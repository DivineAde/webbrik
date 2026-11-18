import { applyOperations, type Document, type Operation } from "@webbrik/document-model";

export interface Tx {
  id: string;
  clientId: string;
  baseRevision: number;
  ops: Operation[];
}
export interface Committed {
  revision: number;
  txId: string;
  clientId: string;
  ops: Operation[];
}
export type SubmitResult = { ok: true; committed: Committed } | { ok: false; reason: "conflict" | "invalid"; message: string; headRevision: number };

/**
 * Server-ordered operation log (see ADR-0008). Operations address nodes by id and most are
 * commutative; an operation that no longer applies to the head (e.g. styling a deleted node) is rejected,
 * never silently dropped, and the client re-syncs.
 */
export class CollabServer {
  private log: Committed[] = [];
  private seen = new Map<string, Committed>();

  constructor(
    private head: Document,
    private baseRevision = 0,
  ) {}

  get doc(): Document {
    return this.head;
  }
  get revision(): number {
    return this.baseRevision + this.log.length;
  }

  submit(tx: Tx): SubmitResult {
    const dup = this.seen.get(tx.id);
    if (dup) return { ok: true, committed: dup }; // idempotent retry
    if (tx.baseRevision > this.revision) return { ok: false, reason: "invalid", message: "Base revision is in the future", headRevision: this.revision };
    try {
      const { doc } = applyOperations(this.head, tx.ops);
      this.head = doc;
    } catch (e) {
      return { ok: false, reason: "conflict", message: e instanceof Error ? e.message : "Operation failed", headRevision: this.revision };
    }
    const committed: Committed = { revision: this.revision + 1, txId: tx.id, clientId: tx.clientId, ops: tx.ops };
    this.log.push(committed);
    this.seen.set(tx.id, committed);
    return { ok: true, committed };
  }

  /** Committed transactions after `revision` (exclusive). Returns null if compacted away (client must reload the snapshot). */
  since(revision: number): Committed[] | null {
    if (revision < this.baseRevision) return null;
    return this.log.slice(revision - this.baseRevision);
  }
}

/** Optimistic client: local ops apply immediately; server order is authoritative. */
export class CollabClient {
  private confirmed: Document;
  private confirmedRevision: number;
  private pending: Tx[] = [];
  private counter = 0;
  current: Document;
  /** Transactions that could not be re-applied after remote changes and were discarded. */
  dropped: Tx[] = [];

  constructor(
    doc: Document,
    revision: number,
    readonly clientId: string,
  ) {
    this.confirmed = doc;
    this.current = doc;
    this.confirmedRevision = revision;
  }

  get revision(): number {
    return this.confirmedRevision;
  }
  get pendingTx(): readonly Tx[] {
    return this.pending;
  }

  /** Apply locally; returns the transaction to send. Throws (leaving state unchanged) if invalid locally. */
  local(ops: Operation[]): Tx {
    const { doc } = applyOperations(this.current, ops);
    const tx: Tx = { id: `${this.clientId}:${++this.counter}`, clientId: this.clientId, baseRevision: this.confirmedRevision, ops };
    this.current = doc;
    this.pending.push(tx);
    return tx;
  }

  /** Feed committed transactions in revision order (own acks and remote edits). Returns false if a gap requires resync. */
  receive(c: Committed): boolean {
    if (c.revision <= this.confirmedRevision) return true; // already seen
    if (c.revision !== this.confirmedRevision + 1) return false;
    this.confirmed = applyOperations(this.confirmed, c.ops).doc;
    this.confirmedRevision = c.revision;
    const idx = this.pending.findIndex((t) => t.id === c.txId);
    if (idx >= 0) this.pending.splice(idx, 1);
    this.rebuild();
    return true;
  }

  /** Re-apply a previously persisted pending transaction (crash recovery), keeping its id so the server can de-duplicate it. */
  restore(tx: Tx): boolean {
    try {
      this.current = applyOperations(this.current, tx.ops).doc;
      this.pending.push(tx);
      return true;
    } catch {
      this.dropped.push(tx);
      return false;
    }
  }

  get counterValue(): number { return this.counter; }
  setCounter(n: number) { this.counter = Math.max(this.counter, n); }

  /** The server rejected a transaction. */
  reject(txId: string) {
    const idx = this.pending.findIndex((t) => t.id === txId);
    if (idx >= 0) this.dropped.push(...this.pending.splice(idx, 1));
    this.rebuild();
  }

  private rebuild() {
    let doc = this.confirmed;
    const keep: Tx[] = [];
    for (const tx of this.pending) {
      try {
        doc = applyOperations(doc, tx.ops).doc;
        keep.push(tx);
      } catch {
        this.dropped.push(tx);
      }
    }
    this.pending = keep;
    this.current = doc;
  }
}

export interface PresenceState {
  clientId: string;
  name: string;
  color: string;
  selection: string[];
  pageId?: string;
  seenAt: number;
}

/** Ephemeral presence: never persisted, expires without heartbeats. */
export class Presence {
  private users = new Map<string, PresenceState>();
  constructor(private ttlMs = 15_000) {}
  update(s: Omit<PresenceState, "seenAt">, now = Date.now()) {
    this.users.set(s.clientId, { ...s, seenAt: now });
  }
  leave(clientId: string) {
    this.users.delete(clientId);
  }
  active(now = Date.now()): PresenceState[] {
    for (const [id, u] of this.users) if (now - u.seenAt > this.ttlMs) this.users.delete(id);
    return [...this.users.values()];
  }
}

const COLORS = ["#2563eb", "#db2777", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];
export const presenceColor = (clientId: string) => COLORS[[...clientId].reduce((n, ch) => n + ch.charCodeAt(0), 0) % COLORS.length]!;
