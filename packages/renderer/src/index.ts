import { compileCss, elementClass } from "@webbrik/css-engine";
import type { Document, ElementNode, Page } from "@webbrik/document-model";
import { applyRepeaterQuery, fieldAsText, referencedItems, resolveFieldPath, sanitizeRichText, type Where } from "@webbrik/content-engine";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const BLOCKED_TAGS = new Set(["script", "iframe", "object", "embed", "style", "link", "meta", "base", "form-action"]);
const TAG_RE = /^[a-z][a-z0-9-]*$/;
const ATTR_RE = /^[a-zA-Z_:][\w:.-]*$/;
const URL_ATTRS = new Set(["href", "src", "action", "formaction", "poster"]);

export { BLOCKED_TAGS, TAG_RE, VOID, safeAttr };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const fieldText = fieldAsText;

const lookupItem = (ctx: RenderContext) => (id: string) => { for (const items of Object.values(ctx.content ?? {})) { const hit = items.find((i) => i.id === id); if (hit) return hit; } return undefined; };

/** Value of this node's CMS binding for the current item, or undefined to keep the static fallback. */
function bindingValue(node: ElementNode, ctx: RenderContext, target: "text" | "src" | "href" | "alt" | "html"): string | undefined {
  const b = node.binding;
  if (!b || !ctx.item || ctx.item.collectionId !== b.collectionId || (b.target ?? "text") !== target) return undefined;
  const v = fieldText(resolveFieldPath(ctx.item.item.data, b.field, lookupItem(ctx)));
  return target === "html" && v !== undefined ? sanitizeRichText(v) : v;
}

const collectionOf = (ctx: RenderContext, id: string) => Object.entries(ctx.content ?? {}).find(([, items]) => items.some((i) => i.id === id))?.[0];

/** Items a repeater shows, each with the collection it belongs to. `repeat` = a whole collection; `repeatRef` = the items the current item points to through a (multi-)reference field. */
function repeatItems(node: ElementNode, ctx: RenderContext): { cid: string; item: RenderItem }[] | null {
  const where = Array.isArray(node.props["repeatWhere"]) ? (node.props["repeatWhere"] as Where[]).filter((w) => w && typeof w.field === "string" && typeof w.value === "string") : [];
  const query = {
    where,
    sort: typeof node.props["repeatSort"] === "string" ? (node.props["repeatSort"] as string) : undefined,
    order: node.props["repeatOrder"] === "desc" ? ("desc" as const) : ("asc" as const),
    limit: Number(node.props["repeatLimit"]),
  };
  const cid = node.props["repeat"], ref = node.props["repeatRef"];
  if (typeof cid === "string" && ctx.content?.[cid]) return applyRepeaterQuery(ctx.content[cid]!, query).map((item) => ({ cid, item }));
  if (typeof ref === "string" && ctx.item && ctx.content) {
    const found = referencedItems(ctx.item.item.data, ref, lookupItem(ctx) as (id: string) => RenderItem | undefined);
    return applyRepeaterQuery(found, query).map((item) => ({ cid: collectionOf(ctx, item.id) ?? "", item }));
  }
  return null;
}

/** Attributes the browser runtime (forms / pagination) reads. Shared with the React exporter. */
export function formAttributes(node: ElementNode): Record<string, string> {
  const id = node.props["formId"];
  if (node.tag !== "form" || typeof id !== "string" || !/^[a-z0-9-]{1,40}$/.test(id)) return {};
  const out: Record<string, string> = { "data-wb-form": id, method: "post" };
  const ok = node.props["successMessage"];
  if (typeof ok === "string" && ok.trim()) out["data-wb-success"] = ok.slice(0, 300);
  const to = node.props["redirectUrl"];
  if (typeof to === "string" && /^(\/(?!\/)|https:\/\/)/.test(to)) out["data-wb-redirect"] = to.slice(0, 500);
  return out;
}
/** Hidden field real visitors never fill; submissions that fill it are dropped as spam (see validateSubmission). */
export const HONEYPOT_HTML = '<div aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden"><label>Leave this empty<input type="text" name="_hp" tabindex="-1" autocomplete="off"></label></div>';
export const pageSizeOf = (node: ElementNode): number | undefined => { const n = Number(node.props["repeatPageSize"]); return Number.isInteger(n) && n >= 1 && n <= 100 ? n : undefined; };

function safeAttr(name: string, value: string): string | null {
  if (!ATTR_RE.test(name) || /^on/i.test(name) || name === "style" || name === "srcdoc") return null;
  if (URL_ATTRS.has(name.toLowerCase()) && /^\s*(javascript|data:text\/html|vbscript):/i.test(value)) return null;
  return `${name}="${escapeHtml(value)}"`;
}

/** A CMS item as the renderer sees it. */
export interface RenderItem { id: string; slug: string; data: Record<string, unknown> }
/** Visible items per collection id. */
export type ContentData = Record<string, RenderItem[]>;

export interface RenderContext {
  /** Items available to repeaters. Without it, repeaters render their children once (design-time fallback). */
  content?: ContentData;
  /** The item bound to the current page (dynamic pages) or repeater iteration. */
  item?: { collectionId: string; item: RenderItem };
  /** Resolve CMS/dynamic bindings. Return undefined to leave the node's static text. */
  resolveBinding?: (node: ElementNode) => string | undefined;
  /** Resolve asset ids/paths to delivery URLs. */
  resolveAsset?: (src: string) => string;
  /** Editor mode adds data-node-id for canvas hit-testing. */
  editor?: boolean;
  /** Emit data-node-id without editor affordances (needed by the interactions runtime). */
  nodeIds?: boolean;
  /** Set while rendering the top-level children of a repeater iteration (marks them for pagination). */
  iter?: { index: number; depth: number };
}

