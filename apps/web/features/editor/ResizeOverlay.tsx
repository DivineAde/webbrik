"use client";
import { useRef, useState } from "react";
import { placeOps } from "./position";
import { resizeBox, snapMove, snapSize, type Box, type Guide, type Handle } from "./snap";
import { useEditor } from "./store";
import { beginPointerDrag } from "./pointer-drag";
import { isPageRoot } from "./dnd";

export interface Measure { id: string; rect: Box; parent: Box; siblings: Box[]; pos: string; ppos: string; pb: { l: number; t: number } }
type Kind = "e" | "s" | "se";
const FLOW: { kind: Kind; label: string; at: (r: Box) => { x: number; y: number }; cursor: string }[] = [
  { kind: "e", label: "Resize width", at: (r) => ({ x: r.x + r.w, y: r.y + r.h / 2 }), cursor: "ew-resize" },
  { kind: "s", label: "Resize height", at: (r) => ({ x: r.x + r.w / 2, y: r.y + r.h }), cursor: "ns-resize" },
  { kind: "se", label: "Resize width and height", at: (r) => ({ x: r.x + r.w, y: r.y + r.h }), cursor: "nwse-resize" },
];
const FREE: { kind: Handle; label: string; at: (r: Box) => { x: number; y: number }; cursor: string }[] = [
  { kind: "nw", label: "Resize from top left", at: (r) => ({ x: r.x, y: r.y }), cursor: "nwse-resize" },
  { kind: "n", label: "Resize from top", at: (r) => ({ x: r.x + r.w / 2, y: r.y }), cursor: "ns-resize" },
  { kind: "ne", label: "Resize from top right", at: (r) => ({ x: r.x + r.w, y: r.y }), cursor: "nesw-resize" },
  { kind: "e", label: "Resize width", at: (r) => ({ x: r.x + r.w, y: r.y + r.h / 2 }), cursor: "ew-resize" },
  { kind: "se", label: "Resize width and height", at: (r) => ({ x: r.x + r.w, y: r.y + r.h }), cursor: "nwse-resize" },
  { kind: "s", label: "Resize height", at: (r) => ({ x: r.x + r.w / 2, y: r.y + r.h }), cursor: "ns-resize" },
  { kind: "sw", label: "Resize from bottom left", at: (r) => ({ x: r.x, y: r.y + r.h }), cursor: "nesw-resize" },
  { kind: "w", label: "Resize from left", at: (r) => ({ x: r.x, y: r.y + r.h / 2 }), cursor: "ew-resize" },
];

/**
 * Handles for the selected element, drawn over the canvas in page coordinates (the wrapper is already scaled by zoom).
 * Flow elements: only the right/bottom edges drag (layout decides position). Free (absolutely positioned) elements:
 * all eight handles plus a move handle (or the arrow keys). Everything snaps to siblings, the parent and user guides.
 */
