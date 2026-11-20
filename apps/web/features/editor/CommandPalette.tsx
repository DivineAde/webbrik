"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { CATALOG } from "./catalog";
import { EXPORT_TARGETS, downloadExport } from "./export";
import { useEditor } from "./store";

interface Cmd { id: string; label: string; run: () => void }


export function CommandPalette() {
  const s = useEditor();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const commands = useMemo<Cmd[]>(() => [
    ...CATALOG.map((c) => ({ id: "add-" + c.label, label: `Add ${c.label}`, run: () => s.insertElement(c.tag, { text: c.text, styles: c.styles }) })),
    ...s.doc.breakpoints.map((b) => ({ id: "bp-" + b.id, label: `Switch breakpoint: ${b.label}`, run: () => s.setBreakpoint(b.id) })),
    ...s.doc.pages.map((p) => ({ id: "page-" + p.id, label: `Go to page: ${p.name}`, run: () => s.setPage(p.id) })),
    { id: "preview", label: s.preview ? "Exit preview" : "Toggle preview", run: () => s.setPreview(!s.preview) },
    { id: "theme", label: "Toggle dark theme", run: () => document.documentElement.classList.toggle("dark") },
    ...EXPORT_TARGETS.map((t) => ({ id: `export-${t.id}`, label: `Export ${t.label}`, run: () => void downloadExport(s.doc, t.id, s.remote?.projectId).catch((e: Error) => alert(e.message)) })),
    { id: "undo", label: "Undo", run: s.undo },
    { id: "redo", label: "Redo", run: s.redo },
  ], [s.doc, s.preview]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())).slice(0, 12);

  useEffect(() => { if (s.paletteOpen) { setQ(""); setIdx(0); } }, [s.paletteOpen]);
  if (!s.paletteOpen) return null;

  const run = (c?: Cmd) => { if (c) { c.run(); s.setPalette(false); } };
  return (
    <div className="fixed inset-0 z-[50] flex items-start justify-center bg-black/30 pt-[15vh]" onMouseDown={() => s.setPalette(false)} role="presentation">
      <div role="dialog" aria-label="Command palette" className="w-[480px] overflow-hidden rounded-xl border border-border bg-background shadow-[var(--shadow-lg)]" onMouseDown={(e) => e.stopPropagation()}>
        <Input ref={input} autoFocus role="combobox" aria-label="Command" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={results[idx] ? `palette-${results[idx]!.id}` : undefined} aria-autocomplete="list" className="h-10 rounded-none border-0 border-b px-3 text-sm" placeholder="Type a command…" value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
            if (e.key === "Enter") run(results[idx]);
            if (e.key === "Escape") s.setPalette(false);
          }} />
        <ul id="palette-list" role="listbox" aria-label="Commands" tabIndex={0} className="max-h-80 overflow-auto p-1">
          {results.map((c, i) => (
            <li key={c.id} id={`palette-${c.id}`} role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => run(c)} className={`cursor-pointer rounded-md px-3 py-2 ${i === idx ? "bg-accent" : ""}`}>{c.label}</li>
          ))}
          {results.length === 0 && <li role="option" aria-disabled="true" aria-selected="false" className="px-3 py-6 text-center text-muted-foreground">No commands found.</li>}
        </ul>
      </div>
    </div>
  );
}
