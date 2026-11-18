import { describe, expect, it } from "vitest";
import {
  diffDocuments,
  History,
  OperationError,
  applyOperation,
  applyOperations,
  createDocument,
  createNode,
  validateDocument,
  type Document,
} from "./index";

function setup() {
  const doc = createDocument("Test");
  const root = doc.pages[0]!.rootId;
  return { doc, root };
}

function insert(doc: Document, parentId: string, id: string, extra = {}) {
  const node = createNode({ id, parentId, ...extra });
  return applyOperation(doc, { type: "insertSubtree", rootId: id, nodes: [node], parentId, index: 99 }).doc;
}

describe("operations", () => {
  it("inserts and reverses", () => {
    const { doc, root } = setup();
    const node = createNode({ id: "a", parentId: root });
    const r = applyOperation(doc, { type: "insertSubtree", rootId: "a", nodes: [node], parentId: root, index: 0 });
    expect(r.doc.nodes[root]!.children).toEqual(["a"]);
    const back = applyOperations(r.doc, r.inverse);
    expect(back.doc.nodes["a"]).toBeUndefined();
    expect(back.doc.nodes[root]!.children).toEqual([]);
  });

  it("deletes a subtree and restores it via inverse", () => {
    let { doc, root } = setup();
    doc = insert(doc, root, "a");
    doc = insert(doc, "a", "b");
    const del = applyOperation(doc, { type: "deleteElement", id: "a" });
    expect(del.doc.nodes["b"]).toBeUndefined();
    const restored = applyOperations(del.doc, del.inverse).doc;
    expect(restored.nodes["b"]!.parentId).toBe("a");
    expect(restored.nodes[root]!.children).toEqual(["a"]);
  });

  it("refuses to delete a page root or move into a descendant", () => {
    let { doc, root } = setup();
    expect(() => applyOperation(doc, { type: "deleteElement", id: root })).toThrow(OperationError);
    doc = insert(doc, root, "a");
    doc = insert(doc, "a", "b");
    expect(() => applyOperation(doc, { type: "moveElement", id: "a", parentId: "b", index: 0 })).toThrow(/itself/);
  });

  it("moves between parents and within the same parent", () => {
    let { doc, root } = setup();
    doc = insert(doc, root, "a");
    doc = insert(doc, root, "b");
    doc = insert(doc, root, "c");
    const same = applyOperation(doc, { type: "moveElement", id: "c", parentId: root, index: 0 });
    expect(same.doc.nodes[root]!.children).toEqual(["c", "a", "b"]);
    const re = applyOperation(doc, { type: "moveElement", id: "c", parentId: "a", index: 0 });
    expect(re.doc.nodes["a"]!.children).toEqual(["c"]);
    expect(applyOperations(re.doc, re.inverse).doc).toEqual(doc);
  });

  it("sets styles per breakpoint and inverts", () => {
    let { doc, root } = setup();
    doc = insert(doc, root, "a");
    const r = applyOperation(doc, { type: "setStyle", id: "a", breakpoint: "mobile", declarations: { color: "red" } });
    expect(r.doc.nodes["a"]!.styles[0]).toMatchObject({ breakpoint: "mobile", declarations: { color: "red" } });
    expect(applyOperations(r.doc, r.inverse).doc.nodes["a"]!.styles).toEqual([]);
  });

  it("duplicates a subtree with fresh ids", () => {
    let { doc, root } = setup();
    doc = insert(doc, root, "a");
    doc = insert(doc, "a", "b");
    const r = applyOperation(doc, { type: "duplicateElement", id: "a", newRootId: "a2" });
    const dup = r.doc.nodes["a2"]!;
    expect(dup.children).toHaveLength(1);
    expect(dup.children[0]).not.toBe("b");
    expect(r.doc.nodes[root]!.children).toEqual(["a", "a2"]);
    expect(validateDocument(r.doc).ok).toBe(true);
  });

  it("rejects edits to locked elements except unlocking", () => {
    let { doc, root } = setup();
    doc = insert(doc, root, "a", { locked: true });
    expect(() => applyOperation(doc, { type: "updateElement", id: "a", patch: { text: "x" } })).toThrow(/locked/);
    expect(applyOperation(doc, { type: "updateElement", id: "a", patch: { locked: false } }).doc.nodes["a"]!.locked).toBe(false);
  });

  it("is atomic across a batch", () => {
    const { doc, root } = setup();
    const good = createNode({ id: "a", parentId: root });
    expect(() =>
      applyOperations(doc, [
        { type: "insertSubtree", rootId: "a", nodes: [good], parentId: root, index: 0 },
        { type: "deleteElement", id: "nope" },
      ]),
    ).toThrow();
    expect(doc.nodes["a"]).toBeUndefined();
  });

  it("guards class names and in-use classes", () => {
    let { doc, root } = setup();
    doc = insert(doc, root, "a");
    doc = applyOperation(doc, { type: "upsertClass", cls: { id: "c1", name: "card", blocks: [] } }).doc;
    expect(() => applyOperation(doc, { type: "upsertClass", cls: { id: "c2", name: "card", blocks: [] } })).toThrow(/in use/);
    doc = applyOperation(doc, { type: "addClass", id: "a", classId: "c1" }).doc;
    expect(() => applyOperation(doc, { type: "removeClassDef", classId: "c1" })).toThrow(/in use/);
  });
});

