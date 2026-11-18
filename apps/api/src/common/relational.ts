import { Logger } from "@nestjs/common";
import { StoreConflict, type ChangeEntry, type RowChange, type SyncableStore } from "./persistence";

/**
 * Relational storage: one real SQL table per entity, with typed/indexed columns, unique constraints and
 * (deferred) foreign keys, for SQLite and PostgreSQL. The full row also lives in a `data` column, which
 * is what the API loads at start-up. A `wb_changes` feed records every write so other API instances can
 * pull rows they didn't write (see Persistence.sync).
 */

type Scalar = string | number | null;
interface ColSpec { name: string; type: "TEXT" | "BIGINT"; get: (row: any) => Scalar }
interface FkSpec { column: string; references: string }
/**
 * A "typed" table stores every field of the record in its own column (no JSON blob), for the entities where that matters
 * most: users, sessions, memberships and workspaces. `key` is the record field (dot paths reach nested objects).
 */
interface TypedCol {
  name: string; key: string; type: "TEXT" | "BOOLEAN" | "BIGINT" | "TIMESTAMPTZ" | "JSON";
  notNull?: boolean; lower?: boolean;
  /** Set once on insert (from "now" if the record has no value) and never overwritten by later updates. */
  insertOnly?: boolean;
  /** Always set to the time of the write. */
  auto?: boolean;
}
interface TableSpec { name: string; sql: string; cols: ColSpec[]; unique?: string[][]; index?: string[]; fks?: FkSpec[]; typed?: TypedCol[]; uniqueExpr?: string[] }
const getPath = (o: any, path: string) => path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
const setPath = (o: any, path: string, v: unknown) => { const ks = path.split("."); let c = o; for (let i = 0; i < ks.length - 1; i++) c = c[ks[i]!] ??= {}; c[ks[ks.length - 1]!] = v; };
const tc = (name: string, type: TypedCol["type"], o: Partial<TypedCol> = {}): TypedCol => ({ name, key: camel(name), type, ...o });

const t = (name: string) => ({ name, type: "TEXT" as const, get: (r: any): Scalar => (r[camel(name)] ?? null) as Scalar });
const n = (name: string) => ({ name, type: "BIGINT" as const, get: (r: any): Scalar => (r[camel(name)] ?? null) as Scalar });
const camel = (s: string) => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

