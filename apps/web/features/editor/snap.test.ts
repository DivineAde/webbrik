import { describe, expect, it } from "vitest";
import { snapSize, type Box } from "./snap";

const parent: Box = { x: 0, y: 0, w: 1000, h: 800 };
const el: Box = { x: 100, y: 100, w: 200, h: 100 };
const sibs: Box[] = [{ x: 100, y: 220, w: 400, h: 100 }, { x: 100, y: 340, w: 640, h: 60 }];

describe("snapSize", () => {
  it("snaps the right edge to a sibling's right edge and reports a guide", () => {
    const r = snapSize("w", 396, el, parent, sibs);
    expect(r.size).toBe(400);            // 100 + 400 = sibling right edge (500)
    expect(r.guides).toEqual([{ axis: "x", pos: 500 }]);
  });
  it("snaps to the parent's right edge and centre", () => {
    expect(snapSize("w", 897, el, parent, []).size).toBe(900);
    expect(snapSize("w", 403, el, parent, []).size).toBe(400); // parent centre x = 500
  });
  it("snaps to a sibling's width", () => {
    expect(snapSize("w", 636, el, parent, [{ x: 0, y: 500, w: 640, h: 10 }]).size).toBe(640);
  });
  it("leaves free sizes alone outside the threshold, and rounds", () => {
    const r = snapSize("w", 333.4, el, parent, sibs);
    expect(r.size).toBe(333); expect(r.guides).toEqual([]);
  });
  it("works for heights and never returns less than 1px", () => {
    expect(snapSize("h", 118, el, parent, sibs).size).toBe(120); // sibling top edge 220 - el.y 100
    expect(snapSize("h", -50, el, parent, []).size).toBe(1);
  });
  it("picks the closest of several candidates", () => {
    const r = snapSize("w", 402, el, parent, [{ x: 100, y: 0, w: 400, h: 1 }, { x: 100, y: 0, w: 405, h: 1 }]);
    expect(r.size).toBe(400);
  });
});
