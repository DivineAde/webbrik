import { Logger } from "@nestjs/common";
import type { RowChange, RowStore } from "./persistence";
import { RelationalStore, pgSql, sqliteSql } from "./relational";

/** Postgres: one generic row table (JSONB). Requires `pg`. See ADR-0014 for why this isn't the relational Prisma schema yet. */
export class PostgresStore implements RowStore {
  private pool: import("pg").Pool | null = null;
  constructor(private connectionString: string) {}

  async init() {
    const { Pool } = await import("pg");
    this.pool = new Pool({ connectionString: this.connectionString, max: 4 });
    // Hosted databases (Neon, etc.) close idle connections; without a handler that event would crash the process.
    this.pool.on("error", (e: Error) => new Logger("Database").warn(`An idle database connection was closed (${e.message}); a new one is opened on the next query.`));
    await this.pool.query(`CREATE TABLE IF NOT EXISTS webbrik_rows (
      tbl text NOT NULL, id text NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tbl, id))`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS webbrik_meta (key text PRIMARY KEY, value text NOT NULL)`);
    await this.pool.query(`INSERT INTO webbrik_meta (key, value) VALUES ('schema_version', '1') ON CONFLICT DO NOTHING`);
  }
  async loadAll(table: string) {
    const r = await this.pool!.query<{ id: string; data: string }>("SELECT id, data::text AS data FROM webbrik_rows WHERE tbl = $1", [table]);
    return r.rows;
  }
  async apply(changes: RowChange[]) {
    const c = await this.pool!.connect();
    try {
      await c.query("BEGIN");
      for (const ch of changes) {
        if (ch.deletes.length) await c.query("DELETE FROM webbrik_rows WHERE tbl = $1 AND id = ANY($2::text[])", [ch.table, ch.deletes]);
        for (let i = 0; i < ch.upserts.length; i += 200) {
          const batch = ch.upserts.slice(i, i + 200);
          await c.query(
            "INSERT INTO webbrik_rows (tbl, id, data) SELECT $1, u.id, u.data::jsonb FROM unnest($2::text[], $3::text[]) AS u(id, data) ON CONFLICT (tbl, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
            [ch.table, batch.map((u) => u.id), batch.map((u) => u.data)],
          );
        }
      }
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK").catch(() => undefined); throw e; }
    finally { c.release(); }
  }
  async close() { await this.pool?.end(); this.pool = null; }
}

/** SQLite via Node's built-in `node:sqlite` (experimental). Zero-dependency durable store for development and single-node self-hosting. */
export class SqliteStore implements RowStore {
  private db: import("node:sqlite").DatabaseSync | null = null;
  constructor(private path: string) {}
  async init() {
    const { DatabaseSync } = (process as unknown as { getBuiltinModule(id: string): typeof import("node:sqlite") }).getBuiltinModule("node:sqlite");
    this.db = new DatabaseSync(this.path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    this.db.exec("CREATE TABLE IF NOT EXISTS webbrik_rows (tbl TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (tbl, id))");
  }
  async loadAll(table: string) {
    return this.db!.prepare("SELECT id, data FROM webbrik_rows WHERE tbl = ?").all(table) as { id: string; data: string }[];
  }
  async apply(changes: RowChange[]) {
    const db = this.db!;
    const up = db.prepare("INSERT INTO webbrik_rows (tbl, id, data) VALUES (?, ?, ?) ON CONFLICT (tbl, id) DO UPDATE SET data = excluded.data");
    const del = db.prepare("DELETE FROM webbrik_rows WHERE tbl = ? AND id = ?");
    db.exec("BEGIN");
    try {
      for (const ch of changes) { for (const id of ch.deletes) del.run(ch.table, id); for (const u of ch.upserts) up.run(ch.table, u.id, u.data); }
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
  }
  async close() { this.db?.close(); this.db = null; }
}

/** Pick a store from the environment (relational tables; older JSON-row databases are imported on first start). Returns null for in-memory (data is lost on restart). */
export function storeFromEnv(env: NodeJS.ProcessEnv = process.env): RowStore | null {
  const url = env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) return new RelationalStore(pgSql(url));
  if (env.SQLITE_PATH) return new RelationalStore(sqliteSql(env.SQLITE_PATH));
  return null;
}
