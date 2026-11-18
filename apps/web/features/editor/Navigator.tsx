"use client";
import { useState } from "react";
import { ChevronRight, Eye, EyeOff, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/input";
import { useEditor } from "./store";
import { beginPointerDrag } from "./pointer-drag";


function Row({ id, depth, query }: { id: string; depth: number; query: string }) {
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selectedIds.includes(id));
  const drop = useEditor((s) => (s.dropTarget?.id === id ? s.dropTarget.pos : null));
  const select = useEditor((s) => s.select);
  const hover = useEditor((s) => s.hover);
  const commit = useEditor((s) => s.commit);
  const [open, setOpen] = useState(true);
  const node = doc.nodes[id];
  if (!node) return null;
  const label = node.name ?? node.tag;
  const matches = !query || label.toLowerCase().includes(query.toLowerCase());
  const hasKids = node.children.length > 0;

  return (
    <li role="treeitem" aria-expanded={hasKids ? open : undefined} aria-selected={selected}>
      {matches && (
        <div
          className={cn("group relative flex h-7 items-center gap-1 rounded-sm pr-1 hover:bg-accent", selected && "bg-accent font-medium", node.hidden && "opacity-50", drop === "inside" && "ring-2 ring-primary ring-inset", drop === "before" && "border-t-2 border-primary", drop === "after" && "border-b-2 border-primary")}
          style={{ paddingLeft: depth * 12 + 4 }}
          data-layer-id={id}
          onPointerDown={(e) => { if (node.locked || (e.target as HTMLElement).closest("button[aria-label]")) return; const ids = useEditor.getState().selectedIds; beginPointerDrag(e, { kind: "move", ids: ids.includes(id) ? ids : [id] }, label); }}
          onContextMenu={(e) => { e.preventDefault(); if (!useEditor.getState().selectedIds.includes(id)) select(id); useEditor.getState().openMenu({ id, x: e.clientX, y: e.clientY }); }}
          onMouseEnter={() => hover(id)}
          onMouseLeave={() => hover(null)}
        >
          <button className="h-4 w-4 shrink-0 text-muted-foreground" onClick={() => setOpen(!open)} aria-label={open ? "Collapse" : "Expand"} disabled={!hasKids}>
            {hasKids && <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />}
          </button>
          <button className="min-w-0 flex-1 truncate text-left" onClick={(e) => select(id, e.shiftKey || e.metaKey || e.ctrlKey)}>
            {label}
            {node.type === "component-instance" && <span className="ml-1 text-xs text-muted-foreground">component</span>}
          </button>
          <button className="hidden h-5 w-5 text-muted-foreground group-hover:block" aria-label={node.hidden ? "Show" : "Hide"} onClick={() => commit("Toggle visibility", [{ type: "updateElement", id, patch: { hidden: !node.hidden } }])}>
            {node.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <button className="hidden h-5 w-5 text-muted-foreground group-hover:block" aria-label={node.locked ? "Unlock" : "Lock"} onClick={() => commit("Toggle lock", [{ type: "updateElement", id, patch: { locked: !node.locked } }])}>
            {node.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
      {open && hasKids && (
        <ul role="group">
          {node.children.map((c) => (
            <Row key={c} id={c} depth={matches ? depth + 1 : depth} query={query} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function Navigator() {
  const doc = useEditor((s) => s.doc);
  const pageId = useEditor((s) => s.pageId);
  const [query, setQuery] = useState("");
  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]!;
  const root = doc.nodes[page.rootId]!;
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <Input placeholder="Search layers" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search layers" />
      <ul role="tree" className="flex-1 overflow-auto">
        {root.children.length === 0 ? <li className="p-3 text-muted-foreground">No elements yet.</li> : root.children.map((c) => <Row key={c} id={c} depth={0} query={query} />)}
      </ul>
    </div>
  );
}
