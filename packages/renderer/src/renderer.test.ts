import { describe, expect, it } from "vitest";
import { applyOperation, applyOperations, createDocument, createNode } from "@webbrik/document-model";
import { renderPage } from "./index";

function build() {
  const doc = createDocument("t");
  const root = doc.pages[0]!.rootId;
  return applyOperations(doc, [
    { type: "insertSubtree", rootId: "h", nodes: [createNode({ id: "h", parentId: root, tag: "h1", text: "Hello <b>" })], parentId: root, index: 0 },
    {
      type: "insertSubtree",
      rootId: "x",
      nodes: [createNode({ id: "x", parentId: root, tag: "a", attributes: { href: "javascript:alert(1)", onclick: "x()", "data-ok": "1" } })],
      parentId: root,
      index: 1,
    },
    { type: "insertSubtree", rootId: "s", nodes: [createNode({ id: "s", parentId: root, tag: "script", text: "alert(1)" })], parentId: root, index: 2 },
    { type: "setStyle", id: "h", breakpoint: "base", declarations: { color: "red" } },
  ]).doc;
}

describe("renderer", () => {
  it("renders escaped content with generated classes and no inline styles", () => {
    const doc = build();
    const { html } = renderPage(doc, doc.pages[0]!);
    expect(html).toContain("Hello &lt;b&gt;");
    expect(html).toContain('class="e-h"');
    expect(html).not.toContain("style=");
    expect(html).toContain(".e-h{color:red}");
  });
  it("strips unsafe attributes and blocked tags", () => {
    const doc = build();
    const { html } = renderPage(doc, doc.pages[0]!);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onclick");
    expect(html).toContain('data-ok="1"');
    expect(html).not.toContain("<script>alert");
  });
  it("hides hidden nodes in production but not in editor mode", () => {
    let doc = build();
    doc = applyOperations(doc, [{ type: "updateElement", id: "h", patch: { hidden: true } }]).doc;
    expect(renderPage(doc, doc.pages[0]!).html).not.toContain("<h1");
    expect(renderPage(doc, doc.pages[0]!, { editor: true }).html).toContain('data-node-id="h"');
  });
});

describe("component instances", () => {
  function withComponent() {
    let doc = createDocument("t");
    const root = doc.pages[0]!.rootId;
    doc = applyOperations(doc, [
      { type: "insertSubtree", rootId: "card", nodes: [createNode({ id: "card", parentId: root, tag: "div" }), createNode({ id: "title", parentId: "card", tag: "h2", text: "Default", props: { bindText: "title" } }), createNode({ id: "badge", parentId: "card", tag: "span", text: "New", props: { bindVisible: "showBadge" } })].map((n, i) => (i === 0 ? { ...n, children: ["title", "badge"] } : n)), parentId: root, index: 0 },
      { type: "createComponent", elementId: "card", componentId: "c1", name: "Card", instanceId: "i1" },
      { type: "updateComponent", componentId: "c1", patch: { props: [{ name: "title", type: "text", default: "Fallback" }, { name: "showBadge", type: "boolean", default: true }], variants: ["primary"] } },
    ]).doc;
    return { doc, root };
  }

  it("renders component props, defaults, visibility and variants", () => {
    const { doc, root } = withComponent();
    const page = doc.pages[0]!;
    let html = renderPage(doc, page).html;
    expect(html).toContain("Fallback");
    expect(html).toContain("New");
    const second = createNode({ id: "i2", parentId: root, type: "component-instance", componentId: "c1", props: { title: "<Hello>", showBadge: false, variant: "primary" } });
    const d2 = applyOperation(doc, { type: "insertSubtree", rootId: "i2", nodes: [second], parentId: root, index: 1 }).doc;
    html = renderPage(d2, page).html;
    expect(html).toContain("&lt;Hello&gt;");
    expect(html).toContain('data-variant="primary"');
    expect(html.match(/New/g)).toHaveLength(1);
  });
});

describe("renderer CMS: rich text, references and repeater filters", () => {
  const content = {
    posts: [
      { id: "p1", slug: "a", data: { title: "A", cat: "news", author: "au1", body: "<p>Hi <strong>there</strong></p><script>alert(1)</script>" } },
      { id: "p2", slug: "b", data: { title: "B", cat: "blog", author: "au1", body: "<p>B</p>" } },
      { id: "p3", slug: "c", data: { title: "C", cat: "news", author: "missing", body: "" } },
    ],
    authors: [{ id: "au1", slug: "ada", data: { name: "Ada" } }],
  };
  function page(props: Record<string, unknown>) {
    const doc0 = createDocument("t");
    const root = doc0.pages[0]!.rootId;
    const doc = applyOperations(doc0, [
      { type: "insertSubtree", rootId: "list", nodes: [createNode({ id: "list", parentId: root, tag: "div", props }), ], parentId: root, index: 0 },
      { type: "insertSubtree", rootId: "t", nodes: [createNode({ id: "t", parentId: "list", tag: "h3", text: "fallback", binding: { collectionId: "posts", field: "title", target: "text" } })], parentId: "list", index: 0 },
      { type: "insertSubtree", rootId: "a", nodes: [createNode({ id: "a", parentId: "list", tag: "em", text: "no author", binding: { collectionId: "posts", field: "author.name", target: "text" } })], parentId: "list", index: 1 },
      { type: "insertSubtree", rootId: "b", nodes: [createNode({ id: "b", parentId: "list", tag: "div", binding: { collectionId: "posts", field: "body", target: "html" } })], parentId: "list", index: 2 },
    ]).doc;
    return renderPage(doc, doc.pages[0]!, { content }).html;
  }
  it("filters repeater items", () => {
    const html = page({ repeat: "posts", repeatWhere: [{ field: "cat", op: "eq", value: "news" }] });
    expect(html).toContain(">A</h3>");
    expect(html).toContain(">C</h3>");
    expect(html).not.toContain(">B</h3>");
  });
  it("resolves reference paths and keeps the fallback for dangling references", () => {
    const html = page({ repeat: "posts" });
    expect(html).toContain(">Ada</em>");
    expect(html).toContain(">no author</em>"); // p3's author is missing
  });
  it("renders sanitised rich text and never emits scripts from content", () => {
    const html = page({ repeat: "posts", repeatLimit: 1 });
    expect(html).toContain("<p>Hi <strong>there</strong></p>");
    expect(html).not.toContain("alert(1)");
  });
  it("tolerates malformed filter props", () => {
    expect(() => page({ repeat: "posts", repeatWhere: "nope" })).not.toThrow();
    expect(page({ repeat: "posts", repeatWhere: [null, { field: 1 }] })).toContain(">B</h3>");
  });
});