/** Table names are the keys of `Db` (see db.ts). Order matters only for readability: foreign keys are deferred. */
export const SCHEMA: TableSpec[] = [
  { name: "users", sql: "wb_users", cols: [], unique: [["email"]], uniqueExpr: ["lower(email)"], typed: [
    tc("email", "TEXT", { notNull: true, lower: true }), tc("email_verified", "BOOLEAN", { notNull: true }), tc("email_verified_at", "TIMESTAMPTZ"),
    tc("password_hash", "TEXT"), tc("name", "TEXT", { notNull: true }), tc("avatar_url", "TEXT"),
    tc("mfa_enabled", "BOOLEAN", { notNull: true }), tc("mfa_secret", "TEXT"), tc("recovery_code_hashes", "JSON", { key: "recoveryHashes" }),
    tc("last_login_at", "TIMESTAMPTZ"), tc("created_at", "TIMESTAMPTZ", { notNull: true, insertOnly: true }), tc("updated_at", "TIMESTAMPTZ", { notNull: true, auto: true }),
  ] },
  { name: "sessions", sql: "wb_sessions", cols: [], unique: [["token_hash"]], index: ["user_id"], fks: [{ column: "user_id", references: "wb_users" }], typed: [
    tc("user_id", "TEXT", { notNull: true }), tc("token_hash", "TEXT", { notNull: true }), tc("expires_at", "TIMESTAMPTZ", { notNull: true }),
    tc("user_agent", "TEXT"), tc("created_at", "TIMESTAMPTZ", { notNull: true, insertOnly: true }),
  ] },
  { name: "tokens", sql: "wb_tokens", cols: [t("kind"), t("token_hash"), t("user_id"), t("workspace_id"), t("project_id")], index: ["token_hash", "workspace_id", "project_id"] },
  { name: "workspaces", sql: "wb_workspaces", cols: [], unique: [["slug"]], typed: [
    tc("name", "TEXT", { notNull: true }), tc("slug", "TEXT", { notNull: true }), tc("plan", "TEXT", { notNull: true }),
    tc("billing_status", "TEXT", { key: "billing.status" }), tc("billing_period_end", "TIMESTAMPTZ", { key: "billing.currentPeriodEnd" }),
    tc("paystack_customer_code", "TEXT", { key: "billing.customerCode" }), tc("paystack_customer_email", "TEXT", { key: "billing.customerEmail" }),
    tc("paystack_subscription_code", "TEXT", { key: "billing.subscriptionCode" }), tc("paystack_email_token", "TEXT", { key: "billing.emailToken" }),
    tc("created_at", "TIMESTAMPTZ", { notNull: true, insertOnly: true }), tc("updated_at", "TIMESTAMPTZ", { notNull: true, auto: true }),
  ] },
  { name: "memberships", sql: "wb_memberships", cols: [], unique: [["user_id", "workspace_id"]], index: ["workspace_id"], fks: [{ column: "user_id", references: "wb_users" }, { column: "workspace_id", references: "wb_workspaces" }], typed: [
    tc("user_id", "TEXT", { notNull: true }), tc("workspace_id", "TEXT", { notNull: true }), tc("role", "TEXT", { notNull: true }), tc("created_at", "TIMESTAMPTZ", { notNull: true, insertOnly: true }),
  ] },
  { name: "projects", sql: "wb_projects", cols: [t("workspace_id"), t("slug"), n("deleted_at"), n("head_revision"), n("updated_at")], index: ["workspace_id"], fks: [{ column: "workspace_id", references: "wb_workspaces" }] },
  { name: "revisions", sql: "wb_revisions", cols: [t("project_id"), n("revision"), n("created_at")], unique: [["project_id", "revision"]], fks: [{ column: "project_id", references: "wb_projects" }] },
  { name: "versions", sql: "wb_versions", cols: [t("project_id"), n("revision")], index: ["project_id"], fks: [{ column: "project_id", references: "wb_projects" }] },
  { name: "assets", sql: "wb_assets", cols: [t("project_id"), t("sha256")], index: ["project_id"], fks: [{ column: "project_id", references: "wb_projects" }] },
  { name: "comments", sql: "wb_comments", cols: [t("project_id")], index: ["project_id"], fks: [{ column: "project_id", references: "wb_projects" }] },
  { name: "deployments", sql: "wb_deployments", cols: [t("project_id"), t("status")], index: ["project_id"], fks: [{ column: "project_id", references: "wb_projects" }] },
  { name: "domains", sql: "wb_domains", cols: [t("project_id"), t("hostname")], unique: [["hostname"]], index: ["project_id"], fks: [{ column: "project_id", references: "wb_projects" }] },
  { name: "env", sql: "wb_env", cols: [t("project_id"), t("key")], unique: [["project_id", "key"]], fks: [{ column: "project_id", references: "wb_projects" }] },
  { name: "collections", sql: "wb_collections", cols: [t("project_id"), t("slug")], unique: [["project_id", "slug"]], fks: [{ column: "project_id", references: "wb_projects" }] },
  { name: "items", sql: "wb_items", cols: [t("collection_id"), t("slug"), t("status")], unique: [["collection_id", "slug"]], fks: [{ column: "collection_id", references: "wb_collections" }] },
  { name: "submissions", sql: "wb_submissions", cols: [t("project_id"), t("form_id"), n("created_at")], index: ["project_id"], fks: [{ column: "project_id", references: "wb_projects" }] },
  { name: "usage", sql: "wb_usage", cols: [t("workspace_id"), t("metric"), t("period")], unique: [["workspace_id", "metric", "period"]], fks: [{ column: "workspace_id", references: "wb_workspaces" }] },
  { name: "audit", sql: "wb_audit", cols: [t("workspace_id"), t("action"), n("created_at")], index: ["workspace_id"] },
  { name: "proposals", sql: "wb_proposals", cols: [t("project_id"), t("user_id")], index: ["project_id"], fks: [{ column: "project_id", references: "wb_projects" }] },
  { name: "webhookDeliveries", sql: "wb_webhook_deliveries", cols: [t("project_id")], index: ["project_id"], fks: [{ column: "project_id", references: "wb_projects" }] },
  { name: "coupons", sql: "wb_coupons", cols: [{ name: "code", type: "TEXT", get: (r) => String(r.code).toUpperCase() }], unique: [["code"]] },
  { name: "payments", sql: "wb_payments", cols: [t("workspace_id"), t("reference"), t("status")], unique: [["reference"]], index: ["workspace_id"], fks: [{ column: "workspace_id", references: "wb_workspaces" }] },
];
const BY_NAME = new Map(SCHEMA.map((s) => [s.name, s]));
const spec = (table: string) => { const s = BY_NAME.get(table); if (!s) throw new Error(`Unknown table: ${table}`); return s; };

