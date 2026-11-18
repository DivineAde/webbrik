import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyOperations, createNode } from "@webbrik/document-model";
import { MemoryProvider } from "@webbrik/deployment";
import { MemoryStorage } from "@webbrik/assets";
import { decryptSecret, encryptSecret } from "../src/common/crypto";
import { startEnv, type Env } from "./helpers";

let env: Env;
const provider = new MemoryProvider();
const storage = new MemoryStorage();
let aiMode: "good" | "bad" | "stale" = "good";
beforeAll(async () => {
  env = await startEnv({
    deploy: provider,
    storage,
    ai: { propose: async ({ document }) => aiMode === "bad" ? { summary: "x", operations: [{ type: "dropDatabase" }] } : { summary: "Add a heading", operations: [{ type: "insertSubtree", rootId: "ai1", nodes: [createNode({ id: "ai1", parentId: document.pages[0]!.rootId, tag: "h1", text: "Generated" })], parentId: document.pages[0]!.rootId, index: 0 }] } },
  });
});
afterAll(async () => { await env.close(); });

async function setup(email: string, plan = "pro") {
  const o = await env.signup(email);
  await o.post(`/workspaces/${o.workspaceId}/plan`, { plan });
  const pid = (await o.post(`/workspaces/${o.workspaceId}/projects`, { name: "Site" })).data.project.id as string;
  return { o, pid };
}

const png = (w = 10, h = 10) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b.toString("base64"); };

describe("publishing CMS content", () => {
  it("renders bindings, repeaters and dynamic pages from published items only", async () => {
    const { o, pid } = await setup("cms-pub@x.com");
    const posts = (await o.post(`/projects/${pid}/collections`, { slug: "posts", name: "Posts", fields: [{ name: "title", type: "text", required: true }] })).data.collection;
    const add = (slug: string, title: string, extra: object = {}) => o.post(`/projects/${pid}/collections/${posts.id}/items`, { slug, data: { title }, ...extra });
    await add("live-post", "Live post", { status: "published" });
    await add("secret-draft", "Secret draft");
    await add("later", "Scheduled later", { status: "scheduled", publishAt: new Date(Date.now() + 86_400_000).toISOString() });
    const head = (await o.get(`/projects/${pid}/document`)).data;
    const root = head.document.pages[0].rootId;
    const doc = applyOperations(head.document, [
      { type: "insertSubtree", rootId: "ul", nodes: [createNode({ id: "ul", parentId: root, tag: "ul", props: { repeat: posts.id } })], parentId: root, index: 0 },
      { type: "insertSubtree", rootId: "li", nodes: [createNode({ id: "li", parentId: "ul", tag: "li", text: "x", binding: { collectionId: posts.id, field: "title", target: "text" } })], parentId: "ul", index: 0 },
      { type: "addPage", page: { id: "pp", name: "Post", route: "/blog/:slug", rootId: "pr", meta: { title: "{title}" }, isHome: false, collectionId: posts.id }, rootNode: createNode({ id: "pr", parentId: null, tag: "main" }) },
      { type: "insertSubtree", rootId: "h", nodes: [createNode({ id: "h", parentId: "pr", tag: "h1", text: "x", binding: { collectionId: posts.id, field: "title", target: "text" } })], parentId: "pr", index: 0 },
    ]).doc;
    expect((await o.put(`/projects/${pid}/document`, { baseRevision: head.revision, document: doc })).status).toBe(200);
    const d = (await o.post(`/projects/${pid}/deployments`, { target: "preview" })).data.deployment;
    const files = provider.files.get(d.providerId)!;
    expect(files["index.html"]).toContain("Live post");
    expect(files["index.html"]).not.toContain("Secret draft");
    expect(files["index.html"]).not.toContain("Scheduled later");
    expect(Object.keys(files).filter((f) => f.startsWith("blog/"))).toEqual(["blog/live-post/index.html"]);
    expect(files["blog/live-post/index.html"]).toContain("<title>Live post</title>");
  });
});

