import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDocument, createNode, type Document } from "@webbrik/document-model";
import { totp, verifyTotp } from "../src/common/crypto";
import { startEnv, Client, type Env } from "./helpers";

let env: Env;
beforeAll(async () => { env = await startEnv(); });
afterAll(async () => { await env.close(); });

const token = (env: Env, to: string) => /token: (\S+)/.exec(env.mailer.last(to)!.text)![1]!;

describe("auth", () => {
  it("registers with a cookie session, requires CSRF header for cookie mutations, and logs out", async () => {
    const c = env.client();
    const r = await c.post("/auth/register", { email: "Ann@Example.com", password: "correct-horse-battery", name: "Ann" });
    expect(r.status).toBe(201);
    expect(r.data.user).toMatchObject({ email: "ann@example.com", emailVerified: false });
    expect(JSON.stringify(r.data)).not.toContain("passwordHash");
    expect((await c.get("/auth/me")).data.workspaces).toHaveLength(1);
    const noHeader = new Client(env.base, false);
    noHeader.cookies = c.cookies;
    expect((await noHeader.post("/auth/logout")).status).toBe(403);
    expect((await noHeader.get("/auth/me")).status).toBe(200); // safe methods are fine
    expect((await c.post("/auth/logout")).status).toBe(204);
    expect((await c.get("/auth/me")).status).toBe(401);
  });

  it("rejects weak/duplicate registrations and wrong passwords without leaking which one", async () => {
    const c = env.client();
    expect((await c.post("/auth/register", { email: "x@example.com", password: "short", name: "X" })).status).toBe(400);
    await c.post("/auth/register", { email: "dup@example.com", password: "correct-horse-battery", name: "D" });
    expect((await env.client().post("/auth/register", { email: "dup@example.com", password: "correct-horse-battery", name: "D" })).status).toBe(400);
    const a = await env.client().post("/auth/login", { email: "dup@example.com", password: "wrong-password-1" });
    const b = await env.client().post("/auth/login", { email: "nobody@example.com", password: "wrong-password-1" });
    expect(a.status).toBe(401);
    expect(a.data).toEqual(b.data);
  });

  it("verifies email with single-use tokens", async () => {
    const c = await env.signup("verify@example.com");
    const t = token(env, "verify@example.com");
    expect((await c.post("/auth/verify-email", { token: "nope-nope-nope" })).status).toBe(400);
    expect((await c.post("/auth/verify-email", { token: t })).status).toBe(200);
    expect((await c.get("/auth/me")).data.user.emailVerified).toBe(true);
    expect((await c.post("/auth/verify-email", { token: t })).status).toBe(400);
  });

  it("resets passwords, revokes all sessions, and doesn't reveal unknown emails", async () => {
    const c = await env.signup("reset@example.com");
    expect((await env.client().post("/auth/password/forgot", { email: "ghost@example.com" })).status).toBe(202);
    expect(env.mailer.last("ghost@example.com")).toBeUndefined();
    await env.client().post("/auth/password/forgot", { email: "reset@example.com" });
    const t = token(env, "reset@example.com");
    expect((await env.client().post("/auth/password/reset", { token: t, password: "brand-new-password" })).status).toBe(200);
    expect((await c.get("/auth/me")).status).toBe(401);
    expect((await env.client().post("/auth/login", { email: "reset@example.com", password: "brand-new-password" })).status).toBe(200);
    expect((await env.client().post("/auth/password/reset", { token: t, password: "another-password-1" })).status).toBe(400);
  });

  it("supports TOTP MFA", async () => {
    expect(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082"); // RFC 6238 vector
    expect(verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 59_000)).toBe(true);
    const c = await env.signup("mfa@example.com");
    const { secret } = (await c.post("/auth/mfa/setup")).data;
    expect((await c.post("/auth/mfa/enable", { code: "000000" })).status).toBe(400);
    expect((await c.post("/auth/mfa/enable", { code: totp(secret) })).status).toBe(200);
    const login = env.client();
    expect((await login.post("/auth/login", { email: "mfa@example.com", password: "correct-horse-battery" })).data.error.code).toBe("mfa_required");
    expect((await login.post("/auth/login", { email: "mfa@example.com", password: "correct-horse-battery", mfaCode: "123456" })).status).toBe(401);
    expect((await login.post("/auth/login", { email: "mfa@example.com", password: "correct-horse-battery", mfaCode: totp(secret) })).status).toBe(200);
  });

  it("lists and revokes sessions; changes passwords while keeping the current session", async () => {
    const c = await env.signup("sess@example.com");
    const other = env.client();
    await other.post("/auth/login", { email: "sess@example.com", password: "correct-horse-battery" });
    const list = (await c.get("/auth/sessions")).data.sessions;
    expect(list).toHaveLength(2);
    await c.post("/auth/password/change", { current: "correct-horse-battery", password: "changed-password-9" });
    expect((await other.get("/auth/me")).status).toBe(401);
    expect((await c.get("/auth/me")).status).toBe(200);
    expect((await c.post("/auth/password/change", { current: "wrong", password: "changed-password-10" })).status).toBe(401);
  });

  it("signs in with OAuth only for verified provider emails", async () => {
    const e2 = await startEnv({ oauth: { fake: { exchange: async (code) => (code === "ok" ? { id: "1", email: "oauth@example.com", name: "O", emailVerified: true } : { id: "2", email: "x@example.com", name: "X", emailVerified: false }) } } });
    try {
      const c = e2.client();
      expect((await c.post("/auth/oauth/fake", { code: "ok" })).status).toBe(200);
      expect((await c.get("/auth/me")).data.user.emailVerified).toBe(true);
      expect((await e2.client().post("/auth/oauth/fake", { code: "bad" })).status).toBe(401);
      expect((await e2.client().post("/auth/oauth/unknown", { code: "ok" })).status).toBe(404);
    } finally { await e2.close(); }
  });

  it("rate limits sensitive endpoints", async () => {
    process.env.DISABLE_RATE_LIMIT = "0";
    try {
      const c = env.client();
      let last = 0;
      for (let i = 0; i < 12; i++) last = (await c.post("/auth/login", { email: "rl@example.com", password: "whatever-pass" })).status;
      expect(last).toBe(429);
    } finally { process.env.DISABLE_RATE_LIMIT = "1"; }
  });
});

