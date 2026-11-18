import type { Animation, Document, ElementNode, StyleBlock } from "@webbrik/document-model";

/** Stable generated class for an element's own (non-class) styles. Never inline styles. */
export const elementClass = (id: string) => `e-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

const UNSAFE_VALUE = /[{};<>]|\/\*|\*\/|url\(\s*['"]?\s*javascript:|expression\(/i;

/** Reject declarations that could break out of a rule or inject script. */
export function sanitizeDeclaration(prop: string, value: string): string | null {
  if (!/^(--)?[a-zA-Z][a-zA-Z0-9-]*$/.test(prop)) return null;
  if (UNSAFE_VALUE.test(value)) return null;
  return `${prop}:${value.trim()}`;
}

function declarations(block: StyleBlock): string {
  return Object.entries(block.declarations)
    .map(([p, v]) => sanitizeDeclaration(p, v))
    .filter((d): d is string => d !== null)
    .join(";");
}

/** Allowed state selectors: pseudo-classes/elements (with simple args) and component variant attributes. */
const STATE_RE = /^(?::{1,2}[a-z][a-z-]*(?:\([^(){};<>"'\\]*\))?|\[data-variant="[\w-]+"\])+$/;
export const isValidState = (state: string | undefined) => state === undefined || state === "" || STATE_RE.test(state);

function rule(selector: string, block: StyleBlock): string {
  if (!isValidState(block.state)) return "";
  const body = declarations(block);
  if (!body) return "";
  return `${selector}${block.state ?? ""}{${body}}`;
}

function sortedBreakpoints(doc: Document) {
  // Desktop-first: widest max-width first so narrower breakpoints override.
  const withQuery = doc.breakpoints.filter((b) => b.maxWidth !== undefined);
  return withQuery.sort((a, b) => (b.maxWidth ?? 0) - (a.maxWidth ?? 0));
}

export interface CompileOptions {
  /** Emit only rules for nodes reachable from these roots (e.g. a single page). */
  rootIds?: string[];
  minify?: boolean;
}

export function tokensToCss(tokens: Record<string, string>): string {
  const body = Object.entries(tokens)
    .map(([k, v]) => sanitizeDeclaration(k.startsWith("--") ? k : `--${k}`, v))
    .filter(Boolean)
    .join(";");
  return body ? `:root{${body}}` : "";
}

/**
 * Compile the document's styles to a CSS string. Order within each breakpoint:
 * classes first, then element-scoped styles (so element overrides win), matching the editor's precedence view.
 */
export function compileCss(doc: Document, opts: CompileOptions = {}): string {
  const nodes = opts.rootIds ? reachable(doc, opts.rootIds) : Object.values(doc.nodes);
  const usedClasses = new Set(nodes.flatMap((n) => n.classIds));
  const bps = [{ id: "base", maxWidth: undefined as number | undefined }, ...sortedBreakpoints(doc)];

  const out: string[] = [tokensToCss(doc.tokens)];
  // The page root isn't an element: its children render straight into <body>, so <body> must be the positioning
  // context for free-positioned (absolute) top-level elements.
  if (nodes.some((n) => n.styles.some((b) => b.declarations["position"] === "absolute"))) out.push("body{position:relative}");
  for (const bp of bps) {
    const rules: string[] = [];
    for (const cid of usedClasses) {
      const cls = doc.classes[cid];
      if (!cls) continue;
      for (const b of cls.blocks.filter((b) => b.breakpoint === bp.id)) rules.push(rule(`.${cls.name}`, b));
    }
    for (const n of nodes) {
      for (const b of n.styles.filter((b) => b.breakpoint === bp.id)) rules.push(rule(`.${elementClass(n.id)}`, b));
    }
    const joined = rules.filter(Boolean).join("\n");
    if (!joined) continue;
    out.push(bp.maxWidth === undefined ? joined : `@media (max-width:${bp.maxWidth}px){\n${joined}\n}`);
  }
  const anims = Object.values(doc.animations ?? {});
  if (anims.length) out.push(animationsToCss(anims), `@media (prefers-reduced-motion:reduce){${anims.map((a) => `.anim-${a.name}{animation:none}`).join("")}}`);
  if (doc.customCode.customCss) out.push(doc.customCode.customCss);
  const css = out.filter(Boolean).join("\n");
  return opts.minify ? css.replace(/\n/g, "") : css;
}

export function animationsToCss(anims: Animation[]): string {
  return anims
    .map((a) => {
      const frames = [...a.keyframes]
        .sort((x, y) => x.offset - y.offset)
        .map((k) => {
          const body = Object.entries(k.declarations).map(([p, v]) => sanitizeDeclaration(p, v)).filter(Boolean).join(";");
          return body ? `${+(k.offset * 100).toFixed(2)}%{${body}}` : "";
        })
        .filter(Boolean)
        .join("");
      const shorthand = `a-${a.name} ${a.duration}ms ${a.easing} ${a.delay}ms ${a.iterations} ${a.direction} ${a.fill}`;
      return `@keyframes a-${a.name}{${frames}}\n.anim-${a.name}{animation:${shorthand}}`;
    })
    .join("\n");
}

function reachable(doc: Document, rootIds: string[]): ElementNode[] {
  const out: ElementNode[] = [];
  const stack = [...rootIds];
  while (stack.length) {
    const n = doc.nodes[stack.pop()!];
    if (!n) continue;
    out.push(n);
    stack.push(...n.children);
  }
  return out;
}

export interface StyleSource {
  property: string;
  value: string;
  origin: "element" | "class" | "token";
  breakpoint: string;
  className?: string;
  /** false when a higher-precedence source overrides this one at the same breakpoint. */
  active: boolean;
}

/** Style source & precedence inspector data: where each declaration on a node comes from and what overrides it. */
export function inspectStyles(doc: Document, nodeId: string, breakpoint = "base"): StyleSource[] {
  const node = doc.nodes[nodeId];
  if (!node) return [];
  const sources: StyleSource[] = [];
  for (const cid of node.classIds) {
    const cls = doc.classes[cid];
    if (!cls) continue;
    for (const b of cls.blocks.filter((x) => x.breakpoint === breakpoint && !x.state))
      for (const [property, value] of Object.entries(b.declarations))
        sources.push({ property, value, origin: "class", breakpoint, className: cls.name, active: true });
  }
  for (const b of node.styles.filter((x) => x.breakpoint === breakpoint && !x.state))
    for (const [property, value] of Object.entries(b.declarations))
      sources.push({ property, value, origin: "element", breakpoint, active: true });
  for (const s of sources) {
    const m = /^var\((--[\w-]+)/.exec(s.value);
    if (m && doc.tokens[m[1]!] !== undefined) s.origin = s.origin === "element" ? "element" : s.origin;
  }
  // Later sources win; mark earlier same-property sources inactive.
  const winner = new Map<string, number>();
  sources.forEach((s, i) => winner.set(s.property, i));
  sources.forEach((s, i) => (s.active = winner.get(s.property) === i));
  return sources;
}
