import { describe, expect, it } from "vitest";
import { applyOperations, createDocument, createNode, validateDocument, type Document } from "@webbrik/document-model";
import { dropOps, indentOps, moveOps, nudgeOps, outdentOps, resolveDrop } from "./dnd";

function fixture(): Document {
  const d = createDocument("t");
  const root = d.pages[0]!.rootId;
  const mk = (id: string, parentId: string, tag = "div") => ({ type: "insertSubtree" as const, rootId: id, nodes: [createNode({ id, parentId, tag })], parentId, index: 99 });
  return applyOperations(d, [mk("a", root), mk("b", root), mk("c", root), mk("img1", "a", "img"), mk("a1", "a")]).doc;
}
const kids = (d: Document, id: string) => d.nodes[id]!.children;

describe("drag and drop", () => {
  it("resolves before/after/inside and refuses void containers and page-root siblings", () => {
    const d = fixture(); const root = d.pages[0]!.rootId;
    expect(resolveDrop(d, "b", "before")).toEqual({ parentId: root, index: 1 });
    expect(resolveDrop(d, "b", "after")).toEqual({ parentId: root, index: 2 });
    expect(resolveDrop(d, "b", "inside")).toEqual({ parentId: "b", index: 0 });
    expect(resolveDrop(d, "img1", "inside")).toBeNull();
    expect(resolveDrop(d, root, "before")).toEqual({ parentId: root, index: 3 });
  });

  it("reorders within a parent without off-by-one errors", () => {
    const d = fixture(); const root = d.pages[0]!.rootId;
    const r = dropOps(d, { kind: "move", ids: ["a"] }, "c", "after");
    expect("ops" in r).toBe(true);
    if ("ops" in r) { const n = applyOperations(d, r.ops).doc; expect(kids(n, root)).toEqual(["b", "c", "a"]); expect(validateDocument(n).ok).toBe(true); }
    const r2 = dropOps(d, { kind: "move", ids: ["c"] }, "a", "before");
    if ("ops" in r2) expect(kids(applyOperations(d, r2.ops).doc, root)).toEqual(["c", "a", "b"]);
  });

  it("moves several selected elements together, preserving document order", () => {
    const d = fixture(); const root = d.pages[0]!.rootId;
    const r = moveOps(d, ["c", "a"], "b", 0);
    expect("ops" in r).toBe(true);
    if ("ops" in r) { const n = applyOperations(d, r.ops).doc; expect(kids(n, "b")).toEqual(["a", "c"]); expect(kids(n, root)).toEqual(["b"]); }
  });

  it("rejects moving into itself or its descendants, and locked elements", () => {
    const d = fixture();
    expect(dropOps(d, { kind: "move", ids: ["a"] }, "a1", "inside")).toHaveProperty("error");
    const locked = applyOperations(d, [{ type: "updateElement", id: "b", patch: { locked: true } }]).doc;
    expect(dropOps(locked, { kind: "move", ids: ["b"] }, "c", "after")).toHaveProperty("error");
  });

  it("inserts catalog elements and templates at the drop position as single reversible steps", () => {
    const d = fixture(); const root = d.pages[0]!.rootId;
    const c = dropOps(d, { kind: "catalog", label: "Heading 1" }, "b", "before");
    if (!("ops" in c)) throw new Error("expected ops");
    const n = applyOperations(d, c.ops).doc;
    expect(kids(n, root).indexOf(c.select[0]!)).toBe(1);
    const t = dropOps(d, { kind: "template", id: "hero" }, "c", "after");
    if (!("ops" in t)) throw new Error("expected ops");
    const n2 = applyOperations(d, t.ops).doc;
    expect(validateDocument(n2).ok).toBe(true);
    expect(kids(n2, root).at(-1)).toBe(t.select[0]);
  });

  it("nudges among siblings and stops at the ends", () => {
    const d = fixture(); const root = d.pages[0]!.rootId;
    expect(nudgeOps(d, "a", -1)).toEqual([]);
    expect(kids(applyOperations(d, nudgeOps(d, "a", 1)).doc, root)).toEqual(["b", "a", "c"]);
  });
});

describe("indent / outdent", () => {
  it("indent moves an element into its previous sibling; the first sibling can't indent", () => {
    const d = fixture(); const root = d.pages[0]!.rootId;
    expect(indentOps(d, "a")).toEqual([]);
    const n = applyOperations(d, indentOps(d, "b")).doc;
    expect(kids(n, root)).toEqual(["a", "c"]);
    expect(kids(n, "a").at(-1)).toBe("b");
    expect(validateDocument(n).ok).toBe(true);
  });
  it("outdent moves an element to just after its parent; top-level elements can't outdent", () => {
    const d = fixture(); const root = d.pages[0]!.rootId;
    expect(outdentOps(d, "b")).toEqual([]);
    const n = applyOperations(d, outdentOps(d, "a1")).doc;
    expect(kids(n, root)).toEqual(["a", "a1", "b", "c"]);
    expect(validateDocument(n).ok).toBe(true);
  });
  it("won't indent into a void element", () => {
    const d = fixture();
    const d2 = applyOperations(d, [{ type: "insertSubtree", rootId: "z", nodes: [createNode({ id: "z", parentId: "a", tag: "div" })], parentId: "a", index: 1 }]).doc;
    expect(indentOps(d2, "z")).toEqual([]); // previous sibling is <img>
  });
});
