import { mkdtempSync, chownSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Db } from "../src/common/db";
import { Persistence, type RowChange, type RowStore } from "../src/common/persistence";
import { PostgresStore, SqliteStore } from "../src/common/stores";
import { startEnv } from "./helpers";

process.env.DISABLE_RATE_LIMIT = "1";

/** Create data, shut the app down, boot a fresh one on the same store, and check it all came back. */
async function restartRoundtrip(makeStore: () => RowStore) {
  const e1 = await startEnv({ store: makeStore() });
  const owner = await e1.signup("persist@x.com");
  const project = (await owner.post(`/workspaces/${owner.workspaceId}/projects`, { name: "Kept" })).data.project;
  const col = (await owner.post(`/projects/${project.id}/collections`, { slug: "posts", name: "Posts", fields: [{ name: "title", type: "text", required: true }] })).data.collection;
  const item = (await owner.post(`/projects/${project.id}/collections/${col.id}/items`, { slug: "one", data: { title: "One" }, status: "published" })).data.item;
  const doc1 = (await owner.get(`/projects/${project.id}/document`)).data;
  await e1.close(); // flushes

  const e2 = await startEnv({ store: makeStore() });
  const again = e2.client();
  Object.assign(again.cookies, {}); owner.cookies.forEach((v, k) => again.cookies.set(k, v)); // same session cookie
  expect((await again.get("/auth/me")).status).toBe(200);                       // session survived
  const doc2 = (await again.get(`/projects/${project.id}/document`)).data;
  expect(doc2.revision).toBe(doc1.revision);
  expect(doc2.document).toEqual(doc1.document);
  const items = (await again.get(`/projects/${project.id}/collections/${col.id}/items`)).data.items;
  expect(items.map((i: { slug: string }) => i.slug)).toEqual(["one"]);
  // The password was stored hashed and still verifies after restart.
  const fresh = e2.client();
  expect((await fresh.post("/auth/login", { email: "persist@x.com", password: "correct-horse-battery" })).status).toBe(200);
  // Edits and deletions persist too.
  expect((await again.req("DELETE", `/projects/${project.id}/collections/${col.id}/items/${item.id}`)).status).toBe(204);
  await e2.close();
  const e3 = await startEnv({ store: makeStore() });
  const c3 = e3.client(); owner.cookies.forEach((v, k) => c3.cookies.set(k, v));
  expect((await c3.get(`/projects/${project.id}/collections/${col.id}/items`)).data.items).toEqual([]);
  await e3.close();
}

describe("persistence: SQLite", () => {
  const dir = mkdtempSync(join(tmpdir(), "webbrik-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  it("survives an API restart (accounts, sessions, projects, documents, CMS, deletions)", async () => {
    await restartRoundtrip(() => new SqliteStore(join(dir, "data.db")));
  });
});

class FakeStore implements RowStore {
  rows = new Map<string, string>();
  applied: RowChange[][] = [];
  failNext = 0;
  async init() {}
  async loadAll(t: string) { return [...this.rows].filter(([k]) => k.startsWith(t + "\u0000")).map(([k, data]) => ({ id: k.split("\u0000")[1]!, data })); }
  async apply(c: RowChange[]) {
    if (this.failNext > 0) { this.failNext--; throw new Error("db down"); }
    this.applied.push(c);
    for (const ch of c) { for (const u of ch.upserts) this.rows.set(`${ch.table}\u0000${u.id}`, u.data); for (const d of ch.deletes) this.rows.delete(`${ch.table}\u0000${d}`); }
  }
  async close() {}
}

describe("persistence: write-behind", () => {
  const mk = () => { const db = new Db(); const store = new FakeStore(); const p = new Persistence(db, store, { debounceMs: 5, intervalMs: 60_000, log: () => undefined }); return { db, store, p }; };

  it("writes only what changed and never re-writes immutable rows", async () => {
    const { db, store, p } = mk();
    await p.load();
    const u = db.users.insert({ email: "a@x.com", passwordHash: "h", name: "A", emailVerified: false, mfaEnabled: false, createdAt: 1 });
    db.logAudit("w1", "x");
    await p.flush();
    expect(store.applied).toHaveLength(1);
    await p.flush();
    expect(store.applied).toHaveLength(1);                      // nothing changed → no write
    db.users.update(u.id, { name: "B" });
    await p.flush();
    expect(store.applied.at(-1)!.map((c) => c.table)).toEqual(["users"]); // audit row not re-sent
    // mutation through a returned reference (not via update()) is detected too
    db.users.get(u.id)!.emailVerified = true;
    await p.flush();
    expect(JSON.parse(store.rows.get(`users\u0000${u.id}`)!).emailVerified).toBe(true);
    db.users.delete(u.id);
    await p.flush();
    expect(store.rows.has(`users\u0000${u.id}`)).toBe(false);
    await p.close();
  });

  it("keeps changes pending when the store is down and writes them once it recovers", async () => {
    const { db, store, p } = mk();
    await p.load();
    db.users.insert({ email: "b@x.com", passwordHash: "h", name: "B", emailVerified: false, mfaEnabled: false, createdAt: 1 });
    store.failNext = 1;
    await expect(p.flush()).rejects.toThrow("db down");
    expect(store.rows.size).toBe(0);
    await p.flush();                                            // retry succeeds with the same diff
    expect(store.rows.size).toBe(1);
    await p.close();
  });

  it("loads existing rows at startup and does not duplicate them", async () => {
    const { db, store, p } = mk();
    await p.load();
    db.users.insert({ id: "usr_fixed", email: "c@x.com", passwordHash: "h", name: "C", emailVerified: true, mfaEnabled: false, createdAt: 1 });
    await p.close();
    const db2 = new Db(); const p2 = new Persistence(db2, store, { intervalMs: 60_000, log: () => undefined });
    await p2.load();
    expect(db2.users.get("usr_fixed")?.email).toBe("c@x.com");
    const before = store.applied.length;
    await p2.flush();
    expect(store.applied.length).toBe(before);
    await p2.close();
  });
});

describe("persistence: PostgreSQL (embedded)", () => {
  let stop: (() => Promise<void>) | null = null;
  let url = "";
  let skip: string | null = null;
  afterAll(async () => { await stop?.(); });

  it("survives an API restart against a real Postgres server", async (ctx) => {
    try {
      const { default: EmbeddedPostgres } = await import("embedded-postgres");
      const dir = mkdtempSync(join(tmpdir(), "webbrik-pg-"));
      if (process.getuid?.() === 0) chownSync(dir, 102, 104); // Postgres refuses to run as root; use the `postgres` system user when available
      const pg = new EmbeddedPostgres({ databaseDir: join(dir, "data"), user: "wb", password: "wb", port: 54000 + Math.floor(Math.random() * 900), persistent: false, onLog: () => undefined, onError: () => undefined });
      await pg.initialise(); await pg.start(); await pg.createDatabase("wb");
      stop = async () => { await pg.stop(); rmSync(dir, { recursive: true, force: true }); };
      url = `postgres://wb:wb@localhost:${(pg as unknown as { options: { port: number } }).options.port}/wb`;
    } catch (e) { skip = e instanceof Error ? e.message : String(e); }
    if (skip) return ctx.skip();
    await restartRoundtrip(() => new PostgresStore(url));
  }, 180_000);
});
