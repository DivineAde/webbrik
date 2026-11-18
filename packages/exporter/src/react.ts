import { compileCss, elementClass } from "@webbrik/css-engine";
import { validateDocument, type Document, type ElementNode } from "@webbrik/document-model";
import { buildInteractionRuntime } from "@webbrik/interactions";
import { BLOCKED_TAGS, TAG_RE, VOID, escapeHtml, formAttributes, pageSizeOf, safeAttr, type ContentData } from "@webbrik/renderer";
import { sanitizeRichText, type Where } from "@webbrik/content-engine";
import type { ExportResult, ExportWarning } from "./index";
import { CMS_RUNTIME_SOURCE, SAFE_SLUG, fill, liveContentSource } from "./cms";

export type ReactTarget = "vite" | "next";

const ATTR_MAP: Record<string, string> = { class: "className", for: "htmlFor", tabindex: "tabIndex", colspan: "colSpan", rowspan: "rowSpan", maxlength: "maxLength", readonly: "readOnly", autocomplete: "autoComplete", autofocus: "autoFocus", srcset: "srcSet", crossorigin: "crossOrigin", datetime: "dateTime", enctype: "encType", novalidate: "noValidate", contenteditable: "contentEditable", playsinline: "playsInline", frameborder: "frameBorder" };

const js = (v: unknown) => (v === undefined ? "undefined" : JSON.stringify(v)).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const ind = (n: number) => "  ".repeat(n);

function pascal(name: string, used: Set<string>): string {
  let base = name.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(" ").filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join("") || "Component";
  if (/^\d/.test(base)) base = "C" + base;
  let n = base, i = 2;
  while (used.has(n)) n = base + i++;
  used.add(n);
  return n;
}

interface Ctx {
  doc: Document;
  componentNames: Map<string, string>;
  nodeIds: boolean;
  /** inside a component definition: the root id (for data-variant) */
  scopeRoot?: string;
  usedComponents: Set<string>;
  /** Present when CMS content was supplied: enables bindings, repeaters and dynamic pages. */
  cms?: { content: ContentData; shared: { fragment: boolean; cms: boolean }; warnings: ExportWarning[] };
  /** The CMS item in scope (page item or innermost repeater iteration) and the JS variable holding it. */
  item?: { cid: string; v: string };
  /** Set for the top-level children of a repeater iteration: the JS variable holding the iteration index (for pagination). */
  iter?: { v: string; depth: number };
}

const cmsPath = (c: Ctx, node: ElementNode, target: "text" | "src" | "href" | "alt" | "html") => {
  const b = node.binding;
  return c.cms && c.item && b && b.collectionId === c.item.cid && (b.target ?? "text") === target ? b.field : undefined;
};
const repeatQuery = (node: ElementNode) => {
  const where = Array.isArray(node.props["repeatWhere"]) ? (node.props["repeatWhere"] as Where[]).filter((w) => w && typeof w.field === "string" && typeof w.value === "string") : [];
  const limit = Number(node.props["repeatLimit"]);
  return {
    where: where.map((w) => ({ field: w.field, op: w.op, value: w.value })),
    ...(typeof node.props["repeatSort"] === "string" ? { sort: node.props["repeatSort"] } : {}),
    order: node.props["repeatOrder"] === "desc" ? "desc" : "asc",
    ...(Number.isInteger(limit) && limit > 0 ? { limit } : {}),
  };
};

