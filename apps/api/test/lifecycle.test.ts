import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { totp } from "../src/common/crypto";
import { startEnv, type Env } from "./helpers";

let env: Env;
beforeAll(async () => { env = await startEnv(); });
afterAll(async () => { await env.close(); });
const PW = "correct-horse-battery";

describe("MFA recovery codes and QR", () => {
  it("returns a QR image at setup, one-time recovery codes at enable, and accepts them at login once", async () => {
    const c = await env.signup("rec@example.com");
    const setup = (await c.post("/auth/mfa/setup")).data;
    expect(setup.qrSvg).toContain("<svg");
    const en = (await c.post("/auth/mfa/enable", { code: totp(setup.secret) })).data;
    expect(en.recoveryCodes).toHaveLength(8);
    expect((await c.get("/auth/mfa/recovery-codes")).data.remaining).toBe(8);
    const code = en.recoveryCodes[0] as string;
    expect((await env.client().post("/auth/login", { email: "rec@example.com", password: PW, mfaCode: code })).status).toBe(200);
    expect((await env.client().post("/auth/login", { email: "rec@example.com", password: PW, mfaCode: code })).status).toBe(401); // used
    expect((await c.get("/auth/mfa/recovery-codes")).data.remaining).toBe(7);
    const fresh = (await c.post("/auth/mfa/recovery-codes", { password: PW, code: totp(setup.secret) })).data.recoveryCodes as string[];
    expect(fresh).toHaveLength(8);
    expect((await env.client().post("/auth/login", { email: "rec@example.com", password: PW, mfaCode: en.recoveryCodes[1] })).status).toBe(401); // old set revoked
    expect((await env.client().post("/auth/login", { email: "rec@example.com", password: PW, mfaCode: fresh[0] })).status).toBe(200);
    expect(JSON.stringify(env.db.users.all())).not.toContain(fresh[0]!); // only hashes are stored
  });
});

describe("webhook delivery log", () => {
  it("records successes and failures and lets editors send a test", async () => {
    const c = await env.signup("hook@example.com");
    const p = (await c.post(`/workspaces/${c.workspaceId}/projects`, { name: "Hooks" })).data.project;
    const hook = (await c.post(`/projects/${p.id}/webhooks`, { url: "https://hooks.example.com/in", events: ["deployment.ready"] })).data.webhook;
    const real = globalThis.fetch;
    const hooked = vi.fn(async () => new Response("ok", { status: 200 }));
    // Only intercept outbound calls to the hook host; the test client still reaches the API.
    globalThis.fetch = ((u: any, i: any) => String(u).startsWith("https://hooks.example.com") ? hooked() : real(u, i)) as typeof fetch;
    try {
      const ok = (await c.post(`/projects/${p.id}/webhooks/${hook.id}/test`)).data.delivery;
      expect(ok).toMatchObject({ ok: true, event: "webhook.test", webhookId: hook.id });
      globalThis.fetch = ((u: any, i: any) => String(u).startsWith("https://hooks.example.com") ? Promise.reject(new Error("connect ECONNREFUSED")) : real(u, i)) as typeof fetch;
      const bad = (await c.post(`/projects/${p.id}/webhooks/${hook.id}/test`)).data.delivery;
      expect(bad).toMatchObject({ ok: false });
      expect(bad.error).toContain("ECONNREFUSED");
    } finally { globalThis.fetch = real; }
    const list = (await c.get(`/projects/${p.id}/webhooks/deliveries`)).data.deliveries;
    expect(list).toHaveLength(2);
    expect(list[0].ok).toBe(false);
    expect(JSON.stringify(list)).not.toContain("whsec_"); // secrets never appear in the log
  });
});

