import { applyOperation, createId, createNode, type Document, type Operation } from "@webbrik/document-model";
import { VOID } from "@webbrik/renderer";
import { insertSpecOp, templateById } from "@webbrik/component-system";
import { CATALOG } from "./catalog";

export type DropPosition = "before" | "inside" | "after";
export type DragPayload =
  | { kind: "move"; ids: string[] }
  | { kind: "catalog"; label: string }
  | { kind: "template"; id: string };

export const isPageRoot = (doc: Document, id: string) => doc.pages.some((p) => p.rootId === id);
export const canContain = (doc: Document, id: string) => {
  const n = doc.nodes[id];
  return !!n && n.type === "element" && !VOID.has(n.tag);
};

/** Where would a drop land? null if that drop is not allowed. */
export function resolveDrop(doc: Document, targetId: string, pos: DropPosition): { parentId: string; index: number } | null {
  const t = doc.nodes[targetId];
  if (!t) return null;
  if (pos === "inside" || isPageRoot(doc, targetId) || !t.parentId) return canContain(doc, targetId) ? { parentId: targetId, index: t.children.length } : null;
  const parent = doc.nodes[t.parentId];
  if (!parent || !canContain(doc, parent.id)) return null;
  const i = parent.children.indexOf(targetId);
  return { parentId: parent.id, index: pos === "before" ? i : i + 1 };
}

const isAncestor = (doc: Document, anc: string, id: string) => {
  for (let c = doc.nodes[id]?.parentId; c; c = doc.nodes[c]?.parentId) if (c === anc) return true;
  return false;
};

/** Move several elements (kept in document order) to parent[index]. Returns ops or an error message. */
export function moveOps(doc: Document, ids: string[], parentId: string, index: number): { ops: Operation[] } | { error: string } {
  // Drop descendants of other selected nodes (they move with their ancestor) and page roots.
  const top = ids.filter((id) => doc.nodes[id] && !isPageRoot(doc, id) && !ids.some((o) => o !== id && isAncestor(doc, o, id)));
  if (top.length === 0) return { error: "Nothing to move." };
  for (const id of top) {
    if (id === parentId || isAncestor(doc, id, parentId)) return { error: "Cannot move an element into itself." };
    if (doc.nodes[id]!.locked) return { error: "Locked elements can't be moved." };
  }
  const order = (id: string) => { const path: number[] = []; for (let c: string | null = id; c; c = doc.nodes[c]?.parentId ?? null) { const p = doc.nodes[c]?.parentId; if (p) path.unshift(doc.nodes[p]!.children.indexOf(c)); } return path; };
  top.sort((a, b) => { const x = order(a), y = order(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? -1) - (y[i] ?? -1); if (d) return d; } return 0; });
  const ops: Operation[] = [];
  let cur = doc, at = index;
  for (const id of top) {
    const n = cur.nodes[id]!;
    const sameParent = n.parentId === parentId;
    const adjusted = sameParent && cur.nodes[parentId]!.children.indexOf(id) < at ? at - 1 : at;
    const op: Operation = { type: "moveElement", id, parentId, index: adjusted };
    try { cur = applyOperation(cur, op).doc; } catch (e) { return { error: e instanceof Error ? e.message : "Move failed" }; }
    ops.push(op);
    at = cur.nodes[parentId]!.children.indexOf(id) + 1;
  }
  return { ops };
}

/** Everything a drop can do, as operations plus the id to select afterwards. */
export function dropOps(doc: Document, payload: DragPayload, targetId: string, pos: DropPosition): { ops: Operation[]; label: string; select: string[] } | { error: string } {
  const where = resolveDrop(doc, targetId, pos);
  if (!where) return { error: "That element can't contain children." };
  if (payload.kind === "move") {
    const r = moveOps(doc, payload.ids, where.parentId, where.index);
    return "error" in r ? r : { ops: r.ops, label: "Move", select: payload.ids };
  }
  if (payload.kind === "template") {
    const t = templateById(payload.id);
    if (!t) return { error: "Unknown template." };
    const seed = createId("t");
    return { ops: [insertSpecOp(doc, t.spec, where.parentId, where.index, seed)], label: `Insert ${t.name}`, select: [seed] };
  }
  const item = CATALOG.find((c) => c.label === payload.label);
  if (!item) return { error: "Unknown element." };
  const id = createId();
  const ops: Operation[] = [{ type: "insertSubtree", rootId: id, nodes: [createNode({ id, parentId: where.parentId, tag: item.tag, name: item.label, text: item.text })], parentId: where.parentId, index: where.index }];
  if (item.styles) ops.push({ type: "setStyle", id, breakpoint: "base", declarations: item.styles });
  return { ops, label: `Insert ${item.label}`, select: [id] };
}

/** Move one step among siblings (Alt+↑/↓). */
export function nudgeOps(doc: Document, id: string, dir: -1 | 1): Operation[] {
  const n = doc.nodes[id];
  if (!n?.parentId || isPageRoot(doc, id)) return [];
  const sib = doc.nodes[n.parentId]!.children, i = sib.indexOf(id), j = i + dir;
  return j < 0 || j >= sib.length ? [] : [{ type: "moveElement", id, parentId: n.parentId, index: j }];
}

/** Send to the front or back of its siblings. */
export function reorderOps(doc: Document, id: string, where: "first" | "last"): Operation[] {
  const n = doc.nodes[id];
  if (!n?.parentId || isPageRoot(doc, id)) return [];
  const sib = doc.nodes[n.parentId]!.children, i = sib.indexOf(id), j = where === "first" ? 0 : sib.length - 1;
  return i === j ? [] : [{ type: "moveElement", id, parentId: n.parentId, index: j }];
}

/** Alt+→: become the last child of the previous sibling, if it can hold children. */
export function indentOps(doc: Document, id: string): Operation[] {
  const n = doc.nodes[id];
  if (!n?.parentId || isPageRoot(doc, id)) return [];
  const sib = doc.nodes[n.parentId]!.children, i = sib.indexOf(id);
  const prev = i > 0 ? sib[i - 1]! : undefined;
  if (!prev || !resolveDrop(doc, prev, "inside")) return [];
  return [{ type: "moveElement", id, parentId: prev, index: doc.nodes[prev]!.children.length }];
}

/** Alt+←: move out of the parent, to just after it. */
export function outdentOps(doc: Document, id: string): Operation[] {
  const n = doc.nodes[id];
  if (!n?.parentId || isPageRoot(doc, id)) return [];
  const parent = doc.nodes[n.parentId]!;
  if (!parent.parentId || isPageRoot(doc, parent.id)) return [];
  const gp = doc.nodes[parent.parentId]!;
  return [{ type: "moveElement", id, parentId: gp.id, index: gp.children.indexOf(parent.id) + 1 }];
}
