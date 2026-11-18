import type { Document, ElementNode } from "./schema";

export interface NodeChange {
  id: string;
  kind: "added" | "removed" | "moved" | "content" | "style" | "attributes" | "visibility" | "structure";
  detail?: string;
}

export interface DocumentDiff {
  nodes: NodeChange[];
  pages: { id: string; kind: "added" | "removed" | "changed"; detail?: string }[];
  tokens: { name: string; before?: string; after?: string }[];
  classes: { id: string; kind: "added" | "removed" | "changed" }[];
  animations: { id: string; kind: "added" | "removed" | "changed" }[];
  summary: { added: number; removed: number; changed: number };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function nodeChanges(a: ElementNode, b: ElementNode): NodeChange[] {
  const out: NodeChange[] = [];
  if (a.parentId !== b.parentId) out.push({ id: b.id, kind: "moved", detail: `${a.parentId} → ${b.parentId}` });
  else if (!same(a.children, b.children)) out.push({ id: b.id, kind: "structure", detail: "children changed" });
  if (a.text !== b.text || a.tag !== b.tag || a.name !== b.name) out.push({ id: b.id, kind: "content", detail: a.text !== b.text ? `"${a.text ?? ""}" → "${b.text ?? ""}"` : "tag/name changed" });
  if (!same(a.styles, b.styles) || !same(a.classIds, b.classIds)) out.push({ id: b.id, kind: "style" });
  if (!same(a.attributes, b.attributes) || !same(a.props, b.props)) out.push({ id: b.id, kind: "attributes" });
  if (a.hidden !== b.hidden || a.locked !== b.locked) out.push({ id: b.id, kind: "visibility" });
  return out;
}

/** Structural diff used by version comparison and the visual diff overlay. */
export function diffDocuments(a: Document, b: Document): DocumentDiff {
  const nodes: NodeChange[] = [];
  for (const id of Object.keys(b.nodes)) {
    const before = a.nodes[id];
    if (!before) nodes.push({ id, kind: "added" });
    else nodes.push(...nodeChanges(before, b.nodes[id]!));
  }
  for (const id of Object.keys(a.nodes)) if (!b.nodes[id]) nodes.push({ id, kind: "removed" });

  const pages: DocumentDiff["pages"] = [];
  for (const p of b.pages) {
    const before = a.pages.find((x) => x.id === p.id);
    if (!before) pages.push({ id: p.id, kind: "added" });
    else if (!same(before, p)) pages.push({ id: p.id, kind: "changed", detail: before.route !== p.route ? `${before.route} → ${p.route}` : undefined });
  }
  for (const p of a.pages) if (!b.pages.some((x) => x.id === p.id)) pages.push({ id: p.id, kind: "removed" });

  const tokens: DocumentDiff["tokens"] = [];
  for (const k of new Set([...Object.keys(a.tokens), ...Object.keys(b.tokens)])) if (a.tokens[k] !== b.tokens[k]) tokens.push({ name: k, before: a.tokens[k], after: b.tokens[k] });

  const classes: DocumentDiff["classes"] = [];
  for (const k of new Set([...Object.keys(a.classes), ...Object.keys(b.classes)])) {
    if (!a.classes[k]) classes.push({ id: k, kind: "added" });
    else if (!b.classes[k]) classes.push({ id: k, kind: "removed" });
    else if (!same(a.classes[k], b.classes[k])) classes.push({ id: k, kind: "changed" });
  }
  const animations: DocumentDiff["animations"] = [];
  for (const k of new Set([...Object.keys(a.animations ?? {}), ...Object.keys(b.animations ?? {})])) {
    if (!a.animations?.[k]) animations.push({ id: k, kind: "added" });
    else if (!b.animations?.[k]) animations.push({ id: k, kind: "removed" });
    else if (!same(a.animations[k], b.animations[k])) animations.push({ id: k, kind: "changed" });
  }
  const added = nodes.filter((n) => n.kind === "added").length;
  const removed = nodes.filter((n) => n.kind === "removed").length;
  return { nodes, pages, tokens, classes, animations, summary: { added, removed, changed: nodes.length - added - removed } };
}
