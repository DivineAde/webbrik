import { describe, expect, it } from "vitest";
import ts from "typescript";
import { resolveFieldPath } from "@webbrik/content-engine";
import { applyOperations, createDocument, createNode } from "@webbrik/document-model";
import { buildInteractionRuntime } from "@webbrik/interactions";
import { renderPage } from "@webbrik/renderer";
import { exportReact, exportStatic } from "./index";

const content = {
  posts: [
    { id: "p1", slug: "one", data: { title: "One", tags: ["t2", "t1", "gone"] } },
    { id: "p2", slug: "two", data: { title: "Two", tags: [] } },
  ],
  tags: [
    { id: "t1", slug: "news", data: { name: "News", rank: 2 } },
    { id: "t2", slug: "tips", data: { name: "Tips", rank: 1 } },
  ],
};

const b = (id: string, parentId: string, tag: string, extra: object = {}) => createNode({ id, parentId, tag, ...extra } as never);

function site() {
  const d0 = createDocument("Feat");
  const home = d0.pages[0]!.rootId;
  const d1 = { ...d0, nodes: { ...d0.nodes, r2: createNode({ id: "r2", tag: "body", parentId: null }) }, pages: [...d0.pages, { id: "pg2", name: "Post", route: "/p/:slug", rootId: "r2", meta: {}, isHome: false, collectionId: "posts" }] };
  return applyOperations(d1, [
    // home: paginated list of posts
    { type: "insertSubtree", rootId: "list", parentId: home, index: 0, nodes: [b("list", home, "ul", { props: { repeat: "posts", repeatPageSize: 1 } })] },
    { type: "insertSubtree", rootId: "li", parentId: "list", index: 0, nodes: [b("li", "list", "li", { text: "x", binding: { collectionId: "posts", field: "title", target: "text" } })] },
    // home: contact form
    { type: "insertSubtree", rootId: "f", parentId: home, index: 1, nodes: [b("f", home, "form", { props: { formId: "contact", successMessage: "Got it <3", redirectUrl: "javascript:alert(1)" } })] },
    { type: "insertSubtree", rootId: "in", parentId: "f", index: 0, nodes: [b("in", "f", "input", { attributes: { name: "email", type: "email" } })] },
    // post page: all tags as text, and a repeater over the post's tags
    { type: "insertSubtree", rootId: "tg", parentId: "r2", index: 0, nodes: [b("tg", "r2", "p", { text: "", binding: { collectionId: "posts", field: "tags.name", target: "text" } })] },
    { type: "insertSubtree", rootId: "tl", parentId: "r2", index: 1, nodes: [b("tl", "r2", "ul", { props: { repeatRef: "tags", repeatRefTo: "tags", repeatSort: "rank" } })] },
    { type: "insertSubtree", rootId: "tli", parentId: "tl", index: 0, nodes: [b("tli", "tl", "li", { text: "", binding: { collectionId: "tags", field: "name", target: "text" } })] },
  ]).doc;
}

