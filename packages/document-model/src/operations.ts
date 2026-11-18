import { AnimationSchema, PageSchema, type Animation, type Breakpoint, type ComponentDef, type Document, type ElementNode, type Page, type StyleBlock, type StyleClass } from "./schema";

export class OperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationError";
  }
}

export type ElementPatch = Partial<Pick<ElementNode, "tag" | "name" | "text" | "hidden" | "locked" | "attributes" | "props" | "binding" | "interactions">>;
export type PagePatch = Partial<Pick<Page, "name" | "route" | "meta" | "collectionId">>;
export type ComponentPatch = Partial<Pick<ComponentDef, "name" | "description" | "props" | "variants">>;

/** Low-level fragment patch. Used internally to build reversible composite operations; not exposed to AI proposals. */
export interface DocPatch {
  nodes?: Record<string, ElementNode | null>;
  components?: Record<string, ComponentDef | null>;
  pages?: Page[];
  breakpoints?: Breakpoint[];
}

/** Serializable, reversible document operations. Every mutation goes through these. */
export type Operation =
  | { type: "insertSubtree"; rootId: string; nodes: ElementNode[]; parentId: string; index: number }
  | { type: "deleteElement"; id: string }
  | { type: "moveElement"; id: string; parentId: string; index: number }
  | { type: "updateElement"; id: string; patch: ElementPatch }
  | { type: "setStyle"; id: string; breakpoint: string; state?: string; declarations: Record<string, string | null> }
  | { type: "addClass"; id: string; classId: string }
  | { type: "removeClass"; id: string; classId: string }
  | { type: "upsertClass"; cls: StyleClass }
  | { type: "removeClassDef"; classId: string }
  | { type: "duplicateElement"; id: string; newRootId: string }
  | { type: "setToken"; name: string; value: string | null }
  | { type: "upsertAnimation"; animation: Animation }
  | { type: "removeAnimation"; id: string }
  | { type: "setCustomCode"; field: "headHtml" | "customCss"; value: string }
  | { type: "patchDoc"; patch: DocPatch }
  | { type: "addPage"; page: Page; rootNode: ElementNode }
  | { type: "removePage"; pageId: string }
  | { type: "updatePage"; pageId: string; patch: PagePatch }
  | { type: "setHomePage"; pageId: string }
  | { type: "upsertBreakpoint"; breakpoint: Breakpoint }
  | { type: "removeBreakpoint"; id: string }
  | { type: "createComponent"; elementId: string; componentId: string; name: string; instanceId: string }
  | { type: "detachInstance"; id: string; idSeed: string }
  | { type: "deleteComponent"; componentId: string }
  | { type: "updateComponent"; componentId: string; patch: ComponentPatch };

export interface ApplyResult {
  doc: Document;
  /** Operations that, applied in order to `doc`, restore the previous state. */
  inverse: Operation[];
}

function getNode(doc: Document, id: string): ElementNode {
  const n = doc.nodes[id];
  if (!n) throw new OperationError(`Element not found: ${id}`);
  return n;
}

export function collectSubtree(doc: Document, id: string): ElementNode[] {
  const out: ElementNode[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = getNode(doc, stack.pop()!);
    out.push(cur);
    for (let i = cur.children.length - 1; i >= 0; i--) stack.push(cur.children[i]!);
  }
  return out;
}

export function isDescendant(doc: Document, ancestorId: string, nodeId: string): boolean {
  let cur: string | null = nodeId;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = doc.nodes[cur]?.parentId ?? null;
  }
  return false;
}

function isPageRoot(doc: Document, id: string): boolean {
  return doc.pages.some((p) => p.rootId === id);
}

function withNode(doc: Document, node: ElementNode): Document {
  const nodes = copyNodes(doc); nodes[node.id] = node;
  return { ...doc, nodes };
}

