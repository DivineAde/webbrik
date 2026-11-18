"use client";
import { use, useEffect, useMemo, useState } from "react";
import { renderPage } from "@webbrik/renderer";
import type { Document } from "@webbrik/document-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

interface Review { project: { name: string }; document: Document; comments: { id: string; authorName: string; body: string; createdAt: number }[]; approvedAt: number | null }

/** Public, no-login review page opened from a review link. The page is rendered in a sandboxed iframe without scripts. */
export default function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [r, setR] = useState<Review | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(""); const [body, setBody] = useState("");
  const [pageIdx, setPageIdx] = useState(0);
  const load = () => api<Review>(`/public/review/${token}`).then(setR).catch((e: Error) => setErr(e.message));
  useEffect(() => { void load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const html = useMemo(() => { if (!r) return ""; const page = r.document.pages[pageIdx] ?? r.document.pages[0]!; return renderPage(r.document, page, {}).html; }, [r, pageIdx]);
  const act = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); await load(); } catch (e) { setErr((e as Error).message); } };

  if (err && !r) return <main className="p-8"><p role="alert">This review link is invalid or has expired.</p></main>;
  if (!r) return <main className="p-8 text-muted-foreground">Loading…</main>;
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <span className="text-xs font-semibold">Webbrik</span><h1 className="font-semibold">{r.project.name}</h1><span className="text-xs text-muted-foreground">Review</span>
        {r.document.pages.length > 1 && <select aria-label="Page" className="h-8 rounded-md border border-border bg-background px-2 text-xs" value={pageIdx} onChange={(e) => setPageIdx(Number(e.target.value))}>{r.document.pages.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}</select>}
        <span className="ml-auto text-xs" role="status">{r.approvedAt ? `Approved ${new Date(r.approvedAt).toLocaleString()}` : "Awaiting approval"}</span>
      </header>
      <div className="flex min-h-0 flex-1">
        {/* sandbox="" (no scripts, no same-origin): the reviewer only sees the design. */}
        <iframe title="Page preview" sandbox="" srcDoc={html} className="min-w-0 flex-1 bg-white" />
        <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-auto border-l border-border bg-panel p-3">
          <label className="text-xs">Your name<Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (name.trim() && body.trim()) void act(async () => { await api(`/public/review/${token}/comments`, { method: "POST", body: { authorName: name.trim(), body: body.trim() } }); setBody(""); }); }}>
            <textarea aria-label="Comment" rows={3} value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded-md border border-border bg-background p-2" placeholder="Leave feedback" />
            <div className="flex gap-2"><Button type="submit" size="sm" disabled={!name.trim() || !body.trim()}>Send</Button>
              <Button type="button" size="sm" variant="secondary" disabled={!name.trim() || !!r.approvedAt} onClick={() => void act(() => api(`/public/review/${token}/approve`, { method: "POST", body: { name: name.trim() } }))}>Approve</Button></div>
          </form>
          {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
          <ul className="space-y-2">{r.comments.map((c) => <li key={c.id} className="rounded-md border border-border p-2"><p className="text-xs text-muted-foreground">{c.authorName}</p><p className="whitespace-pre-wrap">{c.body}</p></li>)}</ul>
        </aside>
      </div>
    </div>
  );
}
