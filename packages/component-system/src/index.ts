import type { Document, ElementNode, Operation, StyleBlock } from "@webbrik/document-model";

/** A declarative description of a subtree. Templates and presets are Specs; they become one atomic insert operation. */
export interface Spec {
  tag: string;
  name?: string;
  text?: string;
  attrs?: Record<string, string>;
  styles?: Record<string, string>;
  tablet?: Record<string, string>;
  mobile?: Record<string, string>;
  children?: Spec[];
}

export interface Template {
  id: string;
  name: string;
  category: "Navigation" | "Hero" | "Content" | "Social proof" | "Conversion" | "Footer" | "Forms";
  description: string;
  spec: Spec;
}

const container = (children: Spec[], extra: Record<string, string> = {}): Spec => ({ tag: "div", name: "Container", styles: { "max-width": "1100px", margin: "0 auto", padding: "0 24px", ...extra }, children });
const btn = (text: string, primary = true): Spec => ({ tag: "a", name: "Button", text, attrs: { href: "#" }, styles: { display: "inline-block", padding: "10px 18px", "border-radius": "8px", "text-decoration": "none", "font-weight": "500", background: primary ? "#111111" : "#ffffff", color: primary ? "#ffffff" : "#111111", border: primary ? "1px solid #111111" : "1px solid #d4d4d4" } });
const card = (title: string, body: string): Spec => ({ tag: "div", name: "Card", styles: { padding: "24px", border: "1px solid #e5e5e5", "border-radius": "12px", background: "#ffffff" }, children: [{ tag: "h3", text: title, styles: { margin: "0 0 8px", "font-size": "18px" } }, { tag: "p", text: body, styles: { margin: "0", color: "#525252", "line-height": "1.6" } }] });
const grid = (n: number, children: Spec[]): Spec => ({ tag: "div", name: "Grid", styles: { display: "grid", "grid-template-columns": `repeat(${n}, 1fr)`, gap: "24px" }, tablet: { "grid-template-columns": n > 2 ? "repeat(2, 1fr)" : `repeat(${n}, 1fr)` }, mobile: { "grid-template-columns": "1fr" }, children });

