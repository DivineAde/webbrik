import { z } from "zod";

export type FieldType = "text" | "richtext" | "number" | "boolean" | "date" | "image" | "file" | "url" | "reference" | "multireference" | "slug" | "json";

export interface FieldDef {
  name: string;
  type: FieldType;
  required?: boolean;
  /** target collection slug for reference fields */
  to?: string;
}
export interface CollectionSchema { slug: string; name: string; fields: FieldDef[] }
export type ItemStatus = "draft" | "published" | "scheduled";
export interface ContentItem { id: string; slug: string; data: Record<string, unknown>; status: ItemStatus; publishAt?: string }

function fieldValidator(f: FieldDef): z.ZodTypeAny {
  let v: z.ZodTypeAny;
  switch (f.type) {
    case "text": case "richtext": v = z.string(); break;
    case "number": v = z.number(); break;
    case "boolean": v = z.boolean(); break;
    case "date": v = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "invalid date"); break;
    case "image": case "file": v = z.string().min(1); break;
    case "url": v = z.string().url(); break;
    case "slug": v = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "invalid slug"); break;
    case "reference": v = z.string(); break;
    case "multireference": v = z.array(z.string()); break;
    case "json": v = z.unknown(); break;
  }
  return f.required ? v : v.optional().nullable();
}

