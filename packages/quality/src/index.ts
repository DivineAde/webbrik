import type { Document, ElementNode, Page } from "@webbrik/document-model";

export type Severity = "error" | "warning" | "info";
export interface Finding { rule: string; category: "seo" | "accessibility" | "performance"; severity: Severity; message: string; pageId?: string; nodeId?: string; fix?: string }

function pageNodes(doc: Document, page: Page): ElementNode[] {
  const out: ElementNode[] = [], stack = [page.rootId];
  while (stack.length) {
    const n = doc.nodes[stack.pop()!];
    if (!n) continue;
    out.push(n);
    for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]!);
  }
  return out;
}

/** Collect every declared value for a property on a node (element + classes), base breakpoint. */
function styleValue(doc: Document, n: ElementNode, prop: string): string | undefined {
  let v: string | undefined;
  for (const cid of n.classIds) for (const b of doc.classes[cid]?.blocks ?? []) if (b.breakpoint === "base" && !b.state && b.declarations[prop]) v = b.declarations[prop];
  for (const b of n.styles) if (b.breakpoint === "base" && !b.state && b.declarations[prop]) v = b.declarations[prop];
  return v;
}

function hex(c: string | undefined): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c?.trim() ?? "");
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
const lum = ([r, g, b]: [number, number, number]) => {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export function contrastRatio(a: string, b: string): number | null {
  const x = hex(a), y = hex(b);
  if (!x || !y) return null;
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (hi! + 0.05) / (lo! + 0.05);
}

export function analyze(doc: Document): Finding[] {
  const f: Finding[] = [];
  const titles = new Map<string, string>();
  for (const page of doc.pages) {
    const nodes = pageNodes(doc, page);
    const add = (x: Omit<Finding, "pageId">) => f.push({ ...x, pageId: page.id });

    const title = page.meta.title ?? "";
    if (!title) add({ rule: "seo/title-missing", category: "seo", severity: "error", message: `Page "${page.name}" has no title.`, fix: "Set a unique page title (30–60 characters)." });
    else if (title.length > 60) add({ rule: "seo/title-long", category: "seo", severity: "warning", message: `Title is ${title.length} characters; search engines truncate after ~60.` });
    if (title) { if (titles.has(title)) add({ rule: "seo/title-duplicate", category: "seo", severity: "warning", message: `Title duplicates page ${titles.get(title)}.` }); titles.set(title, page.name); }
    if (!page.meta.description) add({ rule: "seo/description-missing", category: "seo", severity: "warning", message: "No meta description.", fix: "Add a 70–160 character description." });
    if (!page.meta.ogImage) add({ rule: "seo/og-image-missing", category: "seo", severity: "info", message: "No Open Graph image set." });

    const h1s = nodes.filter((n) => n.tag === "h1" && !n.hidden);
    if (h1s.length === 0) add({ rule: "a11y/h1-missing", category: "accessibility", severity: "warning", message: "Page has no h1." });
    if (h1s.length > 1) add({ rule: "a11y/h1-multiple", category: "accessibility", severity: "warning", message: `Page has ${h1s.length} h1 elements.` });

    let last = 0;
    for (const n of nodes) {
      const m = /^h([1-6])$/.exec(n.tag);
      if (m) { const lvl = Number(m[1]); if (last && lvl > last + 1) add({ rule: "a11y/heading-skip", category: "accessibility", severity: "warning", nodeId: n.id, message: `Heading jumps from h${last} to h${lvl}.` }); last = lvl; }
      if (n.tag === "img" && n.attributes["alt"] === undefined) add({ rule: "a11y/img-alt", category: "accessibility", severity: "error", nodeId: n.id, message: "Image is missing alt text.", fix: 'Add alt text, or alt="" if decorative.' });
      if (n.tag === "img" && !n.attributes["width"] && !n.attributes["height"] && !styleValue(doc, n, "aspect-ratio") && !styleValue(doc, n, "height")) add({ rule: "perf/img-dimensions", category: "performance", severity: "info", nodeId: n.id, message: "Image has no dimensions; this can cause layout shift (CLS)." });
      if (n.tag === "a" && !n.text && n.children.length === 0 && !n.attributes["aria-label"]) add({ rule: "a11y/link-name", category: "accessibility", severity: "error", nodeId: n.id, message: "Link has no accessible name." });
      if (n.tag === "button" && !n.text && n.children.length === 0 && !n.attributes["aria-label"]) add({ rule: "a11y/button-name", category: "accessibility", severity: "error", nodeId: n.id, message: "Button has no accessible name." });
      if ((n.tag === "input" || n.tag === "textarea") && !n.attributes["aria-label"] && !n.attributes["id"]) add({ rule: "a11y/form-label", category: "accessibility", severity: "warning", nodeId: n.id, message: "Form control has no label association." });
      if (n.type === "element" && ["click"].some((t) => n.interactions.some((i) => i.trigger === t)) && !["a", "button", "input", "select", "textarea"].includes(n.tag) && n.attributes["role"] !== "button")
        add({ rule: "a11y/click-semantics", category: "accessibility", severity: "warning", nodeId: n.id, message: `<${n.tag}> has a click interaction but is not keyboard-focusable.`, fix: "Use a button or link." });
      const fg = styleValue(doc, n, "color"), bg = styleValue(doc, n, "background") ?? styleValue(doc, n, "background-color");
      if (fg && bg) { const r = contrastRatio(fg, bg); if (r !== null && r < 4.5) add({ rule: "a11y/contrast", category: "accessibility", severity: "error", nodeId: n.id, message: `Contrast ratio ${r.toFixed(2)}:1 is below 4.5:1.` }); }
      if (styleValue(doc, n, "outline") === "none" || styleValue(doc, n, "outline") === "0") add({ rule: "a11y/focus-visible", category: "accessibility", severity: "warning", nodeId: n.id, message: "Outline removed; make sure a visible focus style exists." });
    }
  }
  return f;
}

export function summarize(findings: Finding[]) {
  return { errors: findings.filter((x) => x.severity === "error").length, warnings: findings.filter((x) => x.severity === "warning").length, info: findings.filter((x) => x.severity === "info").length };
}
