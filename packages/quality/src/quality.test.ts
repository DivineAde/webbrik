import { describe, expect, it } from "vitest";
import { applyOperations, createDocument, createNode } from "@webbrik/document-model";
import { analyze, contrastRatio, summarize } from "./index";

describe("quality center", () => {
  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777", "#888")!).toBeLessThan(4.5);
  });
  it("finds SEO and accessibility problems", () => {
    const base = createDocument("t");
    const root = base.pages[0]!.rootId;
    const mk = (id: string, tag: string, extra = {}) => ({ type: "insertSubtree" as const, rootId: id, nodes: [createNode({ id, parentId: root, tag, ...extra })], parentId: root, index: 99 });
    const doc = applyOperations(base, [
      mk("t1", "h1", { text: "T" }), mk("i", "img"), mk("h", "h3", { text: "x" }), mk("b", "button"),
      { type: "setStyle", id: "h", breakpoint: "base", declarations: { color: "#777", background: "#888" } },
    ]).doc;
    const rules = analyze(doc).map((x) => x.rule);
    expect(rules).toEqual(expect.arrayContaining(["seo/title-missing", "seo/description-missing", "a11y/img-alt", "a11y/button-name", "a11y/contrast", "a11y/heading-skip"]));
    expect(summarize(analyze(doc)).errors).toBeGreaterThan(0);
  });
  it("passes a clean page", () => {
    let doc = createDocument("t");
    const root = doc.pages[0]!.rootId;
    doc = { ...doc, pages: [{ ...doc.pages[0]!, meta: { title: "Home", description: "d", ogImage: "/o.png" } }] };
    doc = applyOperations(doc, [{ type: "insertSubtree", rootId: "h", nodes: [createNode({ id: "h", parentId: root, tag: "h1", text: "Hi" })], parentId: root, index: 0 }]).doc;
    expect(analyze(doc)).toEqual([]);
  });
});
