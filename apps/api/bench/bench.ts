import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { compileCss } from "@webbrik/css-engine";
import { applyOperations, createDocument, createNode, validateDocument, type Document, type Operation } from "@webbrik/document-model";
import { exportStatic } from "@webbrik/exporter";
import { renderPage } from "@webbrik/renderer";
import { Db } from "../src/common/db";
import { Persistence } from "../src/common/persistence";
import { RelationalStore, sqliteSql } from "../src/common/relational";
import { startEnv } from "../test/helpers";

export interface Result { name: string; ms: number; detail?: string }

const time = async <T>(fn: () => T | Promise<T>, runs = 5): Promise<{ ms: number; value: T }> => {
  let best = Infinity, value!: T;
  for (let i = 0; i < runs; i++) { const t = performance.now(); value = await fn(); best = Math.min(best, performance.now() - t); }
  return { ms: best, value };
};

/** A page with `n` elements: sections of 10 cards, each card a heading + paragraph + link. */
export function bigDoc(n: number): Document {
  const doc = createDocument("Bench");
  const root = doc.pages[0]!.rootId;
  const nodes = [];
  let count = 0, s = 0;
  while (count < n) {
    const sec = createNode({ id: `s${s}`, parentId: root, tag: "section" }); nodes.push(sec); count++;
    for (let c = 0; c < 10 && count < n; c++) {
      const card = createNode({ id: `s${s}c${c}`, parentId: sec.id, tag: "div" });
      const h = createNode({ id: `s${s}c${c}h`, parentId: card.id, tag: "h3", text: `Card ${s}-${c}` });
      const p = createNode({ id: `s${s}c${c}p`, parentId: card.id, tag: "p", text: "Body copy that is a realistic length for a card description." });
      nodes.push(card, h, p); count += 3;
    }
    s++;
  }
  const byId: Record<string, (typeof nodes)[number]> = { ...doc.nodes };
  for (const n of nodes) byId[n.id] = n;
  for (const n of nodes) if (n.parentId && byId[n.parentId]) byId[n.parentId] = { ...byId[n.parentId]!, children: [...byId[n.parentId]!.children, n.id] };
  return { ...doc, nodes: byId };
}

export async function runBench(sizes = [1_000, 5_000, 20_000]): Promise<Result[]> {
  const out: Result[] = [];
  for (const n of sizes) {
    const doc = bigDoc(n);
    const page = doc.pages[0]!;
    const total = Object.keys(doc.nodes).length;
    out.push({ name: `render page (${total} nodes)`, ms: (await time(() => renderPage(doc, page, {}))).ms });
    out.push({ name: `compile CSS (${total} nodes)`, ms: (await time(() => compileCss(doc))).ms });
    out.push({ name: `validate document (${total} nodes)`, ms: (await time(() => validateDocument(doc))).ms });
    const heading = Object.values(doc.nodes).find((x) => x.tag === "h3")!;
    const one: Operation[] = [{ type: "setStyle", id: heading.id, breakpoint: "base", declarations: { color: "#111" } }];
    out.push({ name: `apply one edit (${total} nodes)`, ms: (await time(() => applyOperations(doc, one), 20)).ms });
    const many: Operation[] = Object.values(doc.nodes).filter((x) => x.tag === "h3").slice(0, 200).map((x, i) => ({ type: "setStyle", id: x.id, breakpoint: "base", declarations: { "font-size": `${10 + (i % 20)}px` } }));
    out.push({ name: `apply 200 edits in one batch (${total} nodes)`, ms: (await time(() => applyOperations(doc, many), 3)).ms });
    if (n <= 5_000) out.push({ name: `static export (${total} nodes)`, ms: (await time(() => exportStatic(doc), 3)).ms });
  }

  // CMS: a collection page per item
  {
    const doc0 = bigDoc(300); const home = doc0.pages[0]!.rootId;
    const doc = { ...doc0, nodes: { ...doc0.nodes, r2: createNode({ id: "r2", tag: "body", parentId: null }) }, pages: [...doc0.pages, { id: "pp", name: "Post", route: "/blog/:slug", rootId: "r2", meta: { title: "{title}" }, isHome: false, collectionId: "posts" }] };
    const items = Array.from({ length: 500 }, (_, i) => ({ id: `i${i}`, slug: `post-${i}`, data: { title: `Post ${i}`, body: "<p>text</p>" } }));
    void home;
    out.push({ name: "static export, 500 CMS pages", ms: (await time(() => exportStatic(doc, { content: { posts: items } }), 3)).ms });
  }

  // Persistence
  {
    const dir = mkdtempSync(join(tmpdir(), "wb-bench-"));
    try {
      const store = new RelationalStore(sqliteSql(join(dir, "b.db"))); await store.init();
      const db = new Db(); const p = new Persistence(db, store, { debounceMs: 0, intervalMs: 3_600_000, log: () => undefined });
      for (let i = 0; i < 10_000; i++) db.audit.insert({ workspaceId: "w", actor: "u", action: "bench", target: String(i), at: i } as never);
      out.push({ name: "persist 10,000 new rows (SQLite)", ms: (await time(() => p.flush(), 1)).ms });
      let t = performance.now(); db.users.insert({ email: "x@y.z", name: "x", passwordHash: "h", emailVerified: true, mfaEnabled: false, createdAt: 1 } as never); await p.flush();
      out.push({ name: "persist 1 changed row among 10,000", ms: performance.now() - t });
      await p.close();
      t = performance.now(); const db2 = new Db(); const p2 = new Persistence(db2, new RelationalStore(sqliteSql(join(dir, "b.db"))), { log: () => undefined }); await p2.load();
      out.push({ name: "cold start: load 10,001 rows", ms: performance.now() - t, detail: `${db2.audit.all().length} audit rows` });
      await p2.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }

  // HTTP
  {
    process.env.DISABLE_RATE_LIMIT = "1";
    const env = await startEnv();
    const c = await env.signup("bench@example.com");
    const run = async (name: string, path: string, total: number, conc: number) => {
      let next = 0; const lat: number[] = [];
      const t0 = performance.now();
      await Promise.all(Array.from({ length: conc }, async () => { while (next++ < total) { const t = performance.now(); const r = await c.get(path); if (r.status !== 200) throw new Error(`${path} → ${r.status}`); lat.push(performance.now() - t); } }));
      const wall = performance.now() - t0; lat.sort((a, b) => a - b);
      out.push({ name, ms: lat[Math.floor(lat.length * 0.95)]!, detail: `${Math.round((total / wall) * 1000)} req/s, p50 ${lat[Math.floor(lat.length / 2)]!.toFixed(1)} ms, p95 shown` });
    };
    await run("API GET /auth/me (p95, 20 concurrent, 2000 req)", "/auth/me", 2000, 20);
    const pid = (await c.post(`/workspaces/${c.workspaceId}/projects`, { name: "B" })).data.project.id;
    await run("API GET project document (p95, 20 concurrent, 1000 req)", `/projects/${pid}/document`, 1000, 20);
    await env.close();
  }
  return out;
}
