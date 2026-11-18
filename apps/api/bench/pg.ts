/** Load numbers on a real PostgreSQL (embedded binary, so no external service needed). Run: pnpm --filter @webbrik/api exec tsx bench/pg.ts */
import { chownSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createNode } from "@webbrik/document-model";
import { Db } from "../src/common/db";
import { Persistence } from "../src/common/persistence";
import { RelationalStore, pgSql } from "../src/common/relational";
import { startEnv } from "../test/helpers";

const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]!;
const line = (name: string, v: string) => console.log(`${name.padEnd(62)} ${v}`);

async function main() {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const dir = mkdtempSync(join(tmpdir(), "webbrik-pgb-"));
  if (process.getuid?.() === 0) chownSync(dir, 102, 104);
  const port = 55000 + Math.floor(Math.random() * 800);
  const pg = new EmbeddedPostgres({ databaseDir: join(dir, "data"), user: "wb", password: "wb", port, persistent: false, onLog: () => undefined, onError: () => undefined });
  await pg.initialise(); await pg.start();
  const url = (n: string) => `postgres://wb:wb@localhost:${port}/${n}`;
  try {
    await pg.createDatabase("persist");
    const store = new RelationalStore(pgSql(url("persist"))); await store.init();
    const db = new Db(); const p = new Persistence(db, store, { debounceMs: 0, intervalMs: 3_600_000, log: () => undefined });
    for (let i = 0; i < 10_000; i++) db.audit.insert({ workspaceId: "w", actor: "u", action: "bench", target: String(i), at: i } as never);
    let t = performance.now(); await p.flush(); line("persist 10,000 new rows", `${(performance.now() - t).toFixed(0)} ms`);
    t = performance.now(); db.users.insert({ email: "x@y.z", name: "x", passwordHash: "h", emailVerified: true, mfaEnabled: false, createdAt: 1 } as never); await p.flush();
    line("persist 1 changed row among 10,000", `${(performance.now() - t).toFixed(1)} ms`); await p.close();
    t = performance.now(); const db2 = new Db(); const p2 = new Persistence(db2, new RelationalStore(pgSql(url("persist"))), { log: () => undefined }); await p2.load();
    line("cold start: load 10,001 rows", `${(performance.now() - t).toFixed(0)} ms (${db2.audit.all().length} audit rows)`); await p2.close();

    await pg.createDatabase("http");
    process.env.DISABLE_RATE_LIMIT = "1";
    const env = await startEnv({ store: new RelationalStore(pgSql(url("http"))) });
    const c = await env.signup("pgbench@example.com");
    const pid = (await c.post(`/workspaces/${c.workspaceId}/projects`, { name: "B" })).data.project.id;
    const run = async (name: string, total: number, conc: number, one: (i: number) => Promise<void>) => {
      let next = 0; const lat: number[] = []; const t0 = performance.now();
      await Promise.all(Array.from({ length: conc }, async () => { for (;;) { const i = next++; if (i >= total) return; const s = performance.now(); await one(i); lat.push(performance.now() - s); } }));
      line(name, `${Math.round((total / (performance.now() - t0)) * 1000)} req/s, p50 ${pct(lat, 0.5).toFixed(1)} ms, p95 ${pct(lat, 0.95).toFixed(1)} ms, max ${Math.max(...lat).toFixed(0)} ms`);
    };
    await run("GET /auth/me (20 concurrent, 2000 req)", 2000, 20, async () => { const r = await c.get("/auth/me"); if (r.status !== 200) throw new Error(String(r.status)); });
    await run("GET project document (20 concurrent, 1000 req)", 1000, 20, async () => { const r = await c.get(`/projects/${pid}/document`); if (r.status !== 200) throw new Error(String(r.status)); });
    // Writes: 10 editors committing small edits to one project (each commit is a new revision, persisted through the write-behind queue).
    let rev = (await c.get(`/projects/${pid}/document`)).data.revision as number; const root = (await c.get(`/projects/${pid}/document`)).data.document.pages[0].rootId as string;
    let conflicts = 0;
    await run("POST ops: 10 concurrent editors, 300 commits, one project", 300, 10, async (i) => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const r = await c.post(`/projects/${pid}/ops`, { id: `op${i}-${attempt}`, clientId: `cl${i % 10}`, baseRevision: rev, ops: [{ type: "insertSubtree", rootId: `n${i}`, nodes: [createNode({ id: `n${i}`, parentId: root, tag: "div" })], parentId: root, index: 0 }] });
        if (r.status === 201 || r.status === 200) { rev = Math.max(rev, r.data.committed.revision); return; }
        conflicts++; rev = (await c.get(`/projects/${pid}/document`)).data.revision;
      }
      throw new Error("commit never landed");
    });
    line("  (revision conflicts retried during the write run)", String(conflicts));
    await env.close();
  } finally { await pg.stop(); rmSync(dir, { recursive: true, force: true }); }
  console.log(`\nnode ${process.version}, ${process.platform}/${process.arch}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