export function ResizeOverlay({ m, zoom, post, parentId }: { m: Measure; zoom: number; post: (msg: Record<string, unknown>) => void; parentId: string }) {
  const breakpoint = useEditor((s) => s.breakpoint);
  const userGuides = useEditor((s) => s.guides[s.breakpoint]) ?? [];
  const lines = { x: userGuides.filter((g) => g.axis === "x").map((g) => g.pos), y: userGuides.filter((g) => g.axis === "y").map((g) => g.pos) };
  const free = m.pos === "absolute";
  const drag = useRef<{ kind: Handle | "move"; x: number; y: number; box: Box } | null>(null);
  const [live, setLive] = useState<{ label: string; guides: Guide[] } | null>(null);
  const ctx = { id: m.id, breakpoint, parentRect: m.parent, parentBorder: m.pb };

  // ---- flow elements
  const commitFlow = (w: number | null, h: number | null) => {
    const declarations: Record<string, string | null> = {};
    if (w !== null) declarations["width"] = `${w}px`;
    if (h !== null) declarations["height"] = `${h}px`;
    useEditor.getState().commit("Resize", [{ type: "setStyle", id: m.id, breakpoint, declarations }]);
  };
  const computeFlow = (kind: Kind, dx: number, dy: number, w0: number, h0: number) => {
    const sw = kind !== "s" ? snapSize("w", w0 + dx, m.rect, m.parent, m.siblings, undefined, lines.x) : null;
    const sh = kind !== "e" ? snapSize("h", h0 + dy, m.rect, m.parent, m.siblings, undefined, lines.y) : null;
    return { w: sw?.size ?? null, h: sh?.size ?? null, guides: [...(sw?.guides ?? []), ...(sh?.guides ?? [])] };
  };

  // ---- free elements
  const computeFree = (kind: Handle | "move", box0: Box, dx: number, dy: number): { box: Box; guides: Guide[] } => {
    if (kind === "move") {
      const s = snapMove({ ...box0, x: box0.x + dx, y: box0.y + dy }, m.parent, m.siblings, lines);
      return { box: { ...box0, x: s.x, y: s.y }, guides: s.guides };
    }
    const raw = resizeBox(box0, kind, dx, dy);
    // Snap the edges that moved.
    const guides: Guide[] = []; let { x, y, w, h } = raw;
    if (kind.includes("e")) { const s = snapSize("w", w, { ...raw }, m.parent, m.siblings, undefined, lines.x); w = s.size; guides.push(...s.guides); }
    if (kind.includes("s")) { const s = snapSize("h", h, { ...raw }, m.parent, m.siblings, undefined, lines.y); h = s.size; guides.push(...s.guides); }
    if (kind.includes("w")) { const s = snapMove({ ...raw, w: 0 }, m.parent, m.siblings, lines); if (s.guides.some((g) => g.axis === "x")) { const right = raw.x + raw.w; x = s.x; w = Math.max(1, right - x); guides.push(...s.guides.filter((g) => g.axis === "x")); } }
    if (kind.includes("n")) { const s = snapMove({ ...raw, h: 0 }, m.parent, m.siblings, lines); if (s.guides.some((g) => g.axis === "y")) { const bottom = raw.y + raw.h; y = s.y; h = Math.max(1, bottom - y); guides.push(...s.guides.filter((g) => g.axis === "y")); } }
    return { box: { x, y, w, h }, guides };
  };
  const commitFree = (box: Box, sizeToo: boolean) => useEditor.getState().commit(sizeToo ? "Resize" : "Move", placeOps(ctx, box, sizeToo));
  const key = (e: React.KeyboardEvent, apply: (dx: number, dy: number) => void) => {
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0, dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
    if (!dx && !dy) return; e.preventDefault(); e.stopPropagation(); apply(dx, dy);
  };

  const start = (e: React.PointerEvent, kind: Handle | "move") => { e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { kind, x: e.clientX, y: e.clientY, box: { ...m.rect } }; };
  const moveFree = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const r = computeFree(d.kind, d.box, (e.clientX - d.x) / zoom, (e.clientY - d.y) / zoom);
    const o = { left: r.box.x - (m.parent.x + m.pb.l), top: r.box.y - (m.parent.y + m.pb.t) };
    setLive({ label: `${Math.round(r.box.w)} × ${Math.round(r.box.h)}  (${Math.round(o.left)}, ${Math.round(o.top)})`, guides: r.guides });
    post({ type: "preview-box", id: m.id, ...o, width: d.kind === "move" ? null : r.box.w, height: d.kind === "move" ? null : r.box.h });
  };
  const endFree = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null; if (!d) return;
    const r = computeFree(d.kind, d.box, (e.clientX - d.x) / zoom, (e.clientY - d.y) / zoom);
    setLive(null); post({ type: "clear-box", id: m.id });
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 1) commitFree(r.box, d.kind !== "move");
  };
  const cancel = () => { drag.current = null; setLive(null); post({ type: "clear-box", id: m.id }); post({ type: "clear-size", id: m.id }); };
  const handleCls = "pointer-events-auto absolute touch-none rounded-sm border-2 border-[oklch(0.55_0.2_260)] bg-white focus-visible:ring-2 focus-visible:ring-ring";
  const size = 24 / zoom; // 24px hit area (accessibility target size), with the visible square drawn inside
  const hitCls = "pointer-events-auto absolute flex touch-none items-center justify-center focus-visible:ring-2 focus-visible:ring-ring";
  const dot = <span aria-hidden className="block rounded-sm border-2 border-[oklch(0.55_0.2_260)] bg-white" style={{ width: 10 / zoom, height: 10 / zoom }} />;

  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      {live?.guides.map((g, i) => g.axis === "x"
        ? <div key={i} data-testid="snap-guide" className="absolute top-0 h-full w-px bg-[oklch(0.65_0.25_20)]" style={{ left: g.pos }} />
        : <div key={i} data-testid="snap-guide" className="absolute left-0 h-px w-full bg-[oklch(0.65_0.25_20)]" style={{ top: g.pos }} />)}
      {live && <div role="status" className="absolute rounded bg-foreground px-1.5 py-0.5 text-xs tabular-nums text-background" style={{ left: m.rect.x + m.rect.w + 8, top: m.rect.y + m.rect.h + 8, transform: `scale(${1 / zoom})`, transformOrigin: "top left", whiteSpace: "nowrap" }}>{live.label}</div>}
      {free ? (
        <>
          <button type="button" aria-label="Move element" data-handle="move" title="Drag to move; arrow keys nudge (Shift = 10px)"
            className={`${handleCls} flex items-center justify-center text-[8px] leading-none`} style={{ left: m.rect.x + m.rect.w / 2, top: m.rect.y - 14 / zoom, width: 16 / zoom, height: 12 / zoom, transform: "translate(-50%,-50%)", cursor: "move" }}
            onPointerDown={(e) => start(e, "move")} onPointerMove={moveFree} onPointerUp={endFree} onPointerCancel={cancel}
            onKeyDown={(e) => key(e, (dx, dy) => commitFree({ ...m.rect, x: m.rect.x + dx, y: m.rect.y + dy }, false))}>⠿</button>
          {FREE.map((hd) => {
            const p = hd.at(m.rect);
            return <button key={hd.kind} type="button" aria-label={hd.label} data-handle={hd.kind} className={hitCls}
              style={{ left: p.x, top: p.y, width: size, height: size, transform: "translate(-50%,-50%)", cursor: hd.cursor }}
              onPointerDown={(e) => start(e, hd.kind)} onPointerMove={moveFree} onPointerUp={endFree} onPointerCancel={cancel}
              onKeyDown={(e) => key(e, (dx, dy) => commitFree(resizeBox(m.rect, hd.kind, dx, dy), true))}>{dot}</button>;
          })}
        </>
      ) : FLOW.map((hd) => {
        const p = hd.at(m.rect);
        return (
          <button key={hd.kind} type="button" aria-label={hd.label} data-handle={hd.kind} className={hitCls}
            style={{ left: p.x, top: p.y, width: size, height: size, transform: "translate(-50%,-50%)", cursor: hd.cursor }}
            onPointerDown={(e) => { e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { kind: hd.kind, x: e.clientX, y: e.clientY, box: { ...m.rect } }; }}
            onPointerMove={(e) => {
              const d = drag.current; if (!d) return;
              const r = computeFlow(d.kind as Kind, (e.clientX - d.x) / zoom, (e.clientY - d.y) / zoom, d.box.w, d.box.h);
              setLive({ label: `${r.w ?? Math.round(d.box.w)} × ${r.h ?? Math.round(d.box.h)}`, guides: r.guides });
              post({ type: "preview-size", id: m.id, width: r.w, height: r.h });
            }}
            onPointerUp={(e) => {
              const d = drag.current; drag.current = null; if (!d) return;
              const r = computeFlow(d.kind as Kind, (e.clientX - d.x) / zoom, (e.clientY - d.y) / zoom, d.box.w, d.box.h);
              setLive(null); post({ type: "clear-size", id: m.id });
              if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 1) commitFlow(r.w, r.h);
            }}
            onPointerCancel={cancel}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 10 : 1;
              const dw = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
              const dh = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
              if (!dw && !dh) return;
              e.preventDefault();
              if (hd.kind === "e" && dw) commitFlow(Math.max(1, Math.round(m.rect.w + dw)), null);
              else if (hd.kind === "s" && dh) commitFlow(null, Math.max(1, Math.round(m.rect.h + dh)));
              else if (hd.kind === "se") commitFlow(dw ? Math.max(1, Math.round(m.rect.w + dw)) : null, dh ? Math.max(1, Math.round(m.rect.h + dh)) : null);
            }}
          >{dot}</button>
        );
      })}
      {!free && <ReorderGrip m={m} zoom={zoom} />}
      <span className="sr-only" data-parent={parentId} />
    </div>
  );
}

