"use client";
import { AlignLeft, Box, Columns3, Heading1, Heading2, Heading3, Image as ImageIcon, LayoutGrid, Link as LinkIcon, List, ListOrdered, Menu, Minus, MousePointerClick, PanelBottom, PanelTop, Pilcrow, Quote, Rows3, Search, Square, Tag, TextCursorInput, Type, Video, FormInput, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { CATALOG } from "./catalog";
import { beginPointerDrag } from "./pointer-drag";
import { useEditor } from "./store";

const ICONS: Record<string, LucideIcon> = {
  Section: Square, Container: Box, "Flex row": Columns3, Grid: LayoutGrid, Header: PanelTop, Footer: PanelBottom, Divider: Minus,
  "Heading 1": Heading1, "Heading 2": Heading2, "Heading 3": Heading3, Paragraph: Pilcrow, Text: Type, Quote: Quote,
  Image: ImageIcon, Video: Video, Form: FormInput, Input: TextCursorInput, Textarea: AlignLeft, Label: Tag,
  Nav: Menu, Link: LinkIcon, Button: MousePointerClick, List: List, "List item": ListOrdered,
};

/** Element tiles in a three-column grid. Click to insert at the selection, or press and drag onto the canvas or the layers panel. */
export function ElementLibrary() {
  const insert = useEditor((s) => s.insertElement);
  const [q, setQ] = useState("");
  const items = CATALOG.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()));
  const cats = [...new Set(items.map((i) => i.category))];
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" placeholder="Find elements" aria-label="Search elements" value={q} onChange={(e) => setQ(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-4">
        {cats.map((c) => (
          <section key={c} className="mb-5">
            <h3 className="mb-2 text-xs font-semibold text-foreground">{c}</h3>
            <div className="grid grid-cols-3 gap-2">
              {items.filter((i) => i.category === c).map((i) => {
                const Icon = ICONS[i.label] ?? Square;
                return (
                  <button key={i.label} type="button" onPointerDown={(e) => beginPointerDrag(e, { kind: "catalog", label: i.label }, i.label)} onClick={() => insert(i.tag, { text: i.text, styles: i.styles })}
                    title={`Click to add, or drag ${i.label} onto the page`}
                    className="group flex aspect-square cursor-grab flex-col items-center justify-center gap-2 rounded-lg border border-border bg-background text-muted-foreground transition-[border-color,background-color,color,box-shadow] hover:border-ring/50 hover:bg-accent hover:text-foreground hover:shadow-[var(--shadow-sm)] focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing">
                    <Icon className="size-6 stroke-[1.5]" aria-hidden />
                    <span className={cn("max-w-full truncate px-1 text-xs font-medium text-foreground")}>{i.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {items.length === 0 && <p className="px-1 py-6 text-center text-sm text-muted-foreground">No elements match “{q}”.</p>}
      </div>
    </div>
  );
}