export const TEMPLATES: Template[] = [
  { id: "nav", name: "Navigation bar", category: "Navigation", description: "Logo, links and a call to action.", spec: { tag: "header", name: "Header", styles: { "border-bottom": "1px solid #e5e5e5", background: "#ffffff" }, children: [container([{ tag: "nav", name: "Nav", attrs: { "aria-label": "Main" }, styles: { display: "flex", "align-items": "center", "justify-content": "space-between", height: "64px" }, mobile: { height: "auto", padding: "12px 0", gap: "12px", "flex-wrap": "wrap" }, children: [{ tag: "a", text: "Brand", attrs: { href: "/" }, styles: { "font-weight": "600", "text-decoration": "none", color: "#111111" } }, { tag: "div", name: "Links", styles: { display: "flex", gap: "20px", "align-items": "center" }, children: [{ tag: "a", text: "Features", attrs: { href: "#features" } }, { tag: "a", text: "Pricing", attrs: { href: "#pricing" } }, btn("Get started")] }] }])] } },
  { id: "hero", name: "Hero", category: "Hero", description: "Headline, supporting text and two actions.", spec: { tag: "section", name: "Hero", styles: { padding: "96px 0", background: "#fafafa" }, mobile: { padding: "56px 0" }, children: [container([{ tag: "h1", text: "Build something people love", styles: { "font-size": "56px", "line-height": "1.05", margin: "0 0 16px", "letter-spacing": "-0.02em" }, mobile: { "font-size": "36px" } }, { tag: "p", text: "A short, clear sentence about what you offer and who it is for.", styles: { "font-size": "20px", color: "#525252", margin: "0 0 28px", "max-width": "620px" } }, { tag: "div", name: "Actions", styles: { display: "flex", gap: "12px", "flex-wrap": "wrap" }, children: [btn("Get started"), btn("Learn more", false)] }])] } },
  { id: "features", name: "Feature grid", category: "Content", description: "Three feature cards.", spec: { tag: "section", name: "Features", attrs: { id: "features" }, styles: { padding: "80px 0" }, children: [container([{ tag: "h2", text: "Everything you need", styles: { "font-size": "36px", margin: "0 0 32px" } }, grid(3, [card("Fast", "Built for speed from the first byte."), card("Flexible", "Adapt it to the way you work."), card("Reliable", "Backed up, versioned and always recoverable.")])])] } },
  { id: "image-text", name: "Image + text", category: "Content", description: "Two columns with an image and copy.", spec: { tag: "section", name: "Image and text", styles: { padding: "80px 0" }, children: [container([{ tag: "div", name: "Columns", styles: { display: "grid", "grid-template-columns": "1fr 1fr", gap: "48px", "align-items": "center" }, mobile: { "grid-template-columns": "1fr", gap: "24px" }, children: [{ tag: "img", attrs: { src: "https://placehold.co/600x400", alt: "Placeholder illustration", width: "600", height: "400" }, styles: { "max-width": "100%", height: "auto", "border-radius": "12px" } }, { tag: "div", name: "Copy", children: [{ tag: "h2", text: "Tell your story", styles: { "font-size": "32px", margin: "0 0 12px" } }, { tag: "p", text: "Explain the value in a few honest sentences.", styles: { color: "#525252", "line-height": "1.7" } }] }] }])] } },
  { id: "testimonial", name: "Testimonial", category: "Social proof", description: "A single customer quote.", spec: { tag: "section", name: "Testimonial", styles: { padding: "72px 0", background: "#fafafa" }, children: [container([{ tag: "figure", styles: { margin: "0", "max-width": "720px" }, children: [{ tag: "blockquote", text: "“This changed how our whole team ships websites.”", styles: { margin: "0 0 16px", "font-size": "26px", "line-height": "1.4" } }, { tag: "figcaption", text: "Alex Morgan, Head of Design", styles: { color: "#525252" } }] }])] } },
  { id: "pricing", name: "Pricing", category: "Conversion", description: "Three plans side by side.", spec: { tag: "section", name: "Pricing", attrs: { id: "pricing" }, styles: { padding: "80px 0" }, children: [container([{ tag: "h2", text: "Simple pricing", styles: { "font-size": "36px", margin: "0 0 32px" } }, grid(3, [card("Free", "For trying things out."), card("Pro", "For professionals and small teams."), card("Business", "For agencies and larger teams.")])])] } },
  { id: "cta", name: "Call to action", category: "Conversion", description: "A closing banner with one action.", spec: { tag: "section", name: "Call to action", styles: { padding: "72px 0", background: "#111111", color: "#ffffff", "text-align": "center" }, children: [container([{ tag: "h2", text: "Ready to get started?", styles: { "font-size": "36px", margin: "0 0 16px" } }, { tag: "a", name: "Button", text: "Start free", attrs: { href: "#" }, styles: { display: "inline-block", padding: "12px 22px", background: "#ffffff", color: "#111111", "border-radius": "8px", "text-decoration": "none", "font-weight": "500" } }])] } },
  { id: "faq", name: "FAQ", category: "Content", description: "Expandable questions and answers.", spec: { tag: "section", name: "FAQ", styles: { padding: "72px 0" }, children: [container([{ tag: "h2", text: "Frequently asked questions", styles: { "font-size": "32px", margin: "0 0 24px" } }, { tag: "details", styles: { padding: "16px 0", "border-bottom": "1px solid #e5e5e5" }, children: [{ tag: "summary", text: "How does it work?", styles: { "font-weight": "500", cursor: "pointer" } }, { tag: "p", text: "A clear, short answer goes here.", styles: { color: "#525252" } }] }, { tag: "details", styles: { padding: "16px 0", "border-bottom": "1px solid #e5e5e5" }, children: [{ tag: "summary", text: "Can I change my mind later?", styles: { "font-weight": "500", cursor: "pointer" } }, { tag: "p", text: "Yes — explain the policy here.", styles: { color: "#525252" } }] }])] } },
  { id: "contact", name: "Contact form", category: "Forms", description: "Name, email and message.", spec: { tag: "section", name: "Contact", styles: { padding: "72px 0" }, children: [container([{ tag: "h2", text: "Get in touch", styles: { "font-size": "32px", margin: "0 0 24px" } }, { tag: "form", name: "Contact form", attrs: { method: "post" }, styles: { display: "grid", gap: "16px", "max-width": "520px" }, children: [{ tag: "label", text: "Email", attrs: { for: "contact-email" } }, { tag: "input", attrs: { id: "contact-email", name: "email", type: "email", required: "required" }, styles: { padding: "10px", border: "1px solid #d4d4d4", "border-radius": "8px" } }, { tag: "label", text: "Message", attrs: { for: "contact-message" } }, { tag: "textarea", attrs: { id: "contact-message", name: "msg", rows: "5" }, styles: { padding: "10px", border: "1px solid #d4d4d4", "border-radius": "8px" } }, { tag: "button", text: "Send", attrs: { type: "submit" }, styles: { padding: "10px 18px", background: "#111111", color: "#ffffff", border: "0", "border-radius": "8px", cursor: "pointer" } }] }])] } },
  { id: "footer", name: "Footer", category: "Footer", description: "Copyright and links.", spec: { tag: "footer", name: "Footer", styles: { padding: "40px 0", "border-top": "1px solid #e5e5e5", color: "#525252" }, children: [container([{ tag: "div", styles: { display: "flex", "justify-content": "space-between", gap: "16px", "flex-wrap": "wrap" }, children: [{ tag: "p", text: "© 2026 Your company", styles: { margin: "0" } }, { tag: "nav", attrs: { "aria-label": "Footer" }, styles: { display: "flex", gap: "16px" }, children: [{ tag: "a", text: "Privacy", attrs: { href: "#" } }, { tag: "a", text: "Terms", attrs: { href: "#" } }] }] }])] } },
];

