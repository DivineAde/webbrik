import { chownSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Db } from "../src/common/db";
import { Persistence, StoreConflict } from "../src/common/persistence";
import { RelationalStore, pgSql, sqliteSql, type Sql } from "../src/common/relational";
import { PostgresStore, SqliteStore } from "../src/common/stores";
import { startEnv } from "./helpers";

process.env.DISABLE_RATE_LIMIT = "1";

interface Backend { name: string; fresh: () => Promise<{ sql: () => Sql; legacy: () => import("../src/common/persistence").RowStore }>; }

const handles: Sql[] = [];
const track = (x: Sql) => { handles.push(x); return x; };
const tmp = mkdtempSync(join(tmpdir(), "wbrel-"));
let n = 0;
const sqliteBackend: Backend = {
  name: "SQLite",
  fresh: async () => { const file = join(tmp, `db${++n}.db`); return { sql: () => track(sqliteSql(file)), legacy: () => new SqliteStore(file) }; },
};

let pgStop: (() => Promise<void>) | null = null;
let pgCreate: ((db: string) => Promise<string>) | null = null;
const pgBackend: Backend = {
  name: "PostgreSQL (embedded)",
  fresh: async () => { const url = await pgCreate!(`t${++n}`); return { sql: () => track(pgSql(url)), legacy: () => new PostgresStore(url) }; },
};
let pgReady = false;
beforeAll(async () => {
  try {
    const { default: EmbeddedPostgres } = await import("embedded-postgres");
    const dir = mkdtempSync(join(tmpdir(), "webbrik-pg-"));
    if (process.getuid?.() === 0) chownSync(dir, 102, 104);
    const port = 54000 + Math.floor(Math.random() * 900);
    const pg = new EmbeddedPostgres({ databaseDir: join(dir, "data"), user: "wb", password: "wb", port, persistent: false, onLog: () => undefined, onError: () => undefined });
    await pg.initialise(); await pg.start();
    pgCreate = async (db) => { await pg.createDatabase(db); return `postgres://wb:wb@localhost:${port}/${db}`; };
    pgStop = async () => { await pg.stop(); rmSync(dir, { recursive: true, force: true }); };
    pgReady = true;
  } catch { pgReady = false; }
}, 180_000);
afterAll(async () => { for (const h of handles) await h.close().catch(() => undefined); await pgStop?.(); rmSync(tmp, { recursive: true, force: true }); });

const seed = (db: Db) => {
  const ws = db.workspaces.insert({ name: "W", slug: "w-" + Math.random().toString(36).slice(2, 8), plan: "free", createdAt: 1 });
  const p = db.projects.insert({ workspaceId: ws.id, name: "P", slug: "p", description: "", createdAt: 1, updatedAt: 1, headRevision: 1, analytics: [], webhooks: [], forms: {} });
  db.revisions.insert({ projectId: p.id, revision: 1, document: {} as never, createdAt: 1 });
  return { ws, p };
};

