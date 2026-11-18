import { CollabClient, type Committed, type Tx } from "@webbrik/collaboration";
import { applyOperations, History, validateDocument, type Document, type Operation } from "@webbrik/document-model";

export type SaveStatus = "saved" | "saving" | "offline" | "conflict" | "error";

/** What the editor UI talks to. Local sandbox and server-synced documents both implement it. */
export interface DocController {
  readonly doc: Document;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly status: SaveStatus;
  readonly statusMessage: string | null;
  commit(label: string, ops: Operation[]): void;
  undo(): boolean;
  redo(): boolean;
  subscribe(fn: () => void): () => void;
  dispose(): void;
}

export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export class LocalDoc implements DocController {
  private history: History;
  private listeners = new Set<() => void>();
  status: SaveStatus = "saved";
  statusMessage: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(doc: Document, private storage?: KV, private key = "webbrik:editor:recovery:v1", private debounceMs = 600) {
    this.history = new History(doc);
    this.history.subscribe(() => { this.status = "saving"; this.emit(); this.schedule(); });
  }
  get doc() { return this.history.doc; }
  get canUndo() { return this.history.canUndo; }
  get canRedo() { return this.history.canRedo; }
  commit(label: string, ops: Operation[]) { this.history.commit(label, ops); }
  undo() { return this.history.undo(); }
  redo() { return this.history.redo(); }
  replace(doc: Document) { this.history.reset(doc); this.status = "saved"; this.emit(); }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { this.listeners.forEach((l) => l()); }
  private schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), this.debounceMs); }
  flush() {
    clearTimeout(this.timer);
    try { this.storage?.set(this.key, JSON.stringify(this.history.doc)); this.status = "saved"; this.statusMessage = null; }
    catch (e) { this.status = "error"; this.statusMessage = e instanceof Error ? e.message : "Could not save locally"; }
    this.emit();
  }
  static recover(storage: KV, key = "webbrik:editor:recovery:v1"): Document | null {
    try { const raw = storage.get(key); if (!raw) return null; const v = validateDocument(JSON.parse(raw)); return v.ok && v.document ? v.document : null; } catch { return null; }
  }
  dispose() { clearTimeout(this.timer); this.flush(); }
}

// ------------------------------------------------------------------ Remote

export type SubmitResponse = { ok: true; committed: Committed } | { ok: false; reason: "conflict" | "invalid"; message: string; headRevision: number };
export type PollResponse = { resync: false; committed: Committed[] } | { resync: true; revision: number; document: Document };

/** Network seam. Throwing means "network failure" (retryable); returning ok:false means the server rejected the transaction. */
export interface Transport {
  load(): Promise<{ revision: number; document: Document }>;
  submit(tx: Tx): Promise<SubmitResponse>;
  poll(since: number): Promise<PollResponse>;
}

export interface Scheduler { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void }
const realScheduler: Scheduler = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

interface UndoEntry { label: string; undoOps: Operation[] }
interface Persisted { clientId: string; counter: number; pending: Tx[] }

export interface RemoteOptions {
  transport: Transport;
  projectId?: string;
  storage?: KV;
  storageKey?: string;
  clientId?: string;
  pollMs?: number;
  scheduler?: Scheduler;
  random?: () => string;
}

/**
 * Server-synced document with optimistic local edits. Undo/redo are expressed as new operations
 * (so they compose with other people's edits instead of rewinding shared history).
 */
export class RemoteDoc implements DocController {
  private listeners = new Set<() => void>();
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private flushing = false;
  private retryMs = 0;
  private timer: unknown;
  private pollTimer: unknown;
  private disposed = false;
  status: SaveStatus = "saved";
  statusMessage: string | null = null;
  /** Local transactions the server rejected (e.g. editing something another user deleted). */
  dropped: Tx[] = [];

  private constructor(private client: CollabClient, private o: Required<Pick<RemoteOptions, "transport" | "scheduler">> & RemoteOptions) {}

  static async open(o: RemoteOptions): Promise<RemoteDoc> {
    const scheduler = o.scheduler ?? realScheduler;
    const { revision, document } = await o.transport.load();
    const key = o.storageKey ?? "webbrik:remote:pending";
    let saved: Persisted | null = null;
    try { const raw = o.storage?.get(key); if (raw) saved = JSON.parse(raw) as Persisted; } catch { /* ignore corrupt recovery data */ }
    const clientId = saved?.clientId ?? o.clientId ?? `c_${(o.random ?? (() => Math.random().toString(36).slice(2, 10)))()}`;
    const client = new CollabClient(document, revision, clientId);
    const doc = new RemoteDoc(client, { ...o, scheduler });
    // Recovery: re-apply unsent transactions with their original ids so the server can de-duplicate any that did land.
    for (const tx of saved?.pending ?? []) client.restore(tx);
    if (saved?.counter) client.setCounter(saved.counter);
    if (client.pendingTx.length) { doc.status = "saving"; doc.persist(); void doc.flush(); } else o.storage?.remove(key);
    if (o.pollMs) doc.startPolling(o.pollMs);
    return doc;
  }

