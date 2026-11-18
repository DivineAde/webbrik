import { describe, expect, it, vi } from "vitest";
import { MemoryProvider, VercelProvider, withRetry } from "./index";

describe("deployment", () => {
  it("memory provider handles deploy, rollback, domains", async () => {
    const p = new MemoryProvider();
    const d = await p.createDeployment({ projectId: "1", projectSlug: "s", target: "preview", files: { "index.html": "x" } });
    expect((await p.rollback("s", d.id)).target).toBe("production");
    expect((await p.addDomain("s", "a.com")).verified).toBe(false);
    expect((await p.verifyDomain("s", "a.com")).verified).toBe(true);
  });

  it("retries transient failures with backoff", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);
    expect(await withRetry(fn, { sleep })).toBe("ok");
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("vercel provider maps deployment responses and sends auth", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "dpl_1", readyState: "BUILDING", url: "x.vercel.app", createdAt: 0 }), { status: 200 }));
    const p = new VercelProvider({ token: "t", teamId: "team", fetchImpl: f as unknown as typeof fetch });
    const d = await p.createDeployment({ projectId: "1", projectSlug: "site", target: "production", files: { "index.html": "hi" } });
    expect(d).toMatchObject({ id: "dpl_1", status: "building", url: "https://x.vercel.app", target: "production" });
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toContain("teamId=team");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t");
  });
});
