import { describe, expect, it } from "vitest";
import { AssetLibrary, MemoryStorage, assetUsage, buildSrcSet, imageSize, safeFileName, sanitizeSvg, validateUpload } from "./index";
import { createDocument, createNode, applyOperation } from "@webbrik/document-model";

const png = (w: number, h: number) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h);
  return b;
};
const enc = (s: string) => new TextEncoder().encode(s);

describe("assets", () => {
  it("validates by content, reads dimensions, and rejects mismatches", () => {
    const ok = validateUpload({ name: "Logo.PNG", declaredMime: "image/png", bytes: png(120, 40) });
    expect(ok).toMatchObject({ ok: true, kind: "image", width: 120, height: 40, ext: "png" });
    expect(validateUpload({ name: "evil.png", bytes: enc("<html>") }).ok).toBe(false);
    expect(validateUpload({ name: "a.jpg", bytes: png(1, 1) })).toMatchObject({ ok: false });
    expect(validateUpload({ name: "a.png", declaredMime: "image/jpeg", bytes: png(1, 1) })).toMatchObject({ ok: false });
    expect(validateUpload({ name: "a.png", bytes: new Uint8Array() })).toMatchObject({ ok: false });
    expect(imageSize(png(5, 6))).toEqual({ width: 5, height: 6 });
  });

  it("sanitises SVG: scripts, handlers, external refs, foreignObject, CSS", () => {
    const dirty = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><style>*{background:url(javascript:1)}</style><foreignObject><div>hi</div></foreignObject><a href="javascript:alert(1)"><path d="M0 0" onclick="x()" style="x"/></a><use href="https://evil.test/x.svg#a"/><rect width="10" height="10" fill="url(#g)"/><circle r="2" fill="url(https://evil.test/x)"/></svg>`;
    const clean = sanitizeSvg(dirty);
    for (const bad of ["script", "onload", "onclick", "javascript", "foreignObject", "<style", "ENTITY", "evil.test", "<a "]) expect(clean).not.toContain(bad);
    expect(clean).toContain("<rect");
    expect(clean).toContain('fill="url(#g)"');
    const r = validateUpload({ name: "x.svg", bytes: enc(dirty) });
    expect(r.ok && new TextDecoder().decode(r.bytes)).not.toContain("script");
  });

  it("stores content once, detects duplicates, blocks deleting used assets", async () => {
    const lib = new AssetLibrary(new MemoryStorage());
    const a = await lib.upload("p1", { name: "a.png", bytes: png(10, 10) });
    const b = await lib.upload("p1", { name: "copy.png", bytes: png(10, 10) });
    expect(a.ok && !a.duplicate).toBe(true);
    expect(b.ok && b.duplicate).toBe(true);
    const c = await lib.upload("p2", { name: "a.png", bytes: png(10, 10) });
    expect(c.ok && c.duplicate).toBe(false);
    if (!a.ok) throw new Error();
    const id = a.record.id;
    let doc = createDocument("t");
    const root = doc.pages[0]!.rootId;
    doc = applyOperation(doc, { type: "insertSubtree", rootId: "i", nodes: [createNode({ id: "i", parentId: root, tag: "img", attributes: { src: `asset:${id}` } })], parentId: root, index: 0 }).doc;
    expect(assetUsage(doc, id)).toEqual(["i"]);
    expect(await lib.remove(id, doc)).toMatchObject({ ok: false });
    expect(await lib.remove(id)).toMatchObject({ ok: true });
    expect(lib.list("p1")).toHaveLength(0);
  });

  it("cleans filenames and builds srcsets", () => {
    expect(safeFileName("../../etc/pass wd?.png")).toBe("pass-wd.png");
    expect(safeFileName("....")).toBe("file");
    expect(buildSrcSet("/img/a.png", [640, 320, 2000], 1280).srcset).toBe("/img/a.png?w=320 320w, /img/a.png?w=640 640w");
  });
});
