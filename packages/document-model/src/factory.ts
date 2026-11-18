import { DEFAULT_BREAKPOINTS, SCHEMA_VERSION, type Document, type ElementNode } from "./schema";

export function createId(prefix = "n"): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const raw = g.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${raw.replace(/-/g, "").slice(0, 12)}`;
}

export function createNode(partial: Partial<ElementNode> & { parentId: string | null }): ElementNode {
  return {
    id: partial.id ?? createId(),
    type: "element",
    tag: "div",
    children: [],
    attributes: {},
    classIds: [],
    styles: [],
    hidden: false,
    locked: false,
    props: {},
    interactions: [],
    ...partial,
  };
}

export function createDocument(name: string): Document {
  const rootId = createId("root");
  return {
    version: SCHEMA_VERSION,
    id: createId("doc"),
    name,
    nodes: { [rootId]: createNode({ id: rootId, tag: "body", name: "Body", parentId: null }) },
    pages: [{ id: createId("page"), name: "Home", route: "/", rootId, meta: {}, isHome: true }],
    classes: {},
    components: {},
    animations: {},
    breakpoints: DEFAULT_BREAKPOINTS,
    tokens: {},
    customCode: { headHtml: "", customCss: "" },
  };
}
