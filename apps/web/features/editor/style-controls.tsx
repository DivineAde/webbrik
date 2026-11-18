"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Building blocks for the style panel: collapsible sections, labelled fields, unit inputs, segmented controls. */

const field = "h-8 w-full min-w-0 rounded-md border border-transparent bg-muted px-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 hover:bg-accent focus-visible:border-ring focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/30";

const openState = new Map<string, boolean>();

/** A titled group that folds away. Remembers its state while the editor is open. */
export function Section({ title, id = title, defaultOpen = true, count = 0, children, action }: { title: string; id?: string; defaultOpen?: boolean; count?: number; children: ReactNode; action?: ReactNode }) {
  const [open, setOpen] = useState(openState.get(id) ?? defaultOpen);
  const toggle = () => { const v = !open; openState.set(id, v); setOpen(v); };
  return (
    <section className="border-b border-border" aria-label={title}>
      <div className="flex h-10 items-center pr-3">
        <button type="button" onClick={toggle} aria-expanded={open} className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-3 text-left text-sm font-semibold hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          {open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
          <span className="truncate">{title}</span>
          {count > 0 && <span className="ml-1 rounded-full bg-selection-soft px-1.5 text-[11px] font-medium leading-4 text-selection" aria-label={`${count} set`}>{count}</span>}
        </button>
        {action}
      </div>
      {open && <div className="space-y-3 px-3 pb-4">{children}</div>}
    </section>
  );
}

/** A property label. Highlighted when the value is set on this element; click to reset it. */
export function PropLabel({ prop, label, set, from, onReset }: { prop: string; label?: string; set: boolean; from?: string; onReset: () => void }) {
  const text = label ?? prop;
  if (!set) return <span className="block truncate text-xs text-muted-foreground" title={from ? `${prop}: from ${from}` : prop}>{text}</span>;
  return <button type="button" tabIndex={-1} onClick={onReset} title={`Set on this element. Click to reset ${prop}`} className="block max-w-full truncate rounded bg-selection-soft px-1 text-left text-xs font-medium text-selection hover:line-through">{text}</button>;
}

export function Pair({ children }: { children: ReactNode }) { return <div className="grid grid-cols-2 gap-x-2 gap-y-3">{children}</div>; }
export function Stack({ children, className }: { children: ReactNode; className?: string }) { return <div className={cn("space-y-1", className)}>{children}</div>; }
export function Row({ label, children }: { label: ReactNode; children: ReactNode }) { return <div className="grid grid-cols-[84px_1fr] items-center gap-2"><div className="min-w-0">{label}</div><div className="min-w-0">{children}</div></div>; }

const UNITS = ["px", "rem", "em", "%", "vw", "vh", "ch"];
const NUM = /^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i;

/** A text field that understands CSS lengths: a number plus a unit menu, keywords, arrow-key stepping. */
export function UnitInput({ prop, value, placeholder = "—", keywords = [], onCommit, className }: { prop: string; value: string; placeholder?: string; keywords?: string[]; onCommit: (v: string) => void; className?: string }) {
  const [text, setText] = useState(value);
  const prev = useRef(value);
  useEffect(() => { if (prev.current !== value) { prev.current = value; setText(value); } }, [value]);
  const m = NUM.exec(text.trim());
  const unit = m ? (m[2] || "") : "";
  const commit = (v: string) => { if (v.trim() !== value.trim()) onCommit(v.trim()); };
  const step = (dir: 1 | -1, e: React.KeyboardEvent) => {
    const mm = NUM.exec(text.trim());
    const by = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const n = mm ? Number(mm[1]) : 0, u = mm ? mm[2] : "px";
    const next = `${Math.round((n + dir * by) * 100) / 100}${u === "" && n !== 0 ? "" : u}`;
    setText(next); commit(next);
  };
  const chip = m ? (unit || "–") : text.trim() ? "▾" : "–";
  return (
    <div className={cn("relative", className)}>
      <input
        aria-label={prop} value={text} placeholder={placeholder} spellCheck={false} autoComplete="off"
        className={cn(field, "pr-9 tabular-nums")}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") { setText(value); e.currentTarget.blur(); }
          else if (e.key === "ArrowUp") { e.preventDefault(); step(1, e); }
          else if (e.key === "ArrowDown") { e.preventDefault(); step(-1, e); }
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`${prop} unit: ${chip}`} className="absolute inset-y-0 right-0 flex w-9 items-center justify-end pr-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{chip}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32 min-w-0">
          {UNITS.map((u) => <DropdownMenuItem key={u} onSelect={() => { const n = m ? m[1] : "0"; const next = `${n}${u}`; setText(next); commit(next); }}>{u}</DropdownMenuItem>)}
          {keywords.length > 0 && <DropdownMenuSeparator />}
          {keywords.map((k) => <DropdownMenuItem key={k} onSelect={() => { setText(k); commit(k); }}>{k}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Free text (shorthands, families, shadows). */
export function TextField({ prop, value, placeholder = "—", onCommit }: { prop: string; value: string; placeholder?: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  const prev = useRef(value);
  useEffect(() => { if (prev.current !== value) { prev.current = value; setText(value); } }, [value]);
  return <input aria-label={prop} value={text} placeholder={placeholder} spellCheck={false} autoComplete="off" className={field} onChange={(e) => setText(e.target.value)} onBlur={() => text.trim() !== value.trim() && onCommit(text.trim())} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") { setText(value); e.currentTarget.blur(); } }} />;
}

export function SelectField({ prop, value, options, onCommit }: { prop: string; value: string; options: { value: string; label: string }[]; onCommit: (v: string) => void }) {
  const known = options.some((o) => o.value === value);
  return (
    <div className="relative">
      <select aria-label={prop} value={value} onChange={(e) => onCommit(e.target.value)} className={cn(field, "appearance-none pr-7", !value && "text-muted-foreground")}>
        <option value="">—</option>
        {!known && value && <option value={value}>{value}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

/** Colour: a swatch that opens the picker, and the value as text. */
export function ColorField({ prop, value, onCommit }: { prop: string; value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  const prev = useRef(value);
  useEffect(() => { if (prev.current !== value) { prev.current = value; setText(value); } }, [value]);
  const hex = /^#([0-9a-f]{6})$/i.test(text) ? text : /^#([0-9a-f]{3})$/i.test(text) ? "#" + text.slice(1).split("").map((c) => c + c).join("") : "#000000";
  return (
    <div className="relative">
      <label className="absolute left-1.5 top-1/2 flex size-5 -translate-y-1/2 cursor-pointer overflow-hidden rounded border border-border" style={{ background: text || "repeating-conic-gradient(#d4d4d4 0 25%, #fff 0 50%) 0 0 / 8px 8px" }}>
        <span className="sr-only">{prop} picker</span>
        <input type="color" value={hex} onChange={(e) => setText(e.target.value)} onBlur={(e) => e.target.value !== value && onCommit(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
      <input aria-label={prop} value={text} placeholder="—" spellCheck={false} autoComplete="off" className={cn(field, "pl-8")} onChange={(e) => setText(e.target.value)} onBlur={() => text.trim() !== value.trim() && onCommit(text.trim())} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") { setText(value); e.currentTarget.blur(); } }} />
    </div>
  );
}

export interface SegOption { value: string; label: ReactNode; title: string }
/** Icon or short-text choices in one pill. Click the active one again to clear it. */
export function Segmented({ prop, value, options, onCommit, className }: { prop: string; value: string; options: SegOption[]; onCommit: (v: string) => void; className?: string }) {
  return (
    <div role="group" aria-label={prop} className={cn("flex h-8 items-center gap-0.5 rounded-md bg-muted p-0.5", className)}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" aria-label={o.title} title={o.title} aria-pressed={on} onClick={() => onCommit(on ? "" : o.value)}
            className={cn("flex h-full min-w-0 flex-1 items-center justify-center rounded px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-4", on && "bg-background text-foreground shadow-[var(--shadow-sm)]")}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
