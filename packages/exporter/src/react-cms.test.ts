import { describe, expect, it } from "vitest";
import ts from "typescript";
import { applyRepeaterQuery, resolveFieldPath } from "@webbrik/content-engine";
import { applyOperations, createDocument, createNode } from "@webbrik/document-model";
import { exportReact } from "./index";

const content = {
  posts: [
    { id: "p1", slug: "first", data: { title: "First", cat: "news", author: "au1", pts: 3, body: "<p>Hi</p><script>alert(1)</script>", cover: "/a.png" } },
    { id: "p2", slug: "second", data: { title: "Second", cat: "blog", author: "au1", pts: 9, body: "<p>Two</p>", cover: "/b.png" } },
    { id: "p3", slug: "Bad Slug", data: { title: "Third", cat: "news", author: "none", pts: 1, body: "", cover: "" } },
  ],
  authors: [{ id: "au1", slug: "ada", data: { name: "Ada" } }],
};

function site() {
  const doc0 = createDocument("Blog");
  const home = doc0.pages[0]!.rootId;
  const doc1 = { ...doc0, nodes: { ...doc0.nodes, r2: createNode({ id: "r2", tag: "body", parentId: null }) }, pages: [...doc0.pages, { id: "p2", name: "Post", route: "/blog/:slug", rootId: "r2", meta: { title: "{title} | Blog", description: "About {title}" }, isHome: false, collectionId: "posts" }] };
  const b = (id: string, parentId: string, tag: string, extra: object = {}) => createNode({ id, parentId, tag, ...extra } as never);
  return applyOperations(doc1, [
    { type: "insertSubtree", rootId: "list", nodes: [b("list", home, "ul", { props: { repeat: "posts", repeatWhere: [{ field: "cat", op: "eq", value: "news" }], repeatSort: "pts", repeatOrder: "desc", repeatLimit: 5 } })], parentId: home, index: 0 },
    { type: "insertSubtree", rootId: "li", nodes: [b("li", "list", "li", { text: "fallback title", binding: { collectionId: "posts", field: "title", target: "text" } })], parentId: "list", index: 0 },
    { type: "insertSubtree", rootId: "im", nodes: [b("im", "list", "img", { attributes: { src: "/x.png", alt: "static" }, binding: { collectionId: "posts", field: "cover", target: "src" } })], parentId: "list", index: 1 },
    { type: "insertSubtree", rootId: "h", nodes: [b("h", "r2", "h1", { text: "Title", binding: { collectionId: "posts", field: "title", target: "text" } })], parentId: "r2", index: 0 },
    { type: "insertSubtree", rootId: "au", nodes: [b("au", "r2", "p", { text: "by", binding: { collectionId: "posts", field: "author.name", target: "text" } })], parentId: "r2", index: 1 },
    { type: "insertSubtree", rootId: "bd", nodes: [b("bd", "r2", "div", { binding: { collectionId: "posts", field: "body", target: "html" } })], parentId: "r2", index: 2 },
  ]).doc;
}

const check = (files: Record<string, string>) => {
  for (const [path, src] of Object.entries(files).filter(([p]) => /\.tsx?$/.test(p))) {
    const out = ts.transpileModule(src, { reportDiagnostics: true, fileName: path, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
    expect(out.diagnostics?.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")), path).toEqual([]);
  }
};

describe("React export with CMS content", () => {
  it("next: repeaters, bindings, references, rich text and a dynamic [slug] route", () => {
    const { files, warnings } = exportReact(site(), "next", { content });
    check(files);
    const home = files["app/page.tsx"]!;
    expect(home).toContain('repeat("posts"');
    expect(home).toContain('"op":"eq"');
    expect(home).toContain('field(item');
    expect(home).toContain('import { Fragment } from "react"');
    expect(home).toContain('import { field, repeat } from "@/content/cms"');
    const post = files["app/blog/[slug]/page.tsx"]!;
    expect(post).toContain("generateStaticParams");
    expect(post).toContain("notFound()");
    expect(post).toContain('fillText("{title} | Blog"');
    expect(post).toContain('field(item, "author.name")');
    expect(post).toContain("dangerouslySetInnerHTML");
    const data = files["content/cms.ts"]!;
    expect(data).toContain("Ada");
    expect(data).not.toContain("alert(1)"); // rich text re-sanitised at export
    expect(data).toContain("<p>Hi</p>");
    expect(warnings.map((w) => w.code)).toContain("cms-snapshot");
    expect(warnings.map((w) => w.code)).not.toContain("bindings");
  });

  it("vite: one route per safe item, with titles", () => {
    const { files, warnings } = exportReact(site(), "vite", { content });
    check(files);
    const app = files["src/App.tsx"]!;
    expect(app).toContain('"/blog/first"');
    expect(app).toContain('"/blog/second"');
    expect(app).not.toContain("Bad Slug");
    expect(app).toContain("First | Blog");
    expect(app).toContain('import { findItem } from "./content/cms"');
    expect(files["src/content/cms.ts"]).toBeDefined();
    expect(app).not.toContain("JSX.Element"); // global JSX namespace is gone in React 19 types
    expect(warnings.some((w) => w.code === "bad-slug")).toBe(true);
  });

  it("without content it keeps the static fallback and says so", () => {
    const { files, warnings } = exportReact(site(), "next");
    expect(files["content/cms.ts"]).toBeUndefined();
    expect(files["app/page.tsx"]).not.toContain("repeat(");
    expect(warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["bindings", "dynamic-route"]));
  });

  it("the shipped runtime behaves exactly like the content-engine functions the renderer uses", async () => {
    const { files } = exportReact(site(), "next", { content });
    const js = ts.transpileModule(files["content/cms.ts"]!, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod: { exports: Record<string, (...a: any[]) => any> } = { exports: {} };
    new Function("module", "exports", js)(mod, mod.exports);
    const rt = mod.exports;
    const all = Object.values(content).flat();
    const lookup = (id: string) => all.find((i) => i.id === id);
    const queries = [{}, { where: [{ field: "cat", op: "eq", value: "news" }] }, { where: [{ field: "pts", op: "gt", value: "2" }], sort: "pts", order: "desc" }, { where: [{ field: "cat", op: "ne", value: "news" }], limit: 1 }, { where: [{ field: "cat", op: "regex", value: "." }] }, { sort: "title", order: "desc", limit: 2 }];
    for (const q of queries) expect(rt.repeat!("posts", q).map((i: any) => i.id)).toEqual(applyRepeaterQuery(content.posts, q as never).map((i) => i.id));
    for (const path of ["title", "author.name", "author.nothing", "missing", "pts"]) {
      const expected = resolveFieldPath(content.posts[0]!.data, path, lookup);
      expect(rt.field!(content.posts[0], path)).toBe(typeof expected === "string" || typeof expected === "number" || typeof expected === "boolean" ? String(expected) : undefined);
    }
    expect(rt.field!(content.posts[2], "author.name")).toBeUndefined(); // dangling reference
    expect(rt.findItem!("posts", "second")!.id).toBe("p2");
  });
});