function jsxNode(c: Ctx, id: string, depth: number): string {
  const node = c.doc.nodes[id];
  if (!node || depth > 200) return "";
  const pad = ind(depth);
  const scoped = c.scopeRoot !== undefined;
  const bind = (k: string) => (scoped && typeof node.props[k] === "string" ? (node.props[k] as string) : undefined);

  let out: string;
  if (node.type === "text") {
    const b = bind("bindText");
    const cb = cmsPath(c, node, "text");
    if (cb) c.cms!.shared.cms = true;
    out = `${pad}{${b ? `String(v[${js(b)}] ?? ${js(node.text ?? "")})` : cb ? `field(${c.item!.v}, ${js(cb)}) ?? ${js(node.text ?? "")}` : js(node.text ?? "")}}`;
  } else if (node.type === "component-instance") {
    const def = node.componentId ? c.doc.components[node.componentId] : undefined;
    const name = def && c.componentNames.get(def.id);
    if (!def || !name) return "";
    c.usedComponents.add(def.id);
    const props = Object.entries(node.props).filter(([k]) => /^[A-Za-z_]\w*$/.test(k)).map(([k, v]) => ` ${k}={${js(v)}}`).join("");
    out = `${pad}<${name}${props} />`;
  } else {
    const tag = TAG_RE.test(node.tag) && !BLOCKED_TAGS.has(node.tag) ? node.tag : "div";
    const classes = [...node.classIds.map((cid) => c.doc.classes[cid]?.name).filter(Boolean), node.styles.length ? elementClass(node.id) : ""].filter(Boolean).join(" ");
    const attrs: string[] = [];
    if (classes) attrs.push(`className=${js(classes)}`);
    if (c.nodeIds) attrs.push(`data-node-id=${js(node.id)}`);
    if (c.iter && c.iter.depth === depth) attrs.push(`data-wb-item={${c.iter.v}}`);
    if (scoped && node.id === c.scopeRoot) attrs.push(`data-variant={typeof v["variant"] === "string" && /^[\\w-]+$/.test(v["variant"]) ? v["variant"] : undefined}`);
    const formAttrs = formAttributes(node);
    for (const [k, v] of Object.entries(formAttrs)) attrs.push(`${k}=${js(v)}`);
    const attributes: Record<string, string> = { ...node.attributes };
    const cmsAttr = (k: string) => (k === "src" || k === "href" || k === "alt" ? cmsPath(c, node, k) : undefined);
    for (const [k, v] of Object.entries(attributes)) {
      if (safeAttr(k, v) === null) continue;
      if (cmsAttr(k.toLowerCase())) continue;
      const jsxName = ATTR_MAP[k.toLowerCase()] ?? k;
      if (bind(k === "href" ? "bindHref" : k === "src" ? "bindSrc" : k === "alt" ? "bindAlt" : "")) continue;
      attrs.push(`${jsxName}=${js(v)}`);
    }
    for (const [prop, attr] of [["bindHref", "href"], ["bindSrc", "src"], ["bindAlt", "alt"]] as const) {
      const b = bind(prop);
      if (b) attrs.push(`${attr}={String(v[${js(b)}] ?? ${js(node.attributes[attr] ?? "")})}`);
    }
    for (const attr of ["src", "href", "alt"] as const) {
      const cb = cmsPath(c, node, attr);
      if (!cb || bind(attr === "href" ? "bindHref" : attr === "src" ? "bindSrc" : "bindAlt")) continue;
      c.cms!.shared.cms = true;
      attrs.push(`${attr}={field(${c.item!.v}, ${js(cb)}) ?? ${js(node.attributes[attr] ?? "")}}`);
    }
    const rich = cmsPath(c, node, "html");
    if (rich) {
      c.cms!.shared.cms = true;
      attrs.push(`dangerouslySetInnerHTML={{ __html: field(${c.item!.v}, ${js(rich)}) ?? ${js(escapeHtml(node.text ?? ""))} }}`);
      if (node.children.length) c.cms!.warnings.push({ code: "rich-text-children", message: `"${node.id}" shows rich text, so its child elements were not exported.` });
    }
    const pageSize0 = pageSizeOf(node);
    if (pageSize0 && (node.props["repeat"] || node.props["repeatRef"])) attrs.push(`data-wb-paginate=${js(String(pageSize0))}`);
    const open = `<${tag}${attrs.length ? " " + attrs.join(" ") : ""}`;
    if (VOID.has(tag)) out = `${pad}${open} />`;
    else if (rich) out = `${pad}${open} />`;
    else {
      const bt = bind("bindText");
      const parts: string[] = [];
      const ct = bt ? undefined : cmsPath(c, node, "text");
      if (ct) c.cms!.shared.cms = true;
      if (bt) parts.push(`${ind(depth + 1)}{String(v[${js(bt)}] ?? ${js(node.text ?? "")})}`);
      else if (ct) parts.push(`${ind(depth + 1)}{field(${c.item!.v}, ${js(ct)}) ?? ${js(node.text ?? "")}}`);
      else if (node.text !== undefined) parts.push(`${ind(depth + 1)}{${js(node.text)}}`);
      const cid = node.props["repeat"];
      const refField = node.props["repeatRef"], refTo = node.props["repeatRefTo"];
      if (c.cms && c.item && typeof refField === "string" && typeof refTo === "string" && c.cms.content[refTo]) {
        const v = `item${depth}`;
        c.cms.shared.fragment = true; c.cms.shared.cms = true;
        const inner = node.children.map((ch) => jsxNode({ ...c, item: { cid: refTo, v }, iter: { v: `${v}i`, depth: depth + 3 } }, ch, depth + 3)).filter(Boolean);
        parts.push(`${ind(depth + 1)}{refs(${c.item.v}, ${js(refField)}, ${js(repeatQuery(node))}).map((${v}, ${v}i) => (\n${ind(depth + 2)}<Fragment key={${v}.id}>\n${inner.join("\n")}\n${ind(depth + 2)}</Fragment>\n${ind(depth + 1)}))}`);
      } else if (typeof refField === "string" && !refTo) {
        c.cms?.warnings.push({ code: "repeat-ref", message: `"${node.id}" repeats a reference field but has no target collection set; it was exported empty.` });
      } else if (c.cms && typeof cid === "string" && c.cms.content[cid]) {
        const v = `item${depth}`;
        c.cms.shared.fragment = true; c.cms.shared.cms = true;
        const inner = node.children.map((ch) => jsxNode({ ...c, item: { cid, v }, iter: { v: `${v}i`, depth: depth + 3 } }, ch, depth + 3)).filter(Boolean);
        parts.push(`${ind(depth + 1)}{repeat(${js(cid)}, ${js(repeatQuery(node))}).map((${v}, ${v}i) => (\n${ind(depth + 2)}<Fragment key={${v}.id}>\n${inner.join("\n")}\n${ind(depth + 2)}</Fragment>\n${ind(depth + 1)}))}`);
      } else
      for (const ch of node.children) {
        const j = jsxNode(c, ch, depth + 1);
        if (j) parts.push(j);
      }
      if (formAttrs["data-wb-form"]) parts.push(`${ind(depth + 1)}<div aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}><label>Leave this empty<input type="text" name="_hp" tabIndex={-1} autoComplete="off" /></label></div>`);
      out = parts.length ? `${pad}${open}>\n${parts.join("\n")}\n${pad}</${tag}>` : `${pad}${open}></${tag}>`;
    }
  }
  const vis = bind("bindVisible");
  return vis ? `${pad}{v[${js(vis)}] !== false && (\n${out.replace(/^/gm, "  ")}\n${pad})}` : out;
}

