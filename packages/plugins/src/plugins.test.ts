import { describe, expect, it, vi } from "vitest";
import { createDocument } from "@webbrik/document-model";
import { PluginHost, PluginError, definePlugin, satisfies } from "./index";

const base = { id: "acme.hero", name: "Hero", version: "1.0.0", webbrik: "^0.1.0" };
const mkHost = (extra = {}) => new PluginHost({ webbrikVersion: "0.1.4", getDocument: () => createDocument("t"), onProposal: vi.fn(), ...extra });

describe("plugin sdk", () => {
  it("checks version ranges", () => {
    expect(satisfies("0.1.4", "^0.1.0")).toBe(true);
    expect(satisfies("0.2.0", "^0.1.0")).toBe(false);
    expect(satisfies("1.4.0", "^1.2.0")).toBe(true);
    expect(satisfies("2.0.0", "^1.2.0")).toBe(false);
    expect(satisfies("1.2.9", "~1.2.0")).toBe(true);
    expect(satisfies("1.3.0", "~1.2.0")).toBe(false);
    expect(satisfies("3.0.0", ">=2.0.0")).toBe(true);
  });

  it("loads plugins and collects contributions within declared permissions", async () => {
    const host = mkHost();
    await host.load(definePlugin({ manifest: { ...base, permissions: ["ui:elements", "ui:inspector"] }, activate(ctx) {
      ctx.contribute.element({ tag: "section", label: "Hero", category: "Layout" });
      ctx.contribute.inspectorControl({ id: "x", label: "X", property: "gap", kind: "text" });
    } }));
    expect(host.contributions().elements).toHaveLength(1);
    expect(host.list()[0]!.id).toBe("acme.hero");
  });

  it("denies undeclared permissions and rejects bad manifests / incompatible versions / duplicates", async () => {
    const host = mkHost();
    await expect(host.load(definePlugin({ manifest: { ...base, permissions: [] }, activate: (ctx) => void ctx.document.read() }))).rejects.toThrow(/lacks permission document:read/);
    await expect(host.load(definePlugin({ manifest: { ...base, id: "Bad Id", permissions: [] }, activate() {} }))).rejects.toThrow(/Invalid manifest/);
    await expect(host.load(definePlugin({ manifest: { ...base, webbrik: "^9.0.0", permissions: [] }, activate() {} }))).rejects.toThrow(/requires Webbrik/);
    await host.load(definePlugin({ manifest: { ...base, permissions: [] }, activate() {} }));
    await expect(host.load(definePlugin({ manifest: { ...base, permissions: [] }, activate() {} }))).rejects.toBeInstanceOf(PluginError);
  });

  it("gives plugins a copy of the document, routes writes through proposals, and restricts network hosts", async () => {
    const onProposal = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response("ok"));
    const host = mkHost({ onProposal, fetchImpl, allowedHosts: ["api.example.com"] });
    let seen!: ReturnType<typeof createDocument>;
    await host.load(definePlugin({ manifest: { ...base, permissions: ["document:read", "document:write", "network:fetch"] }, async activate(ctx) {
      seen = ctx.document.read();
      seen.name = "mutated";
      ctx.propose("add", []);
      await ctx.fetch("https://api.example.com/x");
      await expect(ctx.fetch("https://evil.test/x")).rejects.toThrow(/not allowed/);
    } }));
    expect(onProposal).toHaveBeenCalledWith("acme.hero", "add", []);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(createDocument("t").name).not.toBe("mutated");
  });
});