// ---------------------------------------------------------------- SQL adapters

export interface Conn { run(sql: string, params?: unknown[]): Promise<void>; all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> }
export interface Sql extends Conn { readonly dialect: "sqlite" | "pg"; tx<T>(fn: (c: Conn) => Promise<T>): Promise<T>; close(): Promise<void> }

function classify(e: unknown): never {
  const err = e as { code?: string; message?: string; errcode?: number };
  const msg = String(err?.message ?? e);
  if (err?.code === "23505" || /UNIQUE constraint failed/i.test(msg)) throw new StoreConflict("unique", msg);
  if (err?.code === "23503" || /FOREIGN KEY constraint failed/i.test(msg)) throw new StoreConflict("foreign_key", msg);
  throw e;
}

export function sqliteSql(path: string): Sql {
  const { DatabaseSync } = (process as unknown as { getBuiltinModule(id: string): typeof import("node:sqlite") }).getBuiltinModule("node:sqlite");
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const conn: Conn = {
    async run(sql, params = []) { try { db.prepare(sql).run(...(params as never[])); } catch (e) { classify(e); } },
    async all<T>(sql: string, params: unknown[] = []) { try { return db.prepare(sql).all(...(params as never[])) as T[]; } catch (e) { return classify(e); } },
  };
  // SQLite allows one writer, and this connection is shared: serialise transactions.
  let chain: Promise<unknown> = Promise.resolve();
  return {
    dialect: "sqlite", ...conn,
    tx<T>(fn: (c: Conn) => Promise<T>) {
      const run = async () => {
        db.exec("BEGIN IMMEDIATE");
        try { const r = await fn(conn); db.exec("COMMIT"); return r; } catch (e) { try { db.exec("ROLLBACK"); } catch { /* already rolled back */ } return classify(e); }
      };
      const p = chain.then(run, run); chain = p.catch(() => undefined); return p;
    },
    async close() { await chain.catch(() => undefined); db.close(); },
  };
}

/** `sslmode=require` currently means verify-full in the pg driver and will change; say so explicitly to keep the same (strict) behaviour and silence its warning. */
export function normalizePgUrl(url: string) {
  try {
    const u = new URL(url);
    const mode = u.searchParams.get("sslmode");
    if ((mode === "require" || mode === "verify-ca") && !u.searchParams.has("uselibpqcompat")) { u.searchParams.set("sslmode", "verify-full"); return u.toString(); }
  } catch { /* not a URL: let the driver report it */ }
  return url;
}