describe("multi-reference fields", () => {
  const all = Object.values(content).flat();
  const lookup = (id: string) => all.find((i) => i.id === id);
  it("resolves a path through a list of references, skipping dangling ids", () => {
    expect(resolveFieldPath(content.posts[0]!.data, "tags.name", lookup)).toEqual(["Tips", "News"]);
    expect(resolveFieldPath(content.posts[1]!.data, "tags.name", lookup)).toEqual([]);
  });
  it("renders joined text and a repeater over the referenced items (sorted)", () => {
    const doc = site();
    const page = doc.pages[1]!;
    const html = renderPage(doc, { ...page, route: "/p/one" }, { content, item: { collectionId: "posts", item: content.posts[0]! } }).html;
    expect(html).toContain("<p>Tips, News</p>");
    expect(html).toMatch(/<ul[^>]*><li[^>]*>Tips<\/li><li[^>]*>News<\/li><\/ul>/);
  });
  it("React export gives the same answers", () => {
    const { files } = exportReact(site(), "next", { content });
    const post = files["app/p/[slug]/page.tsx"]!;
    expect(post).toContain('refs(item, "tags"');
    expect(post).toContain('field(item, "tags.name")');
    const js = ts.transpileModule(files["content/cms.ts"]!, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod: { exports: Record<string, (...a: any[]) => any> } = { exports: {} };
    new Function("module", "exports", js)(mod, mod.exports);
    expect(mod.exports.field!(content.posts[0], "tags.name")).toBe("Tips, News");
    expect(mod.exports.refs!(content.posts[0], "tags", { sort: "rank" }).map((i: any) => i.id)).toEqual(["t2", "t1"]);
    expect(mod.exports.refs!(content.posts[1], "tags").length).toBe(0);
  });
});

describe("pagination", () => {
  it("marks the list and each iteration; the runtime builds the pager", () => {
    const doc = site();
    const html = renderPage(doc, doc.pages[0]!, { content }).html;
    expect(html).toContain('data-wb-paginate="1"');
    expect(html).toContain('data-wb-item="0"');
    expect(html).toContain('data-wb-item="1"');
    expect(buildInteractionRuntime(doc)).toContain("Pagination");
    const react = exportReact(doc, "vite", { content }).files["src/pages/HomePage.tsx"] ?? "";
    void react;
  });
});

describe("forms", () => {
  it("renders a form that the runtime can submit, with a honeypot and only safe redirects", () => {
    const doc = site();
    const html = renderPage(doc, doc.pages[0]!, { content }).html;
    expect(html).toContain('data-wb-form="contact"');
    expect(html).toContain('data-wb-success="Got it &lt;3"');
    expect(html).not.toContain("data-wb-redirect"); // javascript: URL refused
    expect(html).toContain('name="_hp"');
    const editor = renderPage(doc, doc.pages[0]!, { content, editor: true }).html;
    expect(editor).not.toContain('name="_hp"');
  });
  it("static export wires the endpoint into the runtime, or warns when there is none", () => {
    const withEp = exportStatic(site(), { content, forms: { endpoint: "https://api.example.com", projectId: "prj_1" } });
    expect(withEp.files["assets/interactions.js"]).toContain("https://api.example.com");
    expect(withEp.files["assets/interactions.js"]).toContain("prj_1");
    expect(withEp.warnings.map((w) => w.code)).not.toContain("forms");
    expect(exportStatic(site(), { content }).warnings.map((w) => w.code)).toContain("forms");
  });
  it("React export carries the form attributes, honeypot, pager marks and runtime", () => {
    const { files } = exportReact(site(), "vite", { content, forms: { endpoint: "https://api.example.com", projectId: "prj_1" } });
    const page = Object.entries(files).find(([p]) => p.startsWith("src/pages/") && files[p]!.includes("data-wb-form"))![1];
    expect(page).toContain('data-wb-form="contact"');
    expect(page).toContain('name="_hp"');
    expect(page).toContain("data-wb-paginate=");
    expect(page).toContain("data-wb-item={");
    expect(files["public/interactions.js"]).toContain("prj_1");
  });
});

describe("live content in React exports", () => {
  it("next: pages refresh content on the server and revalidate; vite: App refreshes after mount", () => {
    const live = { endpoint: "https://api.example.com/", projectId: "prj 1" };
    const n = exportReact(site(), "next", { content, live });
    expect(n.files["content/cms.ts"]).toContain('https://api.example.com/v1/public/content/prj%201');
    expect(n.files["content/cms.ts"]).toContain("export async function refreshContent");
    expect(n.files["app/page.tsx"]).toContain("await refreshContent()");
    expect(n.files["app/page.tsx"]).toContain("export const revalidate = 60");
    expect(n.files["app/p/[slug]/page.tsx"]).toContain("await refreshContent()");
    expect(n.warnings.map((w) => w.code)).toContain("cms-live");
    const v = exportReact(site(), "vite", { content, live });
    expect(v.files["src/App.tsx"]).toContain("refreshContent");
    for (const files of [n.files, v.files]) for (const [path, src] of Object.entries(files).filter(([p]) => /\.tsx?$/.test(p))) {
      const out = ts.transpileModule(src, { reportDiagnostics: true, fileName: path, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
      expect(out.diagnostics?.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")), path).toEqual([]);
    }
  });
  it("refreshContent swaps content in place and reports changes; failures keep the snapshot", async () => {
    const { files } = exportReact(site(), "vite", { content, live: { endpoint: "https://x", projectId: "p" } });
    const js = ts.transpileModule(files["src/content/cms.ts"]!, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod: { exports: Record<string, any> } = { exports: {} };
    const responses: Array<() => Promise<unknown>> = [
      async () => ({ ok: true, json: async () => ({ content: { posts: [{ id: "p9", slug: "nine", data: { title: "Nine" } }] } }) }),
      async () => ({ ok: true, json: async () => ({ content: { posts: [{ id: "p9", slug: "nine", data: { title: "Nine" } }] } }) }),
      async () => { throw new Error("offline"); },
      async () => ({ ok: false }),
    ];
    new Function("module", "exports", "fetch", js)(mod, mod.exports, () => responses.shift()!());
    const rt = mod.exports;
    expect(await rt.refreshContent()).toBe(true);
    expect(rt.repeat("posts").map((i: any) => i.id)).toEqual(["p9"]);
    expect(await rt.refreshContent()).toBe(false); // nothing new
    expect(await rt.refreshContent()).toBe(false); // offline: keeps what it has
    expect(await rt.refreshContent()).toBe(false);
    expect(rt.repeat("posts").map((i: any) => i.id)).toEqual(["p9"]);
  });
});
