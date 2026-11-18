import type { Operation } from "@webbrik/document-model";
import type { Box } from "./snap";

export interface PositionContext {
  id: string;
  parentId: string;
  breakpoint: string;
  /** Element and its parent in page coordinates (border boxes), as measured on the canvas. */
  rect: Box;
  parentRect: Box;
  /** The parent's border widths: absolute offsets are measured from its padding box. */
  parentBorder: { l: number; t: number };
  /** Computed `position` of the parent. */
  parentPosition: string;
}

const px = (n: number) => `${Math.round(n)}px`;

/** Where (left, top) an element with this page-coordinate box sits inside its positioned parent. */
export function offsetsIn(rect: Box, parentRect: Box, border: { l: number; t: number }) {
  return { left: rect.x - (parentRect.x + border.l), top: rect.y - (parentRect.y + border.t) };
}

/** Take an element out of the flow, keeping it exactly where it is. The parent becomes the positioning context if it isn't one. */
export function freePositionOps(c: PositionContext): Operation[] {
  const ops: Operation[] = [];
  if (c.parentPosition === "static" || c.parentPosition === "") ops.push({ type: "setStyle", id: c.parentId, breakpoint: "base", declarations: { position: "relative" } });
  const { left, top } = offsetsIn(c.rect, c.parentRect, c.parentBorder);
  ops.push({ type: "setStyle", id: c.id, breakpoint: c.breakpoint, declarations: { position: "absolute", left: px(left), top: px(top), width: px(c.rect.w), height: px(c.rect.h), right: null, bottom: null, margin: "0" } });
  return ops;
}

/** Return to normal flow layout. Size is kept; position offsets are removed. */
export function releaseOps(id: string, breakpoint: string): Operation[] {
  return [{ type: "setStyle", id, breakpoint, declarations: { position: null, left: null, top: null, right: null, bottom: null, margin: null } }];
}

/** Move / resize a free element to a page-coordinate box. */
export function placeOps(c: Pick<PositionContext, "id" | "breakpoint" | "parentRect" | "parentBorder">, box: Box, sizeToo: boolean): Operation[] {
  const { left, top } = offsetsIn(box, c.parentRect, c.parentBorder);
  return [{ type: "setStyle", id: c.id, breakpoint: c.breakpoint, declarations: { left: px(left), top: px(top), ...(sizeToo ? { width: px(box.w), height: px(box.h) } : {}) } }];
}

const num = (v: string | undefined) => { const m = v && /^(-?\d+(?:\.\d+)?)px$/.exec(v.trim()); return m ? Number(m[1]) : undefined; };

/**
 * The element's own left/top at `breakpoint` if it is free-positioned there (position: absolute, set on this
 * breakpoint or inherited from a wider one), else null. Wider breakpoints apply first; smaller ones override.
 */
export function freeOffsets(node: { styles: { breakpoint: string; state?: string; declarations: Record<string, string> }[] }, order: string[], breakpoint: string): { left: number; top: number } | null {
  const applicable = order.slice(0, Math.max(0, order.indexOf(breakpoint)) + 1);
  const merged: Record<string, string> = {};
  for (const bp of applicable) for (const b of node.styles) if (b.breakpoint === bp && !b.state) Object.assign(merged, b.declarations);
  if (merged["position"] !== "absolute" && merged["position"] !== "fixed") return null;
  return { left: num(merged["left"]) ?? 0, top: num(merged["top"]) ?? 0 };
}
