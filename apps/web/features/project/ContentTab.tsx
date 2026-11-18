"use client";
import { useState } from "react";
import { ask } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAction, useQuery } from "./hooks";
import { RichTextField } from "./RichTextField";

interface Field { name: string; type: string; required?: boolean; to?: string }
interface Collection { id: string; slug: string; schema: { slug: string; name: string; fields: Field[] } }
interface Item { id: string; slug: string; data: Record<string, unknown>; status: string }

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type FormVal = string | string[];
const label = (c: Collection, i: Item) => String(i.data[c.schema.fields.find((f) => f.type === "text")?.name ?? c.schema.fields[0]!.name] ?? i.slug);

/** Pick the item(s) a reference field points to. */
function RefPicker({ pid, target, multi, name, value, onChange }: { pid: string; target?: Collection; multi: boolean; name: string; value: FormVal; onChange: (v: FormVal) => void }) {
  const q = useQuery<{ items: Item[] }>(target ? `/projects/${pid}/collections/${target.id}/items` : `/projects/${pid}/collections`);
  if (!target) return <p className="mt-1 text-muted-foreground">Target collection not found.</p>;
  const items = target && q.data && "items" in q.data ? q.data.items : [];
  if (multi) {
    const sel = Array.isArray(value) ? value : [];
    return (
      <fieldset className="mt-1 max-h-32 overflow-auto rounded-md border border-border p-2"><legend className="sr-only">{name}</legend>
        {items.length === 0 && <p className="text-muted-foreground">No {target.schema.name.toLowerCase()} yet.</p>}
        {items.map((i) => <label key={i.id} className="flex items-center gap-2"><input type="checkbox" checked={sel.includes(i.id)} onChange={(e) => onChange(e.target.checked ? [...sel, i.id] : sel.filter((x) => x !== i.id))} />{label(target, i)}</label>)}
      </fieldset>
    );
  }
  return (
    <select aria-label={name} className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">None</option>{items.map((i) => <option key={i.id} value={i.id}>{label(target, i)}</option>)}
    </select>
  );
}

/** Earlier versions of an item, with one-click restore (the current version is kept, so a restore can be undone). */
function History({ pid, c, item, onDone }: { pid: string; c: Collection; item: Item; onDone: () => void }) {
  const q = useQuery<{ revisions: { index: number; at: number; data: Record<string, unknown> }[] }>(`/projects/${pid}/collections/${c.id}/items/${item.id}/revisions`);
  const { run, error, busy } = useAction(async () => { await q.reload(); onDone(); });
  const first = c.schema.fields[0]!.name;
  return (
    <div className="rounded-md border border-border p-2 text-xs">
      <h2 className="mb-1 font-medium">History of /{item.slug}</h2>
      {q.data?.revisions.length === 0 && <p className="text-muted-foreground">No earlier versions yet. Versions are saved each time the item is edited.</p>}
      <ul className="divide-y divide-border">
        {q.data?.revisions.map((r) => (
          <li key={r.index} className="flex items-center justify-between gap-2 py-1">
            <span className="min-w-0 truncate"><time>{new Date(r.at).toLocaleString()}</time> · {String(r.data[first] ?? "").slice(0, 40)}</span>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => api(`/projects/${pid}/collections/${c.id}/items/${item.id}/revert/${r.index}`, { method: "POST" }))}>Restore</Button>
          </li>
        ))}
      </ul>
      {(error ?? q.error) && <p role="alert" className="mt-1 text-destructive">{error ?? q.error}</p>}
    </div>
  );
}

