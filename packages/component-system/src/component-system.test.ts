import { describe, expect, it } from "vitest";
import { applyOperation, applyOperations, createDocument, validateDocument } from "@webbrik/document-model";
import { analyzeTemplate } from "./testutil";
import { TEMPLATES, componentUsage, insertSpecOp, specToNodes, wouldCreateComponentCycle } from "./index";

describe("templates", () => {
  for (const t of TEMPLATES) {
    it(`"${t.name}" inserts as one valid, reversible operation with deterministic ids`, () => {
      const doc = createDocument("t");
      const root = doc.pages[0]!.rootId;
      const op = insertSpecOp(doc, t.spec, root, 0, "tpl");
      const r = applyOperation(doc, op);
      expect(validateDocument(r.doc).ok).toBe(true);
      expect(applyOperations(r.doc, r.inverse).doc).toEqual(doc);
      expect(applyOperation(doc, insertSpecOp(doc, t.spec, root, 0, "tpl")).doc).toEqual(r.doc);
      expect(analyzeTemplate(r.doc).errors).toEqual([]);
    });
  }

  it("skips responsive styles for breakpoints the document doesn't have", () => {
    const t = TEMPLATES.find((x) => x.id === "hero")!;
    const { nodes } = specToNodes(t.spec, "p", "s", ["base"]);
    expect(nodes.every((n) => n.styles.every((b) => b.breakpoint === "base"))).toBe(true);
  });
});

describe("component usage", () => {
  it("finds instances by page and detects component cycles", () => {
    let doc = createDocument("t");
    const root = doc.pages[0]!.rootId;
    const t = TEMPLATES.find((x) => x.id === "cta")!;
    doc = applyOperation(doc, insertSpecOp(doc, t.spec, root, 0, "a")).doc;
    doc = applyOperations(doc, [{ type: "createComponent", elementId: "a", componentId: "c1", name: "CTA", instanceId: "i1" }]).doc;
    expect(componentUsage(doc, "c1")).toEqual([{ nodeId: "i1", pageId: doc.pages[0]!.id }]);
    expect(wouldCreateComponentCycle(doc, "c1", "c1")).toBe(true);
    expect(wouldCreateComponentCycle(doc, "c1", "nope")).toBe(false);
  });
});
