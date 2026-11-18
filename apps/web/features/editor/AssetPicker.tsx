"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useEditor } from "./store";
import { Section } from "./style-controls";

interface Asset { id: string; name: string; mime: string; altText?: string }
const toBase64 = (buf: ArrayBuffer) => { let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

/** Modal list of the project's images with upload. Choosing one stores an `asset:<id>` reference on the element. */
function Dialog({ projectId, onPick, onClose }: { projectId: string; onPick: (a: Asset) => void; onClose: () => void }) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const load = async () => { try { setAssets((await api<{ assets: Asset[] }>(`/projects/${projectId}/assets`)).assets.filter((a) => a.mime.startsWith("image/"))); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }; window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true); }, [onClose]);
  const upload = async (files: File[]) => {
    setBusy(true); setError(null);
    try {
      let last: Asset | null = null;
      for (const f of files) last = (await api<{ asset: Asset }>(`/projects/${projectId}/assets`, { method: "POST", body: { name: f.name, mime: f.type || undefined, contentBase64: toBase64(await f.arrayBuffer()) } })).asset;
      await load();
      if (last && files.length === 1) onPick(last);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Choose an image" className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-background shadow-[var(--shadow-lg)]">
        <header className="flex items-center justify-between border-b border-border p-3">
          <h2 className="text-sm font-medium">Choose an image</h2>
          <div className="flex gap-2">
            <input ref={input} type="file" accept="image/*" multiple className="hidden" aria-label="Upload images" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) void upload(f); }} />
            <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : "Upload"}</Button>
            <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {error && <p role="alert" className="mb-2 text-xs text-destructive">{error}</p>}
          {assets?.length === 0 && <p className="text-sm text-muted-foreground">No images yet. Upload one to use it here.</p>}
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {assets?.map((a) => (
              <li key={a.id}>
                <button type="button" className="w-full rounded-md border border-border p-1 text-left hover:border-primary focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onPick(a)} aria-label={`Use ${a.name}`}>
                  <img src={`/api/projects/${projectId}/assets/${a.id}/raw`} alt="" className="h-20 w-full rounded bg-muted object-contain" />
                  <span className="mt-1 block truncate text-xs">{a.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Inspector section for images: pick from the project's assets or enter an address, plus alt text. */
export function ImageSource({ id }: { id: string }) {
  const node = useEditor((s) => s.doc.nodes[id]);
  const projectId = useEditor((s) => s.remote?.projectId);
  const commit = useEditor((s) => s.commit);
  const [open, setOpen] = useState(false);
  if (!node || node.tag !== "img") return null;
  const src = node.attributes["src"] ?? "";
  const set = (attrs: Record<string, string>) => commit("Set image", [{ type: "updateElement", id, patch: { attributes: { ...node.attributes, ...attrs } } }]);
  return (
    <Section title="Image" id="image">
      <div className="space-y-1.5">
        {projectId ? <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Choose from assets…</Button> : <p className="text-xs text-muted-foreground">Open a saved project to use uploaded assets.</p>}
        <label className="block text-xs">{src.startsWith("asset:") ? "Source (uploaded asset)" : "Source address"}
          <input aria-label="Image source" key={id + src} defaultValue={src} className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs" onBlur={(e) => e.target.value !== src && set({ src: e.target.value.trim() })} />
        </label>
        <label className="block text-xs">Alt text
          <input aria-label="Image alt text" key={id + (node.attributes["alt"] ?? "")} defaultValue={node.attributes["alt"] ?? ""} className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs" onBlur={(e) => e.target.value !== (node.attributes["alt"] ?? "") && set({ alt: e.target.value })} />
        </label>
      </div>
      {open && projectId && <Dialog projectId={projectId} onClose={() => setOpen(false)} onPick={(a) => { set({ src: `asset:${a.id}`, alt: node.attributes["alt"] || a.altText || "" }); setOpen(false); }} />}
    </Section>
  );
}