export function validateItem(schema: CollectionSchema, data: Record<string, unknown>) {
  const shape = Object.fromEntries(schema.fields.map((f) => [f.name, fieldValidator(f)]));
  const r = z.object(shape).strict().safeParse(data);
  return r.success ? { ok: true as const } : { ok: false as const, errors: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
}

/** Items visible in production at `now`: published, or scheduled and due. */
export function visibleItems(items: ContentItem[], now = new Date()): ContentItem[] {
  return items.filter((i) => i.status === "published" || (i.status === "scheduled" && !!i.publishAt && new Date(i.publishAt) <= now));
}

export interface Query {
  filter?: Record<string, unknown>;
  sortBy?: string;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export function queryItems(items: ContentItem[], q: Query = {}) {
  let out = items.filter((i) => Object.entries(q.filter ?? {}).every(([k, v]) => i.data[k] === v));
  if (q.sortBy) {
    const dir = q.order === "desc" ? -1 : 1;
    out = [...out].sort((a, b) => {
      const x = a.data[q.sortBy!] as string | number, y = b.data[q.sortBy!] as string | number;
      return x === y ? 0 : x > y ? dir : -dir;
    });
  }
  const pageSize = q.pageSize ?? (out.length || 1);
  const page = q.page ?? 1;
  return { items: out.slice((page - 1) * pageSize, page * pageSize), total: out.length, pages: Math.max(1, Math.ceil(out.length / pageSize)) };
}

/** Resolve a dynamic route like /blog/:slug to an item. */
export function matchDynamicRoute(route: string, path: string): Record<string, string> | null {
  const rp = route.split("/").filter(Boolean), pp = path.split("/").filter(Boolean);
  if (rp.length !== pp.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < rp.length; i++) {
    if (rp[i]!.startsWith(":")) params[rp[i]!.slice(1)] = decodeURIComponent(pp[i]!);
    else if (rp[i] !== pp[i]) return null;
  }
  return params;
}

// ---------- Rich text ----------
const RT_TAGS = new Set(["p", "h2", "h3", "h4", "ul", "ol", "li", "strong", "b", "em", "i", "u", "a", "br", "blockquote", "code", "pre", "hr"]);
const RT_VOID = new Set(["br", "hr"]);
const RT_DROP_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "template", "noscript", "textarea", "svg", "math"]);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeHref = (h: string) => {
  const v = h.replace(/[\u0000- ]/g, "");
  return /^(https?:|mailto:|tel:|\/(?!\/)|#)/i.test(v) ? h.trim() : null;
};

/**
 * Reduces editor HTML to a small allowlist (headings, lists, emphasis, links, quotes, code). Everything else is dropped or escaped;
 * only `href` survives on links, and only for http(s), mailto, tel, same-site and anchor URLs. Output is always balanced.
 * Used on write (API) and again at render time.
 */
export function sanitizeRichText(html: string): string {
  const out: string[] = [];
  const stack: string[] = [];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>|[^<]+|</g;
  let skipUntil: string | null = null;
  let m: RegExpExecArray | null;
  const close = (name: string) => { const i = stack.lastIndexOf(name); if (i < 0) return; while (stack.length > i) out.push(`</${stack.pop()}>`); };
  while ((m = re.exec(html))) {
    const tok = m[0];
    if (tok.startsWith("<!--")) continue;
    const name = m[1]?.toLowerCase();
    if (name === undefined) {
      if (skipUntil) continue;
      out.push(tok === "<" ? "&lt;" : tok.replace(/&(?!(?:amp|lt|gt|quot|nbsp|#\d{1,6}|#x[0-9a-f]{1,6});)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"));
      continue;
    }
    const closing = tok.startsWith("</");
    if (skipUntil) { if (closing && name === skipUntil) skipUntil = null; continue; }
    if (RT_DROP_CONTENT.has(name)) { if (!closing && !tok.endsWith("/>")) skipUntil = name; continue; }
    if (!RT_TAGS.has(name)) continue;
    const tag = name === "b" ? "strong" : name === "i" ? "em" : name;
    if (closing) { if (!RT_VOID.has(tag)) close(tag); continue; }
    if (RT_VOID.has(tag)) { out.push(`<${tag}>`); continue; }
    let attrs = "";
    if (tag === "a") {
      const hm = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[2] ?? "");
      const href = hm ? safeHref(decodeBasic(hm[1] ?? hm[2] ?? hm[3] ?? "")) : null;
      if (href) attrs = ` href="${esc(href)}" rel="noopener noreferrer"`;
    }
    if (tag === "p" || tag === "li" || tag === "h2" || tag === "h3" || tag === "h4") { const i = stack.lastIndexOf(tag); if (i >= 0 && !stack.slice(i + 1).some((t) => t === "ul" || t === "ol" || t === "blockquote")) close(tag); }
    stack.push(tag);
    out.push(`<${tag}${attrs}>`);
  }
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join("");
}
const decodeBasic = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Sanitises every richtext field of an item's data (other fields untouched). */
export function sanitizeItemData(schema: CollectionSchema, data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  for (const f of schema.fields) if (f.type === "richtext" && typeof out[f.name] === "string") out[f.name] = sanitizeRichText(out[f.name] as string);
  return out;
}

// ---------- Repeater queries and field paths ----------
export type WhereOp = "eq" | "ne" | "contains" | "gt" | "lt";
export interface Where { field: string; op: WhereOp; value: string }
export interface RepeaterQuery { where?: Where[]; sort?: string; order?: "asc" | "desc"; limit?: number }
interface HasData { id: string; data: Record<string, unknown> }

const looseEq = (a: unknown, b: string) => (typeof a === "boolean" ? String(a) === b.toLowerCase() : String(a ?? "") === b);
function matches(item: HasData, w: Where): boolean {
  const v = item.data[w.field];
  switch (w.op) {
    case "eq": return looseEq(v, w.value);
    case "ne": return !looseEq(v, w.value);
    case "contains": return Array.isArray(v) ? v.map(String).includes(w.value) : String(v ?? "").toLowerCase().includes(w.value.toLowerCase());
    case "gt": return typeof v === "number" ? v > Number(w.value) : String(v ?? "") > w.value;
    case "lt": return typeof v === "number" ? v < Number(w.value) : String(v ?? "") < w.value;
  }
}
/** Filter, sort and limit items for a repeater. Unknown operators match nothing, so a bad rule never leaks items. */
export function applyRepeaterQuery<T extends HasData>(items: T[], q: RepeaterQuery = {}): T[] {
  let out = items.filter((i) => (q.where ?? []).every((w) => ["eq", "ne", "contains", "gt", "lt"].includes(w.op) && matches(i, w)));
  if (q.sort) {
    const dir = q.order === "desc" ? -1 : 1, key = q.sort;
    out = [...out].sort((a, b) => { const x = a.data[key] as string | number, y = b.data[key] as string | number; return x === y ? 0 : x > y ? dir : -dir; });
  }
  if (q.limit && Number.isInteger(q.limit) && q.limit > 0) out = out.slice(0, q.limit);
  return out;
}

/**
 * Read `field` from an item; `author.name` follows the reference stored in `author` into whichever collection holds that item id.
 * Through a multi-reference (`tags.name`) it returns the list of values, in order, skipping references that no longer resolve.
 */
export function resolveFieldPath(data: Record<string, unknown>, path: string, lookup: (id: string) => HasData | undefined): unknown {
  const segs = path.split(".");
  const walk = (v: unknown, i: number, depth: number): unknown => {
    if (i >= segs.length) return v;
    if (depth > 4) return undefined;
    if (Array.isArray(v)) return v.flatMap((x) => { const r = walk(x, i, depth); return r === undefined ? [] : Array.isArray(r) ? r : [r]; });
    if (typeof v !== "string") return undefined;
    const target = lookup(v);
    return target ? walk(target.data[segs[i]!], i + 1, depth + 1) : undefined;
  };
  return walk(data[segs[0]!], 1, 0);
}

/** The items a reference / multi-reference field points to, in the order stored. */
export function referencedItems<T extends HasData & { id: string }>(data: Record<string, unknown>, field: string, lookup: (id: string) => T | undefined): T[] {
  const v = data[field];
  const ids = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return ids.flatMap((id) => { const it = typeof id === "string" ? lookup(id) : undefined; return it ? [it] : []; });
}

/** Text shown for a field value: scalars as-is, lists of scalars joined with ", ". */
export function fieldAsText(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) { const parts = v.filter((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean").map(String); return parts.length ? parts.join(", ") : undefined; }
  return undefined;
}
