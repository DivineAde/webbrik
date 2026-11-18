import { describe, expect, it } from "vitest";
import { createDocument, type Document } from "@webbrik/document-model";
import { ConflictError, DocumentsService, type DocumentStore } from "../src/modules/projects/documents.service";
import { hashPassword, newSessionToken, verifyPassword } from "../src/modules/auth/auth.service";
import { DeploymentsService } from "../src/modules/deployments/deployments.service";
import { MemoryProvider } from "@webbrik/deployment";

function memStore(): DocumentStore {
  const revs: { revision: number; document: Document }[] = [];
  return {
    head: async () => revs.at(-1) ?? null,
    append: async (_p, revision, document) => void revs.push({ revision, document }),
  };
}

describe("documents service", () => {
  it("saves valid documents with incrementing revisions", async () => {
    const s = new DocumentsService(memStore());
    const doc = createDocument("a");
    expect(await s.save("p", 0, doc)).toEqual({ ok: true, revision: 1 });
    expect(await s.save("p", 1, doc)).toEqual({ ok: true, revision: 2 });
  });
  it("rejects stale base revisions instead of overwriting", async () => {
    const s = new DocumentsService(memStore());
    await s.save("p", 0, createDocument("a"));
    await expect(s.save("p", 0, createDocument("a"))).rejects.toBeInstanceOf(ConflictError);
  });
  it("rejects invalid documents with issues", async () => {
    const r = await new DocumentsService(memStore()).save("p", 0, { bad: 1 });
    expect(r.ok).toBe(false);
  });
});

describe("auth + deployments", () => {
  it("hashes and verifies passwords; stores only token hashes", async () => {
    const h = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    const { token, tokenHash } = newSessionToken();
    expect(tokenHash).not.toBe(token);
  });
  it("publishes through the provider interface", async () => {
    const r = await new DeploymentsService(new MemoryProvider()).publish("p", "site", createDocument("S"), "preview");
    expect(r.deployment.status).toBe("ready");
  });
});