/** A grip on the selected element: press and drag it to a new place on the canvas or in the layers panel. */
function ReorderGrip({ m, zoom }: { m: Measure; zoom: number }) {
  const node = useEditor((s) => s.doc.nodes[m.id]);
  const isRoot = useEditor((s) => isPageRoot(s.doc, m.id));
  if (!node || node.locked || isRoot) return null;
  const label = node.name ?? node.tag;
  const w = 28 / zoom, h = 20 / zoom, inside = m.rect.y < h + 4 / zoom;
  return (
    <button type="button" data-handle="reorder" aria-label={`Drag to reorder ${label}`} title="Drag to reorder. Alt+↑ or Alt+↓ moves it by keyboard"
      className="pointer-events-auto absolute flex touch-none items-center justify-center rounded-md bg-[oklch(0.55_0.2_260)] text-white shadow-sm hover:bg-[oklch(0.5_0.2_260)] focus-visible:ring-2 focus-visible:ring-ring"
      style={{ left: m.rect.x, top: inside ? m.rect.y + 4 / zoom : m.rect.y - h - 2 / zoom, width: w, height: h, cursor: "grab" }}
      onPointerDown={(e) => { e.stopPropagation(); beginPointerDrag(e, { kind: "move", ids: [m.id] }, label); }}
      onKeyDown={(e) => { if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); e.stopPropagation(); useEditor.getState().nudgeSelected(e.key === "ArrowUp" ? -1 : 1); } }}>
      <svg aria-hidden viewBox="0 0 16 16" style={{ width: 12 / zoom, height: 12 / zoom }} fill="currentColor"><circle cx="5" cy="3" r="1.5" /><circle cx="11" cy="3" r="1.5" /><circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" /><circle cx="5" cy="13" r="1.5" /><circle cx="11" cy="13" r="1.5" /></svg>
    </button>
  );
}
