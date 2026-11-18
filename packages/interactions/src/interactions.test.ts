import { describe, expect, it } from "vitest";
import { applyOperations, createDocument, createNode } from "@webbrik/document-model";
import { buildInteractionRuntime } from "./index";

describe("interaction runtime", () => {
  it("is empty without interactions and escapes data when present", () => {
    const doc = createDocument("t");
    expect(buildInteractionRuntime(doc)).toBe("");
    const root = doc.pages[0]!.rootId;
    const n = createNode({ id: "b", parentId: root, tag: "button", interactions: [{ id: "i", trigger: "click", action: "toggle", targetId: "</script>" }] });
    const js = buildInteractionRuntime(applyOperations(doc, [{ type: "insertSubtree", rootId: "b", nodes: [n], parentId: root, index: 0 }]).doc);
    expect(js).not.toContain("</script>");
    expect(js).toContain("prefers-reduced-motion");
    expect(() => new Function(js)).not.toThrow();
  });

  it("maps animation ids to generated classes and respects reduced motion", () => {
    let doc = createDocument("t");
    const root = doc.pages[0]!.rootId;
    const n = createNode({ id: "b", parentId: root, tag: "button", interactions: [{ id: "i", trigger: "click", action: "animate", targetId: "b", params: { animationId: "a1" } }] });
    doc = applyOperations(doc, [
      { type: "upsertAnimation", animation: { id: "a1", name: "pop", keyframes: [{ offset: 0, declarations: { opacity: "0" } }, { offset: 1, declarations: { opacity: "1" } }], duration: 200, delay: 0, easing: "ease", iterations: 1, direction: "normal", fill: "both" } },
      { type: "insertSubtree", rootId: "b", nodes: [n], parentId: root, index: 0 },
    ]).doc;
    const js = buildInteractionRuntime(doc);
    expect(js).toContain('{"a1":"pop"}');
    expect(js).toContain('"anim-"');
    expect(() => new Function(js)).not.toThrow();
  });
});
