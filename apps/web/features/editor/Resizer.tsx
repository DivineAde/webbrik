"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Panel width that survives reloads (per browser; storage failures are ignored). */
export function usePanelWidth(key: string, def: number, min: number, max: number) {
  const [width, setWidth] = useState(def);
  useEffect(() => { try { const v = Number(localStorage.getItem(key)); if (v >= min && v <= max) setWidth(v); } catch { /* storage unavailable */ } }, [key, min, max]);
  const set = useCallback((n: number) => { const v = clamp(Math.round(n), min, max); setWidth(v); try { localStorage.setItem(key, String(v)); } catch { /* ignore */ } }, [key, min, max]);
  return [width, set] as const;
}

/**
 * Draggable, keyboard-operable divider between a side panel and the canvas.
 * `side="left"` sits on the right edge of the left panel; `side="right"` on the left edge of the right panel.
 */
export function PanelSeparator({ label, width, min, max, def, side, onChange }: { label: string; width: number; min: number; max: number; def: number; side: "left" | "right"; onChange: (w: number) => void }) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const [active, setActive] = useState(false);
  const dir = side === "left" ? 1 : -1;
  return (
    <div
      role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={width} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
      title="Drag to resize · double-click to reset"
      className={`absolute inset-y-0 ${side === "left" ? "-right-0.5" : "-left-0.5"} z-10 w-1 shrink-0 after:absolute after:inset-y-0 after:-left-1.5 after:-right-1.5 after:content-[''] cursor-col-resize touch-none bg-border outline-none transition-colors hover:bg-ring/60 focus-visible:bg-ring ${active ? "bg-ring" : ""}`}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, w: width }; setActive(true); }}
      onPointerMove={(e) => { if (drag.current) onChange(drag.current.w + (e.clientX - drag.current.x) * dir); }}
      onPointerUp={() => { drag.current = null; setActive(false); }}
      onPointerCancel={() => { drag.current = null; setActive(false); }}
      onDoubleClick={() => onChange(def)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        const grow = (side === "left" ? "ArrowRight" : "ArrowLeft"), shrink = (side === "left" ? "ArrowLeft" : "ArrowRight");
        if (e.key === grow) onChange(width + step); else if (e.key === shrink) onChange(width - step); else if (e.key === "Home") onChange(min); else if (e.key === "End") onChange(max); else return;
        e.preventDefault();
      }}
    />
  );
}
