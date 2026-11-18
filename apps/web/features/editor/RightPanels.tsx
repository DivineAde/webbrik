"use client";
import { useState } from "react";
import { analyze, summarize } from "@webbrik/quality";
import { createId } from "@webbrik/document-model";
import { Button } from "@/components/ui/button";
import { useEditor } from "./store";
import { AnimationEditor } from "./AnimationEditor";

export function QualityPanel() {
  const doc = useEditor((s) => s.doc);
  const select = useEditor((s) => s.select);
  const setPage = useEditor((s) => s.setPage);
  const findings = analyze(doc);
  const sum = summarize(findings);
  return (
    <div className="h-full overflow-auto p-2">
      <p role="status" className="mb-2 text-xs">{findings.length === 0 ? "No issues found." : `${sum.errors} error${sum.errors === 1 ? "" : "s"}, ${sum.warnings} warning${sum.warnings === 1 ? "" : "s"}, ${sum.info} suggestion${sum.info === 1 ? "" : "s"}`}</p>
      <ul className="space-y-1">
        {findings.map((f, i) => (
          <li key={i}>
            <button className="w-full rounded-md border border-border p-2 text-left hover:bg-accent" onClick={() => { if (f.pageId) setPage(f.pageId); if (f.nodeId) select(f.nodeId); }}>
              <span className="mr-1 text-xs capitalize text-muted-foreground">{f.severity} · {f.category}</span>
              <span className="block">{f.message}</span>
              {f.fix && <span className="block text-xs text-muted-foreground">Fix: {f.fix}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CodePanel() {
  const css = useEditor((s) => s.doc.customCode.customCss);
  const head = useEditor((s) => s.doc.customCode.headHtml);
  const commit = useEditor((s) => s.commit);
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-2">
      <p className="text-xs text-muted-foreground">Custom CSS is appended after generated styles. Head HTML is published only; it never runs inside the editor canvas.</p>
      {([["Custom CSS", "customCss", css], ["Head HTML (analytics, fonts)", "headHtml", head]] as const).map(([label, field, value]) => (
        <label key={field} className="block text-xs">{label}
          <textarea key={value} spellCheck={false} defaultValue={value} rows={9} className="mt-1 w-full rounded-md border border-border bg-background p-2 font-mono text-xs" onBlur={(e) => e.target.value !== value && commit(`Edit ${label}`, [{ type: "setCustomCode", field, value: e.target.value }])} />
        </label>
      ))}
    </div>
  );
}

const PRESETS = {
  "fade-in": [{ offset: 0, declarations: { opacity: "0" } }, { offset: 1, declarations: { opacity: "1" } }],
  "slide-up": [{ offset: 0, declarations: { opacity: "0", transform: "translateY(16px)" } }, { offset: 1, declarations: { opacity: "1", transform: "translateY(0)" } }],
  "scale-in": [{ offset: 0, declarations: { opacity: "0", transform: "scale(0.96)" } }, { offset: 1, declarations: { opacity: "1", transform: "scale(1)" } }],
} as const;

export function AnimatePanel() {
  const doc = useEditor((s) => s.doc);
  const sel = useEditor((s) => s.selectedId);
  const commit = useEditor((s) => s.commit);
  const anims = Object.values(doc.animations);
  const node = sel ? doc.nodes[sel] : undefined;
  const apply = (name: string) => {
    let cls = Object.values(doc.classes).find((c) => c.name === `anim-${name}`);
    const ops = [];
    if (!cls) { cls = { id: createId("cls"), name: `anim-${name}`, blocks: [] }; ops.push({ type: "upsertClass" as const, cls }); }
    if (sel && !node?.classIds.includes(cls.id)) ops.push({ type: "addClass" as const, id: sel, classId: cls.id });
    if (ops.length) commit(`Apply ${name}`, ops);
  };
  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-2">
      <p className="text-xs text-muted-foreground">Animations respect “reduce motion” automatically.</p>
      <div className="flex flex-wrap gap-1">
        {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((n) => (
          <Button key={n} size="sm" variant="secondary" disabled={anims.some((a) => a.name === n)} onClick={() => commit(`Add ${n}`, [{ type: "upsertAnimation", animation: { id: createId("a"), name: n, keyframes: [...PRESETS[n]].map((k) => ({ offset: k.offset, declarations: { ...k.declarations } })), duration: 400, delay: 0, easing: "ease-out", iterations: 1, direction: "normal", fill: "both" } }])}>+ {n}</Button>
        ))}
      </div>
      {anims.map((a) => (
        <div key={a.id} className="rounded-md border border-border p-2">
          <div className="flex items-center justify-between"><span className="font-medium">{a.name}</span>
            <span className="flex gap-1"><Button size="sm" variant="secondary" disabled={!sel} onClick={() => apply(a.name)}>Apply</Button><Button size="sm" variant="ghost" onClick={() => commit(`Remove ${a.name}`, [{ type: "removeAnimation", id: a.id }])}>Remove</Button></span></div>
          <AnimationEditor a={a} />
        </div>
      ))}
    </div>
  );
}

export function HistoryPanel() {
  const doc = useEditor((s) => s);
  return (
    <div className="space-y-2 p-2">
      <p className="text-xs text-muted-foreground">{doc.canUndo ? `Next undo${doc.undoLabel ? `: ${doc.undoLabel}` : ""}` : "Nothing to undo."}</p>
      <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={!doc.canUndo} onClick={doc.undo}>Undo</Button><Button size="sm" variant="secondary" disabled={!doc.canRedo} onClick={doc.redo}>Redo</Button></div>
      <p className="text-xs text-muted-foreground">Server-side version history, compare and restore are available through the API for synced projects.</p>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [["⌘/Ctrl K", "Command palette"], ["⌘/Ctrl Z", "Undo"], ["⇧⌘/Ctrl Z", "Redo"], ["⌘/Ctrl D", "Duplicate"], ["Delete", "Delete selection"], ["Esc", "Clear selection"], ["AI tab", "Describe a change, review it, then accept or reject"], ["Shift/⌘ click", "Multi-select"], ["Alt ↑/↓", "Move among siblings"], ["Alt →/←", "Indent into previous sibling / outdent"], ["Arrow keys", "Nudge a free-positioned element (Shift = 10px)"], ["Rulers button", "Show rulers; drag from a ruler to add a guide"], ["Double-click", "Edit text on canvas"], ["Drag", "Reorder layers; drop elements or templates on layers or the canvas"]];
export function HelpPanel() {
  return (
    <div className="space-y-3 overflow-auto p-2">
      <p className="text-xs"><a className="underline" href="/help" target="_blank" rel="noreferrer">Open the full help center ↗</a> <span className="text-muted-foreground">(guides for layout, CMS, forms, publishing and billing)</span></p>
      <section><h3 className="mb-1 text-xs font-medium">Getting started</h3>
        <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground"><li>Open Templates and insert a Hero or Navigation bar.</li><li>Select anything to edit its styles. Switch breakpoints at the top to adjust for tablet and mobile.</li><li>Define colours under Tokens, and reuse them as <code>var(--color-primary)</code>.</li><li>Check Quality before exporting.</li></ol></section>
      <section><h3 className="mb-1 text-xs font-medium">Keyboard shortcuts</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">{SHORTCUTS.map(([k, v]) => (<div key={k} className="contents"><dt><kbd className="rounded border border-border px-1">{k}</kbd></dt><dd className="text-muted-foreground">{v}</dd></div>))}</dl></section>
    </div>
  );
}

