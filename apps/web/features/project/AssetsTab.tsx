"use client";
import { useRef } from "react";
import { ask } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAction, useQuery } from "./hooks";

interface Asset { id: string; name: string; mime: string; sizeBytes: number; altText?: string }

const toBase64 = (buf: ArrayBuffer) => { let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

export function AssetsTab({ id }: { id: string }) {
  const q = useQuery<{ assets: Asset[] }>(`/projects/${id}/assets`);
  const { run, error, busy } = useAction(q.reload);
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <input ref={input} type="file" multiple accept="image/*,video/mp4,application/pdf" className="hidden" aria-label="Choose files" onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          void run(async () => { for (const f of files) await api(`/projects/${id}/assets`, { method: "POST", body: { name: f.name, mime: f.type || undefined, contentBase64: toBase64(await f.arrayBuffer()) } }); });
          e.target.value = "";
        }} />
        <Button disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : "Upload files"}</Button>
        <span className="text-xs text-muted-foreground">Files are validated by content, not file name. SVGs are sanitised.</span>
      </div>
      {(error ?? q.error) && <p role="alert" className="text-xs text-destructive">{error ?? q.error}</p>}
      {q.data?.assets.length === 0 && <p className="text-muted-foreground">No assets yet.</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {q.data?.assets.map((a) => (
          <li key={a.id} className="rounded-md border border-border p-2">
            {a.mime.startsWith("image/") ? <img src={`/api/projects/${id}/assets/${a.id}/raw`} alt={a.altText ?? ""} className="mb-2 h-24 w-full rounded object-contain bg-muted" /> : <div className="mb-2 flex h-24 items-center justify-center rounded bg-muted text-xs text-muted-foreground">{a.mime}</div>}
            <p className="truncate text-xs font-medium" title={a.name}>{a.name}</p>
            <p className="text-xs text-muted-foreground">{(a.sizeBytes / 1024).toFixed(1)} KB</p>
            <label className="mt-1 block text-xs text-muted-foreground">Alt text
              <input key={a.altText} defaultValue={a.altText ?? ""} className="mt-0.5 h-7 w-full rounded-md border border-border bg-background px-1.5 text-xs" onBlur={(e) => e.target.value !== (a.altText ?? "") && void run(() => api(`/projects/${id}/assets/${a.id}`, { method: "PATCH", body: { altText: e.target.value } }))} />
            </label>
            <Button size="sm" variant="ghost" className="mt-1" onClick={async () => { if (await ask(`Delete ${a.name}?`)) void run(() => api(`/projects/${id}/assets/${a.id}`, { method: "DELETE" })); }}>Delete</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
