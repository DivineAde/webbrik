"use client";
/**
 * Smooth reorders. Before a change that moves elements, the canvas reports where everything is; once the new page has
 * loaded, the canvas slides each element from its old place to its new one (a FLIP animation), so moving a section up
 * or down looks like movement rather than a redraw.
 */
export type Rects = Record<string, { x: number; y: number }>;
let snapshot: (() => Promise<Rects | null>) | null = null;
let pending: Rects | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export const registerSnapshot = (fn: () => Promise<Rects | null>) => { snapshot = fn; return () => { if (snapshot === fn) snapshot = null; }; };

/** Run `change` after taking a snapshot of the canvas. */
export function withFlip(change: () => void) {
  if (!snapshot) { change(); return; }
  void snapshot().then((r) => {
    pending = r;
    clearTimeout(timer); timer = setTimeout(() => { pending = null; }, 1500);
    change();
  });
}
export function takeFlip(): Rects | null { const r = pending; pending = null; return r; }
