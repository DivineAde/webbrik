import { describe, expect, it } from "vitest";
import { createDocument } from "@webbrik/document-model";
import { processBuildJob, runBuild } from "./build-job";

const content = { collections: [], items: {} } as never;
describe("build pipeline", () => {
  it("builds valid documents and reports invalid ones", () => {
    expect(runBuild({ document: createDocument("x"), content }).ok).toBe(true);
    expect(runBuild({ document: {}, content }).ok).toBe(false);
  });
  it("pulls its input from the API, reports the result, and refuses a job for another tenant", async () => {
    const calls: { method: string; url: string; auth: string | null; body?: any }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ method: String(init.method), url, auth: (init.headers as Record<string, string>)["authorization"] ?? null, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (init.method === "GET") return new Response(JSON.stringify({ projectId: "p1", workspaceId: "w1", projectSlug: "p", revision: 7, document: createDocument("x"), content }), { status: 200 });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const api = { baseUrl: "http://api.test/", token: "tok", fetch: fetchImpl };
    const r = await processBuildJob({ projectId: "p1", workspaceId: "w1" }, api);
    expect(r.ok).toBe(true); expect(r.revision).toBe(7);
    expect(calls[0]).toMatchObject({ method: "GET", url: "http://api.test/v1/internal/projects/p1/build-input", auth: "Bearer tok" });
    expect(calls[1]).toMatchObject({ method: "POST", url: "http://api.test/v1/internal/projects/p1/build-result", body: { revision: 7, ok: true } });
    expect(calls[1]!.body.files).toBeGreaterThan(0);
    await expect(processBuildJob({ projectId: "p1", workspaceId: "someone-else" }, api)).rejects.toThrow(/does not match/);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1); // nothing reported for the refused job
  });
});
