import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processBuildJob } from "../../worker/src/build-job";
import { startEnv, type Env } from "./helpers";

let env: Env;
beforeAll(async () => { process.env.WORKER_TOKEN = "worker-secret-token"; env = await startEnv(); });
afterAll(async () => { await env.close(); delete process.env.WORKER_TOKEN; });

describe("build worker against the real API", () => {
  it("builds the current revision from API data, records the result, and is locked to its token and tenant", async () => {
    const a = await env.signup("w-a@x.com"); const b = await env.signup("w-b@x.com");
    const proj = (await a.post(`/workspaces/${a.workspaceId}/projects`, { name: "Built" })).data.project;
    const api = { baseUrl: env.base, token: "worker-secret-token" };

    const r = await processBuildJob({ projectId: proj.id, workspaceId: a.workspaceId }, api);
    expect(r.ok).toBe(true); expect(Object.keys(r.files)).toContain("index.html");
    const audit = env.db.audit.filter((x) => x.workspaceId === a.workspaceId && x.action === "build.ok");
    expect(audit).toHaveLength(1); expect(audit[0]!.target).toMatch(/files/);

    // wrong token, no token, and another tenant's job are all refused
    await expect(processBuildJob({ projectId: proj.id, workspaceId: a.workspaceId }, { ...api, token: "nope" })).rejects.toThrow(/401/);
    expect((await fetch(`${env.base}/v1/internal/projects/${proj.id}/build-input`)).status).toBe(401);
    expect((await a.get(`/internal/projects/${proj.id}/build-input`)).status).toBe(401); // a signed-in user is not the worker
    await expect(processBuildJob({ projectId: proj.id, workspaceId: b.workspaceId }, api)).rejects.toThrow(/does not match/);
    await expect(processBuildJob({ projectId: proj.id, workspaceId: a.workspaceId, revision: 999 }, api)).rejects.toThrow(/404/);
  });
});
