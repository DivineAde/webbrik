"use client";
import { useEditor } from "./store";
import type { DragPayload, DropPosition } from "./dnd";

/**
 * Pointer-based drag and drop. The browser's built-in drag-and-drop has to cross into a sandboxed iframe, which is
 * unreliable in real browsers. Here a full-screen overlay (so the iframe can't swallow pointer events) follows the
 * pointer, and the editor asks the canvas or the layers panel what is under it.
 */
export interface CanvasDropTarget {
  /** Where the canvas frame is on screen (null when it isn't mounted). */
  rect(): DOMRect | null;
  /** The pointer moved over the canvas at these viewport coordinates. */
  hover(x: number, y: number): void;
  clear(): void;
  /** Resolve the drop position at these viewport coordinates. */
  drop(x: number, y: number): Promise<{ id: string; pos: DropPosition } | null>;
}

let canvasTarget: CanvasDropTarget | null = null;
export const registerCanvasTarget = (t: CanvasDropTarget) => { canvasTarget = t; return () => { if (canvasTarget === t) canvasTarget = null; }; };

let active: DragPayload | null = null;
const listeners = new Set<(on: boolean) => void>();
export const onDragChange = (fn: (on: boolean) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const isDragging = () => active !== null;

const THRESHOLD = 5;

function layerAt(x: number, y: number): { id: string; pos: DropPosition } | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const row = (el as HTMLElement).closest?.("[data-layer-id]") as HTMLElement | null;
    if (!row) continue;
    const r = row.getBoundingClientRect(), f = (y - r.top) / Math.max(r.height, 1);
    return { id: row.dataset["layerId"]!, pos: f < 0.25 ? "before" : f > 0.75 ? "after" : "inside" };
  }
  return null;
}

/**
 * Call from `onPointerDown` of anything draggable. A press that never moves stays an ordinary click.
 * `label` is what the floating chip says while dragging.
 */
export function beginPointerDrag(e: { button: number; clientX: number; clientY: number; pointerId: number }, payload: DragPayload, label: string) {
  if (e.button !== 0 || active) return;
  const sx = e.clientX, sy = e.clientY;
  // Pressing on a tile and moving must not start selecting page text.
  const noSelect = (ev: Event) => ev.preventDefault();
  window.addEventListener("selectstart", noSelect, true);
  let started = false, overlay: HTMLDivElement | null = null, chip: HTMLDivElement | null = null;
  let target: { kind: "canvas" } | { kind: "layer"; id: string; pos: DropPosition } | null = null;
  let seq = 0;

  const start = () => {
    started = true;
    active = payload;
    overlay = document.createElement("div");
    overlay.setAttribute("data-drag-overlay", "");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;cursor:grabbing;user-select:none;touch-action:none";
    chip = document.createElement("div");
    chip.setAttribute("role", "presentation");
    chip.textContent = label;
    chip.style.cssText = "position:fixed;left:0;top:0;z-index:2147483001;pointer-events:none;padding:6px 12px;border-radius:8px;background:oklch(0.145 0 0);color:#fff;font:500 13px/1.2 var(--font-sans,system-ui);box-shadow:0 8px 24px rgba(0,0,0,.28);white-space:nowrap";
    document.body.append(overlay, chip);
    document.documentElement.style.userSelect = "none";
    listeners.forEach((l) => l(true));
  };
  const place = (x: number, y: number) => { if (chip) chip.style.transform = `translate(${x + 14}px, ${y + 14}px)`; };

  const update = (x: number, y: number) => {
    const r = canvasTarget?.rect();
    const overCanvas = !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const st = useEditor.getState();
    if (overCanvas) {
      canvasTarget!.hover(x, y);
      if (st.dropTarget) st.setDropTarget(null);
      target = { kind: "canvas" };
      return;
    }
    canvasTarget?.clear();
    const l = layerAt(x, y);
    if (l) { if (st.dropTarget?.id !== l.id || st.dropTarget.pos !== l.pos) st.setDropTarget(l); target = { kind: "layer", ...l }; }
    else { if (st.dropTarget) st.setDropTarget(null); target = null; }
  };

  const cleanup = () => {
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", cancel, true);
    window.removeEventListener("keydown", key, true);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("selectstart", noSelect, true);
    window.getSelection()?.removeAllRanges();
    overlay?.remove(); chip?.remove();
    document.documentElement.style.userSelect = "";
    if (started) {
      active = null;
      canvasTarget?.clear();
      useEditor.getState().setDropTarget(null);
      listeners.forEach((l) => l(false));
      // The click that follows a drag must not also select or insert.
      const swallow = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, true), 0);
    }
  };
  function move(ev: PointerEvent) {
    if (!started) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < THRESHOLD) return; start(); }
    ev.preventDefault();
    place(ev.clientX, ev.clientY);
    update(ev.clientX, ev.clientY);
  }
  function up(ev: PointerEvent) {
    if (!started) { cleanup(); return; }
    const t = target, my = ++seq;
    const p = payload;
    if (t?.kind === "layer") { useEditor.getState().performDrop(p, t.id, t.pos); cleanup(); return; }
    if (t?.kind === "canvas") {
      const ct = canvasTarget;
      void ct?.drop(ev.clientX, ev.clientY).then((h) => { if (my === seq && h) useEditor.getState().performDrop(p, h.id, h.pos); });
    }
    cleanup();
  }
  function cancel() { cleanup(); }
  function key(ev: KeyboardEvent) { if (ev.key === "Escape") { ev.stopPropagation(); cleanup(); } }

  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
  window.addEventListener("keydown", key, true);
  window.addEventListener("blur", cancel);
}
