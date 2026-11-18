import type { Db } from "./db";

export const PERSISTENCE = Symbol("PERSISTENCE");
export interface RowChange { table: string; upserts: { id: string; data: string }[]; deletes: string[] }
export interface RowRef { table: string; id: string; row?: any }
export interface ChangeEntry { seq: number; table: string; id: string; op: "put" | "del"; origin: string }

/** A write was refused by a database constraint (e.g. two API instances both tried to create revision 7 of a project). */
export class StoreConflict extends Error { constructor(public kind: "unique" | "foreign_key", message: string) { super(message); } }

/** A store that can tell other API instances what changed (the relational stores). */
export interface SyncableStore extends RowStore {
  apply(changes: RowChange[], origin?: string): Promise<void>;
  currentSeq(): Promise<number>;
  changesSince(seq: number, limit: number): Promise<ChangeEntry[]>;
  loadRow(table: string, id: string): Promise<string | null>;
  /** Is there already a revision with this number for the project, written under a different id? */
  revisionClash(projectId: string, revision: number, id: string): Promise<boolean>;
}
const isSyncable = (s: RowStore): s is SyncableStore => typeof (s as Partial<SyncableStore>).changesSince === "function";

/** A durable place for rows. Rows are opaque JSON strings keyed by (table, id). */
export interface RowStore {
  init(): Promise<void>;
  loadAll(table: string): Promise<{ id: string; data: string }[]>;
  /** Apply all changes atomically (all or nothing). */
  apply(changes: RowChange[], origin?: string): Promise<void>;
  close(): Promise<void>;
}

export interface PersistenceOptions {
  /** Wait this long after a write request before flushing (coalesces bursts). */
  debounceMs?: number;
  /** Safety net for changes that don't come from a request. */
  intervalMs?: number;
  log?: (msg: string, err?: unknown) => void;
  /** How often to pull other instances' changes (only for stores that support it). */
  syncMs?: number;
  /** Called after a row we tried to write was refused by a constraint; the local copy has already been reverted to what the database holds. */
  onRejected?: (rows: RowRef[]) => void | Promise<void>;
  /** Document writes wait until the database has accepted them (needed when several API instances share one database). */
  writeThrough?: boolean;
}

/**
 * Durable write-behind for the in-memory Db. Reads are served from memory; changed rows are diffed and
 * written to the store shortly after each write request, on an interval, and on shutdown.
 * Trade-off (ADR-0014): single API instance, and a crash can lose up to `debounceMs` of the newest writes.
 */
export class Persistence {
  private last = new Map<string, Map<string, string>>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private running: Promise<{ rejected: RowRef[] }> | null = null;
  private again = false;
  private closed = false;
  private o: Required<Omit<PersistenceOptions, "onRejected" | "writeThrough">> & Pick<PersistenceOptions, "onRejected">;
  private seq = 0;
  private syncTimer: ReturnType<typeof setInterval> | undefined;
  private syncing: Promise<void> | null = null;
  readonly instanceId = Math.random().toString(36).slice(2, 12);
  get writeThrough() { return !!this.opts.writeThrough; }
  get syncable() { return isSyncable(this.store); }

  constructor(private db: Db, private store: RowStore, private opts: PersistenceOptions = {}) {
    this.o = { debounceMs: opts.debounceMs ?? 150, intervalMs: opts.intervalMs ?? 5000, syncMs: opts.syncMs ?? 500, log: opts.log ?? ((m, e) => console.error(m, e)), onRejected: opts.onRejected };
  }

  async load() {
    await this.store.init();
    if (isSyncable(this.store)) this.seq = await this.store.currentSeq(); // read before loading, so writes made while loading are replayed (idempotent)
    for (const [name, table] of Object.entries(this.db.tables)) {
      const rows = await this.store.loadAll(name);
      const seen = new Map<string, string>();
      table.restore(rows.map((r) => { seen.set(r.id, table.immutable ? "" : r.data); return JSON.parse(r.data) as { id: string }; }));
      this.last.set(name, seen);
    }
    this.interval = setInterval(() => this.schedule(), this.o.intervalMs);
    this.interval.unref?.();
    if (isSyncable(this.store)) { this.syncTimer = setInterval(() => void this.sync().catch((e) => this.o.log("Sync failed; will retry", e)), this.o.syncMs); this.syncTimer.unref?.(); }
  }