for (const be of [sqliteBackend, pgBackend]) {
  describe(`relational storage: ${be.name}`, () => {
    const isPg = be === pgBackend;
    const ok = (ctx: { skip: () => void }) => { if (isPg && !pgReady) ctx.skip(); };

    it("keeps accounts, projects, documents and CMS across restarts, and deletes stay deleted", async (ctx) => {
      ok(ctx);
      const { sql } = await be.fresh();
      const e1 = await startEnv({ store: new RelationalStore(sql()) });
      const owner = await e1.signup("rel@x.com");
      const project = (await owner.post(`/workspaces/${owner.workspaceId}/projects`, { name: "Kept" })).data.project;
      const col = (await owner.post(`/projects/${project.id}/collections`, { slug: "posts", name: "Posts", fields: [{ name: "title", type: "text", required: true }] })).data.collection;
      const item = (await owner.post(`/projects/${project.id}/collections/${col.id}/items`, { slug: "one", data: { title: "One" }, status: "published" })).data.item;
      const doc1 = (await owner.get(`/projects/${project.id}/document`)).data;
      await e1.close();
      const e2 = await startEnv({ store: new RelationalStore(sql()) });
      const c2 = e2.client(); owner.cookies.forEach((v, k) => c2.cookies.set(k, v));
      expect((await c2.get("/auth/me")).status).toBe(200);
      expect((await c2.get(`/projects/${project.id}/document`)).data).toEqual(doc1);
      expect((await c2.req("DELETE", `/projects/${project.id}/collections/${col.id}/items/${item.id}`)).status).toBe(204);
      expect((await c2.del(`/workspaces/${owner.workspaceId}`, { confirmName: "x" })).status).toBeGreaterThanOrEqual(400);
      await e2.close();
      const e3 = await startEnv({ store: new RelationalStore(sql()) });
      const c3 = e3.client(); owner.cookies.forEach((v, k) => c3.cookies.set(k, v));
      expect((await c3.get(`/projects/${project.id}/collections/${col.id}/items`)).data.items).toEqual([]);
      await e3.close();
    }, 120_000);

    it("really is relational: typed columns, indexes and constraints reject bad rows", async (ctx) => {
      ok(ctx);
      const { sql } = await be.fresh();
      const store = new RelationalStore(sql()); await store.init();
      const db = new Db(); const { ws, p } = seed(db);
      const row = (t: string, r: { id: string }) => ({ table: t, upserts: [{ id: r.id, data: JSON.stringify(r) }], deletes: [] as string[] });
      await store.apply([row("workspaces", ws), row("projects", p), ...db.revisions.all().map((r) => row("revisions", r))]);
      // typed column is queryable
      const q = await sql().all<{ n: number | string }>("SELECT COUNT(*) AS n FROM wb_projects WHERE workspace_id = ?", [ws.id]);
      expect(Number(q[0]!.n)).toBe(1);
      // unique (project, revision) with a different id
      await expect(store.apply([row("revisions", { id: "rev_dup", projectId: p.id, revision: 1, document: {}, createdAt: 2 } as never)])).rejects.toBeInstanceOf(StoreConflict);
      // unique hostname across projects
      await store.apply([row("domains", { id: "dom_1", projectId: p.id, hostname: "a.example.com", verified: true, primary: true } as never)]);
      await expect(store.apply([row("domains", { id: "dom_2", projectId: p.id, hostname: "a.example.com", verified: false, primary: false } as never)])).rejects.toBeInstanceOf(StoreConflict);
      // foreign key: a comment for a project that doesn't exist
      await expect(store.apply([row("comments", { id: "cmt_1", projectId: "prj_missing", authorName: "x", body: "b", createdAt: 1 } as never)])).rejects.toMatchObject({ kind: "foreign_key" });
      // deleting a project in the same transaction as its children is fine (constraints are deferred)
      await store.apply([{ table: "revisions", upserts: [], deletes: db.revisions.all().map((r) => r.id) }, { table: "domains", upserts: [], deletes: ["dom_1"] }, { table: "projects", upserts: [], deletes: [p.id] }]);
      expect(await store.loadRow("projects", p.id)).toBeNull();
      await store.close();
    }, 60_000);

    it("keeps users, sessions, workspaces and memberships in real columns, with no JSON blob", async (ctx) => {
      ok(ctx);
      const { sql } = await be.fresh();
      const e1 = await startEnv({ store: new RelationalStore(sql()) });
      const a = await e1.signup("Typed@X.com");
      await new Promise((r) => setTimeout(r, 400));
      const cols = async (table: string) => (await sql().all<{ name: string }>(isPg ? `SELECT column_name AS name FROM information_schema.columns WHERE table_name = ? AND table_schema = current_schema()` : `SELECT name FROM pragma_table_info(?)`, [table])).map((r) => r.name);
      const users = await cols("wb_users");
      expect(users).toEqual(expect.arrayContaining(["id", "email", "email_verified", "email_verified_at", "password_hash", "name", "avatar_url", "mfa_enabled", "mfa_secret", "last_login_at", "created_at", "updated_at"]));
      for (const t of ["wb_users", "wb_sessions", "wb_workspaces", "wb_memberships"]) expect(await cols(t)).not.toContain("data");
      const row = (await sql().all<Record<string, unknown>>(`SELECT * FROM wb_users WHERE email = ?`, ["typed@x.com"]))[0]!;
      expect(row["name"]).toBeTruthy(); expect(row["password_hash"]).toMatch(/\S/); expect(row["mfa_enabled"] === false || row["mfa_enabled"] === 0).toBe(true);
      expect(row["last_login_at"]).not.toBeNull(); expect(row["created_at"]).not.toBeNull(); expect(row["updated_at"]).not.toBeNull();
      expect((await sql().all(`SELECT * FROM wb_sessions WHERE user_id = ?`, [row["id"]])).length).toBe(1);
      expect((await sql().all<{ role: string }>(`SELECT role FROM wb_memberships WHERE user_id = ?`, [row["id"]]))[0]!.role).toBe("OWNER");
      await e1.close();
      // everything comes back after a restart, and the same session still works
      const e2 = await startEnv({ store: new RelationalStore(sql()) });
      const c = e2.client(); a.cookies.forEach((v, k) => c.cookies.set(k, v));
      expect((await c.get("/auth/me")).data.user.email).toBe("typed@x.com");
      await e2.close();
    }, 60_000);

    it("upgrades the old users/sessions/workspaces/memberships layout (JSON blob) in place, keeping the data", async (ctx) => {
      ok(ctx);
      const { sql } = await be.fresh();
      const q = sql();
      const j = isPg ? "JSONB" : "TEXT", bi = isPg ? "BIGINT" : "INTEGER";
      const legacy = (name: string, cols: string, unique: string) => q.run(`CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${cols}, version BIGINT NOT NULL DEFAULT 1, data ${j} NOT NULL, stored_at BIGINT NOT NULL, ${unique})`);
      await q.run(`CREATE TABLE wb_migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)`);
      await q.run(`CREATE TABLE wb_changes (seq ${isPg ? "BIGSERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT"}, tbl TEXT NOT NULL, row_id TEXT NOT NULL, op TEXT NOT NULL, origin TEXT NOT NULL, at BIGINT NOT NULL)`);
      await legacy("wb_users", `email TEXT, created_at ${bi}`, "UNIQUE (email)");
      await legacy("wb_sessions", `user_id TEXT, token_hash TEXT, expires_at ${bi}`, "UNIQUE (token_hash), FOREIGN KEY (user_id) REFERENCES wb_users (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED");
      await legacy("wb_workspaces", `slug TEXT, plan TEXT`, "UNIQUE (slug)");
      await legacy("wb_memberships", `user_id TEXT, workspace_id TEXT, role TEXT`, "UNIQUE (user_id, workspace_id), FOREIGN KEY (user_id) REFERENCES wb_users (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED, FOREIGN KEY (workspace_id) REFERENCES wb_workspaces (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED");
      for (const name of ["001_relational_tables", "002_import_legacy_rows"]) await q.run(`INSERT INTO wb_migrations (name, applied_at) VALUES (?, 1)`, [name]);
      const put = (table: string, cols: string, vals: unknown[], data: object) => q.run(`INSERT INTO ${table} (id, ${cols}, data, stored_at) VALUES (?, ${vals.map(() => "?").join(", ")}, ${isPg ? "CAST(? AS jsonb)" : "?"}, 1)`, [(data as { id: string }).id, ...vals, JSON.stringify(data), ]);
      const created = 1_700_000_000_000;
      await put("wb_users", "email, created_at", ["old@x.com", created], { id: "usr_old", email: "old@x.com", passwordHash: "hash", name: "Old User", emailVerified: true, mfaEnabled: true, mfaSecret: "sec", recoveryHashes: ["a", "b"], createdAt: created });
      await put("wb_workspaces", "slug, plan", ["old-ws", "pro"], { id: "wsp_old", name: "Old WS", slug: "old-ws", plan: "pro", createdAt: created, billing: { status: "active", currentPeriodEnd: created + 1000, customerCode: "CUS_1", subscriptionCode: "SUB_1", emailToken: "tok" } });
      await put("wb_memberships", "user_id, workspace_id, role", ["usr_old", "wsp_old", "OWNER"], { id: "mem_old", userId: "usr_old", workspaceId: "wsp_old", role: "OWNER" });
      await put("wb_sessions", "user_id, token_hash, expires_at", ["usr_old", "th", created + 5000], { id: "ses_old", userId: "usr_old", tokenHash: "th", expiresAt: created + 5000, userAgent: "UA" });

      const store = new RelationalStore(sql(), () => undefined);
      await store.init();
      await store.init(); // second start is a no-op
      const u = JSON.parse((await store.loadRow("users", "usr_old"))!);
      expect(u).toMatchObject({ id: "usr_old", email: "old@x.com", passwordHash: "hash", name: "Old User", emailVerified: true, mfaEnabled: true, mfaSecret: "sec", recoveryHashes: ["a", "b"], createdAt: created });
      const w = JSON.parse((await store.loadRow("workspaces", "wsp_old"))!);
      expect(w).toMatchObject({ name: "Old WS", plan: "pro", createdAt: created, billing: { status: "active", currentPeriodEnd: created + 1000, customerCode: "CUS_1", subscriptionCode: "SUB_1", emailToken: "tok" } });
      expect(JSON.parse((await store.loadRow("sessions", "ses_old"))!)).toMatchObject({ userId: "usr_old", tokenHash: "th", expiresAt: created + 5000, userAgent: "UA" });
      expect(JSON.parse((await store.loadRow("memberships", "mem_old"))!)).toMatchObject({ userId: "usr_old", workspaceId: "wsp_old", role: "OWNER" });
      const names = (await sql().all<{ name: string }>(isPg ? `SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'wb_users' AND table_schema = current_schema()` : `SELECT name FROM pragma_table_info('wb_users')`)).map((r) => r.name);
      expect(names).not.toContain("data"); expect(names).toContain("password_hash");
      // writing through the upgraded table works, and created_at is not overwritten by later updates
      await store.apply([{ table: "users", upserts: [{ id: "usr_old", data: JSON.stringify({ ...u, name: "Renamed", createdAt: 5 }) }], deletes: [] }]);
      const u2 = JSON.parse((await store.loadRow("users", "usr_old"))!);
      expect(u2.name).toBe("Renamed"); expect(u2.createdAt).toBe(created);
      await store.close();
    }, 60_000);

    it("imports a database written by the old JSON-row store, once", async (ctx) => {
      ok(ctx);
      const { sql, legacy } = await be.fresh();
      const e1 = await startEnv({ store: legacy() });
      const owner = await e1.signup("old@x.com");
      const project = (await owner.post(`/workspaces/${owner.workspaceId}/projects`, { name: "Old" })).data.project;
      const doc = (await owner.get(`/projects/${project.id}/document`)).data;
      await e1.close();
      for (let round = 0; round < 2; round++) { // second start must not import again or fail
        const e2 = await startEnv({ store: new RelationalStore(sql()) });
        const c = e2.client(); owner.cookies.forEach((v, k) => c.cookies.set(k, v));
        expect((await c.get("/auth/me")).status).toBe(200);
        expect((await c.get(`/projects/${project.id}/document`)).data).toEqual(doc);
        await e2.close();
      }
    }, 120_000);

    it("two API instances on one database stay consistent: sessions, projects and concurrent document edits", async (ctx) => {
      ok(ctx);
      const { sql } = await be.fresh();
      const A = await startEnv({ store: new RelationalStore(sql()), multiInstance: true });
      const B = await startEnv({ store: new RelationalStore(sql()), multiInstance: true });
      const a = await A.signup("two@x.com");
      // Signed in on A, immediately served by B.
      const b = B.client(); a.cookies.forEach((v, k) => b.cookies.set(k, v));
      expect((await b.get("/auth/me")).status).toBe(200);
      // Project created on A is editable from B.
      const proj = (await a.post(`/workspaces/${a.workspaceId}/projects`, { name: "Shared" })).data.project;
      const head = (await b.get(`/projects/${proj.id}/document`)).data;
      expect(head.revision).toBeGreaterThan(0);
      const root = head.document.pages[0].rootId as string;
      const insert = (id: string) => ({ type: "insertSubtree", rootId: id, parentId: root, index: 0, nodes: [{ id, tag: "p", parentId: root, children: [], text: id, props: {}, style: {}, locked: false, hidden: false, name: id } ] });
      void insert;

      // Both instances submit edits at the same time, many rounds. Every response is either committed or a clean conflict.
      const statuses: number[] = [];
      let rev = head.revision as number;
      for (let round = 0; round < 8; round++) {
        const mk = (who: string) => ({ id: `${who}-${round}`, clientId: who, baseRevision: rev, ops: [{ type: "setStyle", id: root, breakpoint: "base", declarations: { "--tag": `${who}${round}` } }] });
        const [ra, rb] = await Promise.all([a.post(`/projects/${proj.id}/ops`, mk("a")), b.post(`/projects/${proj.id}/ops`, mk("b"))]);
        statuses.push(ra.status, rb.status);
        for (const r of [ra, rb]) expect([201, 409]).toContain(r.status);
        const next = (await a.get(`/projects/${proj.id}/document`)).data.revision as number;
        rev = Math.max(rev, next);
      }
      expect(statuses.filter((s) => s === 201).length).toBeGreaterThan(0);

      // The database holds one revision per number, with no gaps, and the head points at the highest.
      await new Promise((r) => setTimeout(r, 300));
      const rows = await sql().all<{ revision: number | string }>("SELECT revision FROM wb_revisions WHERE project_id = ? ORDER BY revision", [proj.id]);
      const nums = rows.map((r) => Number(r.revision));
      expect(new Set(nums).size).toBe(nums.length);
      expect(nums).toEqual(Array.from({ length: nums.length }, (_, i) => i + 1));
      const headRow = await sql().all<{ head_revision: number | string }>("SELECT head_revision FROM wb_projects WHERE id = ?", [proj.id]);
      expect(Number(headRow[0]!.head_revision)).toBe(nums[nums.length - 1]);

      // After catching up, both instances serve identical documents.
      let da = await a.get(`/projects/${proj.id}/document`), dbb = await b.get(`/projects/${proj.id}/document`);
      for (let i = 0; i < 100 && dbb.data.revision !== da.data.revision; i++) { // wait for convergence, up to 10 s
        await new Promise((r) => setTimeout(r, 100));
        [da, dbb] = await Promise.all([a.get(`/projects/${proj.id}/document`), b.get(`/projects/${proj.id}/document`)]);
      }
      expect(dbb.data.revision).toBe(da.data.revision);
      expect(dbb.data.document).toEqual(da.data.document);
      await A.close(); await B.close();
    }, 180_000);

    it("a revision number already taken by another instance is refused, and the loser's copy is reverted", async (ctx) => {
      ok(ctx);
      const { sql } = await be.fresh();
      const db1 = new Db(); const { ws, p } = seed(db1);
      const s1 = new RelationalStore(sql()); const p1 = new Persistence(db1, s1, { debounceMs: 5, intervalMs: 60_000, syncMs: 60_000, log: () => undefined });
      await p1.load(); await p1.flush();
      const db2 = new Db(); const s2 = new RelationalStore(sql()); const p2 = new Persistence(db2, s2, { debounceMs: 5, intervalMs: 60_000, syncMs: 60_000, log: () => undefined });
      await p2.load();
      expect(db2.projects.get(p.id)?.headRevision).toBe(1);
      // Both commit "revision 2" with different content.
      db1.revisions.insert({ projectId: p.id, revision: 2, document: { who: "one" } as never, createdAt: 2 }); db1.projects.update(p.id, { headRevision: 2 });
      db2.revisions.insert({ projectId: p.id, revision: 2, document: { who: "two" } as never, createdAt: 3 }); db2.projects.update(p.id, { headRevision: 2 });
      expect((await p1.flush()).rejected).toEqual([]);
      const r = await p2.flush();
      expect(r.rejected.map((x) => x.table)).toEqual(["revisions"]);
      // Instance 2 now agrees with the database: head 2 is instance 1's document; its own attempt is gone.
      await p2.sync();
      const revs2 = db2.revisions.filter((x) => x.projectId === p.id && x.revision === 2);
      expect(revs2).toHaveLength(1);
      expect((revs2[0]!.document as unknown as { who: string }).who).toBe("one");
      expect(db2.projects.get(p.id)?.headRevision).toBe(2);
      // And it can continue from there.
      db2.revisions.insert({ projectId: p.id, revision: 3, document: { who: "two-next" } as never, createdAt: 4 }); db2.projects.update(p.id, { headRevision: 3 });
      expect((await p2.flush()).rejected).toEqual([]);
      await p1.sync();
      expect(db1.projects.get(p.id)?.headRevision).toBe(3);
      void ws;
      await p1.close(); await p2.close();
    }, 60_000);
  });
}
