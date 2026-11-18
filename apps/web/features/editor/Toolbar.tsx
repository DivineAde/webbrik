"use client";
import { useRouter } from "next/navigation";
import { Columns3, Minus, Monitor, Play, Plus, Redo2, Ruler, Search, Smartphone, Square, Tablet, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { downloadExport } from "./export";
import { EditorMenu, MOD } from "./EditorMenu";
import { useEditor } from "./store";

const STATUS = { saved: "Saved", saving: "Saving…", unsaved: "Unsaved changes", error: "Save failed", offline: "Offline — will sync", conflict: "Edit conflicted" } as const;
const DOT = { saved: "bg-[oklch(0.7_0.17_150)]", saving: "bg-[oklch(0.8_0.16_85)] animate-pulse", unsaved: "bg-[oklch(0.8_0.16_85)]", error: "bg-destructive", offline: "bg-muted-foreground", conflict: "bg-destructive" } as const;

const bpIcon = (label: string) => { const l = label.toLowerCase(); return l.includes("mob") ? Smartphone : l.includes("tab") ? Tablet : l.includes("desk") || l.includes("base") ? Monitor : Square; };

function IconButton({ label, shortcut, pressed, disabled, onClick, children }: { label: string; shortcut?: string; pressed?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip label={shortcut ? `${label} (${shortcut})` : label} side="bottom">
      <button type="button" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}
        className={cn("flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-[18px]", pressed && "bg-accent text-foreground")}>
        {children}
      </button>
    </Tooltip>
  );
}

export function Toolbar() {
  const router = useRouter();
  const s = useEditor();
  const pct = Math.round(s.zoom * 100);
  return (
    <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border bg-background px-3">
      <h1 className="sr-only">Webbrik editor</h1>
      <div className="flex min-w-0 items-center gap-2">
        <EditorMenu />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold" title={s.doc.name}>{s.doc.name}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className={cn("size-1.5 rounded-full", DOT[s.saveStatus])} />
            <span role="status" className={cn(s.saveStatus === "error" && "text-destructive")}>{STATUS[s.saveStatus]}</span>
            {s.remote && <span data-testid="live-indicator" className="ml-1.5" title={s.live ? "Changes from collaborators arrive instantly" : "Checking for collaborator changes every few seconds"}>{s.live ? "● Live" : "○ Polling"}</span>}
          </div>
        </div>
        {s.statusMessage && <span className="hidden max-w-64 truncate text-xs text-muted-foreground xl:block" title={s.statusMessage}>{s.statusMessage}</span>}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-lg bg-muted p-1" role="tablist" aria-label="Breakpoint">
          {s.doc.breakpoints.map((b) => { const Icon = bpIcon(b.label); return (
            <button key={b.id} role="tab" aria-selected={s.breakpoint === b.id} onClick={() => s.setBreakpoint(b.id)}
              className={cn("flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring", s.breakpoint === b.id ? "bg-background font-medium shadow-[var(--shadow-sm)]" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="size-4" aria-hidden />{b.label}
            </button>
          ); })}
        </div>
        <div className="hidden items-center rounded-lg border border-border md:flex" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" onClick={() => s.setZoom(s.zoom - 0.1)} className="flex size-8 items-center justify-center rounded-l-lg text-muted-foreground hover:bg-accent hover:text-foreground"><Minus className="size-4" /></button>
          <button type="button" aria-label={`Fit page to window, ${pct}%`} title={s.zoomManual ? "Click to fit the page to the window" : "Fitted to the window"} onClick={() => s.setZoom(1, false)} className="w-14 text-center text-sm tabular-nums hover:bg-accent" style={{ height: 32 }}>{pct}%</button>
          <button type="button" aria-label="Zoom in" onClick={() => s.setZoom(s.zoom + 0.1)} className="flex size-8 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-accent hover:text-foreground"><Plus className="size-4" /></button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-0.5">
        <IconButton label="Undo" shortcut={`${MOD}Z`} disabled={!s.canUndo} onClick={s.undo}><Undo2 /></IconButton>
        <IconButton label="Redo" shortcut={`⇧${MOD}Z`} disabled={!s.canRedo} onClick={s.redo}><Redo2 /></IconButton>
        <span className="mx-1.5 h-5 w-px bg-border" aria-hidden />
        <IconButton label="Rulers" pressed={s.showRulers} onClick={() => s.setRulers(!s.showRulers)}><Ruler /></IconButton>
        <IconButton label="Compare" pressed={s.compare} onClick={() => s.setCompare(!s.compare)}><Columns3 /></IconButton>
        <IconButton label="Search commands" shortcut={`${MOD}K`} onClick={() => s.setPalette(true)}><Search /></IconButton>
        <span className="mx-1.5 h-5 w-px bg-border" aria-hidden />
        <Button variant="secondary" aria-pressed={s.preview} onClick={() => s.setPreview(!s.preview)} className="px-3"><Play className="size-4" />{s.preview ? "Edit" : "Preview"}</Button>
        {s.remote
          ? <Button className="ml-1.5" onClick={() => router.push(`/projects/${s.remote!.projectId}?tab=Publish`)}>Publish</Button>
          : <Button className="ml-1.5" onClick={() => downloadExport(s.doc)}>Export</Button>}
      </div>
    </header>
  );
}
