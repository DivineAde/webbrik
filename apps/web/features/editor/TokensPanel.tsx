"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "./store";

const SUGGEST = ["--color-primary", "--color-text", "--color-bg", "--font-body", "--radius", "--space-4"];

export function TokensPanel() {
  const tokens = useEditor((s) => s.doc.tokens);
  const commit = useEditor((s) => s.commit);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const full = (n: string) => (n.startsWith("--") ? n : `--${n}`);
  const valid = /^--[a-z][a-z0-9-]*$/.test(full(name.trim())) && value.trim() !== "";
  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-2">
      <p className="text-xs text-muted-foreground">Design tokens become CSS variables on <code>:root</code>. Use them as <code>var(--name)</code> in any style.</p>
      {Object.entries(tokens).map(([k, v]) => (
        <div key={k} className="flex items-center gap-1">
          <span className="w-28 shrink-0 truncate text-xs" title={k}>{k}</span>
          <Input key={v} defaultValue={v} aria-label={k} onBlur={(e) => e.target.value !== v && e.target.value.trim() && commit(`Set ${k}`, [{ type: "setToken", name: k, value: e.target.value.trim() }])} />
          <Button size="icon" variant="ghost" aria-label={`Delete ${k}`} onClick={() => commit(`Delete ${k}`, [{ type: "setToken", name: k, value: null }])}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ))}
      <form className="mt-2 space-y-1 border-t border-border pt-2" onSubmit={(e) => { e.preventDefault(); if (valid && commit(`Add ${full(name.trim())}`, [{ type: "setToken", name: full(name.trim()), value: value.trim() }])) { setName(""); setValue(""); } }}>
        <Input list="token-suggest" placeholder="--color-primary" value={name} onChange={(e) => setName(e.target.value)} aria-label="Token name" />
        <datalist id="token-suggest">{SUGGEST.map((s) => <option key={s} value={s} />)}</datalist>
        <Input placeholder="#111111" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Token value" />
        <Button size="sm" type="submit" disabled={!valid}>Add token</Button>
      </form>
    </div>
  );
}