export interface BuiltSubtree { rootId: string; nodes: ElementNode[] }

/** Turn a spec into nodes with deterministic ids (`${idSeed}_${n}`), so the operation replays identically on every client. */
export function specToNodes(spec: Spec, parentId: string, idSeed: string, breakpointIds: string[] = ["base", "tablet", "mobile"]): BuiltSubtree {
  const nodes: ElementNode[] = [];
  let n = 0;
  const walk = (s: Spec, parent: string): string => {
    const id = n === 0 ? idSeed : `${idSeed}_${n}`;
    n++;
    const styles: StyleBlock[] = [];
    if (s.styles) styles.push({ breakpoint: "base", declarations: s.styles });
    if (s.tablet && breakpointIds.includes("tablet")) styles.push({ breakpoint: "tablet", declarations: s.tablet });
    if (s.mobile && breakpointIds.includes("mobile")) styles.push({ breakpoint: "mobile", declarations: s.mobile });
    const node: ElementNode = { id, type: "element", tag: s.tag, name: s.name, parentId: parent, children: [], attributes: s.attrs ?? {}, text: s.text, classIds: [], styles, hidden: false, locked: false, props: {}, interactions: [] };
    nodes.push(node);
    node.children = (s.children ?? []).map((c) => walk(c, id));
    return id;
  };
  const rootId = walk(spec, parentId);
  return { rootId, nodes };
}

export function insertSpecOp(doc: Document, spec: Spec, parentId: string, index: number, idSeed: string): Operation {
  const { rootId, nodes } = specToNodes(spec, parentId, idSeed, doc.breakpoints.map((b) => b.id));
  return { type: "insertSubtree", rootId, nodes, parentId, index };
}

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);

export interface ComponentUsage { nodeId: string; pageId?: string; inComponentId?: string }

/** Where a component is instanced: on which page (or inside which other component). */
export function componentUsage(doc: Document, componentId: string): ComponentUsage[] {
  const out: ComponentUsage[] = [];
  const owner = (id: string): { pageId?: string; inComponentId?: string } => {
    let cur: string | null = id, last = id;
    while (cur) { last = cur; cur = doc.nodes[cur]?.parentId ?? null; }
    const page = doc.pages.find((p) => p.rootId === last);
    if (page) return { pageId: page.id };
    const comp = Object.values(doc.components).find((c) => c.rootId === last);
    return comp ? { inComponentId: comp.id } : {};
  };
  for (const n of Object.values(doc.nodes)) if (n.type === "component-instance" && n.componentId === componentId) out.push({ nodeId: n.id, ...owner(n.id) });
  return out;
}

/** Detect cycles before allowing a component to contain an instance of another (A → B → A). */
export function wouldCreateComponentCycle(doc: Document, containerComponentId: string, instanceComponentId: string): boolean {
  if (containerComponentId === instanceComponentId) return true;
  const seen = new Set<string>();
  const visit = (cid: string): boolean => {
    if (cid === containerComponentId) return true;
    if (seen.has(cid)) return false;
    seen.add(cid);
    const def = doc.components[cid];
    if (!def) return false;
    const stack = [def.rootId];
    while (stack.length) {
      const n = doc.nodes[stack.pop()!];
      if (!n) continue;
      if (n.type === "component-instance" && n.componentId && visit(n.componentId)) return true;
      stack.push(...n.children);
    }
    return false;
  };
  return visit(instanceComponentId);
}