function assertRouteFree(doc: Document, route: string, exceptPageId?: string) {
  const norm = (r: string) => r.replace(/\/$/, "") || "/";
  if (doc.pages.some((p) => p.id !== exceptPageId && norm(p.route) === norm(route))) throw new OperationError(`Route already in use: ${route}`);
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

function blockMatches(b: StyleBlock, breakpoint: string, state?: string): boolean {
  return b.breakpoint === breakpoint && (b.state ?? undefined) === (state ?? undefined);
}

/**
 * Node maps created inside applyOperations are private to that batch and are updated in place, so a
 * batch costs O(ops) instead of O(ops × nodes). Anything else is copied first (documents are immutable).
 */
const batchOwned = new WeakSet<object>();
function copyNodes(doc: Document): Document["nodes"] {
  return batchOwned.has(doc.nodes) ? doc.nodes : { ...doc.nodes };
}

export function applyOperation(doc: Document, op: Operation): ApplyResult {
  switch (op.type) {
    case "insertSubtree": {
      const parent = getNode(doc, op.parentId);
      if (parent.locked) throw new OperationError("Parent is locked");
      if (op.nodes.some((n) => doc.nodes[n.id])) throw new OperationError("Duplicate element id on insert");
      const root = op.nodes.find((n) => n.id === op.rootId);
      if (!root) throw new OperationError("Subtree root missing from nodes");
      const nodes = copyNodes(doc);
      for (const n of op.nodes) nodes[n.id] = n.id === op.rootId ? { ...n, parentId: op.parentId } : n;
      const idx = clampIndex(op.index, parent.children.length);
      const children = [...parent.children];
      children.splice(idx, 0, op.rootId);
      nodes[parent.id] = { ...parent, children };
      return { doc: { ...doc, nodes }, inverse: [{ type: "deleteElement", id: op.rootId }] };
    }

    case "deleteElement": {
      const node = getNode(doc, op.id);
      if (isPageRoot(doc, node.id) || !node.parentId) throw new OperationError("Cannot delete a page root");
      if (node.locked) throw new OperationError("Element is locked");
      const parent = getNode(doc, node.parentId);
      const index = parent.children.indexOf(node.id);
      const subtree = collectSubtree(doc, node.id);
      const nodes = copyNodes(doc);
      for (const n of subtree) delete nodes[n.id];
      nodes[parent.id] = { ...parent, children: parent.children.filter((c) => c !== node.id) };
      return {
        doc: { ...doc, nodes },
        inverse: [{ type: "insertSubtree", rootId: node.id, nodes: subtree, parentId: parent.id, index }],
      };
    }

    case "moveElement": {
      const node = getNode(doc, op.id);
      if (!node.parentId || isPageRoot(doc, node.id)) throw new OperationError("Cannot move a page root");
      if (node.locked) throw new OperationError("Element is locked");
      const newParent = getNode(doc, op.parentId);
      if (isDescendant(doc, node.id, newParent.id)) throw new OperationError("Cannot move an element into itself");
      const oldParent = getNode(doc, node.parentId);
      const oldIndex = oldParent.children.indexOf(node.id);
      const nodes = copyNodes(doc);
      const oldChildren = oldParent.children.filter((c) => c !== node.id);
      nodes[oldParent.id] = { ...oldParent, children: oldChildren };
      const base = newParent.id === oldParent.id ? oldChildren : [...newParent.children];
      const idx = clampIndex(op.index, base.length);
      const newChildren = [...base];
      newChildren.splice(idx, 0, node.id);
      nodes[newParent.id] = { ...(nodes[newParent.id] ?? newParent), children: newChildren };
      nodes[node.id] = { ...node, parentId: newParent.id };
      return {
        doc: { ...doc, nodes },
        inverse: [{ type: "moveElement", id: node.id, parentId: oldParent.id, index: oldIndex }],
      };
    }

    case "updateElement": {
      const node = getNode(doc, op.id);
      const prev: ElementPatch = {};
      for (const k of Object.keys(op.patch) as (keyof ElementPatch)[]) {
        (prev as Record<string, unknown>)[k] = node[k];
      }
      // Locking/unlocking is always allowed; other edits are blocked on locked nodes.
      const keys = Object.keys(op.patch);
      if (node.locked && keys.some((k) => k !== "locked")) throw new OperationError("Element is locked");
      return { doc: withNode(doc, { ...node, ...op.patch }), inverse: [{ type: "updateElement", id: op.id, patch: prev }] };
    }

    case "setStyle": {
      const node = getNode(doc, op.id);
      if (node.locked) throw new OperationError("Element is locked");
      const existing = node.styles.find((b) => blockMatches(b, op.breakpoint, op.state));
      const before: Record<string, string | null> = {};
      const decl = { ...(existing?.declarations ?? {}) };
      for (const [prop, val] of Object.entries(op.declarations)) {
        before[prop] = decl[prop] ?? null;
        if (val === null) delete decl[prop];
        else decl[prop] = val;
      }
      let styles = node.styles.filter((b) => !blockMatches(b, op.breakpoint, op.state));
      if (Object.keys(decl).length) styles = [...styles, { breakpoint: op.breakpoint, state: op.state, declarations: decl }];
      return {
        doc: withNode(doc, { ...node, styles }),
        inverse: [{ type: "setStyle", id: op.id, breakpoint: op.breakpoint, state: op.state, declarations: before }],
      };
    }

    case "addClass": {
      const node = getNode(doc, op.id);
      if (!doc.classes[op.classId]) throw new OperationError(`Unknown class: ${op.classId}`);
      if (node.classIds.includes(op.classId)) return { doc, inverse: [] };
      return {
        doc: withNode(doc, { ...node, classIds: [...node.classIds, op.classId] }),
        inverse: [{ type: "removeClass", id: op.id, classId: op.classId }],
      };
    }

    case "removeClass": {
      const node = getNode(doc, op.id);
      if (!node.classIds.includes(op.classId)) return { doc, inverse: [] };
      return {
        doc: withNode(doc, { ...node, classIds: node.classIds.filter((c) => c !== op.classId) }),
        inverse: [{ type: "addClass", id: op.id, classId: op.classId }],
      };
    }

    case "upsertClass": {
      const prev = doc.classes[op.cls.id];
      const dup = Object.values(doc.classes).find((c) => c.name === op.cls.name && c.id !== op.cls.id);
      if (dup) throw new OperationError(`Class name already in use: ${op.cls.name}`);
      return {
        doc: { ...doc, classes: { ...doc.classes, [op.cls.id]: op.cls } },
        inverse: [prev ? { type: "upsertClass", cls: prev } : { type: "removeClassDef", classId: op.cls.id }],
      };
    }

    case "removeClassDef": {
      const prev = doc.classes[op.classId];
      if (!prev) throw new OperationError(`Unknown class: ${op.classId}`);
      if (Object.values(doc.nodes).some((n) => n.classIds.includes(op.classId)))
        throw new OperationError("Class is still in use");
      const classes = { ...doc.classes };
      delete classes[op.classId];
      return { doc: { ...doc, classes }, inverse: [{ type: "upsertClass", cls: prev }] };
    }

    case "duplicateElement": {
      const node = getNode(doc, op.id);
      if (!node.parentId || isPageRoot(doc, node.id)) throw new OperationError("Cannot duplicate a page root");
      const parent = getNode(doc, node.parentId);
      const subtree = collectSubtree(doc, node.id);
      const idMap = new Map<string, string>();
      subtree.forEach((n, i) => idMap.set(n.id, i === 0 ? op.newRootId : `${op.newRootId}_${i}`));
      const clones = subtree.map((n) => ({
        ...n,
        id: idMap.get(n.id)!,
        parentId: n.parentId && idMap.has(n.parentId) ? idMap.get(n.parentId)! : n.parentId,
        children: n.children.map((c) => idMap.get(c)!),
        locked: false,
      }));
      return applyOperation(doc, {
        type: "insertSubtree",
        rootId: op.newRootId,
        nodes: clones,
        parentId: parent.id,
        index: parent.children.indexOf(node.id) + 1,
      });
    }

    case "setToken": {
      const prev = doc.tokens[op.name] ?? null;
      const tokens = { ...doc.tokens };
      if (op.value === null) delete tokens[op.name];
      else tokens[op.name] = op.value;
      return { doc: { ...doc, tokens }, inverse: [{ type: "setToken", name: op.name, value: prev }] };
    }

    case "setCustomCode": {
      if (op.field !== "headHtml" && op.field !== "customCss") throw new OperationError("Unknown custom code field");
      if (op.value.length > 200_000) throw new OperationError("Custom code is too large (200 KB max)");
      const prev = doc.customCode[op.field];
      return { doc: { ...doc, customCode: { ...doc.customCode, [op.field]: op.value } }, inverse: [{ type: "setCustomCode", field: op.field, value: prev }] };
    }

    case "upsertAnimation": {
      const parsed = AnimationSchema.safeParse(op.animation);
      if (!parsed.success) throw new OperationError(`Invalid animation: ${parsed.error.issues[0]?.message}`);
      const a = parsed.data;
      if (Object.values(doc.animations).some((x) => x.name === a.name && x.id !== a.id)) throw new OperationError(`Animation name already in use: ${a.name}`);
      const prev = doc.animations[a.id];
      return { doc: { ...doc, animations: { ...doc.animations, [a.id]: a } }, inverse: [prev ? { type: "upsertAnimation", animation: prev } : { type: "removeAnimation", id: a.id }] };
    }

    case "removeAnimation": {
      const prev = doc.animations[op.id];
      if (!prev) throw new OperationError("Animation not found");
      if (Object.values(doc.nodes).some((n) => n.interactions.some((i) => i.params?.["animationId"] === op.id))) throw new OperationError("Animation is used by an interaction");
      const animations = { ...doc.animations };
      delete animations[op.id];
      return { doc: { ...doc, animations }, inverse: [{ type: "upsertAnimation", animation: prev }] };
    }

    case "patchDoc": {
      const before: DocPatch = {};
      const p = op.patch;
      let nodes = doc.nodes, components = doc.components;
      if (p.nodes) {
        before.nodes = {};
        nodes = copyNodes(doc);
        for (const [id, n] of Object.entries(p.nodes)) {
          before.nodes[id] = doc.nodes[id] ?? null;
          if (n === null) delete nodes[id];
          else nodes[id] = n;
        }
      }
      if (p.components) {
        before.components = {};
        components = { ...doc.components };
        for (const [id, c] of Object.entries(p.components)) {
          before.components[id] = doc.components[id] ?? null;
          if (c === null) delete components[id];
          else components[id] = c;
        }
      }
      if (p.pages) before.pages = doc.pages;
      if (p.breakpoints) before.breakpoints = doc.breakpoints;
      return {
        doc: { ...doc, nodes, components, pages: p.pages ?? doc.pages, breakpoints: p.breakpoints ?? doc.breakpoints },
        inverse: [{ type: "patchDoc", patch: before }],
      };
    }

    case "addPage": {
      const parsed = PageSchema.safeParse(op.page);
      if (!parsed.success) throw new OperationError(`Invalid page: ${parsed.error.issues[0]?.message}`);
      assertRouteFree(doc, op.page.route);
      if (doc.pages.some((p) => p.id === op.page.id)) throw new OperationError("Duplicate page id");
      if (doc.nodes[op.rootNode.id] || op.rootNode.id !== op.page.rootId) throw new OperationError("Invalid page root");
      const page = { ...op.page, isHome: doc.pages.length === 0 };
      return applyOperation(doc, { type: "patchDoc", patch: { nodes: { [op.rootNode.id]: { ...op.rootNode, parentId: null } }, pages: [...doc.pages, page] } });
    }

    case "removePage": {
      const page = doc.pages.find((p) => p.id === op.pageId);
      if (!page) throw new OperationError("Page not found");
      if (doc.pages.length === 1) throw new OperationError("Cannot remove the last page");
      if (page.isHome) throw new OperationError("Cannot remove the home page; set another home page first");
      const nodes: Record<string, null> = {};
      for (const n of collectSubtree(doc, page.rootId)) nodes[n.id] = null;
      return applyOperation(doc, { type: "patchDoc", patch: { nodes, pages: doc.pages.filter((p) => p.id !== op.pageId) } });
    }

    case "updatePage": {
      const page = doc.pages.find((p) => p.id === op.pageId);
      if (!page) throw new OperationError("Page not found");
      const next = { ...page, ...op.patch, meta: { ...page.meta, ...(op.patch.meta ?? {}) } };
      const parsed = PageSchema.safeParse(next);
      if (!parsed.success) throw new OperationError(`Invalid page: ${parsed.error.issues[0]?.message}`);
      if (op.patch.route !== undefined && op.patch.route !== page.route) assertRouteFree(doc, op.patch.route, page.id);
      return applyOperation(doc, { type: "patchDoc", patch: { pages: doc.pages.map((p) => (p.id === page.id ? next : p)) } });
    }

    case "setHomePage": {
      if (!doc.pages.some((p) => p.id === op.pageId)) throw new OperationError("Page not found");
      return applyOperation(doc, { type: "patchDoc", patch: { pages: doc.pages.map((p) => ({ ...p, isHome: p.id === op.pageId })) } });
    }

    case "upsertBreakpoint": {
      const bp = op.breakpoint;
      if (bp.id === "base") throw new OperationError("The base breakpoint cannot be changed");
      if (!/^[a-z][\w-]*$/i.test(bp.id)) throw new OperationError("Invalid breakpoint id");
      if (!bp.maxWidth) throw new OperationError("Breakpoints need a max width");
      const exists = doc.breakpoints.some((b) => b.id === bp.id);
      return applyOperation(doc, { type: "patchDoc", patch: { breakpoints: exists ? doc.breakpoints.map((b) => (b.id === bp.id ? bp : b)) : [...doc.breakpoints, bp] } });
    }

    case "removeBreakpoint": {
      if (op.id === "base") throw new OperationError("The base breakpoint cannot be removed");
      const used = Object.values(doc.nodes).some((n) => n.styles.some((b) => b.breakpoint === op.id)) || Object.values(doc.classes).some((c) => c.blocks.some((b) => b.breakpoint === op.id));
      if (used) throw new OperationError("Breakpoint is still used by styles");
      return applyOperation(doc, { type: "patchDoc", patch: { breakpoints: doc.breakpoints.filter((b) => b.id !== op.id) } });
    }

    case "createComponent": {
      const el = getNode(doc, op.elementId);
      if (!el.parentId || isPageRoot(doc, el.id)) throw new OperationError("Cannot turn a page root into a component");
      if (el.type === "component-instance") throw new OperationError("Element is already a component instance");
      if (doc.components[op.componentId] || doc.nodes[op.instanceId]) throw new OperationError("Duplicate component or instance id");
      if (Object.values(doc.components).some((c) => c.name === op.name)) throw new OperationError(`Component name already in use: ${op.name}`);
      const parent = getNode(doc, el.parentId);
      const instance: ElementNode = { ...el, id: op.instanceId, type: "component-instance", tag: "div", name: op.name, children: [], attributes: {}, text: undefined, classIds: [], styles: [], componentId: op.componentId, props: {}, binding: undefined, interactions: [] };
      return applyOperation(doc, {
        type: "patchDoc",
        patch: {
          nodes: { [el.id]: { ...el, parentId: null, locked: false }, [instance.id]: instance, [parent.id]: { ...parent, children: parent.children.map((c) => (c === el.id ? instance.id : c)) } },
          components: { [op.componentId]: { id: op.componentId, name: op.name, rootId: el.id, props: [], variants: [] } },
        },
      });
    }

    case "detachInstance": {
      const inst = getNode(doc, op.id);
      const def = inst.componentId ? doc.components[inst.componentId] : undefined;
      if (inst.type !== "component-instance" || !def || !inst.parentId) throw new OperationError("Not a component instance");
      const parent = getNode(doc, inst.parentId);
      const subtree = collectSubtree(doc, def.rootId);
      const idMap = new Map(subtree.map((n, i) => [n.id, i === 0 ? op.id : `${op.idSeed}_${i}`] as const));
      const nodes: Record<string, ElementNode | null> = {};
      for (const n of subtree) {
        const id = idMap.get(n.id)!;
        nodes[id] = { ...n, id, parentId: n.id === def.rootId ? parent.id : idMap.get(n.parentId ?? "") ?? parent.id, children: n.children.map((c) => idMap.get(c)!), locked: false };
      }
      return applyOperation(doc, { type: "patchDoc", patch: { nodes } });
    }

    case "deleteComponent": {
      const def = doc.components[op.componentId];
      if (!def) throw new OperationError("Component not found");
      if (Object.values(doc.nodes).some((n) => n.componentId === op.componentId)) throw new OperationError("Component still has instances");
      const nodes: Record<string, null> = {};
      for (const n of collectSubtree(doc, def.rootId)) nodes[n.id] = null;
      return applyOperation(doc, { type: "patchDoc", patch: { nodes, components: { [def.id]: null } } });
    }

    case "updateComponent": {
      const def = doc.components[op.componentId];
      if (!def) throw new OperationError("Component not found");
      if (op.patch.name && Object.values(doc.components).some((c) => c.name === op.patch.name && c.id !== def.id)) throw new OperationError(`Component name already in use: ${op.patch.name}`);
      return applyOperation(doc, { type: "patchDoc", patch: { components: { [def.id]: { ...def, ...op.patch } } } });
    }
  }
}

/** Apply operations atomically: if any op throws, the original document is untouched. */
export function applyOperations(doc: Document, ops: Operation[]): ApplyResult {
  if (ops.length <= 1) { const r = ops[0] ? applyOperation(doc, ops[0]) : { doc, inverse: [] as Operation[] }; return r; }
  // One private copy of the node map for the whole batch; the caller's document is never touched, and a throw discards the copy.
  const owned = { ...doc.nodes };
  batchOwned.add(owned);
  let cur: Document = { ...doc, nodes: owned };
  const inverses: Operation[][] = [];
  try {
    for (const op of ops) {
      const r = applyOperation(cur, op);
      cur = r.doc;
      inverses.push(r.inverse);
    }
  } finally { batchOwned.delete(owned); }
  return { doc: cur, inverse: inverses.reverse().flat() };
}