export function pgSql(rawUrl: string): Sql {
  const connectionString = normalizePgUrl(rawUrl);
  let pool: import("pg").Pool | null = null;
  const get = async () => { if (!pool) { const { Pool } = await import("pg"); pool = new Pool({ connectionString, max: 6 }); pool.on("error", (e: Error) => new Logger("Database").warn(`An idle database connection was closed (${e.message}); a new one is opened on the next query.`)); } return pool; };
  const toPg = (sql: string) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
  const wrap = (q: { query: (s: string, p?: unknown[]) => Promise<{ rows: any[] }> }): Conn => ({
    async run(sql, params = []) { try { await q.query(toPg(sql), params); } catch (e) { classify(e); } },
    async all<T>(sql: string, params: unknown[] = []) { try { return (await q.query(toPg(sql), params)).rows as T[]; } catch (e) { return classify(e); } },
  });
  return {
    dialect: "pg",
    run: async (s, p) => wrap(await get()).run(s, p),
    all: async <T,>(s: string, p?: unknown[]) => wrap(await get()).all<T>(s, p),
    async tx<T>(fn: (c: Conn) => Promise<T>) {
      const c = await (await get()).connect();
      try {
        await c.query("BEGIN");
        const r = await fn(wrap(c));
        await c.query("COMMIT");
        return r;
      } catch (e) { await c.query("ROLLBACK").catch(() => undefined); return classify(e); } finally { c.release(); }
    },
    async close() { await pool?.end(); pool = null; },
  };
}

// ---------------------------------------------------------------- the store

const MIGRATIONS_TABLE = "wb_migrations";
const CHANGE_RETENTION_MS = 24 * 3600 * 1000;

export class RelationalStore implements SyncableStore {
  constructor(private sql: Sql, private log: (m: string) => void = (m) => console.warn(m)) {}
  private json(p = "?") { return this.sql.dialect === "pg" ? `CAST(${p} AS jsonb)` : p; }
  private text(col: string) { return this.sql.dialect === "pg" ? `${col}::text` : col; }

  private sqlType(c: TypedCol) {
    const pg = this.sql.dialect === "pg";
    switch (c.type) { case "TEXT": return "TEXT"; case "BOOLEAN": return pg ? "BOOLEAN" : "INTEGER"; case "BIGINT": return pg ? "BIGINT" : "INTEGER"; case "TIMESTAMPTZ": return pg ? "TIMESTAMPTZ" : "INTEGER"; case "JSON": return pg ? "JSONB" : "TEXT"; }
  }
  private toDb(c: TypedCol, v: unknown): unknown {
    if (v === undefined || v === null) return null;
    const pg = this.sql.dialect === "pg";
    switch (c.type) {
      case "TEXT": return c.lower ? String(v).toLowerCase() : String(v);
      case "BOOLEAN": return pg ? !!v : v ? 1 : 0;
      case "BIGINT": return Number(v);
      case "TIMESTAMPTZ": return pg ? new Date(Number(v)) : Number(v);
      case "JSON": return JSON.stringify(v);
    }
  }
  private fromDb(c: TypedCol, v: unknown): unknown {
    if (v === undefined || v === null) return undefined;
    switch (c.type) {
      case "TEXT": return String(v);
      case "BOOLEAN": return v === true || v === 1 || v === "1" || v === "t";
      case "BIGINT": return Number(v);
      case "TIMESTAMPTZ": return v instanceof Date ? v.getTime() : Number(v);
      case "JSON": return typeof v === "string" ? JSON.parse(v) : v;
    }
  }
  /** Column values of a record, in `s.typed` order. `now` fills insert-only and auto columns. */
  private typedValues(s: TableSpec, obj: any, now: number) {
    return s.typed!.map((c) => this.toDb(c, c.auto ? now : c.insertOnly ? getPath(obj, c.key) ?? now : getPath(obj, c.key)));
  }
  private typedRecord(s: TableSpec, row: Record<string, unknown>) {
    const obj: any = { id: row["id"] };
    for (const c of s.typed!) { if (c.auto) continue; const v = this.fromDb(c, row[c.name]); if (v !== undefined) setPath(obj, c.key, v); }
    return JSON.stringify(obj);
  }
  private placeholder(c: TypedCol) { return c.type === "JSON" && this.sql.dialect === "pg" ? "CAST(? AS jsonb)" : "?"; }