describe("workspaces, roles and tenancy", () => {
  it("lists pending invites and lets admins revoke them; revoked tokens stop working", async () => {
    const owner = await env.signup("inv-owner@team.com");
    const guest = await env.signup("inv-guest@team.com");
    await owner.post(`/workspaces/${owner.workspaceId}/plan`, { plan: "pro" });
    await owner.post(`/workspaces/${owner.workspaceId}/invites`, { email: "inv-guest@team.com", role: "VIEWER" });
    const t = token(env, "inv-guest@team.com");
    const list = (await owner.get(`/workspaces/${owner.workspaceId}/invites`)).data.invites;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ email: "inv-guest@team.com", role: "VIEWER" });
    expect(JSON.stringify(list)).not.toContain(t); // the secret is never returned
    expect((await guest.get(`/workspaces/${owner.workspaceId}/invites`)).status).toBe(404); // non-members can't even see it exists
    expect((await owner.req("DELETE", `/workspaces/${owner.workspaceId}/invites/${list[0].id}`)).status).toBe(204);
    expect((await owner.get(`/workspaces/${owner.workspaceId}/invites`)).data.invites).toHaveLength(0);
    expect((await guest.post("/invites/accept", { token: t })).status).toBe(400);
  });

  it("invites members, enforces roles, protects the last owner, and isolates tenants", async () => {
    const owner = await env.signup("owner@team.com");
    const dev = await env.signup("dev@team.com");
    const stranger = await env.signup("stranger@else.com");
    await owner.post(`/workspaces/${owner.workspaceId}/plan`, { plan: "pro" });
    expect((await owner.post(`/workspaces/${owner.workspaceId}/invites`, { email: "dev@team.com", role: "DEVELOPER" })).status).toBe(201);
    const t = token(env, "dev@team.com");
    expect((await dev.post("/invites/accept", { token: t })).status).toBe(403); // unverified
    await dev.post("/auth/verify-email", { token: token(env, "dev@team.com").length ? /token: (\S+)/.exec(env.mailer.outbox.find((m) => m.to === "dev@team.com" && m.subject.startsWith("Verify"))!.text)![1] : "" });
    expect((await stranger.post("/invites/accept", { token: t })).status).toBe(403);
    expect((await dev.post("/invites/accept", { token: t })).status).toBe(200);
    expect((await dev.post("/invites/accept", { token: t })).status).toBe(400);

    const members = (await owner.get(`/workspaces/${owner.workspaceId}/members`)).data.members;
    expect(members.map((m: any) => m.role).sort()).toEqual(["DEVELOPER", "OWNER"]);
    expect((await dev.patch(`/workspaces/${owner.workspaceId}`, { name: "Hacked" })).status).toBe(403);
    expect((await dev.post(`/workspaces/${owner.workspaceId}/invites`, { email: "z@z.com", role: "VIEWER" })).status).toBe(403);
    expect((await stranger.get(`/workspaces/${owner.workspaceId}/members`)).status).toBe(404);
    expect((await owner.patch(`/workspaces/${owner.workspaceId}/members/${owner.userId}`, { role: "ADMIN" })).data.error.code).toBe("last_owner");
    expect((await owner.del(`/workspaces/${owner.workspaceId}/members/${owner.userId}`)).status).toBe(400);
    expect((await owner.patch(`/workspaces/${owner.workspaceId}/members/${dev.userId}`, { role: "VIEWER" })).status).toBe(200);

    const proj = (await owner.post(`/workspaces/${owner.workspaceId}/projects`, { name: "Secret" })).data.project;
    expect((await stranger.get(`/projects/${proj.id}`)).status).toBe(404);
    expect((await stranger.get(`/projects/${proj.id}/document`)).status).toBe(404);
    expect((await dev.get(`/projects/${proj.id}`)).status).toBe(200);
    expect((await dev.put(`/projects/${proj.id}/document`, { baseRevision: 1, document: createDocument("x") })).status).toBe(403);

    expect((await owner.get(`/workspaces/${owner.workspaceId}/audit`)).data.entries.map((e: any) => e.action)).toEqual(expect.arrayContaining(["member.invite", "member.join", "member.role"]));
    expect((await dev.del(`/workspaces/${owner.workspaceId}/members/${dev.userId}`)).status).toBe(204); // leave
  });

  it("enforces plan quotas and reports usage", async () => {
    const o = await env.signup("quota@team.com");
    for (const n of ["a", "b", "c"]) expect((await o.post(`/workspaces/${o.workspaceId}/projects`, { name: n })).status).toBe(201);
    const over = await o.post(`/workspaces/${o.workspaceId}/projects`, { name: "d" });
    expect(over.status).toBe(403);
    expect(over.data.error.code).toBe("quota_exceeded");
    expect((await o.get(`/workspaces/${o.workspaceId}/usage`)).data).toMatchObject({ plan: "free", usage: { projects: 3, members: 1 } });
    await o.post(`/workspaces/${o.workspaceId}/plan`, { plan: "pro" });
    expect((await o.post(`/workspaces/${o.workspaceId}/projects`, { name: "d" })).status).toBe(201);
  });
});