describe("history", () => {
  it("undoes and redoes grouped transactions", () => {
    const { doc, root } = setup();
    const h = new History(doc);
    const a = createNode({ id: "a", parentId: root });
    h.commit("Add + style", [
      { type: "insertSubtree", rootId: "a", nodes: [a], parentId: root, index: 0 },
      { type: "setStyle", id: "a", breakpoint: "base", declarations: { color: "blue" } },
    ]);
    expect(h.doc.nodes["a"]!.styles).toHaveLength(1);
    expect(h.undo()).toBe(true);
    expect(h.doc.nodes["a"]).toBeUndefined();
    expect(h.redo()).toBe(true);
    expect(h.doc.nodes["a"]!.styles[0]!.declarations).toEqual({ color: "blue" });
    expect(h.undo() && h.undo()).toBe(false);
  });

  it("clears redo on new commit and leaves state intact on failure", () => {
    const { doc, root } = setup();
    const h = new History(doc);
    h.commit("a", [{ type: "insertSubtree", rootId: "a", nodes: [createNode({ id: "a", parentId: root })], parentId: root, index: 0 }]);
    h.undo();
    expect(h.canRedo).toBe(true);
    expect(() => h.commit("bad", [{ type: "deleteElement", id: "missing" }])).toThrow();
    expect(h.canRedo).toBe(true);
    h.commit("b", [{ type: "setToken", name: "--c", value: "#000" }]);
    expect(h.canRedo).toBe(false);
  });
});

describe("validation", () => {
  it("accepts a fresh document", () => {
    expect(validateDocument(createDocument("x")).ok).toBe(true);
  });
  it("flags duplicate routes and broken links", () => {
    const { doc, root } = setup();
    const bad: Document = {
      ...doc,
      pages: [...doc.pages, { id: "p2", name: "Dup", route: "/", rootId: root, meta: {}, isHome: false }],
    };
    const res = validateDocument(bad);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "duplicate-route")).toBe(true);
  });
  it("flags schema violations", () => {
    expect(validateDocument({ nope: true }).ok).toBe(false);
  });
});