  private ddl(s: TableSpec): string[] {
    const pg = this.sql.dialect === "pg";
    if (s.typed) {
      const cols = ["id TEXT PRIMARY KEY", ...s.typed.map((c) => `${c.name} ${this.sqlType(c)}${c.notNull ? " NOT NULL" : ""}`)];
      const cons = [
        ...(s.unique ?? []).map((u) => `UNIQUE (${u.join(", ")})`),
        ...(s.fks ?? []).map((f) => `FOREIGN KEY (${f.column}) REFERENCES ${f.references} (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED`),
      ];
      const out = [`CREATE TABLE IF NOT EXISTS ${s.sql} (${[...cols, ...cons].join(", ")})`];
      for (const ix of s.index ?? []) out.push(`CREATE INDEX IF NOT EXISTS ${s.sql}_${ix}_idx ON ${s.sql} (${ix})`);
      (s.uniqueExpr ?? []).forEach((e, i) => out.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${s.sql}_expr${i}_uidx ON ${s.sql} (${e})`));
      return out;
    }
    const cols = ["id TEXT PRIMARY KEY", ...s.cols.map((c) => `${c.name} ${pg || c.type === "TEXT" ? c.type : "INTEGER"}`), "version BIGINT NOT NULL DEFAULT 1", `data ${pg ? "JSONB" : "TEXT"} NOT NULL`, "stored_at BIGINT NOT NULL"];
    const cons = [
      ...(s.unique ?? []).map((u) => `UNIQUE (${u.join(", ")})`),
      ...(s.fks ?? []).map((f) => `FOREIGN KEY (${f.column}) REFERENCES ${f.references} (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED`),
    ];
    const out = [`CREATE TABLE IF NOT EXISTS ${s.sql} (${[...cols, ...cons].join(", ")})`];
    for (const ix of s.index ?? []) out.push(`CREATE INDEX IF NOT EXISTS ${s.sql}_${ix}_idx ON ${s.sql} (${ix})`);
    return out;
  }

  async init() {
    const pg = this.sql.dialect === "pg";
    await this.sql.run(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)`);
    const applied = new Set((await this.sql.all<{ name: string }>(`SELECT name FROM ${MIGRATIONS_TABLE}`)).map((r) => r.name));
    const mark = (c: Conn, name: string) => c.run(`INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, ?)`, [name, Date.now()]);
    if (!applied.has("001_relational_tables")) {
      await this.sql.tx(async (c) => {
        for (const s of SCHEMA) for (const q of this.ddl(s)) await c.run(q);
        await c.run(`CREATE TABLE IF NOT EXISTS wb_changes (seq ${pg ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${pg ? "" : "AUTOINCREMENT"}, tbl TEXT NOT NULL, row_id TEXT NOT NULL, op TEXT NOT NULL, origin TEXT NOT NULL, at BIGINT NOT NULL)`);
        await mark(c, "001_relational_tables");
      });
    }
    if (!applied.has("002_import_legacy_rows")) {
      // Databases created before the relational layout kept every row as JSON in `webbrik_rows`. Copy them over once; the old table is left in place as a backup.
      const legacy = pg
        ? await this.sql.all<{ n: string }>(`SELECT to_regclass('webbrik_rows')::text AS n`).then((r) => !!r[0]?.n)
        : await this.sql.all(`SELECT name FROM sqlite_master WHERE type='table' AND name='webbrik_rows'`).then((r) => r.length > 0);
      if (legacy) {
        const rows = await this.sql.all<{ tbl: string; id: string; data: string }>(`SELECT tbl, id, ${this.text("data")} AS data FROM webbrik_rows`);
        const byTable = new Map<string, { id: string; data: string }[]>();
        for (const r of rows) { if (!BY_NAME.has(r.tbl)) continue; (byTable.get(r.tbl) ?? byTable.set(r.tbl, []).get(r.tbl)!).push(r); }
        await this.sql.tx(async (c) => {
          for (const s of SCHEMA) { const list = byTable.get(s.name); if (list?.length) await this.upsert(c, s, list); }
          await mark(c, "002_import_legacy_rows");
        });
        this.log(`Imported ${rows.length} rows from the legacy JSON row table; the old table was left in place.`);
      } else await this.sql.tx((c) => mark(c, "002_import_legacy_rows"));
    }
    if (!applied.has("003_typed_columns")) {
      // users, sessions, workspaces and memberships get one real column per field instead of a JSON blob.
      await this.sql.tx(async (c) => {
        let n = 0;
        for (const s of SCHEMA) if (s.typed && await this.upgradeToTyped(c, s)) n++;
        await mark(c, "003_typed_columns");
        if (n) this.log(`Migrated ${n} tables to typed columns (users, sessions, workspaces, memberships).`);
      });
    }
    await this.sql.run(`DELETE FROM wb_changes WHERE at < ?`, [Date.now() - CHANGE_RETENTION_MS]);
  }

  async loadAll(table: string) {
    const s = spec(table);
    if (s.typed) return (await this.sql.all<Record<string, unknown>>(`SELECT * FROM ${s.sql}`)).map((r) => ({ id: String(r["id"]), data: this.typedRecord(s, r) }));
    return this.sql.all<{ id: string; data: string }>(`SELECT id, ${this.text("data")} AS data FROM ${s.sql}`);
  }
  async loadRow(table: string, id: string) {
    const s = spec(table);
    if (s.typed) { const r = await this.sql.all<Record<string, unknown>>(`SELECT * FROM ${s.sql} WHERE id = ?`, [id]); return r[0] ? this.typedRecord(s, r[0]) : null; }
    const r = await this.sql.all<{ data: string }>(`SELECT ${this.text("data")} AS data FROM ${s.sql} WHERE id = ?`, [id]); return r[0]?.data ?? null;
  }
  async currentSeq() { const r = await this.sql.all<{ m: number | string | null }>(`SELECT MAX(seq) AS m FROM wb_changes`); return Number(r[0]?.m ?? 0); }
  async changesSince(seq: number, limit: number): Promise<ChangeEntry[]> {
    const rows = await this.sql.all<{ seq: number | string; tbl: string; row_id: string; op: string; origin: string }>(`SELECT seq, tbl, row_id, op, origin FROM wb_changes WHERE seq > ? ORDER BY seq LIMIT ?`, [seq, limit]);
    return rows.map((r) => ({ seq: Number(r.seq), table: r.tbl, id: r.row_id, op: r.op === "del" ? "del" : "put", origin: r.origin }));
  }

  async revisionClash(projectId: string, revision: number, id: string) { const r = await this.sql.all(`SELECT 1 AS x FROM wb_revisions WHERE project_id = ? AND revision = ? AND id <> ?`, [projectId, revision, id]); return r.length > 0; }

  private async upsertTyped(c: Conn, s: TableSpec, rows: { id: string; data: string }[]) {
    const names = ["id", ...s.typed!.map((x) => x.name)];
    const tuple = `(${["?", ...s.typed!.map((x) => this.placeholder(x))].join(", ")})`;
    const set = s.typed!.filter((x) => !x.insertOnly).map((x) => `${x.name} = excluded.${x.name}`).join(", ");
    const now = Date.now();
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const params: unknown[] = [];
      for (const r of chunk) params.push(r.id, ...this.typedValues(s, JSON.parse(r.data), now));
      await c.run(`INSERT INTO ${s.sql} (${names.join(", ")}) VALUES ${chunk.map(() => tuple).join(", ")} ON CONFLICT (id) DO UPDATE SET ${set}`, params);
    }
  }

  private async columnsOf(table: string): Promise<Map<string, string>> {
    if (this.sql.dialect === "pg") return new Map((await this.sql.all<{ column_name: string; data_type: string }>(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ? AND table_schema = current_schema()`, [table])).map((r) => [r.column_name, r.data_type]));
    return new Map((await this.sql.all<{ name: string; type: string }>(`PRAGMA table_info(${table})`)).map((r) => [r.name, r.type.toLowerCase()]));
  }

  /** Upgrade a table that still has the old layout (typed key columns plus a JSON `data` blob) to one real column per field. */
  private async upgradeToTyped(c: Conn, s: TableSpec) {
    const pg = this.sql.dialect === "pg";
    const have = await this.columnsOf(s.sql);
    if (!have.has("data")) return false; // created with the typed layout already
    const legacy = await c.all<{ id: string; data: string }>(`SELECT id, ${this.text("data")} AS data FROM ${s.sql}`);
    for (const col of s.typed!) {
      const cur = have.get(col.name);
      if (cur && pg && col.type === "TIMESTAMPTZ" && cur === "bigint") await c.run(`ALTER TABLE ${s.sql} ALTER COLUMN ${col.name} TYPE TIMESTAMPTZ USING to_timestamp(${col.name} / 1000.0)`);
      else if (!cur) await c.run(`ALTER TABLE ${s.sql} ADD COLUMN ${col.name} ${this.sqlType(col)}`);
    }
    const now = Date.now();
    for (const r of legacy) {
      const obj = JSON.parse(r.data);
      await c.run(`UPDATE ${s.sql} SET ${s.typed!.map((x) => `${x.name} = ${this.placeholder(x)}`).join(", ")} WHERE id = ?`, [...this.typedValues(s, obj, now), r.id]);
    }
    // The UPDATEs above queue deferred foreign-key checks, and PostgreSQL refuses to ALTER a table that has any pending: run them now.
    if (pg) await c.run("SET CONSTRAINTS ALL IMMEDIATE");
    if (pg) for (const col of s.typed!) if (col.notNull) await c.run(`ALTER TABLE ${s.sql} ALTER COLUMN ${col.name} SET NOT NULL`);
    for (const drop of ["data", "version", "stored_at"]) if (have.has(drop)) await c.run(`ALTER TABLE ${s.sql} DROP COLUMN ${drop}`);
    for (const q of this.ddl(s).slice(1)) await c.run(q);
    return true;
  }

  private async upsert(c: Conn, s: TableSpec, rows: { id: string; data: string }[]) {
    if (s.typed) return this.upsertTyped(c, s, rows);
    const names = ["id", ...s.cols.map((x) => x.name), "version", "data", "stored_at"];
    const per = names.length - 1; // version is a literal
    const set = [...s.cols.map((x) => `${x.name} = excluded.${x.name}`), "data = excluded.data", `version = ${s.sql}.version + 1`, "stored_at = excluded.stored_at"].join(", ");
    const now = Date.now();
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const tuple = `(?, ${s.cols.map(() => "?").join(", ")}${s.cols.length ? ", " : ""}1, ${this.json()}, ?)`;
      const params: unknown[] = [];
      for (const r of chunk) { const obj = JSON.parse(r.data); params.push(r.id, ...s.cols.map((x) => x.get(obj)), r.data, now); }
      await c.run(`INSERT INTO ${s.sql} (${names.join(", ")}) VALUES ${chunk.map(() => tuple).join(", ")} ON CONFLICT (id) DO UPDATE SET ${set}`, params);
      void per;
    }
  }

  async apply(changes: RowChange[], origin = "local") {
    await this.sql.tx(async (c) => {
      const feed: [string, string, string][] = [];
      for (const ch of changes) {
        const s = spec(ch.table);
        for (let i = 0; i < ch.deletes.length; i += 200) {
          const ids = ch.deletes.slice(i, i + 200);
          await c.run(`DELETE FROM ${s.sql} WHERE id IN (${ids.map(() => "?").join(", ")})`, ids);
        }
        if (ch.upserts.length) await this.upsert(c, s, ch.upserts);
        for (const id of ch.deletes) feed.push([ch.table, id, "del"]);
        for (const u of ch.upserts) feed.push([ch.table, u.id, "put"]);
      }
      const now = Date.now();
      for (let i = 0; i < feed.length; i += 200) {
        const chunk = feed.slice(i, i + 200);
        await c.run(`INSERT INTO wb_changes (tbl, row_id, op, origin, at) VALUES ${chunk.map(() => "(?, ?, ?, ?, ?)").join(", ")}`, chunk.flatMap((f) => [f[0], f[1], f[2], origin, now]));
      }
    });
  }

  async close() { await this.sql.close(); }
}
