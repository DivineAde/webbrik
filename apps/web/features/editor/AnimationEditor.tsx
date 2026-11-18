"use client";
import { useEffect, useRef, useState } from "react";
import type { Animation } from "@webbrik/document-model";
import { Button } from "@/components/ui/button";
import { useEditor } from "./store";

const parse = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of text.split(/[;\n]/)) { const i = line.indexOf(":"); if (i > 0) { const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim(); if (k && v && /^[a-z-]+$/.test(k)) out[k] = v; } }
  return out;
};
const show = (d: Record<string, string>) => Object.entries(d).map(([k, v]) => `${k}: ${v}`).join("\n");
const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const EASINGS = ["linear", "ease", "ease-in", "ease-out", "ease-in-out", "cubic-bezier(0.2,0.8,0.2,1)"];

/** Timeline editor for one animation: a track with draggable-by-number keyframe stops, per-stop declarations, timing, and live preview. */
export function AnimationEditor({ a }: { a: Animation }) {
  const commit = useEditor((s) => s.commit);
  const box = useRef<HTMLDivElement>(null);
  const run = useRef<globalThis.Animation | null>(null);
  const [sel, setSel] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stops = a.keyframes;
  const save = (label: string, patch: Partial<Animation>) => commit(label, [{ type: "upsertAnimation", animation: { ...a, ...patch } }]);
  const setStop = (i: number, next: { offset?: number; declarations?: Record<string, string> }) => {
    const k = stops.map((s, j) => (j === i ? { ...s, ...next } : s));
    save("Edit keyframe", { keyframes: [...k].sort((x, y) => x.offset - y.offset) });
  };
  const play = () => {
    const el = box.current; if (!el) return;
    run.current?.cancel();
    const frames = stops.map((k) => Object.fromEntries([["offset", k.offset], ...Object.entries(k.declarations).map(([p, v]) => [camel(p), v])]));
    const anim = el.animate(frames as Keyframe[], { duration: a.duration, delay: a.delay, easing: a.easing, iterations: a.iterations === "infinite" ? Infinity : a.iterations, direction: a.direction, fill: a.fill });
    run.current = anim; setPlaying(true);
    anim.onfinish = () => setPlaying(false); anim.oncancel = () => setPlaying(false);
  };
  useEffect(() => () => run.current?.cancel(), []);
  const cur = stops[Math.min(sel, stops.length - 1)];

  return (
    <div className="mt-2 space-y-2" data-testid={`anim-${a.name}`}>
      <div className="relative h-6 rounded bg-muted" role="group" aria-label="Keyframe timeline">
        {stops.map((k, i) => (
          <button key={i} type="button" aria-label={`Keyframe at ${Math.round(k.offset * 100)}%`} aria-pressed={sel === i}
            className={`absolute top-1 h-4 w-4 -translate-x-1/2 rotate-45 rounded-[2px] border ${sel === i ? "border-primary bg-primary" : "border-border bg-background"}`}
            style={{ left: `${k.offset * 100}%` }} onClick={() => setSel(i)} />
        ))}
      </div>
      {cur && (
        <div className="space-y-1.5 rounded-md border border-border p-2">
          <label className="flex items-center gap-2 text-xs">Offset %
            <input type="number" min={0} max={100} step={1} key={`o${sel}${cur.offset}`} defaultValue={Math.round(cur.offset * 100)} className="h-8 w-20 rounded-md border border-border bg-background px-2"
              onBlur={(e) => { const v = Number(e.target.value); if (v >= 0 && v <= 100 && v / 100 !== cur.offset) { setStop(sel, { offset: v / 100 }); } }} />
            <Button size="sm" variant="ghost" disabled={stops.length <= 2} onClick={() => { save("Remove keyframe", { keyframes: stops.filter((_, j) => j !== sel) }); setSel(0); }}>Remove stop</Button>
          </label>
          <label className="block text-xs text-muted-foreground">Styles at this stop (property: value)
            <textarea key={`d${sel}${show(cur.declarations)}`} rows={3} spellCheck={false} defaultValue={show(cur.declarations)} className="mt-1 w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
              onBlur={(e) => { const d = parse(e.target.value); if (show(d) !== show(cur.declarations)) setStop(sel, { declarations: d }); }} />
          </label>
        </div>
      )}
      <Button size="sm" variant="secondary" onClick={() => { const mid = stops.length >= 2 ? (stops[0]!.offset + stops[1]!.offset) / 2 : 0.5; save("Add keyframe", { keyframes: [...stops, { offset: mid, declarations: {} }].sort((x, y) => x.offset - y.offset) }); }}>+ Keyframe</Button>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <label>Duration (ms)<input type="number" min={50} max={10000} step={50} key={a.duration} defaultValue={a.duration} className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-foreground" onBlur={(e) => { const d = Number(e.target.value); if (d >= 50 && d <= 10000 && d !== a.duration) save("Change duration", { duration: d }); }} /></label>
        <label>Delay (ms)<input type="number" min={0} max={10000} step={50} key={a.delay} defaultValue={a.delay} className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-foreground" onBlur={(e) => { const d = Number(e.target.value); if (d >= 0 && d <= 10000 && d !== a.delay) save("Change delay", { delay: d }); }} /></label>
        <label>Easing<select value={EASINGS.includes(a.easing) ? a.easing : "ease"} className="mt-1 h-8 w-full rounded-md border border-border bg-background px-1 text-foreground" onChange={(e) => save("Change easing", { easing: e.target.value })}>{EASINGS.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Repeat<select value={String(a.iterations)} className="mt-1 h-8 w-full rounded-md border border-border bg-background px-1 text-foreground" onChange={(e) => save("Change repeat", { iterations: e.target.value === "infinite" ? "infinite" : Number(e.target.value) })}>{["1", "2", "3", "5", "10", "infinite"].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Direction<select value={a.direction} className="mt-1 h-8 w-full rounded-md border border-border bg-background px-1 text-foreground" onChange={(e) => save("Change direction", { direction: e.target.value as Animation["direction"] })}>{["normal", "reverse", "alternate", "alternate-reverse"].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Fill<select value={a.fill} className="mt-1 h-8 w-full rounded-md border border-border bg-background px-1 text-foreground" onChange={(e) => save("Change fill", { fill: e.target.value as Animation["fill"] })}>{["none", "forwards", "backwards", "both"].map((x) => <option key={x}>{x}</option>)}</select></label>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" onClick={play} aria-label={`Preview ${a.name}`}>{playing ? "Playing…" : "▶ Preview"}</Button>
        <div className="flex h-12 flex-1 items-center justify-center overflow-hidden rounded bg-muted"><div ref={box} className="h-6 w-16 rounded bg-primary" aria-hidden /></div>
      </div>
    </div>
  );
}