function pageBody(c: Ctx, rootId: string, depth: number): string {
  const root = c.doc.nodes[rootId];
  return (root?.children ?? []).map((ch) => jsxNode(c, ch, depth)).filter(Boolean).join("\n");
}

function routeDir(route: string) {
  return route.replace(/^\/|\/$/g, "");
}

/** React export: components for page/component definitions and one global stylesheet from the same CSS compiler. */
export interface ReactExportOptions {
  /** Published CMS items per collection id. Enables bindings, repeaters and dynamic pages in the exported project. */
  content?: ContentData;
  /** Fetch published content from the API at run time (snapshot is the fallback). */
  live?: { endpoint: string; projectId: string };
  /** Where published forms post to (API origin + project id). */
  forms?: { endpoint: string; projectId: string };
}

export function exportReact(doc: Document, target: ReactTarget = "next", options: ReactExportOptions = {}): ExportResult {
  const v = validateDocument(doc);
  if (!v.ok) throw new Error("Cannot export invalid document: " + v.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; "));
  const warnings: ExportWarning[] = [];
  const files: Record<string, string> = {};
  const runtime = buildInteractionRuntime(doc, { forms: options.forms });
  const live = options.live && options.content ? `${options.live.endpoint.replace(/\/$/, "")}/v1/public/content/${encodeURIComponent(options.live.projectId)}` : undefined;

  const used = new Set<string>(["App", "Page", "Layout", "RootLayout"]);
  const componentNames = new Map<string, string>();
  for (const def of Object.values(doc.components)) componentNames.set(def.id, pascal(def.name, used));
  // Rich-text fields are sanitised again here so exported projects never embed unvetted HTML.
  const richFields = new Set(Object.values(doc.nodes).filter((n) => n.binding?.target === "html").map((n) => n.binding!.field.split(".").pop()!));
  const content: ContentData | undefined = options.content && Object.fromEntries(Object.entries(options.content).map(([k, items]) => [k, items.map((i) => ({ id: i.id, slug: i.slug, data: Object.fromEntries(Object.entries(i.data).map(([f, v]) => [f, richFields.has(f) && typeof v === "string" ? sanitizeRichText(v) : v])) }))]));
  const cmsBase = content ? { content, shared: { fragment: false, cms: false }, warnings } : undefined;
  const ctx: Ctx = { doc, componentNames, nodeIds: !!runtime, usedComponents: new Set() };
  const cmsFile = target === "next" ? "content/cms.ts" : "src/content/cms.ts";
  const cmsImport = (from: "page" | "app") => (target === "next" ? "@/content/cms" : from === "page" ? "../content/cms" : "./content/cms");
  const viteDynamic: { name: string; route: string; cid: string; slug: string; title: string }[] = [];

  const compDir = target === "next" ? "components" : "src/components";
  for (const def of Object.values(doc.components)) {
    const name = componentNames.get(def.id)!;
    const defaults = Object.fromEntries(def.props.filter((p) => p.default !== undefined).map((p) => [p.name, p.default]));
    const cctx: Ctx = { ...ctx, scopeRoot: def.rootId, usedComponents: new Set() };
    const body = jsxNode(cctx, def.rootId, 2);
    const imports = [...cctx.usedComponents].map((id) => `import { ${componentNames.get(id)} } from "./${componentNames.get(id)}";`).join("\n");
    files[`${compDir}/${name}.tsx`] = `${imports ? imports + "\n\n" : ""}const defaults: Record<string, unknown> = ${js(defaults)};\n\nexport function ${name}(props: Record<string, unknown>) {\n  const v = { ...defaults, ...props };\n  return (\n${body}\n  );\n}\n`;
  }

  const pagePaths: { name: string; route: string; file: string; isHome: boolean }[] = [];
  const pageNames = new Set<string>(used);
  for (const page of doc.pages) {
    const dynamic = /:slug(\/|$)/.test(page.route);
    if (dynamic) {
      if (!content || !page.collectionId || !content[page.collectionId]) { warnings.push({ code: "dynamic-route", message: `Dynamic page ${page.route} needs a collection with content and was skipped.` }); continue; }
    } else if (/[:\[\]]/.test(page.route)) { warnings.push({ code: "dynamic-route", message: `Route ${page.route} is not supported and was skipped.` }); continue; }
    const name = pascal(page.name + " Page", pageNames);
    const shared = { fragment: false, cms: false };
    const pctx: Ctx = { ...ctx, usedComponents: new Set(), cms: cmsBase && { ...cmsBase, shared }, item: dynamic && page.collectionId ? { cid: page.collectionId, v: "item" } : undefined };
    const body = pageBody(pctx, page.rootId, dynamic && target === "next" ? 4 : 3);
    const imports = [...pctx.usedComponents].map((id) => `import { ${componentNames.get(id)} } from "${target === "next" ? `@/components/${componentNames.get(id)}` : `../components/${componentNames.get(id)}`}";`);
    const helpers = ["field", "repeat", "refs", "findItem", "content"].filter((h) => (h === "field" || h === "repeat" || h === "refs") ? new RegExp(`\\b${h}\\(`).test(body) : false);
    const titleOf = (t: string | undefined) => t;
    if (shared.fragment) imports.unshift('import { Fragment } from "react";');
    const meta0 = { title: page.meta.title ?? page.name, ...(page.meta.description ? { description: page.meta.description } : {}) };
    let comp: string, file: string;
    if (dynamic) {
      const cid = page.collectionId!;
      const route = page.route;
      if (target === "next") {
        const imp = ["findItem", "content", ...helpers, ...(live ? ["refreshContent"] : [])];
        imports.push(`import { notFound } from "next/navigation";`, `import { ${imp.join(", ")}, fillText } from "@/content/cms";`);
        const og = page.meta.ogImage ? `, openGraph: { images: [${js(page.meta.ogImage)}] }` : "";
        comp = `${imports.join("\n")}\n\nconst cid = ${js(cid)};\n\n${live ? "export const revalidate = 60;\n\n" : ""}export ${live ? "async " : ""}function generateStaticParams() {\n  ${live ? "await refreshContent();\n  " : ""}return (content[cid] ?? []).filter((i) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(i.slug)).map((i) => ({ slug: i.slug }));\n}\n\nexport async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {\n  const { slug } = await params;\n  ${live ? "await refreshContent();\n  " : ""}const item = findItem(cid, slug);\n  if (!item) return {};\n  return { title: fillText(${js(titleOf(meta0.title))}, item) ?? ${js(page.name)}, description: fillText(${js(meta0.description)}, item)${og} };\n}\n\nexport default async function ${name}({ params }: { params: Promise<{ slug: string }> }) {\n  const { slug } = await params;\n  ${live ? "await refreshContent();\n  " : ""}const item = findItem(cid, slug);\n  if (!item) notFound();\n  return (\n    <>\n${body}\n    </>\n  );\n}\n`;
        file = `app/${routeDir(route).replace(/:slug/g, "[slug]")}/page.tsx`;
      } else {
        imports.push(`import { ${[...helpers, "type Item"].join(", ")} } from "${cmsImport("page")}";`);
        comp = `${imports.join("\n")}\n\nexport default function ${name}({ item }: { item: Item }) {\n  return (\n    <>\n${body}\n    </>\n  );\n}\n`;
        file = `src/pages/${name}.tsx`;
        const seen = new Set<string>();
        for (const it of content![cid]!) {
          if (!SAFE_SLUG.test(it.slug) || seen.has(it.slug)) { warnings.push({ code: "bad-slug", message: `Item "${it.slug}" skipped: slugs must be lowercase letters, numbers and hyphens, and unique.` }); continue; }
          seen.add(it.slug);
          viteDynamic.push({ name, route: route.replace(/:slug(?=\/|$)/, it.slug), cid, slug: it.slug, title: fill(page.meta.title, it) ?? page.name });
        }
      }
    } else {
      const liveHere = !!live && target === "next" && shared.cms;
      if (shared.cms) imports.push(`import { ${[...helpers, ...(liveHere ? ["refreshContent"] : [])].join(", ")} } from "${cmsImport("page")}";`);
      const meta = target === "next" ? `export const metadata = ${js({ title: page.meta.title ?? page.name, ...(page.meta.description ? { description: page.meta.description } : {}), ...(page.meta.ogImage ? { openGraph: { images: [page.meta.ogImage] } } : {}) })};\n\n` : "";
      comp = `${imports.length ? imports.join("\n") + "\n\n" : ""}${meta}${liveHere ? "export const revalidate = 60;\n\n" : ""}export default ${liveHere ? "async " : ""}function ${name}() {\n  ${liveHere ? "await refreshContent();\n  " : ""}return (\n    <>\n${body}\n    </>\n  );\n}\n`;
      file = target === "next" ? `app/${routeDir(page.route) ? routeDir(page.route) + "/" : ""}page.tsx` : `src/pages/${name}.tsx`;
    }
    files[file] = comp;
    pagePaths.push({ name, route: page.route, file, isHome: page.isHome });
  }
  if (content) files[cmsFile] = `export const content: Record<string, Item[]> = ${js(content)};\n${CMS_RUNTIME_SOURCE}${live ? liveContentSource(live) : ""}`;

  const css = compileCss(doc);
  if (runtime) files["public/interactions.js"] = runtime;
  const slugName = doc.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";

  if (target === "next") {
    files["app/globals.css"] = css;
    files["app/layout.tsx"] = `import type { ReactNode } from "react";\n${runtime ? 'import Script from "next/script";\n' : ""}import "./globals.css";\n\nexport default function RootLayout({ children }: { children: ReactNode }) {\n  return (\n    <html lang="en">\n      <body>\n        {children}\n${runtime ? '        <Script src="/interactions.js" strategy="afterInteractive" />\n' : ""}      </body>\n    </html>\n  );\n}\n`;
    files["package.json"] = JSON.stringify({ name: slugName, private: true, scripts: { dev: "next dev", build: "next build", start: "next start" }, dependencies: { next: "^15.0.0", react: "^19.0.0", "react-dom": "^19.0.0" }, devDependencies: { "@types/node": "^22.0.0", "@types/react": "^19.0.0", typescript: "^5.6.0" } }, null, 2) + "\n";
    files["next.config.mjs"] = "export default { reactStrictMode: true };\n";
    files["tsconfig.json"] = JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["dom", "esnext"], jsx: "preserve", module: "esnext", moduleResolution: "bundler", strict: true, noEmit: true, skipLibCheck: true, esModuleInterop: true, incremental: true, plugins: [{ name: "next" }], paths: { "@/*": ["./*"] } }, include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"], exclude: ["node_modules"] }, null, 2) + "\n";
  } else {
    files["src/styles.css"] = css;
    const dynNames = new Set(viteDynamic.map((d) => d.name));
    const imports = pagePaths.map((p) => `import ${p.name} from "./pages/${p.name}";`).join("\n") + (viteDynamic.length ? `\nimport { findItem } from "${cmsImport("app")}";` : "");
    const routes = [...pagePaths.filter((p) => !dynNames.has(p.name)).map((p) => `  ${js(p.route.replace(/\/$/, "") || "/")}: ${p.name},`), ...viteDynamic.map((d) => `  ${js(d.route)}: () => <${d.name} item={findItem(${js(d.cid)}, ${js(d.slug)})!} />,`)].join("\n");
    const titles = { ...Object.fromEntries(doc.pages.filter((p) => !/:slug/.test(p.route)).map((p) => [p.route.replace(/\/$/, "") || "/", p.meta.title ?? p.name])), ...Object.fromEntries(viteDynamic.map((d) => [d.route, d.title])) };
    files["src/App.tsx"] = `import { useEffect, useState, type ReactElement } from "react";\n${imports}${live ? `\nimport { refreshContent } from "${cmsImport("app")}";` : ""}\n\nconst routes: Record<string, () => ReactElement> = {\n${routes}\n};\nconst titles: Record<string, string> = ${js(titles)};\n\nconst norm = (p: string) => p.replace(/\\/$/, "") || "/";\n\nexport default function App() {\n  const [path, setPath] = useState(norm(window.location.pathname));\n${live ? "  const [, refresh] = useState(0);\n  useEffect(() => { void refreshContent().then((changed) => { if (changed) refresh((n) => n + 1); }); }, []);\n" : ""}  useEffect(() => {\n    const onPop = () => setPath(norm(window.location.pathname));\n    const onClick = (e: MouseEvent) => {\n      const a = (e.target as HTMLElement).closest("a");\n      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || a.target || a.origin !== window.location.origin || !routes[norm(a.pathname)]) return;\n      e.preventDefault();\n      window.history.pushState({}, "", a.pathname);\n      setPath(norm(a.pathname));\n    };\n    window.addEventListener("popstate", onPop);\n    document.addEventListener("click", onClick);\n    return () => { window.removeEventListener("popstate", onPop); document.removeEventListener("click", onClick); };\n  }, []);\n  useEffect(() => { document.title = titles[path] ?? document.title; (window as unknown as { __bindInteractions?: () => void }).__bindInteractions?.(); }, [path]);\n  const Page = routes[path];\n  return Page ? <Page /> : <main><h1>Not found</h1></main>;\n}\n`;
    files["src/main.tsx"] = `import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./styles.css";\n\ncreateRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);\n`;
    files["index.html"] = `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width,initial-scale=1" />\n    <title>${doc.name.replace(/[<>&"]/g, "")}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n${runtime ? '    <script src="/interactions.js" defer></script>\n' : ""}  </body>\n</html>\n`;
    files["vite.config.ts"] = `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({ plugins: [react()] });\n`;
    files["package.json"] = JSON.stringify({ name: slugName, private: true, type: "module", scripts: { dev: "vite", build: "tsc && vite build", preview: "vite preview" }, dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" }, devDependencies: { "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0", "@vitejs/plugin-react": "^4.3.0", typescript: "^5.6.0", vite: "^6.0.0" } }, null, 2) + "\n";
    files["tsconfig.json"] = JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["DOM", "ES2022"], jsx: "react-jsx", module: "ESNext", moduleResolution: "Bundler", strict: true, noEmit: true, skipLibCheck: true }, include: ["src"] }, null, 2) + "\n";
    warnings.push({ code: "spa-routing", message: "The Vite export is a single-page app; configure your host to serve index.html for unknown paths." });
  }
  if (!content && Object.values(doc.nodes).some((n: ElementNode) => n.binding || n.props["repeat"])) warnings.push({ code: "bindings", message: "No CMS content was provided: bindings and repeaters export their static fallback only." });
  if (content && live) warnings.push({ code: "cms-live", message: "Exported pages fetch published content from the Webbrik API at run time and fall back to the snapshot in content/cms.ts if it is unreachable." });
  else if (content) warnings.push({ code: "cms-snapshot", message: "CMS content is exported as a snapshot in content/cms.ts; re-export or edit that file to update it." });
  files["README.md"] = `# ${doc.name}\n\nExported ${target === "next" ? "Next.js (App Router)" : "Vite + React"} project.\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\nStyles are in one global stylesheet generated by the same compiler as the editor and hosted site.\n`;
  return { files, warnings };
}
