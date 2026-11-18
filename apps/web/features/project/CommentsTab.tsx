"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAction, useQuery } from "./hooks";

interface Comment { id: string; authorName: string; body: string; createdAt: number; resolvedAt?: number; elementId?: string }

export function CommentsTab({ id }: { id: string }) {
  const q = useQuery<{ comments: Comment[] }>(`/projects/${id}/comments`);
  const [body, setBody] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const { run, error, busy } = useAction(q.reload);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(async () => { const r = await api<{ token: string }>(`/projects/${id}/review-links`, { method: "POST", body: {} }); setLink(`${location.origin}/review/${r.token}`); })}>Create review link</Button>
        {link && <input readOnly aria-label="Review link" value={link} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs" onFocus={(e) => e.currentTarget.select()} />}
      </div>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (body.trim()) void run(async () => { await api(`/projects/${id}/comments`, { method: "POST", body: { body: body.trim() } }); setBody(""); }); }}>
        <textarea aria-label="New comment" rows={3} value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded-md border border-border bg-background p-2" placeholder="Leave a comment" />
        <Button type="submit" disabled={busy || !body.trim()}>Comment</Button>
      </form>
      {(error ?? q.error) && <p role="alert" className="text-xs text-destructive">{error ?? q.error}</p>}
      <ul className="space-y-2">
        {q.data?.comments.length === 0 && <li className="text-muted-foreground">No comments yet.</li>}
        {q.data?.comments.map((c) => (
          <li key={c.id} className={`rounded-md border border-border p-3 ${c.resolvedAt ? "opacity-60" : ""}`}>
            <p className="text-xs text-muted-foreground">{c.authorName} · {new Date(c.createdAt).toLocaleString()}{c.resolvedAt ? " · resolved" : ""}</p>
            <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
            {!c.resolvedAt && <Button size="sm" variant="ghost" className="mt-1" onClick={() => void run(() => api(`/projects/${id}/comments/${c.id}/resolve`, { method: "POST" }))}>Resolve</Button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