  private isDirty(name: string, id: string) {
    const table = this.db.tables[name]; const row = table?.get(id);
    if (!table || !row || table.immutable) return false;
    return JSON.stringify(row) !== this.last.get(name)?.get(id);
  }

  /** Replace the local copy of one row with what the database holds (or drop it if it's gone). */
  async forceReload(name: string, id: string) {
    if (!isSyncable(this.store)) return;
    const table = this.db.tables[name]; if (!table) return;
    const data = await this.store.loadRow(name, id);
    const seen = this.last.get(name) ?? this.last.set(name, new Map()).get(name)!;
    if (data === null) { table.delete(id); seen.delete(id); return; }
    table.restore([JSON.parse(data)]); seen.set(id, table.immutable ? "" : data);
  }

  private lastSync = 0;
  /** Sync unless we did so very recently (cheap guard for hot paths). */
  async syncFresh(maxAgeMs = 250) { if (Date.now() - this.lastSync < maxAgeMs) return; await this.sync(); }

  /** Pull rows written by other API instances into memory. Local rows with unsaved edits win (they're about to be written). */
  sync(): Promise<void> {
    if (!isSyncable(this.store)) return Promise.resolve();
    if (this.syncing) return this.syncing;
    const store = this.store;
    this.syncing = (async () => {
      try {
        for (;;) {
          const list = await store.changesSince(this.seq, 1000);
          if (!list.length) break;
          const latest = new Map<string, ChangeEntry>();
          for (const c of list) if (c.origin !== this.instanceId) latest.set(`${c.table}\u0000${c.id}`, c);
          for (const c of latest.values()) {
            const table = this.db.tables[c.table]; if (!table || this.isDirty(c.table, c.id)) continue;
            const seen = this.last.get(c.table) ?? this.last.set(c.table, new Map()).get(c.table)!;
            if (c.op === "del") { table.delete(c.id); seen.delete(c.id); continue; }
            const data = await store.loadRow(c.table, c.id);
            if (data === null) { table.delete(c.id); seen.delete(c.id); continue; }
            table.restore([JSON.parse(data)]); seen.set(c.id, table.immutable ? "" : data);
          }
          this.seq = list[list.length - 1]!.seq;
          if (list.length < 1000) break;
        }
      } finally { this.syncing = null; this.lastSync = Date.now(); }
    })();
    return this.syncing;
  }

  /** Ask for a flush soon. Safe to call often. */
  schedule() {
    if (this.closed || this.timer) return;
    this.timer = setTimeout(() => { this.timer = undefined; this.flush().catch(() => undefined); }, this.o.debounceMs);
    this.timer.unref?.();
  }

  private diff(): RowChange[] {
    const changes: RowChange[] = [];
    for (const [name, table] of Object.entries(this.db.tables)) {
      const before = this.last.get(name) ?? new Map<string, string>();
      const ids = new Set<string>();
      const upserts: RowChange["upserts"] = [];
      for (const row of table.all()) {
        ids.add(row.id);
        const prev = before.get(row.id);
        if (table.immutable) { if (prev === undefined) upserts.push({ id: row.id, data: JSON.stringify(row) }); }
        else { const s = JSON.stringify(row); if (prev !== s) upserts.push({ id: row.id, data: s }); }
      }
      const deletes = [...before.keys()].filter((id) => !ids.has(id));
      if (upserts.length || deletes.length) changes.push({ table: name, upserts, deletes });
    }
    return changes;
  }

  private mark(changes: RowChange[]) {
    for (const ch of changes) {
      const seen = this.last.get(ch.table) ?? this.last.set(ch.table, new Map()).get(ch.table)!;
      const immutable = this.db.tables[ch.table]!.immutable;
      for (const u of ch.upserts) seen.set(u.id, immutable ? "" : u.data);
      for (const id of ch.deletes) seen.delete(id);
    }
  }

