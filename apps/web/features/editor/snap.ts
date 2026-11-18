/** Geometry helpers for resizing an element on the canvas. All numbers are CSS pixels in the page's own coordinate space. */
export interface Box { x: number; y: number; w: number; h: number }
export interface Guide { axis: "x" | "y"; pos: number }
/** A guide the user dragged out of a ruler. */
export interface UserGuide { id: string; axis: "x" | "y"; pos: number }
export interface Snap { size: number; guides: Guide[] }

export const SNAP_THRESHOLD = 6;

/**
 * Snap a proposed width (axis "w") or height (axis "h") for an element whose top-left stays fixed (flow layouts move
 * elements by layout, not by position, so only the right and bottom edges are draggable).
 * The moving edge snaps to sibling edges/centres and the parent's edges/centre; the size also snaps to a sibling's size.
 */
export function snapSize(axis: "w" | "h", proposed: number, el: Box, parent: Box, siblings: Box[], threshold = SNAP_THRESHOLD, extraLines: number[] = []): Snap {
  const start = axis === "w" ? el.x : el.y;
  const lines: number[] = [];
  const add = (b: Box) => { const a = axis === "w" ? b.x : b.y, len = axis === "w" ? b.w : b.h; lines.push(a, a + len / 2, a + len); };
  add(parent); siblings.forEach(add); lines.push(...extraLines); // user guides
  const sizes = siblings.map((b) => (axis === "w" ? b.w : b.h));
  let best: { size: number; dist: number; line: number } | null = null;
  const consider = (size: number, line: number) => { const dist = Math.abs(size - proposed); if (dist <= threshold && (!best || dist < best.dist)) best = { size, dist, line }; };
  for (const l of lines) consider(l - start, l);
  for (const s of sizes) consider(s, start + s);
  const size = Math.max(1, Math.round(best ? (best as { size: number }).size : proposed));
  const hit = best as { line: number } | null;
  return { size, guides: hit ? [{ axis: axis === "w" ? "x" : "y", pos: hit.line }] : [] };
}

export interface MoveSnap { x: number; y: number; guides: Guide[] }

/**
 * Snap a box being moved (proposed top-left, page coordinates). Its left/centre/right edges snap to vertical lines and
 * its top/middle/bottom to horizontal lines; lines are the parent's and siblings' edges and centres plus user guides.
 */
export function snapMove(box: Box, parent: Box, siblings: Box[], userGuides: { x: number[]; y: number[] } = { x: [], y: [] }, threshold = SNAP_THRESHOLD): MoveSnap {
  const xs: number[] = [...userGuides.x], ys: number[] = [...userGuides.y];
  for (const b of [parent, ...siblings]) { xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h); }
  const fit = (start: number, len: number, lines: number[]) => {
    let best: { delta: number; line: number } | null = null;
    for (const edge of [0, len / 2, len]) for (const l of lines) { const d = l - (start + edge); if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, line: l }; }
    return best;
  };
  const bx = fit(box.x, box.w, xs), by = fit(box.y, box.h, ys);
  return { x: Math.round(box.x + (bx?.delta ?? 0)), y: Math.round(box.y + (by?.delta ?? 0)), guides: [...(bx ? [{ axis: "x" as const, pos: bx.line }] : []), ...(by ? [{ axis: "y" as const, pos: by.line }] : [])] };
}

/** Which edges move for a resize handle that may also move the top-left corner (free-positioned elements). */
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** New box after dragging `handle` by (dx, dy), keeping at least 1px size. */
export function resizeBox(box: Box, handle: Handle, dx: number, dy: number): Box {
  let { x, y, w, h } = box;
  if (handle.includes("e")) w = Math.max(1, w + dx);
  if (handle.includes("s")) h = Math.max(1, h + dy);
  if (handle.includes("w")) { const nw = Math.max(1, w - dx); x += w - nw; w = nw; }
  if (handle.includes("n")) { const nh = Math.max(1, h - dy); y += h - nh; h = nh; }
  return { x, y, w, h };
}
