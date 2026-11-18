import { describe, expect, it } from "vitest";
import { createDocument, createNode, applyOperations } from "@webbrik/document-model";
import { freePositionOps, offsetsIn, placeOps, releaseOps } from "./position";
import { resizeBox, snapMove, snapSize } from "./snap";

describe("snapMove", () => {
  const parent = { x: 0, y: 0, w: 1000, h: 800 };
  const sibs = [{ x: 400, y: 300, w: 200, h: 100 }];
  it("snaps edges and centres to siblings, the parent and user guides, per axis", () => {
    expect(snapMove({ x: 397, y: 10, w: 100, h: 50 }, parent, sibs).x).toBe(400);            // left edge to sibling left
    expect(snapMove({ x: 503, y: 10, w: 100, h: 50 }, parent, sibs).x).toBe(500);            // right edge (603) -> sibling right (600)? no: centre of parent
    const g = snapMove({ x: 200, y: 98, w: 100, h: 50 }, parent, [], { x: [], y: [100] });
    expect(g.y).toBe(100); expect(g.guides).toContainEqual({ axis: "y", pos: 100 });
    expect(snapMove({ x: 200, y: 98, w: 100, h: 50 }, parent, [], { x: [], y: [] }).y).toBe(98);   // nothing near: untouched
  });
  it("snaps a centre line, not just edges", () => {
    const r = snapMove({ x: 448, y: 0, w: 100, h: 10 }, parent, []);    // centre 498 -> parent centre 500
    expect(r.x).toBe(450); expect(r.guides[0]).toEqual({ axis: "x", pos: 500 });
  });
  it("snapSize honours user guides", () => {
    expect(snapSize("w", 297, { x: 100, y: 0, w: 100, h: 10 }, parent, [], 6, [400]).size).toBe(300);
  });
});

describe("resizeBox", () => {
  const b = { x: 100, y: 100, w: 200, h: 100 };
  it("moves the opposite edge's anchor for west/north handles", () => {
    expect(resizeBox(b, "e", 20, 0)).toEqual({ x: 100, y: 100, w: 220, h: 100 });
    expect(resizeBox(b, "w", -30, 0)).toEqual({ x: 70, y: 100, w: 230, h: 100 });
    expect(resizeBox(b, "nw", 10, 20)).toEqual({ x: 110, y: 120, w: 190, h: 80 });
    expect(resizeBox(b, "se", -500, -500)).toEqual({ x: 100, y: 100, w: 1, h: 1 });       // never collapses
    expect(resizeBox(b, "w", 500, 0).w).toBe(1);
  });
});

describe("free positioning ops", () => {
  const ctx = { id: "el", parentId: "par", breakpoint: "base", rect: { x: 130, y: 250, w: 200, h: 80 }, parentRect: { x: 100, y: 200, w: 800, h: 600 }, parentBorder: { l: 2, t: 2 }, parentPosition: "static" };
  it("offsets are measured from the parent's padding box", () => {
    expect(offsetsIn(ctx.rect, ctx.parentRect, ctx.parentBorder)).toEqual({ left: 28, top: 48 });
  });
  it("makes the parent relative only when needed and keeps the element where it was", () => {
    const ops = freePositionOps(ctx);
    expect(ops[0]).toMatchObject({ type: "setStyle", id: "par", declarations: { position: "relative" } });
    expect(ops[1]).toMatchObject({ id: "el", declarations: { position: "absolute", left: "28px", top: "48px", width: "200px", height: "80px" } });
    expect(freePositionOps({ ...ctx, parentPosition: "relative" })).toHaveLength(1);
  });
  it("applies cleanly to a document, and releasing / placing work", () => {
    const d0 = createDocument("t"); const root = d0.pages[0]!.rootId;
    const doc = applyOperations(d0, [{ type: "insertSubtree", rootId: "par", parentId: root, index: 0, nodes: [createNode({ id: "par", parentId: root, children: ["el"] }), createNode({ id: "el", parentId: "par" })] }]).doc;
    const placed = applyOperations(doc, freePositionOps(ctx)).doc;
    const decl = (id: string, p: string) => placed.nodes[id]!.styles.flatMap((b) => Object.entries(b.declarations)).find(([k]) => k === p)?.[1];
    expect(decl("el", "position")).toBe("absolute"); expect(decl("par", "position")).toBe("relative");
    const moved = applyOperations(placed, placeOps(ctx, { x: 150, y: 260, w: 300, h: 90 }, true)).doc;
    const m = (p: string) => moved.nodes["el"]!.styles.flatMap((b) => Object.entries(b.declarations)).find(([k]) => k === p)?.[1];
    expect([m("left"), m("top"), m("width"), m("height")]).toEqual(["48px", "58px", "300px", "90px"]);
    const freed = applyOperations(moved, releaseOps("el", "base")).doc;
    expect(freed.nodes["el"]!.styles.flatMap((b) => Object.keys(b.declarations))).not.toContain("position");
  });
});
