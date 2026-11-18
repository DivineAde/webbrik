"use client";
import { Section } from "./style-controls";
import { freeOffsets, freePositionOps, releaseOps } from "./position";
import { useEditor } from "./store";

/** Free positioning controls: switch an element between normal flow and absolute placement, and type exact offsets/size. */
export function PositionSection({ id }: { id: string }) {
  const doc = useEditor((s) => s.doc);
  const bp = useEditor((s) => s.breakpoint);
  const m = useEditor((s) => s.measured);
  const commit = useEditor((s) => s.commit);
  const node = doc.nodes[id];
  if (!node || !node.parentId) return null; // the page root can't be positioned
  const order = doc.breakpoints.map((b) => b.id);
  const free = freeOffsets(node, order, bp);
  const ready = m && m.id === id;

  const make = () => {
    if (!m || m.id !== id) return;
    commit("Free position", freePositionOps({ id, parentId: node.parentId!, breakpoint: bp, rect: m.rect, parentRect: m.parent, parentBorder: m.pb, parentPosition: m.ppos }));
  };
  const set = (k: "left" | "top" | "width" | "height", v: string) => {
    const n = Number(v); if (!Number.isFinite(n) || v.trim() === "") return;
    commit(`Set ${k}`, [{ type: "setStyle", id, breakpoint: bp, declarations: { [k]: `${Math.round(n)}px` } }]);
  };
  const box = ready ? m.rect : null;
  return (
    <Section title="Position" id="free-pos">
      <div role="group" aria-label="Positioning mode" className="flex h-8 items-center gap-0.5 rounded-md bg-muted p-0.5">
        <button type="button" aria-pressed={!free} disabled={!free} onClick={() => commit("Back to flow", releaseOps(id, bp))} className={`h-full flex-1 rounded px-2 text-xs font-medium transition-colors disabled:cursor-default ${!free ? "bg-background text-foreground shadow-[var(--shadow-sm)]" : "text-muted-foreground hover:text-foreground"}`}>Flow</button>
        <button type="button" aria-pressed={!!free} disabled={!!free || !ready} onClick={make} title={ready ? "Take out of the flow and place by coordinates" : "Select the element on the canvas first"} className={`h-full flex-1 rounded px-2 text-xs font-medium transition-colors disabled:cursor-default ${free ? "bg-background text-foreground shadow-[var(--shadow-sm)]" : "text-muted-foreground hover:text-foreground disabled:opacity-50"}`}>Free</button>
      </div>
      {free && box && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-2.5 text-xs">
          {([["Left", "X", free.left, "left"], ["Top", "Y", free.top, "top"], ["Width", "W", Math.round(box.w), "width"], ["Height", "H", Math.round(box.h), "height"]] as const).map(([name, short, v, k]) => (
            <label key={name} className="relative block">
              <span aria-hidden className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">{short}</span>
              <input aria-label={name} key={`${k}${v}${bp}`} defaultValue={v} onBlur={(e) => set(k, e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className="h-8 w-full rounded-md border border-transparent bg-muted pl-6 pr-2 text-sm tabular-nums outline-none hover:bg-accent focus-visible:border-ring focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/30" />
            </label>
          ))}
        </div>
      )}
      {free && <p className="text-xs text-muted-foreground">Offsets apply at {bp === "base" ? "Desktop" : bp} and narrower. Arrow keys nudge; Shift = 10px.</p>}
    </Section>
  );
}

