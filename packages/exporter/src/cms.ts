import type { RenderItem } from "@webbrik/renderer";

export const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `{field}` placeholders in SEO text, filled from the item. Missing fields become empty. */
export const fill = (t: string | undefined, item: RenderItem) => t?.replace(/\{(\w+)\}/g, (_, k: string) => { const v = item.data[k]; return typeof v === "string" || typeof v === "number" ? String(v) : ""; });

/**
 * Source of the helpers shipped in exported React projects (`content/cms.ts`, after the generated data).
 * Behaviour mirrors applyRepeaterQuery / resolveFieldPath in @webbrik/content-engine; the exporter tests run both on the same inputs.
 */
export const CMS_RUNTIME_SOURCE = `
export interface Item { id: string; slug: string; data: Record<string, unknown> }
interface Where { field: string; op: string; value: string }
interface Query { where?: Where[]; sort?: string; order?: "asc" | "desc"; limit?: number }

const lookup = (id: string): Item | undefined => { for (const items of Object.values(content)) { const hit = items.find((i) => i.id === id); if (hit) return hit; } return undefined; };
const looseEq = (a: unknown, b: string) => (typeof a === "boolean" ? String(a) === b.toLowerCase() : String(a ?? "") === b);
function matches(item: Item, w: Where): boolean {
  const v = item.data[w.field];
  switch (w.op) {
    case "eq": return looseEq(v, w.value);
    case "ne": return !looseEq(v, w.value);
    case "contains": return Array.isArray(v) ? v.map(String).includes(w.value) : String(v ?? "").toLowerCase().includes(w.value.toLowerCase());
    case "gt": return typeof v === "number" ? v > Number(w.value) : String(v ?? "") > w.value;
    case "lt": return typeof v === "number" ? v < Number(w.value) : String(v ?? "") < w.value;
    default: return false;
  }
}

function run(list: Item[], q: Query): Item[] {
  let out = list.filter((i) => (q.where ?? []).every((w) => matches(i, w)));
  if (q.sort) {
    const dir = q.order === "desc" ? -1 : 1, key = q.sort;
    out = [...out].sort((a, b) => { const x = a.data[key] as string | number, y = b.data[key] as string | number; return x === y ? 0 : x > y ? dir : -dir; });
  }
  if (q.limit && Number.isInteger(q.limit) && q.limit > 0) out = out.slice(0, q.limit);
  return out;
}

export function repeat(collectionId: string, q: Query = {}): Item[] { return run(content[collectionId] ?? [], q); }

/** The items a reference / multi-reference field of \`item\` points to. */
export function refs(item: Item, fieldName: string, q: Query = {}): Item[] {
  const v = item.data[fieldName];
  const ids = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return run(ids.flatMap((id) => { const it = typeof id === "string" ? lookup(id) : undefined; return it ? [it] : []; }), q);
}

/** Field value as text; "author.name" follows a reference field, and "tags.name" a multi-reference (values joined with ", "). */
export function field(item: Item, path: string): string | undefined {
  const segs = path.split(".");
  const walk = (v: unknown, i: number, depth: number): unknown => {
    if (i >= segs.length) return v;
    if (depth > 4) return undefined;
    if (Array.isArray(v)) return v.flatMap((x) => { const r = walk(x, i, depth); return r === undefined ? [] : Array.isArray(r) ? r : [r]; });
    if (typeof v !== "string") return undefined;
    const target = lookup(v);
    return target ? walk(target.data[segs[i]!], i + 1, depth + 1) : undefined;
  };
  const v = walk(item.data[segs[0]!], 1, 0);
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) { const parts = v.filter((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean").map(String); return parts.length ? parts.join(", ") : undefined; }
  return undefined;
}

export const fillText = (t: string | undefined, item: Item) => t?.replace(/\\{(\\w+)\\}/g, (_, k: string) => { const v = item.data[k]; return typeof v === "string" || typeof v === "number" ? String(v) : ""; });

export const findItem = (collectionId: string, slug: string): Item | undefined => (content[collectionId] ?? []).find((i) => i.slug === slug);
`;

/** Appended to content/cms.ts when the export reads live content: fetches published items and updates \`content\` in place. */
export const liveContentSource = (url: string) => `
const LIVE_URL = ${JSON.stringify(url)};

/** Fetches the latest published content (cached for a minute on Next). Keeps the exported snapshot if the request fails. Resolves true when content changed. */
export async function refreshContent(): Promise<boolean> {
  try {
    const res = await fetch(LIVE_URL, { next: { revalidate: 60 } } as RequestInit);
    if (!res.ok) return false;
    const data = (await res.json()) as { content?: Record<string, Item[]> };
    if (!data.content) return false;
    const before = JSON.stringify(content);
    for (const k of Object.keys(content)) delete content[k];
    Object.assign(content, data.content);
    return JSON.stringify(content) !== before;
  } catch {
    return false;
  }
}
`;