describe("publishing", () => {
  it("publishes previews and production, tracks usage, injects analytics, rolls back, and gates on quality", async () => {
    const { o, pid } = await setup("pub@x.com");
    expect((await o.put(`/projects/${pid}/integrations/analytics`, { configs: [{ provider: "ga4", measurementId: 'G-1");alert(1)' }] })).status).toBe(400);
    expect((await o.put(`/projects/${pid}/integrations/analytics`, { configs: [{ provider: "plausible", domain: "example.com" }] })).status).toBe(200);
    const untitled = await o.req("POST", `/projects/${pid}/deployments?strict=1`, { target: "production" });
    expect(untitled.data.error.code).toBe("quality_gate"); // a new page has no title yet
    const first = (await o.get(`/projects/${pid}/document`)).data;
    await o.put(`/projects/${pid}/document`, { baseRevision: first.revision, document: { ...first.document, pages: [{ ...first.document.pages[0], meta: { title: "Home", description: "Welcome" } }] } });
    const d = await o.post(`/projects/${pid}/deployments`, { target: "production" });
    expect(d.status).toBe(201);
    expect(d.data.deployment).toMatchObject({ status: "ready", target: "production", revision: 2 });
    expect(d.data.quality.errors).toBe(0);
    expect(d.data.deployment.logs.length).toBeGreaterThan(0);
    const strict = await o.req("POST", `/projects/${pid}/deployments?strict=1`, { target: "preview" });
    expect(strict.status).toBe(201); // fresh doc has warnings but no errors
    const list = (await o.get(`/projects/${pid}/deployments`)).data.deployments;
    expect(list).toHaveLength(2);
    expect((await o.get(`/projects/${pid}/deployments/${d.data.deployment.id}/logs`)).data.logs.length).toBeGreaterThan(0);
    const prev = list.find((x: any) => x.target === "preview");
    expect((await o.post(`/projects/${pid}/deployments/${prev.id}/rollback`)).data.deployment.target).toBe("production");
    expect((await o.get(`/projects/${pid}/health`)).data.healthy).toBe(true);
    expect((await o.get(`/workspaces/${o.workspaceId}/usage`)).data.usage.publishes).toBe(2);
    expect((await o.get(`/workspaces/${o.workspaceId}/audit`)).data.entries.some((e: any) => e.action === "deploy.rollback")).toBe(true);

    // add an image without alt -> quality error blocks strict publishing
    const cur = (await o.get(`/projects/${pid}/document`)).data;
    const root = cur.document.pages[0].rootId;
    const img = createNode({ id: "im", parentId: root, tag: "img", attributes: { src: "/a.png" } });
    await o.put(`/projects/${pid}/document`, { baseRevision: cur.revision, document: { ...cur.document, nodes: { ...cur.document.nodes, im: img, [root]: { ...cur.document.nodes[root], children: ["im"] } } } });
    const blocked = await o.req("POST", `/projects/${pid}/deployments?strict=1`, { target: "production" });
    expect(blocked.status).toBe(400);
    expect(blocked.data.error.code).toBe("quality_gate");
  });

  it("enforces publish quotas and role permissions", async () => {
    const { o, pid } = await setup("pubq@x.com", "free");
    for (let i = 0; i < 20; i++) expect((await o.post(`/projects/${pid}/deployments`, { target: "preview" })).status).toBe(201);
    expect((await o.post(`/projects/${pid}/deployments`, { target: "preview" })).data.error.code).toBe("quota_exceeded");
    const viewer = await env.signup("viewer@x.com");
    expect((await viewer.get(`/projects/${pid}/deployments`)).status).toBe(404);
  });

  it("manages domains with plan gating, validation, verification, primary and redirects", async () => {
    const free = await setup("domfree@x.com", "free");
    expect((await free.o.post(`/projects/${free.pid}/domains`, { hostname: "a.example.com" })).data.error.code).toBe("upgrade_required");
    const { o, pid } = await setup("dom@x.com");
    expect((await o.post(`/projects/${pid}/domains`, { hostname: "not a domain" })).status).toBe(400);
    const a = await o.post(`/projects/${pid}/domains`, { hostname: "WWW.Example.com" });
    expect(a.status).toBe(201);
    expect(a.data.domain).toMatchObject({ hostname: "www.example.com", primary: true, verified: false });
    expect(a.data.dnsInstructions[0].type).toBe("CNAME");
    expect((await o.post(`/projects/${pid}/domains`, { hostname: "www.example.com" })).status).toBe(400);
    expect((await o.post(`/projects/${pid}/domains/${a.data.domain.id}/verify`)).data.verified).toBe(true);
    const b = (await o.post(`/projects/${pid}/domains`, { hostname: "example.org" })).data.domain;
    expect((await o.post(`/projects/${pid}/domains/${b.id}/primary`)).status).toBe(400); // unverified
    await o.post(`/projects/${pid}/domains/${b.id}/verify`);
    expect((await o.post(`/projects/${pid}/domains/${b.id}/primary`)).status).toBe(200);
    expect((await o.put(`/projects/${pid}/domains/${a.data.domain.id}/redirect`, { redirectTo: "example.org" })).data.domain.redirectTo).toBe("example.org");
    expect((await o.put(`/projects/${pid}/domains/${a.data.domain.id}/redirect`, { redirectTo: "evil.com" })).status).toBe(400);
    expect((await o.del(`/projects/${pid}/domains/${b.id}`)).status).toBe(204);
    expect((await o.get(`/projects/${pid}/domains`)).data.domains[0].primary).toBe(true);
  });

  it("stores env vars encrypted and never returns values", async () => {
    const { o, pid } = await setup("env@x.com");
    expect((await o.put(`/projects/${pid}/env`, { key: "bad key", value: "x" })).status).toBe(400);
    await o.put(`/projects/${pid}/env`, { key: "API_KEY", value: "s3cr3t-value" });
    expect(JSON.stringify((await o.get(`/projects/${pid}/env`)).data)).toBe('{"variables":[{"key":"API_KEY"}]}');
    const stored = env.db.env.find((e) => e.projectId === pid)!;
    expect(stored.valueCipher).not.toContain("s3cr3t");
    expect(decryptSecret(stored.valueCipher)).toBe("s3cr3t-value");
    expect(decryptSecret(encryptSecret("a"))).toBe("a");
    expect(() => decryptSecret(stored.valueCipher.replace(/.$/, "A"))).toThrow();
    expect((await o.del(`/projects/${pid}/env/API_KEY`)).status).toBe(204);
  });

  it("registers webhooks only for public https URLs and returns the secret once", async () => {
    const { o, pid } = await setup("hook@x.com");
    expect((await o.post(`/projects/${pid}/webhooks`, { url: "https://127.0.0.1/x", events: ["deployment.ready"] })).status).toBe(400);
    expect((await o.post(`/projects/${pid}/webhooks`, { url: "http://example.com/x", events: ["deployment.ready"] })).status).toBe(400);
    const h = await o.post(`/projects/${pid}/webhooks`, { url: "https://hooks.example.com/x", events: ["deployment.ready"] });
    expect(h.status).toBe(201);
    expect(h.data.secret).toMatch(/^whsec_/);
    expect(JSON.stringify((await o.get(`/projects/${pid}/integrations`)).data)).not.toContain("whsec_");
  });
});

