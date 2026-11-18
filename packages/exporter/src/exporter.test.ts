import { describe, expect, it } from "vitest";
import { applyOperations, createDocument, createNode } from "@webbrik/document-model";
import ts from "typescript";
import { exportReact, exportStatic } from "./index";

describe("exporter", () => {
  it("exports pages to nested paths with relative stylesheet links", () => {
    let doc = createDocument("My Site");
    const root = doc.pages[0]!.rootId;
    doc = { ...doc, nodes: { ...doc.nodes, r2: createNode({ id: "r2", tag: "body", parentId: null }) }, pages: [...doc.pages, { id: "p2", name: "About", route: "/about/team", rootId: "r2", meta: {}, isHome: false }] };
    doc = applyOperations(doc, [{ type: "insertSubtree", rootId: "a", nodes: [createNode({ id: "a", parentId: root, tag: "p", text: "hi" })], parentId: root, index: 0 }]).doc;
    const { files, warnings } = exportStatic(doc);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["index.html", "about/team/index.html", "assets/styles.css"]));
    expect(files["about/team/index.html"]).toContain('href="../../assets/styles.css"');
    expect(files["index.html"]).toContain('href="assets/styles.css"');
    expect(warnings).toEqual([]);
  });

  it("includes the interactions runtime when interactions exist", () => {
    let doc = createDocument("x");
    const root = doc.pages[0]!.rootId;
    const b = createNode({ id: "b", parentId: root, tag: "button", text: "go", interactions: [{ id: "i", trigger: "click", action: "toggle", targetId: "b" }] });
    doc = applyOperations(doc, [{ type: "insertSubtree", rootId: "b", nodes: [b], parentId: root, index: 0 }]).doc;
    const { files } = exportStatic(doc);
    expect(files["assets/interactions.js"]).toBeTruthy();
    expect(files["index.html"]).toContain('src="assets/interactions.js"');
    expect(files["index.html"]).toContain('data-node-id="b"');
  });

  it("warns on dynamic routes and refuses invalid documents", () => {
    let doc = createDocument("x");
    doc = { ...doc, nodes: { ...doc.nodes, r2: createNode({ id: "r2", tag: "body", parentId: null }) }, pages: [...doc.pages, { id: "p2", name: "Post", route: "/blog/:slug", rootId: "r2", meta: {}, isHome: false }] };
    expect(exportStatic(doc).warnings[0]!.code).toBe("dynamic-route");
    expect(() => exportStatic({ ...doc, pages: [] })).toThrow(/invalid/i);
  });
});

function sample() {
  let doc = createDocument("My Shop");
  const root = doc.pages[0]!.rootId;
  doc = { ...doc, pages: [{ ...doc.pages[0]!, meta: { title: "Home", description: "Welcome" } }] };
  const card = createNode({ id: "card", parentId: root, tag: "div", children: ["t", "img", "btn"] });
  doc = applyOperations(doc, [
    { type: "insertSubtree", rootId: "card", nodes: [card, createNode({ id: "t", parentId: "card", tag: "h2", text: "Hi <b>\u2028", props: { bindText: "title" } }), createNode({ id: "img", parentId: "card", tag: "img", attributes: { src: "/a.png", alt: "A", onerror: "x()" } }), createNode({ id: "btn", parentId: "card", tag: "button", text: "Go", attributes: { class: "x", tabindex: "0" }, interactions: [{ id: "i", trigger: "click", action: "toggle", targetId: "t" }] })], parentId: root, index: 0 },
    { type: "setStyle", id: "card", breakpoint: "base", declarations: { padding: "8px" } },
    { type: "createComponent", elementId: "card", componentId: "c1", name: "product card", instanceId: "inst" },
    { type: "updateComponent", componentId: "c1", patch: { props: [{ name: "title", type: "text", default: "Fallback" }] } },
  ]).doc;
  const about = createNode({ id: "r2", tag: "body", parentId: null });
  doc = applyOperations(doc, [{ type: "addPage", page: { id: "p2", name: "About us", route: "/about", rootId: "r2", meta: {}, isHome: false }, rootNode: about }, { type: "insertSubtree", rootId: "i2", nodes: [createNode({ id: "i2", parentId: "r2", type: "component-instance", componentId: "c1", props: { title: "Second" } })], parentId: "r2", index: 0 }]).doc;
  return doc;
}