describe("page, breakpoint and component operations", () => {
  const rootOf = (d: Document) => d.pages[0]!.rootId;

  it("adds, renames, re-routes and removes pages with full inverses", () => {
    const { doc } = setup();
    const root2 = createNode({ id: "r2", tag: "body", parentId: null });
    const added = applyOperation(doc, { type: "addPage", page: { id: "p2", name: "About", route: "/about", rootId: "r2", meta: {}, isHome: false }, rootNode: root2 });
    expect(added.doc.pages).toHaveLength(2);
    expect(validateDocument(added.doc).ok).toBe(true);
    expect(() => applyOperation(added.doc, { type: "addPage", page: { id: "p3", name: "X", route: "/about/", rootId: "r3", meta: {}, isHome: false }, rootNode: createNode({ id: "r3", tag: "body", parentId: null }) })).toThrow(/Route already/);
    expect(() => applyOperation(added.doc, { type: "updatePage", pageId: "p2", patch: { route: "/" } })).toThrow(/Route already/);
    expect(() => applyOperation(added.doc, { type: "updatePage", pageId: "p2", patch: { route: "bad route" } })).toThrow(/Invalid page/);
    const renamed = applyOperation(added.doc, { type: "updatePage", pageId: "p2", patch: { name: "About us", meta: { title: "About" } } });
    expect(renamed.doc.pages[1]).toMatchObject({ name: "About us", meta: { title: "About" } });
    expect(() => applyOperation(renamed.doc, { type: "removePage", pageId: doc.pages[0]!.id })).toThrow(/home/);
    const moved = applyOperation(renamed.doc, { type: "setHomePage", pageId: "p2" });
    const removed = applyOperation(moved.doc, { type: "removePage", pageId: doc.pages[0]!.id });
    expect(removed.doc.pages).toHaveLength(1);
    expect(removed.doc.nodes[rootOf(doc)]).toBeUndefined();
    expect(applyOperations(removed.doc, removed.inverse).doc).toEqual(moved.doc);
  });

  it("manages breakpoints and blocks removal when in use", () => {
    let { doc, root } = setup();
    doc = insert(doc, root, "a");
    doc = applyOperation(doc, { type: "upsertBreakpoint", breakpoint: { id: "wide", label: "Wide", maxWidth: 1600 } }).doc;
    expect(doc.breakpoints.some((b) => b.id === "wide")).toBe(true);
    expect(() => applyOperation(doc, { type: "upsertBreakpoint", breakpoint: { id: "base", label: "x", maxWidth: 10 } })).toThrow(/base/);
    doc = applyOperation(doc, { type: "setStyle", id: "a", breakpoint: "wide", declarations: { color: "red" } }).doc;
    expect(() => applyOperation(doc, { type: "removeBreakpoint", id: "wide" })).toThrow(/used/);
    expect(validateDocument(doc).ok).toBe(true);
  });

  it("creates a component, instances it, detaches it, and reverses each step", () => {
    let { doc, root } = setup();
    doc = insert(doc, root, "card");
    doc = insert(doc, "card", "title", { tag: "h2", text: "Hi" });
    const made = applyOperation(doc, { type: "createComponent", elementId: "card", componentId: "c1", name: "Card", instanceId: "inst" });
    expect(made.doc.nodes[root]!.children).toEqual(["inst"]);
    expect(made.doc.nodes["inst"]!.type).toBe("component-instance");
    expect(made.doc.components["c1"]!.rootId).toBe("card");
    expect(validateDocument(made.doc).ok).toBe(true);
    expect(applyOperations(made.doc, made.inverse).doc).toEqual(doc);
    expect(() => applyOperation(made.doc, { type: "deleteComponent", componentId: "c1" })).toThrow(/instances/);
    const detached = applyOperation(made.doc, { type: "detachInstance", id: "inst", idSeed: "d" });
    expect(detached.doc.nodes["inst"]!.type).toBe("element");
    expect(detached.doc.nodes["inst"]!.children).toEqual(["d_1"]);
    expect(validateDocument(detached.doc).ok).toBe(true);
    expect(applyOperations(detached.doc, detached.inverse).doc).toEqual(made.doc);
    const del = applyOperations(detached.doc, [{ type: "deleteComponent", componentId: "c1" }]);
    expect(del.doc.components["c1"]).toBeUndefined();
    expect(validateDocument(del.doc).ok).toBe(true);
  });

  it("duplicates deterministically", () => {
    let { doc, root } = setup();
    doc = insert(doc, root, "a");
    doc = insert(doc, "a", "b");
    const x = applyOperation(doc, { type: "duplicateElement", id: "a", newRootId: "z" }).doc;
    const y = applyOperation(doc, { type: "duplicateElement", id: "a", newRootId: "z" }).doc;
    expect(x).toEqual(y);
  });
});

describe("diff", () => {
  it("reports added, removed, moved, content and style changes", () => {
    let { doc, root } = setup();
    doc = insert(doc, root, "a", { text: "one" });
    doc = insert(doc, root, "b");
    const before = doc;
    let after = applyOperation(doc, { type: "updateElement", id: "a", patch: { text: "two" } }).doc;
    after = applyOperation(after, { type: "setStyle", id: "a", breakpoint: "base", declarations: { color: "red" } }).doc;
    after = applyOperation(after, { type: "deleteElement", id: "b" }).doc;
    after = insert(after, root, "c");
    const d = diffDocuments(before, after);
    expect(d.nodes.find((n) => n.id === "a" && n.kind === "content")?.detail).toBe('"one" → "two"');
    expect(d.nodes.some((n) => n.id === "a" && n.kind === "style")).toBe(true);
    expect(d.nodes.some((n) => n.id === "b" && n.kind === "removed")).toBe(true);
    expect(d.nodes.some((n) => n.id === "c" && n.kind === "added")).toBe(true);
    expect(d.summary.added).toBe(1);
  });
});