  /**
   * After a constraint refusal. First deal with the case that matters most: another instance already committed the
   * same revision number of a project. Our revision is discarded and the project row is reverted to the database's
   * (so a stale head can't overwrite theirs); the rest of the batch is then retried as one transaction. Anything
   * else that is still refused is written row by row and the refused rows are reverted.
   */
  private async resolveConflict(changes: RowChange[]): Promise<{ rejected: RowRef[]; remaining: RowChange[] }> {
    const store = this.store as SyncableStore;
    const rejected: RowRef[] = [];
    const lostProjects = new Set<string>();
    const revs = changes.find((c) => c.table === "revisions");
    for (const u of revs?.upserts ?? []) {
      const row = JSON.parse(u.data) as { projectId: string; revision: number };
      if (await store.revisionClash(row.projectId, row.revision, u.id)) {
        lostProjects.add(row.projectId); rejected.push({ table: "revisions", id: u.id, row });
        this.db.tables["revisions"]!.delete(u.id);
      }
    }
    for (const pid of lostProjects) { await this.forceReload("projects", pid); }
    if (lostProjects.size) {
      this.o.log(`Revision clash on ${[...lostProjects].join(", ")}: another instance committed first; local copy reverted`);
      await this.sync().catch(() => undefined);
    }
    const remaining = changes.map((c) => ({
      ...c,
      upserts: c.upserts.filter((u) => !(c.table === "revisions" && rejected.some((r) => r.id === u.id)) && !(c.table === "projects" && lostProjects.has(u.id))),
    })).filter((c) => c.upserts.length || c.deletes.length);
    return { rejected, remaining };
  }

  private async applyEach(changes: RowChange[]): Promise<RowRef[]> {
    const store = this.store as SyncableStore;
    const rejected: RowRef[] = [];
    for (const ch of changes) {
      const table = this.db.tables[ch.table]!;
      const single = async (c: RowChange, ref: RowRef) => {
        try { await store.apply([c], this.instanceId); this.mark([c]); }
        catch (e) {
          if (!(e instanceof StoreConflict)) throw e;
          this.o.log(`Write refused (${e.kind}) for ${ref.table}/${ref.id}; reverting to the stored copy`, e.message);
          rejected.push(ref);
          if (this.last.get(ch.table)?.has(ref.id)) await this.forceReload(ch.table, ref.id); else table.delete(ref.id);
        }
      };
      if (ch.deletes.length) await single({ table: ch.table, upserts: [], deletes: ch.deletes }, { table: ch.table, id: ch.deletes[0]! });
      for (const u of ch.upserts) await single({ table: ch.table, upserts: [u], deletes: [] }, { table: ch.table, id: u.id, row: JSON.parse(u.data) });
    }
    return rejected;
  }

  /** Write everything that changed. Resolves when the store has accepted it; rejects if it could not (changes stay pending). */
  flush(): Promise<{ rejected: RowRef[] }> {
    if (this.running) { this.again = true; return this.running; }
    const rejected: RowRef[] = [];
    this.running = (async () => {
      await Promise.resolve(); // ensure `running` is assigned before the finally below can clear it
      try {
        do {
          this.again = false;
          const changes = this.diff();
          if (!changes.length) continue;
          try { await this.store.apply(changes, this.instanceId); this.mark(changes); }
          catch (e) {
            if (e instanceof StoreConflict && isSyncable(this.store)) {
              const r = await this.resolveConflict(changes); rejected.push(...r.rejected);
              try { if (r.remaining.length) { await this.store.apply(r.remaining, this.instanceId); this.mark(r.remaining); } }
              catch (e2) { if (!(e2 instanceof StoreConflict)) throw e2; rejected.push(...(await this.applyEach(r.remaining))); }
              continue;
            }
            // Nothing is marked as saved, so the same diff is retried; keep trying while the app is alive.
            this.o.log("Persistence flush failed; will retry", e);
            if (!this.closed) setTimeout(() => this.schedule(), 2000).unref?.();
            throw e;
          }
        } while (this.again);
      } finally { this.running = null; }
      if (rejected.length) await this.o.onRejected?.(rejected);
      return { rejected };
    })();
    return this.running;
  }

  async close() {
    this.closed = true;
    clearTimeout(this.timer); clearInterval(this.interval); clearInterval(this.syncTimer);
    try { await this.flush(); } finally { await this.store.close(); } // a failed final flush is loud: unsaved data must not be silent
  }
}
