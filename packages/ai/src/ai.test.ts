import { describe, expect, it } from "vitest";
import { applyOperations, createDocument, createNode } from "@webbrik/document-model";
import { buildContext, reviewProposal } from "./index";

describe("ai proposal gate", () => {
  const doc = createDocument("t");
  const root = doc.pages[0]!.rootId;
  const good = { summary: "Add heading", operations: [{ type: "insertSubtree", rootId: "h", nodes: [createNode({ id: "h", parentId: root, tag: "h1", text: "Hi" })], parentId: root, index: 0 }] };

  it("accepts a valid proposal, previews it without mutating the original, and provides an inverse", () => {
    const r = reviewProposal(doc, good);
    expect(r.ok).toBe(true);
    expect(r.preview!.nodes["h"]).toBeDefined();
    expect(doc.nodes["h"]).toBeUndefined();
    expect(applyOperations(r.preview!, r.inverse!).doc.nodes["h"]).toBeUndefined();
  });
  it("rejects unknown operation types and malformed payloads", () => {
    expect(reviewProposal(doc, { summary: "x", operations: [{ type: "dropDatabase" }] }).ok).toBe(false);
    expect(reviewProposal(doc, "nonsense").ok).toBe(false);
  });
  it("rejects proposals that violate document rules", () => {
    expect(reviewProposal(doc, { summary: "x", operations: [{ type: "deleteElement", id: root }] }).ok).toBe(false);
  });
  it("builds a trimmed context", () => {
    expect(buildContext(doc, null).selection).toBeNull();
  });
});
