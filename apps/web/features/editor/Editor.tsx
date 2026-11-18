"use client";
import { Component, FileText, Layers, LayoutTemplate, MoreHorizontal, PanelLeftClose, Palette, Plus, CircleHelp, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { Canvas } from "./Canvas";
import { CommandPalette } from "./CommandPalette";
import { ContextMenu } from "./ContextMenu";
import { ElementLibrary } from "./ElementLibrary";
import { InteractionsPanel } from "./InteractionsPanel";
import { Inspector } from "./Inspector";
import { Navigator } from "./Navigator";
import { Toolbar } from "./Toolbar";
import { AiPanel } from "./AiPanel";
import { PagesPanel } from "./PagesPanel";
import { TemplatesPanel } from "./TemplatesPanel";
import { ComponentsPanel } from "./ComponentsPanel";
import { TokensPanel } from "./TokensPanel";
import { AnimatePanel, CodePanel, HelpPanel, HistoryPanel, QualityPanel } from "./RightPanels";
import { PanelSeparator, usePanelWidth } from "./Resizer";
import { useEditor, type LeftTab, type RightTab } from "./store";

export interface KeyInfo { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }

/** Shared by real key events and keys forwarded from the sandboxed canvas. Returns true if the key was handled. */
export function handleShortcut(e: KeyInfo, typing: boolean): boolean {
  const s = useEditor.getState();
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.toLowerCase();
  if (mod && k === "k") { s.setPalette(!s.paletteOpen); return true; }
  if (typing) return false;
  if (mod && k === "z") { e.shiftKey ? s.redo() : s.undo(); return true; }
  if (mod && k === "d") { s.duplicateSelected(); return true; }
  if (e.key === "Delete" || e.key === "Backspace") { s.deleteSelected(); return true; }
  if (e.altKey && e.key === "ArrowUp") { s.nudgeSelected(-1); return true; }
  if (e.altKey && e.key === "ArrowDown") { s.nudgeSelected(1); return true; }
  if (e.altKey && e.key === "ArrowRight") { s.indentSelected(); return true; }
  if (e.altKey && e.key === "ArrowLeft") { s.outdentSelected(); return true; }
  if (!mod && !e.altKey && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) {
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0, dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
    return s.nudgeFree(dx, dy);
  }
  if (e.key === "Escape") { s.select(null); return true; }
  return false;
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "") || (e.target as HTMLElement)?.isContentEditable;
      if (handleShortcut(e, !!typing)) e.preventDefault();
    };
    const onMsg = (e: MessageEvent) => {
      if (e.data?.source === "canvas" && e.data.type === "key" && typeof e.data.key === "string") handleShortcut({ key: e.data.key, metaKey: !!e.data.metaKey, ctrlKey: !!e.data.ctrlKey, shiftKey: !!e.data.shiftKey, altKey: !!e.data.altKey }, false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMsg);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("message", onMsg); };
  }, []);
}

/** Debounced autosave + unsaved-change protection. Local recovery now; server sync is a follow-up. */
function useAutosave() {
  const doc = useEditor((s) => s.doc);
  const status = useEditor((s) => s.saveStatus);
  useEffect(() => {
    if (status !== "unsaved") return;
    const t = setTimeout(() => useEditor.getState().persist(), 600);
    return () => clearTimeout(t);
  }, [doc, status]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (useEditor.getState().saveStatus !== "saved") e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
}

const LEFT_META: Record<LeftTab, { icon: LucideIcon; label: string; title: string }> = {
  elements: { icon: Plus, label: "Elements", title: "Elements" },
  navigator: { icon: Layers, label: "Navigator", title: "Navigator" },
  pages: { icon: FileText, label: "Pages", title: "Pages" },
  templates: { icon: LayoutTemplate, label: "Templates", title: "Templates" },
  components: { icon: Component, label: "Components", title: "Components" },
  tokens: { icon: Palette, label: "Tokens", title: "Design tokens" },
};
const MAIN_RIGHT: RightTab[] = ["design", "interact", "animate"];
const MORE_RIGHT: { id: RightTab; label: string }[] = [{ id: "ai", label: "AI assistant" }, { id: "quality", label: "Quality checks" }, { id: "code", label: "Custom code" }, { id: "history", label: "History" }, { id: "help", label: "Help and shortcuts" }];
const RIGHT_LABEL: Record<RightTab, string> = { design: "Design", interact: "Interact", animate: "Animate", ai: "AI", quality: "Quality", code: "Code", history: "History", help: "Help" };

/** Where the selection sits in the page, as clickable steps: body > Section > Heading. */
function Breadcrumb() {
  const doc = useEditor((s) => s.doc);
  const sel = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const pageId = useEditor((s) => s.pageId);
  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]!;
  const chain: { id: string; label: string }[] = [];
  for (let c: string | null | undefined = sel; c && c !== page.rootId; c = doc.nodes[c]?.parentId) { const n = doc.nodes[c]; if (!n) break; chain.unshift({ id: c, label: n.name ?? n.tag ?? "element" }); }
  return (
    <nav aria-label="Selection path" className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-t border-border bg-background px-3 text-xs text-muted-foreground">
      <button type="button" onClick={() => select(null)} className="rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground">&lt;body&gt;</button>
      {chain.map((c, i) => (
        <span key={c.id} className="flex items-center gap-1"><span aria-hidden>›</span>
          <button type="button" onClick={() => select(c.id)} aria-current={i === chain.length - 1 ? "true" : undefined} className={cn("rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground", i === chain.length - 1 && "font-medium text-foreground")}>{c.label}</button>
        </span>
      ))}
    </nav>
  );
}

