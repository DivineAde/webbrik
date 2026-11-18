"use client";
import { useEffect, useState } from "react";
import { ask } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAction, useQuery } from "./hooks";

type FieldType = "text" | "email" | "textarea" | "number" | "checkbox";
interface Field { name: string; type: FieldType; required?: boolean; maxLength?: number }
interface FormInfo { id: string; fields: Field[]; settings: { successMessage?: string; redirectUrl?: string; notifyEmails?: string[] }; submissionCount: number }
interface Submission { id: string; data: Record<string, unknown>; createdAt: number }
const TYPES: FieldType[] = ["text", "email", "textarea", "number", "checkbox"];
const DEFAULT_FIELDS: Field[] = [{ name: "name", type: "text", required: true }, { name: "email", type: "email", required: true }, { name: "message", type: "textarea" }];

function Editor({ pid, form, onChanged, onDeleted }: { pid: string; form: FormInfo; onChanged: () => void; onDeleted: () => void }) {
  const [fields, setFields] = useState<Field[]>(form.fields);
  const [msg, setMsg] = useState(form.settings.successMessage ?? "");
  const [redirect, setRedirect] = useState(form.settings.redirectUrl ?? "");
  const [emails, setEmails] = useState((form.settings.notifyEmails ?? []).join(", "));
  const [saved, setSaved] = useState(false);
  useEffect(() => { setFields(form.fields); setMsg(form.settings.successMessage ?? ""); setRedirect(form.settings.redirectUrl ?? ""); setEmails((form.settings.notifyEmails ?? []).join(", ")); }, [form]);
  const subs = useQuery<{ submissions: Submission[] }>(`/projects/${pid}/forms/${form.id}/submissions`);
  const save = useAction(async () => { setSaved(true); onChanged(); });
  const del = useAction(onDeleted);
  const delSub = useAction(async () => { await subs.reload(); onChanged(); });
  const set = (i: number, patch: Partial<Field>) => { setSaved(false); setFields((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x))); };
  const move = (i: number, d: -1 | 1) => { setSaved(false); setFields((f) => { const n = [...f]; const j = i + d; if (j < 0 || j >= n.length) return f; [n[i], n[j]] = [n[j]!, n[i]!]; return n; }); };
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-md border border-border p-3" aria-label={`Fields of ${form.id}`}>
        <h3 className="text-sm font-medium">Fields</h3>
        <ul className="space-y-1.5">
          {fields.map((f, i) => (
            <li key={i} className="grid grid-cols-[1fr_110px_auto_70px_auto] items-center gap-1.5">
              <Input aria-label={`Field ${i + 1} name`} value={f.name} onChange={(e) => set(i, { name: e.target.value })} />
              <select aria-label={`Field ${i + 1} type`} className="h-7 rounded-md border border-input bg-background px-1 text-xs" value={f.type} onChange={(e) => set(i, { type: e.target.value as FieldType })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!f.required} onChange={(e) => set(i, { required: e.target.checked })} />Required</label>
              <Input aria-label={`Field ${i + 1} max length`} type="number" min={1} max={10000} placeholder="Max" value={f.maxLength ?? ""} onChange={(e) => set(i, { maxLength: e.target.value ? Number(e.target.value) : undefined })} />
              <span className="flex gap-0.5">
                <Button size="sm" variant="ghost" aria-label={`Move field ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
                <Button size="sm" variant="ghost" aria-label={`Move field ${i + 1} down`} disabled={i === fields.length - 1} onClick={() => move(i, 1)}>↓</Button>
                <Button size="sm" variant="ghost" aria-label={`Remove field ${i + 1}`} disabled={fields.length === 1} onClick={() => { setSaved(false); setFields((x) => x.filter((_, j) => j !== i)); }}>×</Button>
              </span>
            </li>
          ))}
        </ul>
        <Button size="sm" variant="secondary" disabled={fields.length >= 30} onClick={() => { setSaved(false); setFields((f) => [...f, { name: `field${f.length + 1}`, type: "text" }]); }}>Add field</Button>
      </section>
      <section className="space-y-2 rounded-md border border-border p-3" aria-label="After submission">
        <h3 className="text-sm font-medium">After a visitor submits</h3>
        <label className="block text-xs">Success message<Input value={msg} placeholder="Thanks! Your message was sent." onChange={(e) => { setSaved(false); setMsg(e.target.value); }} /></label>
        <label className="block text-xs">Redirect to (optional)<Input value={redirect} placeholder="/thanks or https://…" onChange={(e) => { setSaved(false); setRedirect(e.target.value); }} /></label>
        <label className="block text-xs">Email each submission to (up to 5, comma-separated)<Input value={emails} placeholder="you@company.com" onChange={(e) => { setSaved(false); setEmails(e.target.value); }} /></label>
        <p className="text-xs text-muted-foreground">Emails are limited to 20 per hour per form. Spam is filtered with a hidden field, and each visitor can send 10 submissions a minute.</p>
        <div className="flex items-center gap-2">
          <Button disabled={save.busy} onClick={() => void save.run(() => api(`/projects/${pid}/forms/${form.id}`, { method: "PUT", body: { fields: fields.map((f) => ({ ...f, maxLength: f.maxLength || undefined })), successMessage: msg, redirectUrl: redirect, notifyEmails: emails.split(",").map((e) => e.trim()).filter(Boolean) } }))}>Save form</Button>
          {saved && <span role="status" className="text-xs text-muted-foreground">Saved. Publish again for the change to go live.</span>}
          <Button variant="secondary" disabled={del.busy} onClick={async () => { if (await ask(`Delete the "${form.id}" form and all its submissions?`)) void del.run(() => api(`/projects/${pid}/forms/${form.id}`, { method: "DELETE" })); }}>Delete form</Button>
        </div>
        {save.error && <p role="alert" className="text-xs text-destructive">{save.error}</p>}
        {del.error && <p role="alert" className="text-xs text-destructive">{del.error}</p>}
      </section>
      <section className="space-y-2 rounded-md border border-border p-3" aria-label="Submissions">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Submissions ({form.submissionCount})</h3>
          {form.submissionCount > 0 && <a className="text-xs underline" href={`/api/projects/${pid}/forms/${form.id}/submissions.csv`} download>Download CSV</a>}
        </div>
        {subs.data?.submissions.length === 0 && <p className="text-xs text-muted-foreground">Nothing yet. Put a Form element on a page, connect it to “{form.id}”, and publish.</p>}
        <ul className="divide-y divide-border rounded-md border border-border text-xs">
          {subs.data?.submissions.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-2 p-2">
              <div className="min-w-0">
                <p className="text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</p>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">{Object.entries(s.data).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{String(v)}</dd></div>)}</dl>
              </div>
              <Button size="sm" variant="ghost" aria-label={`Delete submission from ${new Date(s.createdAt).toLocaleString()}`} onClick={async () => { if (await ask("Delete this submission?")) void delSub.run(() => api(`/projects/${pid}/forms/${form.id}/submissions/${s.id}`, { method: "DELETE" })); }}>Delete</Button>
            </li>
          ))}
        </ul>
        {delSub.error && <p role="alert" className="text-xs text-destructive">{delSub.error}</p>}
      </section>
    </div>
  );
}

export function FormsTab({ id }: { id: string }) {
  const q = useQuery<{ forms: FormInfo[] }>(`/projects/${id}/forms`);
  const [sel, setSel] = useState<string | null>(null);
  const [newId, setNewId] = useState("");
  const create = useAction(async () => { await q.reload(); });
  const forms = q.data?.forms ?? [];
  const current = forms.find((f) => f.id === sel) ?? forms[0];
  const valid = /^[a-z0-9-]{1,40}$/.test(newId) && !forms.some((f) => f.id === newId);
  return (
    <div className="space-y-4 py-4">
      <p className="text-xs text-muted-foreground">Define what a form collects, then connect a Form element in the editor to it. Submissions arrive here, by email, and as <code>form.submitted</code> webhooks.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">New form id<Input className="mt-1 w-48" value={newId} placeholder="contact" onChange={(e) => setNewId(e.target.value.toLowerCase())} /></label>
        <Button disabled={!valid || create.busy} onClick={() => void create.run(async () => { await api(`/projects/${id}/forms/${newId}`, { method: "PUT", body: { fields: DEFAULT_FIELDS } }); setSel(newId); setNewId(""); })}>Create form</Button>
        {newId && !valid && <span className="text-xs text-muted-foreground">Lowercase letters, numbers and hyphens; must be new.</span>}
      </div>
      {create.error && <p role="alert" className="text-xs text-destructive">{create.error}</p>}
      {forms.length > 0 && (
        <div role="tablist" aria-label="Forms" className="flex flex-wrap gap-1">
          {forms.map((f) => <button key={f.id} role="tab" aria-selected={current?.id === f.id} onClick={() => setSel(f.id)} className={`rounded-md border px-2.5 py-1 text-xs ${current?.id === f.id ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{f.id} · {f.submissionCount}</button>)}
        </div>
      )}
      {q.error && <p role="alert" className="text-xs text-destructive">{q.error}</p>}
      {forms.length === 0 && q.data && <p className="text-sm text-muted-foreground">No forms yet.</p>}
      {current && <Editor key={current.id} pid={id} form={current} onChanged={() => void q.reload()} onDeleted={async () => { setSel(null); await q.reload(); }} />}
    </div>
  );
}