describe("assets", () => {
  it("validates content, dedupes, serves with hardening headers, protects used assets, replaces bytes", async () => {
    const { o, pid } = await setup("assets@x.com");
    expect((await o.post(`/projects/${pid}/assets`, { name: "evil.png", contentBase64: Buffer.from("<html>").toString("base64") })).status).toBe(400);
    expect((await o.post(`/projects/${pid}/assets`, { name: "a.png", contentBase64: "not base64!!" })).status).toBe(400);
    const a = await o.post(`/projects/${pid}/assets`, { name: "Logo.png", contentBase64: png(120, 40), mime: "image/png" });
    expect(a.status).toBe(201);
    expect(a.data.asset).toMatchObject({ kind: "image", width: 120, height: 40, name: "Logo.png" });
    const dup = await o.post(`/projects/${pid}/assets`, { name: "copy.png", contentBase64: png(120, 40) });
    expect(dup.data.duplicate).toBe(true);
    expect((await o.get(`/projects/${pid}/assets?q=logo`)).data.assets).toHaveLength(1);
    expect((await o.patch(`/projects/${pid}/assets/${a.data.asset.id}`, { altText: "Company logo" })).data.asset.altText).toBe("Company logo");

    const raw = await o.get(`/projects/${pid}/assets/${a.data.asset.id}/raw`);
    expect(raw.headers.get("x-content-type-options")).toBe("nosniff");
    expect(raw.headers.get("content-security-policy")).toContain("sandbox");
    expect(raw.headers.get("content-type")).toBe("image/png");

    const svg = await o.post(`/projects/${pid}/assets`, { name: "x.svg", contentBase64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>1</script><rect width="1" height="1"/></svg>').toString("base64") });
    const svgRaw = (await o.get(`/projects/${pid}/assets/${svg.data.asset.id}/raw`)).data.toString();
    expect(svgRaw).toContain("<rect");
    expect(svgRaw).not.toMatch(/script|onload/);

    const cur = (await o.get(`/projects/${pid}/document`)).data;
    const root = cur.document.pages[0].rootId;
    const img = createNode({ id: "im", parentId: root, tag: "img", attributes: { src: `asset:${a.data.asset.id}`, alt: "x" } });
    await o.put(`/projects/${pid}/document`, { baseRevision: cur.revision, document: { ...cur.document, nodes: { ...cur.document.nodes, im: img, [root]: { ...cur.document.nodes[root], children: ["im"] } } } });
    expect((await o.del(`/projects/${pid}/assets/${a.data.asset.id}`)).data.error.code).toBe("asset_in_use");
    const rep = await o.put(`/projects/${pid}/assets/${a.data.asset.id}/content`, { name: "Logo.png", contentBase64: png(300, 100) });
    expect(rep.data.asset).toMatchObject({ id: a.data.asset.id, width: 300, height: 100 });
    expect((await o.del(`/projects/${pid}/assets/${svg.data.asset.id}`)).status).toBe(204);

    const other = await setup("assets2@x.com");
    expect((await other.o.get(`/projects/${pid}/assets`)).status).toBe(404);
  });

  it("enforces storage quota", async () => {
    const { o, pid } = await setup("assetq@x.com", "free");
    const big = Buffer.alloc(14 * 2 ** 20); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(big);
    let status = 0;
    for (let i = 0; i < 40 && status !== 403; i++) { big.writeUInt32BE(i + 1, 16); status = (await o.post(`/projects/${pid}/assets`, { name: `b${i}.png`, contentBase64: big.toString("base64") })).status; }
    expect(status).toBe(403);
  });
});

describe("cms and forms", () => {
  it("validates schemas/items, references, scheduling, revisions, and exposes only visible content publicly", async () => {
    const { o, pid } = await setup("cms@x.com");
    const authors = (await o.post(`/projects/${pid}/collections`, { slug: "authors", name: "Authors", fields: [{ name: "name", type: "text", required: true }] })).data.collection;
    const posts = (await o.post(`/projects/${pid}/collections`, { slug: "posts", name: "Posts", fields: [{ name: "title", type: "text", required: true }, { name: "author", type: "reference", to: "authors" }, { name: "views", type: "number" }] })).data.collection;
    expect((await o.post(`/projects/${pid}/collections`, { slug: "posts", name: "x", fields: [{ name: "a", type: "text" }] })).status).toBe(400);
    const a1 = (await o.post(`/projects/${pid}/collections/${authors.id}/items`, { slug: "ann", data: { name: "Ann" }, status: "published" })).data.item;
    const bad = await o.post(`/projects/${pid}/collections/${posts.id}/items`, { slug: "p1", data: { title: 5 } });
    expect(bad.status).toBe(400);
    expect((await o.post(`/projects/${pid}/collections/${posts.id}/items`, { slug: "p1", data: { title: "A", author: "nope" } })).data.error.code).toBe("invalid_reference");
    const mk = (slug: string, status: string, extra: object = {}) => o.post(`/projects/${pid}/collections/${posts.id}/items`, { slug, data: { title: slug, author: a1.id, views: slug.length }, status, ...extra });
    const p1 = (await mk("pub", "published")).data.item;
    await mk("draft", "draft");
    await mk("past", "scheduled", { publishAt: "2020-01-01T00:00:00Z" });
    await mk("future", "scheduled", { publishAt: "2999-01-01T00:00:00Z" });
    expect((await mk("nodate", "scheduled")).status).toBe(400);

    const pub = await env.client().get(`/public/projects/${pid}/content/posts?sortBy=views&order=desc`);
    expect(pub.status).toBe(200);
    expect(pub.data.items.map((i: any) => i.slug)).toEqual(["past", "pub"]);
    expect((await env.client().get(`/public/projects/${pid}/content/nope`)).status).toBe(404);

    await o.patch(`/projects/${pid}/collections/${posts.id}/items/${p1.id}`, { data: { title: "Edited", author: a1.id } });
    const reverted = await o.post(`/projects/${pid}/collections/${posts.id}/items/${p1.id}/revert/0`);
    expect(reverted.data.item.data.title).toBe("pub");
    expect((await o.del(`/projects/${pid}/collections/${authors.id}/items/${a1.id}`)).data.error.code).toBe("in_use");
    expect((await o.put(`/projects/${pid}/collections/${posts.id}`, { slug: "posts", name: "Posts", fields: [{ name: "title", type: "number", required: true }] })).data.error.code).toBe("schema_conflict");
    expect((await o.del(`/projects/${pid}/collections/${authors.id}`)).data.error.code).toBe("in_use");

    const editor = await env.signup("cmseditor@x.com");
    expect((await editor.get(`/projects/${pid}/collections`)).status).toBe(404);
  });

  it("accepts validated public form submissions, drops honeypot spam silently", async () => {
    const { o, pid } = await setup("form@x.com");
    await o.put(`/projects/${pid}/forms/contact`, { fields: [{ name: "email", type: "email", required: true }, { name: "msg", type: "textarea" }] });
    const anon = env.client();
    expect((await anon.post(`/public/forms/${pid}/contact`, { email: "a@b.co", msg: "hi" })).status).toBe(201);
    expect((await anon.post(`/public/forms/${pid}/contact`, { email: "nope" })).status).toBe(400);
    expect((await anon.post(`/public/forms/${pid}/contact`, { email: "a@b.co", _hp: "bot" })).status).toBe(201);
    expect((await anon.post(`/public/forms/${pid}/missing`, {})).status).toBe(404);
    const subs = (await o.get(`/projects/${pid}/forms/contact/submissions`)).data.submissions;
    expect(subs).toHaveLength(1);
    expect(subs[0].data).toEqual({ email: "a@b.co", msg: "hi" });
  });
});

describe("ai proposals", () => {
  it("previews, applies only valid proposals through validation, re-checks staleness, and meters usage", async () => {
    const { o, pid } = await setup("ai@x.com");
    aiMode = "bad";
    const bad = await o.post(`/projects/${pid}/ai/proposals`, { prompt: "do it" });
    expect(bad.data.ok).toBe(false);
    aiMode = "good";
    const p = await o.post(`/projects/${pid}/ai/proposals`, { prompt: "add a heading" });
    expect(p.data.ok).toBe(true);
    expect(p.data.changes.summary.added).toBe(1);
    expect((await o.get(`/projects/${pid}/document`)).data.document.nodes.ai1).toBeUndefined(); // nothing applied yet
    const acc = await o.post(`/projects/${pid}/ai/proposals/${p.data.proposal.id}/accept`);
    expect(acc.data.revision).toBe(2);
    expect((await o.get(`/projects/${pid}/document`)).data.document.nodes.ai1.text).toBe("Generated");
    expect((await o.post(`/projects/${pid}/ai/proposals/${p.data.proposal.id}/accept`)).data.error.code).toBe("not_pending");
    // second proposal re-inserts the same id -> stale/invalid against the new head
    const p2 = await o.post(`/projects/${pid}/ai/proposals`, { prompt: "again" });
    expect(p2.data.ok).toBe(false);
    expect((await o.get(`/workspaces/${o.workspaceId}/usage`)).data.usage.aiCredits).toBe(3);
    // undo path: restore previous revision via version
    const v = (await o.post(`/projects/${pid}/versions`, { name: "pre-ai", revision: 1 })).data.version;
    expect((await o.post(`/projects/${pid}/versions/${v.id}/restore`)).status).toBe(200);
    expect((await o.get(`/projects/${pid}/document`)).data.document.nodes.ai1).toBeUndefined();
    const other = await env.signup("ai2@x.com");
    expect((await other.post(`/projects/${pid}/ai/proposals/${p.data.proposal.id}/accept`)).status).toBe(404);
  });

  it("reports unavailable when no provider is configured", async () => {
    const e2 = await startEnv({ ai: null });
    try {
      const c = await e2.signup("noai@x.com");
      const pid = (await c.post(`/workspaces/${c.workspaceId}/projects`, { name: "S" })).data.project.id;
      expect((await c.post(`/projects/${pid}/ai/proposals`, { prompt: "hi" })).status).toBe(503);
      expect((await c.get(`/projects/${pid}/ai/status`)).data.available).toBe(false);
    } finally { await e2.close(); }
  });
});