describe("react export", () => {
  for (const target of ["next", "vite"] as const) {
    it(`generates syntactically valid TSX for ${target} and keeps content safe`, () => {
      const { files } = exportReact(sample(), target);
      const tsx = Object.entries(files).filter(([p]) => p.endsWith(".tsx") || p.endsWith(".ts"));
      expect(tsx.length).toBeGreaterThan(2);
      for (const [path, src] of tsx) {
        const out = ts.transpileModule(src, { reportDiagnostics: true, fileName: path, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
        expect(out.diagnostics?.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")), path).toEqual([]);
      }
      const all = Object.values(files).join("\n");
      expect(all).not.toContain("onerror");
      expect(all).toContain("tabIndex");
      expect(all).toContain("className");
      const comp = files[`${target === "next" ? "components" : "src/components"}/ProductCard.tsx`]!;
      expect(comp).toContain("Fallback");
      expect(comp).toContain('data-node-id');
      expect(files["public/interactions.js"]).toBeTruthy();
      expect(files["package.json"]).toContain(target === "next" ? '"next"' : '"vite"');
    });
  }

  it("maps routes to Next app directories with metadata and imports components", () => {
    const { files } = exportReact(sample(), "next");
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["app/page.tsx", "app/about/page.tsx", "app/layout.tsx", "app/globals.css"]));
    expect(files["app/page.tsx"]).toContain('title":"Home"');
    expect(files["app/about/page.tsx"]).toContain('<ProductCard title={"Second"} />');
    expect(files["app/about/page.tsx"]).toContain('import { ProductCard } from "@/components/ProductCard"');
    expect(files["app/globals.css"]).toContain("padding:8px");
  });

  it("supports injected head snippets in static export", () => {
    const { files } = exportStatic(createDocument("x"), { injectHead: "<script defer data-domain=\"a.com\"></script>" });
    expect(files["index.html"]).toContain('data-domain="a.com"');
  });

  describe("CMS", () => {
    const items = [
      { id: "i1", slug: "first-post", data: { title: "First <b>post</b>", cover: "/img/a.png", views: 5 } },
      { id: "i2", slug: "second-post", data: { title: "Second post", views: 9 } },
      { id: "i3", slug: "Bad Slug!", data: { title: "Nope" } },
    ];
    const build = () => {
      let doc = createDocument("Blog");
      const root = doc.pages[0]!.rootId;
      const mk = (id: string, parentId: string, tag: string, extra: Partial<ReturnType<typeof createNode>> = {}) => ({ type: "insertSubtree" as const, rootId: id, nodes: [createNode({ id, parentId, tag, ...extra })], parentId, index: 99 });
      doc = applyOperations(doc, [
        mk("list", root, "ul", { props: { repeat: "posts", repeatSort: "views", repeatOrder: "desc", repeatLimit: 2 } }),
        mk("li", "list", "li", { text: "fallback", binding: { collectionId: "posts", field: "title", target: "text" } }),
        { type: "addPage", page: { id: "pg", name: "Post", route: "/blog/:slug", rootId: "proot", meta: { title: "{title} | Blog" }, isHome: false, collectionId: "posts" }, rootNode: createNode({ id: "proot", parentId: null, tag: "main" }) },
        mk("h", "proot", "h1", { text: "fallback", binding: { collectionId: "posts", field: "title", target: "text" } }),
        mk("im", "proot", "img", { attributes: { alt: "" }, binding: { collectionId: "posts", field: "cover", target: "src" } }),
      ]).doc;
      return doc;
    };

    it("repeats children per item (sorted, limited, escaped) and generates one page per valid item", () => {
      const r = exportStatic(build(), { content: { posts: items } });
      const home = r.files["index.html"]!;
      expect(home.indexOf("Second post")).toBeLessThan(home.indexOf("First &lt;b&gt;post&lt;/b&gt;")); // views desc
      expect(home).not.toContain("Nope"); // limit 2 applied after sort (Bad Slug has no views, sorts last)
      expect(home).not.toContain("<b>post");
      expect(r.files["blog/first-post/index.html"]).toContain("<h1");
      expect(r.files["blog/first-post/index.html"]).toContain("First &lt;b&gt;post&lt;/b&gt;");
      expect(r.files["blog/first-post/index.html"]).toContain('src="/img/a.png"');
      expect(r.files["blog/first-post/index.html"]).toContain("<title>First &lt;b&gt;post&lt;/b&gt; | Blog</title>");
      expect(r.files["blog/second-post/index.html"]).toContain("Second post");
      expect(Object.keys(r.files).filter((f) => f.startsWith("blog/"))).toHaveLength(2);
      expect(r.warnings.some((w) => w.code === "bad-slug")).toBe(true);
    });

    it("ignores bindings that point at a different collection and falls back without content", () => {
      const doc = build();
      const other = applyOperations(doc, [{ type: "updateElement", id: "li", patch: { binding: { collectionId: "other", field: "title", target: "text" } } }]).doc;
      const r = exportStatic(other, { content: { posts: items } });
      expect(r.files["index.html"]).toContain("fallback");
      const none = exportStatic(doc);
      expect(none.files["index.html"]).toContain("fallback");
      expect(none.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["bindings", "dynamic-route"]));
    });
  });
});