describe("animations", () => {
  const anim = { id: "a1", name: "fade-in", keyframes: [{ offset: 0, declarations: { opacity: "0" } }, { offset: 1, declarations: { opacity: "1" } }], duration: 300, delay: 0, easing: "ease-out", iterations: 1 as const, direction: "normal" as const, fill: "both" as const };

  it("adds, updates and removes animations reversibly and validates names", () => {
    const { doc } = setup();
    const r = applyOperation(doc, { type: "upsertAnimation", animation: anim });
    expect(r.doc.animations["a1"]!.name).toBe("fade-in");
    expect(applyOperations(r.doc, r.inverse).doc.animations["a1"]).toBeUndefined();
    expect(() => applyOperation(doc, { type: "upsertAnimation", animation: { ...anim, name: "Bad Name" } })).toThrow(/Invalid animation/);
    expect(() => applyOperation(doc, { type: "upsertAnimation", animation: { ...anim, keyframes: [anim.keyframes[0]!] } })).toThrow(/Invalid animation/);
    expect(() => applyOperation(r.doc, { type: "upsertAnimation", animation: { ...anim, id: "a2" } })).toThrow(/already in use/);
  });

  it("blocks removing animations used by interactions and flags dangling references", () => {
    let { doc, root } = setup();
    doc = applyOperation(doc, { type: "upsertAnimation", animation: anim }).doc;
    doc = insert(doc, root, "b", { interactions: [{ id: "i", trigger: "click", action: "animate", targetId: "b", params: { animationId: "a1" } }] });
    expect(() => applyOperation(doc, { type: "removeAnimation", id: "a1" })).toThrow(/used by/);
    expect(validateDocument(doc).ok).toBe(true);
    const dangling = { ...doc, animations: {} };
    expect(validateDocument(dangling).issues.some((i) => i.code === "unknown-animation")).toBe(true);
  });

  it("sets custom code reversibly and rejects oversized input", () => {
    const doc = createDocument("t");
    const r = applyOperations(doc, [{ type: "setCustomCode", field: "customCss", value: ".x{top:0}" }]);
    expect(r.doc.customCode.customCss).toBe(".x{top:0}");
    expect(applyOperations(r.doc, r.inverse).doc).toEqual(doc);
    expect(() => applyOperations(doc, [{ type: "setCustomCode", field: "headHtml", value: "x".repeat(200_001) }])).toThrow();
  });

  it("defaults binding target, binds pages to collections, and requires a :slug route for bound pages", () => {
    let doc = createDocument("t");
    const root = doc.pages[0]!.rootId;
    doc = applyOperations(doc, [{ type: "insertSubtree", rootId: "a", nodes: [createNode({ id: "a", parentId: root, binding: { collectionId: "c", field: "title" } as never })], parentId: root, index: 0 }]).doc;
    expect(validateDocument(doc).document!.nodes["a"]!.binding!.target).toBe("text");
    const bad = applyOperations(doc, [{ type: "updatePage", pageId: doc.pages[0]!.id, patch: { collectionId: "c" } }]).doc;
    expect(validateDocument(bad).issues.map((i) => i.code)).toContain("collection-needs-dynamic-route");
    const ok = applyOperations(doc, [{ type: "updatePage", pageId: doc.pages[0]!.id, patch: { route: "/:slug", collectionId: "c" } }]).doc;
    expect(validateDocument(ok).ok).toBe(true);
  });
});

describe("applyOperations batches", () => {
  it("leaves the original document untouched when a later op fails, and applies in order otherwise", async () => {
    const { createDocument, createNode, applyOperations } = await import("./index");
    const doc = createDocument("t");
    const root = doc.pages[0]!.rootId;
    const snapshot = JSON.stringify(doc);
    const ins = (id: string) => ({ type: "insertSubtree" as const, rootId: id, parentId: root, index: 0, nodes: [createNode({ id, parentId: root, tag: "p", text: id })] });
    expect(() => applyOperations(doc, [ins("a"), ins("b"), { type: "deleteElement", id: "missing" }])).toThrow();
    expect(JSON.stringify(doc)).toBe(snapshot);
    const r = applyOperations(doc, [ins("a"), ins("b")]);
    expect(r.doc.nodes[root]!.children).toEqual(["b", "a"]);
    expect(JSON.stringify(doc)).toBe(snapshot);
    const undone = applyOperations(r.doc, r.inverse);
    expect(undone.doc.nodes[root]!.children).toEqual([]);
    expect(r.doc.nodes[root]!.children).toEqual(["b", "a"]); // later ops don't mutate the earlier result
  });
});