function Items({ pid, c, all }: { pid: string; c: Collection; all: Collection[] }) {
  const q = useQuery<{ items: Item[] }>(`/projects/${pid}/collections/${c.id}/items`);
  const [form, setForm] = useState<Record<string, FormVal>>({ slug: "" });
  const [history, setHistory] = useState<Item | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const { run, error, busy } = useAction(q.reload);
  const coerce = (f: Field, v: FormVal): unknown => (f.type === "multireference" ? (Array.isArray(v) ? v : []) : Array.isArray(v) ? undefined : f.type === "number" ? (v === "" ? undefined : Number(v)) : f.type === "boolean" ? v === "true" : v === "" ? undefined : v);
  const create = () => run(async () => {
    const data: Record<string, unknown> = {};
    for (const f of c.schema.fields) { const v = coerce(f, form[f.name] ?? (f.type === "multireference" ? [] : "")); if (v !== undefined) data[f.name] = v; }
    if (editing) {
      await api(`/projects/${pid}/collections/${c.id}/items/${editing.id}`, { method: "PATCH", body: { data } });
      setEditing(null);
    } else {
      await api(`/projects/${pid}/collections/${c.id}/items`, { method: "POST", body: { slug: form["slug"] || slugify(String(data[c.schema.fields[0]!.name] ?? "")), data } });
    }
    setForm({ slug: "" });
  });
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-md border border-border">
        {q.data?.items.length === 0 && <li className="p-3 text-muted-foreground">No items yet.</li>}
        {q.data?.items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 p-2">
            <span className="min-w-0 truncate">{String(i.data[c.schema.fields[0]!.name] ?? i.slug)} <span className="text-xs text-muted-foreground">/{i.slug}</span></span>
            <span className="flex items-center gap-1">
              <select aria-label={`Status of ${i.slug}`} value={i.status} className="h-7 rounded-md border border-border bg-background px-1 text-xs" onChange={(e) => void run(() => api(`/projects/${pid}/collections/${c.id}/items/${i.id}/status`, { method: "POST", body: { status: e.target.value === "scheduled" ? "draft" : e.target.value } }))}>
                <option value="draft">Draft</option><option value="published">Published</option>{i.status === "scheduled" && <option value="scheduled">Scheduled</option>}
              </select>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(i); setForm({ slug: i.slug, ...Object.fromEntries(c.schema.fields.map((f) => [f.name, f.type === "multireference" ? (Array.isArray(i.data[f.name]) ? (i.data[f.name] as string[]) : []) : i.data[f.name] === undefined || i.data[f.name] === null ? "" : String(i.data[f.name])])) }); }}>Edit</Button>
              <Button size="sm" variant="ghost" aria-label={`History of ${i.slug}`} onClick={() => setHistory(history?.id === i.id ? null : i)}>History</Button>
              <Button size="sm" variant="ghost" onClick={async () => { if (await ask("Delete this item?")) void run(() => api(`/projects/${pid}/collections/${c.id}/items/${i.id}`, { method: "DELETE" })); }}>Delete</Button>
            </span>
          </li>
        ))}
      </ul>
      {history && <History pid={pid} c={c} item={history} onDone={() => void q.reload()} />}
      <form className="grid gap-2 rounded-md border border-border p-3" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <h2 className="text-xs font-medium">{editing ? `Editing /${editing.slug}` : "New item"}</h2>
        {c.schema.fields.map((f) => (
          // Rich text is not wrapped in a <label>: a label would forward clicks in the text area to the first toolbar button.
          f.type === "richtext" ? <div key={f.name} className="text-xs">{f.name}{f.required ? " *" : ""} <span className="text-muted-foreground">(richtext)</span><RichTextField label={f.name} value={String(form[f.name] ?? "")} onChange={(html) => setForm((cur) => ({ ...cur, [f.name]: html }))} /></div> :
          <label key={f.name} className="text-xs">{f.name}{f.required ? " *" : ""} <span className="text-muted-foreground">({f.type}{f.to ? ` → ${f.to}` : ""})</span>
            {f.type === "reference" || f.type === "multireference" ? <RefPicker pid={pid} name={f.name} multi={f.type === "multireference"} target={all.find((x) => x.schema.slug === f.to)} value={form[f.name] ?? (f.type === "multireference" ? [] : "")} onChange={(v) => setForm((cur) => ({ ...cur, [f.name]: v }))} />
              : f.type === "boolean" ? <select className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2" value={String(form[f.name] ?? "false")} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}><option value="false">No</option><option value="true">Yes</option></select>
              : <Input className="mt-1" type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={String(form[f.name] ?? "")} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />}
          </label>
        ))}
        <label className="text-xs">slug <Input className="mt-1" disabled={!!editing} value={String(form["slug"] ?? "")} placeholder="auto from first field" onChange={(e) => setForm({ ...form, slug: e.target.value })} /></label>
        {(error ?? q.error) && <p role="alert" className="text-xs text-destructive">{error ?? q.error}</p>}
        <div className="flex gap-2"><Button type="submit" disabled={busy}>{editing ? "Save changes" : "Create item"}</Button>{editing && <Button type="button" variant="secondary" onClick={() => { setEditing(null); setForm({ slug: "" }); }}>Cancel</Button>}</div>
      </form>
    </div>
  );
}

export function ContentTab({ id }: { id: string }) {
  const q = useQuery<{ collections: Collection[] }>(`/projects/${id}/collections`);
  const [active, setActive] = useState<string | null>(null);
  const [name, setName] = useState(""); const [fields, setFields] = useState("title:text*, body:richtext");
  const { run, error, busy } = useAction(q.reload);
  const cur = q.data?.collections.find((c) => c.id === active) ?? q.data?.collections[0];
  const parse = (s: string): Field[] => s.split(",").map((p) => p.trim()).filter(Boolean).map((p) => { const [n, t = "text"] = p.split(":"); const [type, to] = t.replace("*", "").trim().split(">"); return { name: n!.trim(), type: type!.trim(), required: t.includes("*") || undefined, ...(to ? { to: to.trim() } : {}) }; });
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Collections">
        {q.data?.collections.map((c) => <button key={c.id} role="tab" aria-selected={cur?.id === c.id} onClick={() => setActive(c.id)} className={`rounded-md border px-2 py-1 text-xs ${cur?.id === c.id ? "border-primary font-medium" : "border-border text-muted-foreground"}`}>{c.schema.name}</button>)}
      </div>
      {cur && <Items key={cur.id} pid={id} c={cur} all={q.data?.collections ?? []} />}
      <form className="grid gap-2 rounded-md border border-dashed border-border p-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api(`/projects/${id}/collections`, { method: "POST", body: { slug: slugify(name), name: name.trim(), fields: parse(fields) } }); setName(""); }); }}>
        <h2 className="text-xs font-medium">New collection</h2>
        <Input aria-label="Collection name" placeholder="Blog posts" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="text-xs text-muted-foreground">Fields (name:type, * = required; types: text, richtext, number, boolean, date, image, url, slug, reference{">"}collection, multireference{">"}collection)
          <Input className="mt-1" aria-label="Fields" value={fields} onChange={(e) => setFields(e.target.value)} /></label>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || !name.trim()}>Create collection</Button>
      </form>
    </section>
  );
}