  get projectId() { return this.o.projectId; }
  get doc() { return this.client.current; }
  get revision() { return this.client.revision; }
  get clientId() { return this.client.clientId; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get pendingCount() { return this.client.pendingTx.length; }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { this.listeners.forEach((l) => l()); }

  private persist() {
    const key = this.o.storageKey ?? "webbrik:remote:pending";
    try {
      if (!this.client.pendingTx.length) this.o.storage?.remove(key);
      else this.o.storage?.set(key, JSON.stringify({ clientId: this.client.clientId, counter: this.client.counterValue, pending: [...this.client.pendingTx] } satisfies Persisted));
    } catch { /* storage unavailable: edits still sync, just without crash recovery */ }
  }

  commit(label: string, ops: Operation[]) {
    const { inverse } = applyOperations(this.client.current, ops); // throws before anything changes
    this.client.local(ops);
    this.undoStack.push({ label, undoOps: inverse });
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.afterLocal();
  }

  private move(from: UndoEntry[], to: UndoEntry[]): boolean {
    const entry = from.pop();
    if (!entry) return false;
    try {
      const { inverse } = applyOperations(this.client.current, entry.undoOps);
      this.client.local(entry.undoOps);
      to.push({ label: entry.label, undoOps: inverse });
    } catch {
      // The target of this undo no longer exists (someone else changed it). Drop the step rather than corrupting state.
      this.statusMessage = `"${entry.label}" can no longer be undone because the document changed.`;
      this.emit();
      return false;
    }
    this.afterLocal();
    return true;
  }
  undo() { return this.move(this.undoStack, this.redoStack); }
  redo() { return this.move(this.redoStack, this.undoStack); }

  private afterLocal() {
    this.status = "saving";
    this.statusMessage = null;
    this.persist();
    this.emit();
    void this.flush();
  }

  /** Send pending transactions in order. Safe to call repeatedly. */
  async flush(): Promise<void> {
    if (this.flushing || this.disposed) return;
    this.flushing = true;
    try {
      while (this.client.pendingTx.length && !this.disposed) {
        const tx = this.client.pendingTx[0]!;
        let res: SubmitResponse;
        try { res = await this.o.transport.submit(tx); }
        catch { this.goOffline(); return; }
        this.retryMs = 0;
        if (res.ok) {
          if (!this.client.receive(res.committed)) await this.poll(); // gap: fetch the revisions we missed first
        } else {
          this.client.reject(tx.id);
          this.dropped = this.client.dropped;
          this.status = "conflict";
          this.statusMessage = res.message;
          await this.poll();
        }
        this.persist();
        this.emit();
      }
      if (!this.client.pendingTx.length) {
        if (this.status !== "conflict") { this.status = "saved"; this.statusMessage = null; }
        this.persist();
        this.emit();
      }
    } finally { this.flushing = false; }
  }

  private goOffline() {
    this.status = "offline";
    this.statusMessage = "Offline — changes are kept and will sync when the connection returns.";
    this.emit();
    this.retryMs = Math.min(this.retryMs ? this.retryMs * 2 : 1000, 30_000);
    this.o.scheduler.clearTimeout(this.timer);
    this.timer = this.o.scheduler.setTimeout(() => void this.flush(), this.retryMs);
  }

  /** Fetch and apply remote commits. */
  async poll(): Promise<void> {
    if (this.disposed) return;
    let res: PollResponse;
    try { res = await this.o.transport.poll(this.client.revision); }
    catch { if (this.client.pendingTx.length) this.goOffline(); else { this.status = "offline"; this.emit(); } return; }
    if (this.status === "offline" && !this.client.pendingTx.length) { this.status = "saved"; this.statusMessage = null; }
    if (res.resync) {
      const pending = [...this.client.pendingTx];
      this.client = new CollabClient(res.document, res.revision, this.client.clientId);
      for (const tx of pending) this.client.restore(tx);
      this.undoStack = [];
      this.redoStack = [];
    } else {
      for (const c of res.committed) if (!this.client.receive(c)) break;
    }
    this.persist();
    this.emit();
    if (this.client.pendingTx.length) void this.flush();
  }

  acknowledgeConflict() { if (this.status === "conflict") { this.status = this.client.pendingTx.length ? "saving" : "saved"; this.statusMessage = null; this.client.dropped.length = 0; this.dropped = []; this.emit(); } }

  /** Changes how often we poll (e.g. slower while a push channel is connected). */
  setPolling(ms: number) { this.o.scheduler.clearTimeout(this.pollTimer); if (!this.disposed) this.startPolling(ms); }

  startPolling(ms: number) {
    const tick = () => { if (this.disposed) return; void this.poll().finally(() => { this.pollTimer = this.o.scheduler.setTimeout(tick, ms); }); };
    this.pollTimer = this.o.scheduler.setTimeout(tick, ms);
  }

  dispose() { this.disposed = true; this.o.scheduler.clearTimeout(this.timer); this.o.scheduler.clearTimeout(this.pollTimer); }
}