export function Editor({ projectId }: { projectId?: string } = {}) {
  useEffect(() => { if (projectId) void useEditor.getState().attachRemote(projectId).catch((err: { status?: number; message?: string }) => { if (err.status === 401) location.assign("/login"); else useEditor.setState({ lastError: err.message ?? "Could not open project" }); }); else useEditor.getState().hydrate(); }, [projectId]);
  useShortcuts();
  useAutosave();
  const tab = useEditor((s) => s.leftTab);
  const setTab = useEditor((s) => s.setLeftTab);
  const preview = useEditor((s) => s.preview);
  const error = useEditor((s) => s.lastError);
  const rtab = useEditor((s) => s.rightTab);
  const setRtab = useEditor((s) => s.setRightTab);
  const [leftOpen, setLeftOpen] = useState(true);
  const [leftW, setLeftW] = usePanelWidth("webbrik:panel-left", 288, 240, 520);
  const [rightW, setRightW] = usePanelWidth("webbrik:panel-right", 304, 280, 600);
  const LEFT = { elements: <ElementLibrary />, navigator: <Navigator />, pages: <PagesPanel />, templates: <TemplatesPanel />, components: <ComponentsPanel />, tokens: <TokensPanel /> } as const;
  const RIGHT = { design: <Inspector />, interact: <InteractionsPanel />, animate: <AnimatePanel />, quality: <QualityPanel />, code: <CodePanel />, ai: <AiPanel />, history: <HistoryPanel />, help: <HelpPanel /> } as const;
  const moreActive = !MAIN_RIGHT.includes(rtab);

  return (
    <div className="flex h-screen flex-col bg-background">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        {!preview && (
          <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-3" aria-label="Tools">
            <div role="tablist" aria-orientation="vertical" aria-label="Left panel" className="flex flex-col items-center gap-1">
              {(Object.keys(LEFT_META) as LeftTab[]).map((t) => { const { icon: Icon, label, title } = LEFT_META[t]; const on = tab === t && leftOpen; return (
                <Tooltip key={t} label={title} side="right">
                  <button role="tab" aria-selected={on} aria-label={label} onClick={() => { setTab(t); setLeftOpen(true); }}
                    className={cn("relative flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-5", on && "bg-accent text-foreground before:absolute before:-left-2 before:top-2 before:h-6 before:w-[3px] before:rounded-r before:bg-primary")}>
                    <Icon aria-hidden />
                  </button>
                </Tooltip>
              ); })}
            </div>
            <div className="mt-auto">
              <Tooltip label="Help and shortcuts" side="right"><button type="button" aria-label="Help" onClick={() => setRtab("help")} className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-5"><CircleHelp aria-hidden /></button></Tooltip>
            </div>
          </nav>
        )}
        {!preview && leftOpen && (
          <aside style={{ width: leftW }} className="relative flex shrink-0 flex-col border-r border-border bg-panel" aria-label="Left sidebar">
            <PanelSeparator label="Resize left panel" side="left" width={leftW} min={240} max={520} def={288} onChange={setLeftW} />
            <div className="flex h-12 shrink-0 items-center justify-between px-4">
              <h2 className="text-sm font-semibold">{LEFT_META[tab].title}</h2>
              <Tooltip label="Hide panel" side="bottom"><button type="button" aria-label="Hide panel" onClick={() => setLeftOpen(false)} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><PanelLeftClose className="size-4" /></button></Tooltip>
            </div>
            <div className="min-h-0 flex-1" role="tabpanel">{LEFT[tab]}</div>
          </aside>
        )}
        <main className="min-w-0 flex-1"><Canvas /></main>
        {!preview && (
          <aside style={{ width: rightW }} className="relative flex shrink-0 flex-col border-l border-border bg-panel" aria-label="Right sidebar">
            <h2 className="sr-only">Right panel</h2>
            <PanelSeparator label="Resize right panel" side="right" width={rightW} min={280} max={600} def={304} onChange={setRightW} />
            <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-3">
              <div className="flex min-w-0 flex-1 items-center gap-1" role="tablist" aria-label="Right panel">
              {MAIN_RIGHT.map((t) => (
                <button key={t} role="tab" aria-selected={rtab === t} aria-label={RIGHT_LABEL[t]} onClick={() => setRtab(t)} className={cn("h-8 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring", rtab === t ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>{RIGHT_LABEL[t]}</button>
              ))}
              {moreActive && <span role="tab" aria-selected="true" className="flex h-8 items-center rounded-md bg-accent px-3 text-sm font-medium">{RIGHT_LABEL[rtab]}</span>}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="More panels" className="flex shrink-0 size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-accent"><MoreHorizontal className="size-[18px]" /></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuRadioGroup value={rtab} onValueChange={(v) => setRtab(v as RightTab)}>
                    {MORE_RIGHT.map((m) => <DropdownMenuRadioItem key={m.id} value={m.id}>{m.label}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="min-h-0 flex-1 overflow-auto" role="tabpanel">{RIGHT[rtab]}</div>
          </aside>
        )}
      </div>
      {error && <div role="alert" className="border-t border-border bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>}
      {!preview && <Breadcrumb />}
      <CommandPalette />
      <ContextMenu />
    </div>
  );
}
