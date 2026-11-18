import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createNode } from "@webbrik/document-model";
import { startEnv, type Env } from "./helpers";

let env: Env;
beforeAll(async () => { env = await startEnv(); });
afterAll(() => env.close());

const wsUrl = () => env.base.replace("http", "ws").replace(/\/$/, "") + "/v1/realtime";
async function cookieOf(email: string) {
  const r = await fetch(`${env.base}/v1/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "correct-horse-battery", name: "W" }) });
  return { cookie: r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "), r };
}
const open = (q: string, headers: Record<string, string>) => new Promise<{ ws?: WebSocket; status?: number; messages: unknown[] }>((resolve) => {
  const ws = new WebSocket(`${wsUrl()}?${q}`, { headers }); const messages: unknown[] = [];
  ws.on("message", (d) => messages.push(JSON.parse(String(d))));
  ws.on("open", () => resolve({ ws, messages }));
  ws.on("unexpected-response", (_q, res) => resolve({ status: res.statusCode, messages }));
  ws.on("error", () => undefined);
});
const until = async (f: () => boolean) => { for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 20)); expect(f()).toBe(true); };

describe("WebSocket push", () => {
  it("pushes a revision hint to everyone watching a project, and enforces auth, origin and membership", async () => {
    const a = await env.signup("ws-a@x.com"); const stranger = await cookieOf("ws-b@x.com");
    const proj = (await a.post(`/workspaces/${a.workspaceId}/projects`, { name: "P" })).data.project;
    // The browser session cookie for `a`: log in again to read it.
    const login = await fetch(`${env.base}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "ws-a@x.com", password: "correct-horse-battery" }) });
    const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

    expect((await open(`projectId=${proj.id}`, {})).status).toBe(401);                                                // no session
    expect((await open(`projectId=${proj.id}`, { cookie, origin: "https://evil.example" })).status).toBe(403);         // cross-site page
    expect((await open(`projectId=${proj.id}`, { cookie: stranger.cookie })).status).toBe(403);                         // not a member
    expect((await open(`projectId=nope`, { cookie })).status).toBe(404);

    const c1 = await open(`projectId=${proj.id}`, { cookie, origin: "http://localhost:3000" });
    const c2 = await open(`projectId=${proj.id}`, { cookie });
    await until(() => c1.messages.length > 0 && c2.messages.length > 0);
    const head = (await a.get(`/projects/${proj.id}/document`)).data;
    const root = head.document.pages[0].rootId;
    const r = await a.post(`/projects/${proj.id}/ops`, { id: "t1", clientId: "c1", baseRevision: head.revision, ops: [{ type: "insertSubtree", rootId: "n1", nodes: [createNode({ id: "n1", parentId: root, tag: "div" })], parentId: root, index: 0 }] });
    expect(r.status).toBe(201);
    await until(() => c1.messages.some((m: any) => m.type === "ops") && c2.messages.some((m: any) => m.type === "ops"));
    expect((c1.messages.find((m: any) => m.type === "ops") as any).revision).toBe(r.data.committed.revision);
    c1.ws!.close(); c2.ws!.close();
  });
});