describe("projects and documents", () => {
  let o: Awaited<ReturnType<Env["signup"]>>; let pid: string;
  beforeAll(async () => {
    o = await env.signup("proj@team.com");
    await o.post(`/workspaces/${o.workspaceId}/plan`, { plan: "pro" });
    pid = (await o.post(`/workspaces/${o.workspaceId}/projects`, { name: "Site One", description: "first" })).data.project.id;
  });

  it("lists, searches, sorts, renames, duplicates, archives, deletes and restores", async () => {
    await o.post(`/workspaces/${o.workspaceId}/projects`, { name: "Zebra" });
    expect((await o.get(`/workspaces/${o.workspaceId}/projects?q=zeb`)).data.projects.map((p: any) => p.name)).toEqual(["Zebra"]);
    expect((await o.get(`/workspaces/${o.workspaceId}/projects?sort=name&order=asc`)).data.projects.map((p: any) => p.name)).toEqual([...(await o.get(`/workspaces/${o.workspaceId}/projects?sort=name&order=asc`)).data.projects.map((p: any) => p.name)].sort());
    expect((await o.patch(`/projects/${pid}`, { name: "Site 1" })).data.project.name).toBe("Site 1");
    const dup = (await o.post(`/projects/${pid}/duplicate`)).data.project;
    expect(dup.name).toBe("Site 1 copy");
    expect((await o.get(`/projects/${dup.id}/document`)).data.document.id).not.toBe((await o.get(`/projects/${pid}/document`)).data.document.id);
    await o.post(`/projects/${dup.id}/archive`);
    expect((await o.get(`/workspaces/${o.workspaceId}/projects`)).data.projects.some((p: any) => p.id === dup.id)).toBe(false);
    expect((await o.get(`/workspaces/${o.workspaceId}/projects?archived=true`)).data.projects.some((p: any) => p.id === dup.id)).toBe(true);
    await o.post(`/projects/${dup.id}/restore`);
    expect((await o.del(`/projects/${dup.id}`)).status).toBe(204);
    expect((await o.get(`/projects/${dup.id}`)).status).toBe(404);
    expect((await o.post(`/projects/${dup.id}/undelete`)).status).toBe(200);
    expect((await o.get(`/projects/${dup.id}`)).status).toBe(200);
    expect((await o.get(`/projects/recent`)).data.projects.length).toBeGreaterThan(0);
    expect((await o.get(`/projects/${pid}/activity`)).data.entries.length).toBeGreaterThan(0);
  });

  it("transfers a project between workspaces the user administers", async () => {
    const w2 = (await o.post("/workspaces", { name: "Second" })).data.workspace.id;
    expect((await o.post(`/projects/${pid}/transfer`, { workspaceId: w2 })).status).toBe(200);
    expect((await o.get(`/workspaces/${w2}/projects`)).data.projects.map((p: any) => p.id)).toContain(pid);
    expect((await o.post(`/projects/${pid}/transfer`, { workspaceId: o.workspaceId })).status).toBe(200);
  });

  it("saves with revision checks, validates documents, and keeps history", async () => {
    const cur = (await o.get(`/projects/${pid}/document`)).data;
    const doc: Document = { ...cur.document, name: "Edited" };
    expect((await o.put(`/projects/${pid}/document`, { baseRevision: cur.revision, document: doc })).data.revision).toBe(cur.revision + 1);
    const stale = await o.put(`/projects/${pid}/document`, { baseRevision: cur.revision, document: doc });
    expect(stale.status).toBe(409);
    expect(stale.data.error).toMatchObject({ code: "revision_conflict", headRevision: cur.revision + 1 });
    const bad = await o.put(`/projects/${pid}/document`, { baseRevision: cur.revision + 1, document: { ...doc, pages: [] } });
    expect(bad.status).toBe(400);
    expect(bad.data.error.code).toBe("invalid_document");
    expect((await o.get(`/projects/${pid}/revisions`)).data.revisions.length).toBeGreaterThanOrEqual(2);
  });

  it("names versions, compares revisions, and restores without rewriting history", async () => {
    const r1 = (await o.get(`/projects/${pid}`)).data.project.headRevision;
    const v = (await o.post(`/projects/${pid}/versions`, { name: "Before heading" })).data.version;
    const cur = (await o.get(`/projects/${pid}/document`)).data;
    const root = cur.document.pages[0].rootId;
    const h = createNode({ id: "h1", parentId: root, tag: "h1", text: "Hello" });
    const doc: Document = { ...cur.document, nodes: { ...cur.document.nodes, h1: h, [root]: { ...cur.document.nodes[root], children: ["h1"] } } };
    await o.put(`/projects/${pid}/document`, { baseRevision: cur.revision, document: doc });
    const diff = (await o.get(`/projects/${pid}/compare?from=${r1}`)).data;
    expect(diff.summary.added).toBe(1);
    const restored = await o.post(`/projects/${pid}/versions/${v.id}/restore`);
    expect(restored.data.revision).toBe(cur.revision + 2);
    expect((await o.get(`/projects/${pid}/document`)).data.document.nodes.h1).toBeUndefined();
    expect((await o.get(`/projects/${pid}/revisions/${cur.revision + 1}`)).data.document.nodes.h1).toBeDefined();
  });

  it("supports collaborative operations, presence, comments and review links", async () => {
    const cur = (await o.get(`/projects/${pid}/document`)).data;
    const root = cur.document.pages[0].rootId;
    const node = createNode({ id: "c1", parentId: root, tag: "p", text: "x" });
    const ops = [{ type: "insertSubtree", rootId: "c1", nodes: [node], parentId: root, index: 0 }];
    const r = await o.post(`/projects/${pid}/ops`, { id: "tx1", clientId: "A", baseRevision: cur.revision, ops });
    expect(r.status).toBe(201);
    expect((await o.post(`/projects/${pid}/ops`, { id: "tx1", clientId: "A", baseRevision: cur.revision, ops })).data.committed.revision).toBe(r.data.committed.revision); // idempotent
    const bad = await o.post(`/projects/${pid}/ops`, { id: "tx2", clientId: "A", baseRevision: r.data.committed.revision, ops: [{ type: "deleteElement", id: "missing" }] });
    expect(bad.status).toBe(409);
    expect((await o.get(`/projects/${pid}/ops?since=${cur.revision}`)).data.committed).toHaveLength(1);
    expect((await o.get(`/projects/${pid}/document`)).data.document.nodes.c1).toBeDefined();

    await o.post(`/projects/${pid}/presence`, { clientId: "A", selection: ["c1"] });
    expect((await o.get(`/projects/${pid}/presence`)).data.users[0]).toMatchObject({ clientId: "A", selection: ["c1"] });

    const c = (await o.post(`/projects/${pid}/comments`, { body: "Looks good", elementId: "c1" })).data.comment;
    await o.post(`/projects/${pid}/comments/${c.id}/resolve`);
    expect((await o.get(`/projects/${pid}/comments`)).data.comments[0].resolvedAt).toBeTruthy();

    const { token: rt } = (await o.post(`/projects/${pid}/review-links`)).data;
    const anon = env.client();
    const view = await anon.get(`/public/review/${rt}`);
    expect(view.status).toBe(200);
    expect(JSON.stringify(view.data)).not.toContain("workspaceId");
    expect((await anon.post(`/public/review/${rt}/comments`, { authorName: "Client", body: "Change logo" })).status).toBe(201);
    expect((await anon.post(`/public/review/${rt}/approve`, { name: "Client" })).status).toBe(200);
    expect((await anon.get(`/public/review/${rt}`)).data.approvedAt).toBeTruthy();
    expect((await anon.get(`/public/review/bogus-token`)).status).toBe(404);
    expect((await anon.get(`/projects/${pid}/document`)).status).toBe(401);
  });

  it("reports quality findings and exports static, Next and Vite projects as zips", async () => {
    const q = (await o.get(`/projects/${pid}/quality`)).data;
    expect(q.findings.some((f: any) => f.rule === "seo/title-missing")).toBe(true);
    for (const target of ["static", "next", "vite"]) {
      const z = await o.get(`/projects/${pid}/export?target=${target}`);
      expect(z.status).toBe(200);
      expect(z.headers.get("content-type")).toBe("application/zip");
      expect((z.data as Buffer).subarray(0, 4).toString("hex")).toBe("504b0304");
    }
    const j = await o.get(`/projects/${pid}/export?target=next&format=json`);
    expect(Object.keys(j.data.files)).toContain("app/layout.tsx");
    expect((await o.get(`/projects/${pid}/export?target=bogus`)).status).toBe(400);
  });
});