/** Values supplied by a component instance to the nodes inside its definition. */
interface Scope {
  values: Record<string, unknown>;
  rootId: string;
}

function renderNode(doc: Document, id: string, ctx: RenderContext, depth = 0, scope?: Scope): string {
  const node = doc.nodes[id];
  if (!node || depth > 200) return "";
  if (node.hidden && !ctx.editor) return "";

  const bound = (key: string) => (scope && typeof node.props[key] === "string" ? scope.values[node.props[key] as string] : undefined);
  if (scope && bound("bindVisible") === false) return "";

  if (node.type === "text") return escapeHtml(String(bound("bindText") ?? bindingValue(node, ctx, "text") ?? ctx.resolveBinding?.(node) ?? node.text ?? ""));

  if (node.type === "component-instance") {
    const def = node.componentId ? doc.components[node.componentId] : undefined;
    if (!def) return "";
    const defaults = Object.fromEntries(def.props.filter((p) => p.default !== undefined).map((p) => [p.name, p.default]));
    return renderNode(doc, def.rootId, ctx, depth + 1, { values: { ...defaults, ...node.props }, rootId: def.rootId });
  }

  const tag = TAG_RE.test(node.tag) && !BLOCKED_TAGS.has(node.tag) ? node.tag : "div";
  const classes = [...node.classIds.map((c) => doc.classes[c]?.name).filter(Boolean), node.styles.length ? elementClass(node.id) : ""]
    .filter(Boolean)
    .join(" ");

  const attrs: string[] = [];
  if (classes) attrs.push(`class="${escapeHtml(classes)}"`);
  if (ctx.editor || ctx.nodeIds) attrs.push(`data-node-id="${escapeHtml(node.id)}"`);
  if (ctx.iter && ctx.iter.depth === depth) attrs.push(`data-wb-item="${ctx.iter.index}"`);
  if (scope && node.id === scope.rootId && typeof scope.values["variant"] === "string" && /^[\w-]+$/.test(scope.values["variant"])) attrs.push(`data-variant="${scope.values["variant"]}"`);
  const attributes: Record<string, string> = { ...node.attributes, ...(ctx.editor ? {} : formAttributes(node)) };
  for (const [prop, attr] of [["bindHref", "href"], ["bindSrc", "src"], ["bindAlt", "alt"]] as const) {
    const v = bound(prop);
    if (typeof v === "string") attributes[attr] = v;
    const cms = bindingValue(node, ctx, attr);
    if (cms !== undefined) attributes[attr] = cms;
  }
  for (const [k, v] of Object.entries(attributes)) {
    const value = (k === "src" || k === "poster") && ctx.resolveAsset ? ctx.resolveAsset(v) : v;
    const a = safeAttr(k, value);
    if (a) attrs.push(a);
  }
  const pageSize = pageSizeOf(node);
  if (pageSize && !ctx.editor && (node.props["repeat"] || node.props["repeatRef"])) attrs.push(`data-wb-paginate="${pageSize}"`);
  const open = `<${tag}${attrs.length ? " " + attrs.join(" ") : ""}>`;
  if (VOID.has(tag)) return open;

  const richHtml = bindingValue(node, ctx, "html");
  const boundText = bound("bindText") ?? bindingValue(node, ctx, "text");
  const text = richHtml !== undefined ? richHtml : boundText !== undefined ? escapeHtml(String(boundText)) : node.text !== undefined ? escapeHtml(ctx.resolveBinding?.(node) ?? node.text) : "";
  const items = repeatItems(node, ctx);
  const inner = items
    ? items.map(({ cid, item }, index) => node.children.map((c) => renderNode(doc, c, { ...ctx, item: { collectionId: cid, item }, iter: { index, depth: depth + 1 } }, depth + 1, scope)).join("")).join("")
    : node.children.map((c) => renderNode(doc, c, { ...ctx, iter: undefined }, depth + 1, scope)).join("");
  const honeypot = !ctx.editor && formAttributes(node)["data-wb-form"] ? HONEYPOT_HTML : "";
  return `${open}${text}${inner}${honeypot}</${tag}>`;
}

/** Render one page's body markup. */
export function renderPageBody(doc: Document, page: Page, ctx: RenderContext = {}): string {
  const root = doc.nodes[page.rootId];
  if (!root) return "";
  return root.children.map((c) => renderNode(doc, c, ctx)).join("");
}

export interface RenderedPage {
  route: string;
  html: string;
  css: string;
}

/** The canonical full-document render shared by preview, publishing, and static export. */
export function renderPage(doc: Document, page: Page, ctx: RenderContext = {}, cssHref?: string, scriptSrc?: string): RenderedPage {
  const css = compileCss(doc, { rootIds: [page.rootId] });
  const title = escapeHtml(page.meta.title ?? page.name);
  const desc = page.meta.description ? `<meta name="description" content="${escapeHtml(page.meta.description)}">` : "";
  const og = page.meta.ogImage ? `<meta property="og:image" content="${escapeHtml(page.meta.ogImage)}">` : "";
  const style = cssHref ? `<link rel="stylesheet" href="${escapeHtml(cssHref)}">` : `<style>${css}</style>`;
  const html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${title}</title>\n${desc}${og}\n${style}\n${doc.customCode.headHtml}\n</head>\n<body>${renderPageBody(doc, page, ctx)}${scriptSrc ? `<script src="${escapeHtml(scriptSrc)}" defer></script>` : ""}</body>\n</html>\n`;
  return { route: page.route, html, css };
}

export function renderSite(doc: Document, ctx: RenderContext = {}): RenderedPage[] {
  return doc.pages.map((p) => renderPage(doc, p, ctx));
}