describe("workspace and account deletion", () => {
  it("deletes a workspace only for owners who type its name, removing all of its data", async () => {
    const owner = await env.signup("own@example.com");
    const editor = await env.signup("ed@example.com");
    const ws = (await owner.post("/workspaces", { name: "Doomed" })).data.workspace;
    env.db.memberships.insert({ userId: editor.userId, workspaceId: ws.id, role: "EDITOR" });
    const p = (await owner.post(`/workspaces/${ws.id}/projects`, { name: "P" })).data.project;
    expect((await owner.del(`/workspaces/${ws.id}`, { confirmName: "nope" })).status).toBe(400);
    expect((await editor.del(`/workspaces/${ws.id}`, { confirmName: "Doomed" })).status).toBe(403);
    expect((await owner.del(`/workspaces/${ws.id}`, { confirmName: "Doomed" })).status).toBe(204);
    expect((await owner.get(`/projects/${p.id}`)).status).toBe(404);
    expect(env.db.projects.get(p.id)).toBeUndefined();
    expect(env.db.revisions.filter((r) => r.projectId === p.id)).toHaveLength(0);
    expect(env.db.audit.filter((a) => a.workspaceId === ws.id)).toHaveLength(0);
    expect((await editor.get("/auth/me")).data.workspaces.some((w: any) => w.id === ws.id)).toBe(false);
  });

  it("deletes an account after a password check, purging sole-owned workspaces and blocking when members would be orphaned", async () => {
    const a = await env.signup("bye@example.com");
    const b = await env.signup("stay@example.com");
    const shared = (await a.post("/workspaces", { name: "Shared" })).data.workspace;
    env.db.memberships.insert({ userId: b.userId, workspaceId: shared.id, role: "EDITOR" });
    expect((await a.del("/auth/me", { password: "wrong-password-1" })).status).toBe(401);
    const blocked = await a.del("/auth/me", { password: PW });
    expect(blocked.status).toBe(400);
    expect(blocked.data.error.code).toBe("transfer_required");
    expect(env.db.users.find((u) => u.email === "bye@example.com")).toBeDefined(); // nothing was removed
    expect((await a.patch(`/workspaces/${shared.id}/members/${b.userId}`, { role: "OWNER" })).status).toBe(200);
    expect((await a.del("/auth/me", { password: PW })).status).toBe(204);
    expect(env.db.users.find((u) => u.email === "bye@example.com")).toBeUndefined();
    expect(env.db.workspaces.find((w) => w.name === "bye's workspace")).toBeUndefined();
    expect(env.db.workspaces.get(shared.id)).toBeDefined(); // survives with its remaining owner
    expect(env.db.memberships.filter((m) => m.workspaceId === shared.id)).toHaveLength(1);
    expect((await a.get("/auth/me")).status).toBe(401);
    expect((await env.client().post("/auth/login", { email: "bye@example.com", password: PW })).status).toBe(401);
    expect((await b.get("/auth/me")).status).toBe(200);
  });
});

describe("CMS rich text, reverts", () => {
  it("sanitises rich text on write, lists revisions, and reverts safely", async () => {
    const c = await env.signup("cms2@example.com");
    const pid = (await c.post(`/workspaces/${c.workspaceId}/projects`, { name: "Blog" })).data.project.id;
    const col = (await c.post(`/projects/${pid}/collections`, { slug: "posts", name: "Posts", fields: [{ name: "title", type: "text", required: true }, { name: "body", type: "richtext" }] })).data.collection;
    const base = `/projects/${pid}/collections/${col.id}/items`;
    const item = (await c.post(base, { slug: "one", data: { title: "One", body: "<p>v1</p><script>alert(1)</script>" } })).data.item;
    expect(item.data.body).toBe("<p>v1</p>");
    await c.patch(`${base}/${item.id}`, { data: { title: "One", body: '<p onclick="x()">v2</p>' } });
    await c.patch(`${base}/${item.id}`, { data: { title: "One", body: "<p>v3</p>" } });
    const revs = (await c.get(`${base}/${item.id}/revisions`)).data.revisions;
    expect(revs).toHaveLength(2);
    expect(revs[0].data.body).toBe("<p>v2</p>"); // newest first
    const restored = (await c.post(`${base}/${item.id}/revert/${revs[1].index}`)).data.item;
    expect(restored.data.body).toBe("<p>v1</p>");
    expect((await c.get(`${base}/${item.id}/revisions`)).data.revisions).toHaveLength(3); // revert is itself undoable
    expect((await c.post(`${base}/${item.id}/revert/99`)).status).toBe(404);
    // a schema change that makes an old version invalid blocks the revert instead of corrupting data
    const fields = (extra: object) => [{ name: "title", type: "text", required: true }, { name: "body", type: "richtext" }, { name: "sub", type: "text", ...extra }];
    expect((await c.put(`/projects/${pid}/collections/${col.id}`, { slug: "posts", name: "Posts", fields: fields({}) })).status).toBe(200);
    await c.patch(`${base}/${item.id}`, { data: { title: "One", body: "<p>v4</p>", sub: "x" } });
    expect((await c.put(`/projects/${pid}/collections/${col.id}`, { slug: "posts", name: "Posts", fields: fields({ required: true }) })).status).toBe(200);
    const oldest = (await c.get(`${base}/${item.id}/revisions`)).data.revisions.at(-1);
    const r = await c.post(`${base}/${item.id}/revert/${oldest.index}`);
    expect(r.status).toBe(400);
    expect(r.data.error.code).toBe("invalid_item");
  });
});

describe("export includes published CMS content only", () => {
  it("ships published items in the React export and never drafts", async () => {
    const c = await env.signup("exp@example.com");
    await c.post(`/workspaces/${c.workspaceId}/plan`, { plan: "pro" });
    const pid = (await c.post(`/workspaces/${c.workspaceId}/projects`, { name: "Exp" })).data.project.id;
    const col = (await c.post(`/projects/${pid}/collections`, { slug: "posts", name: "Posts", fields: [{ name: "title", type: "text", required: true }] })).data.collection;
    await c.post(`/projects/${pid}/collections/${col.id}/items`, { slug: "live", status: "published", data: { title: "Live post" } });
    await c.post(`/projects/${pid}/collections/${col.id}/items`, { slug: "wip", status: "draft", data: { title: "Secret draft" } });
    const out = (await c.get(`/projects/${pid}/export?target=next&format=json`)).data;
    expect(out.files["content/cms.ts"]).toContain("Live post");
    expect(JSON.stringify(out.files)).not.toContain("Secret draft");
  });
});
