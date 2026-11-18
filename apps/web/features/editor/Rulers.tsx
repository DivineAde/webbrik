"use client";
import { useEffect, useRef } from "react";
import { useEditor } from "./store";

const T = 18; // ruler thickness (page px at zoom 1; drawn inside the scaled wrapper)

/**
 * Rulers + user guides, drawn inside the zoom-scaled canvas wrapper so positions are page pixels.
 * Drag from a ruler to create a guide; drag a guide to move it (drop it back on a ruler to delete);
 * focus a guide and use arrow keys (Shift = 10px) or Delete. Guides are editor-only and persisted per project in localStorage.
 */
export function Rulers({ width, height, zoom }: { width: number; height: number; zoom: number }) {
  const guides = useEditor((s) => s.guides[s.breakpoint]) ?? [];
  const { addGuide, moveGuide, removeGuide } = useEditor.getState();
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; axis: "x" | "y" } | null>(null);
  const projectId = useEditor((s) => s.remote?.projectId);
  const all = useEditor((s) => s.guides);
  const key = `webbrik.guides.${projectId ?? "local"}`;

  useEffect(() => { try { const raw = localStorage.getItem(key); if (raw) useEditor.getState().setGuides(JSON.parse(raw)); } catch { /* storage unavailable */ } }, [key]);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(all)); } catch { /* storage unavailable */ } }, [all, key]);

  const toPage = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };
  const begin = (e: React.PointerEvent, axis: "x" | "y") => {
    e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = toPage(e); drag.current = { id: addGuide(axis, axis === "x" ? p.x : p.y), axis };
  };
  const grab = (e: React.PointerEvent, id: string, axis: "x" | "y") => { e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { id, axis }; };
  const move = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const p = toPage(e); moveGuide(d.id, d.axis === "x" ? p.x : p.y); };
  const end = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null; if (!d) return;
    const p = toPage(e); const v = d.axis === "x" ? p.x : p.y;
    if (v < 0 || v > (d.axis === "x" ? width : height + 4000)) removeGuide(d.id); // dropped back onto the ruler
  };

  const ticks = (len: number) => Array.from({ length: Math.floor(len / 100) + 1 }, (_, i) => i * 100);
  return (
    <div ref={wrap} className="pointer-events-none absolute inset-0" data-testid="rulers">
      <div role="presentation" data-ruler="x" className="pointer-events-auto absolute left-0 cursor-row-resize select-none border-b border-border bg-muted text-[9px] text-muted-foreground" style={{ top: -T, height: T, width }}
        onPointerDown={(e) => begin(e, "y")} onPointerMove={move} onPointerUp={end} title="Drag down to add a horizontal guide">
        {ticks(width).map((x) => <span key={x} className="absolute top-0 h-full border-l border-border pl-0.5" style={{ left: x }}>{x}</span>)}
      </div>
      <div role="presentation" data-ruler="y" className="pointer-events-auto absolute top-0 cursor-col-resize select-none border-r border-border bg-muted text-[9px] text-muted-foreground" style={{ left: -T, width: T, height }}
        onPointerDown={(e) => begin(e, "x")} onPointerMove={move} onPointerUp={end} title="Drag right to add a vertical guide">
        {ticks(height).map((y) => <span key={y} className="absolute left-0 w-full border-t border-border" style={{ top: y }}>{y}</span>)}
      </div>
      {guides.map((g) => (
        <div key={g.id} role="slider" tabIndex={0} aria-label={`${g.axis === "x" ? "Vertical" : "Horizontal"} guide`} aria-orientation={g.axis === "x" ? "vertical" : "horizontal"} aria-valuenow={g.pos} aria-valuemin={0} aria-valuemax={g.axis === "x" ? width : 10000}
          data-guide={g.axis} data-pos={g.pos}
          className="pointer-events-auto absolute bg-[oklch(0.65_0.2_230)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          style={g.axis === "x" ? { left: g.pos, top: 0, width: 1, height, cursor: "col-resize", padding: "0 3px", margin: "0 -3px", backgroundClip: "content-box" } : { top: g.pos, left: 0, height: 1, width, cursor: "row-resize", padding: "3px 0", margin: "-3px 0", backgroundClip: "content-box" }}
          onPointerDown={(e) => grab(e, g.id, g.axis)} onPointerMove={move} onPointerUp={end}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 10 : 1;
            if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); removeGuide(g.id); return; }
            const d = g.axis === "x" ? (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0) : (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0);
            if (d) { e.preventDefault(); e.stopPropagation(); moveGuide(g.id, g.pos + d); }
          }} />
      ))}
    </div>
  );
}
