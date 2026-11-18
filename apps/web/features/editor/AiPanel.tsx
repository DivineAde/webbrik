"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useEditor } from "./store";

interface Change { id: string; kind: string; detail?: string }
interface Proposal { id: string; summary: string; operations: unknown[] }
interface Result { ok: boolean; errors?: string[]; proposal?: Proposal; changes?: { nodes: Change[]; pages: unknown[]; tokens: unknown[]; classes: unknown[] } }

/** AI suggestions are proposals: validated on the server, previewed here, and only applied when the user accepts. */
export function AiPanel() {
  const remote = useEditor((s) => s.remote);
  const selectedId = useEditor((s) => s.selectedId);
  const doc = useEditor((s) => s.doc);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [prompt, setPrompt] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pid = remote?.projectId;
  useEffect(() => { if (pid) api<{ available: boolean }>(`/projects/${pid}/ai/status`).then((r) => setAvailable(r.available)).catch(() => setAvailable(false)); }, [pid]);

  if (!pid) return <p className="p-3 text-xs text-muted-foreground">Open a saved project to use AI suggestions.</p>;
  if (available === false) return <p className="p-3 text-xs text-muted-foreground">AI suggestions aren’t configured on this server.</p>;

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const ask = () => run(async () => { setDone(null); setRes(null); await remote!.flush(); setRes(await api<Result>(`/projects/${pid}/ai/proposals`, { method: "POST", body: { prompt, selectedId } })); });
  const accept = () => run(async () => {
    await remote!.flush(); // the server applies the proposal to the saved document, so send pending edits first
    await api(`/projects/${pid}/ai/proposals/${res!.proposal!.id}/accept`, { method: "POST" });
    await remote!.poll();
    setRes(null); setPrompt(""); setDone("Applied. Use Version history to go back to the revision before.");
  });
  const reject = () => run(async () => { await api(`/projects/${pid}/ai/proposals/${res!.proposal!.id}/reject`, { method: "POST" }); setRes(null); });
  const counts = (res?.changes?.nodes ?? []).reduce<Record<string, number>>((m, c) => ({ ...m, [c.kind]: (m[c.kind] ?? 0) + 1 }), {});
  const name = (id: string) => doc.nodes[id]?.name ?? doc.nodes[id]?.tag ?? id;

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3">
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (prompt.trim()) void ask(); }}>
        <label className="block text-xs">What should change?
          <textarea aria-label="AI prompt" rows={4} maxLength={2000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={selectedId ? "Describe a change to the selected element" : "Describe a change to this page"} className="mt-1 w-full rounded-md border border-border bg-background p-2" />
        </label>
        <Button type="submit" disabled={busy || !prompt.trim()}>{busy && !res ? "Thinking…" : "Suggest changes"}</Button>
        <p className="text-xs text-muted-foreground">Nothing changes until you accept. Each request counts toward your plan’s AI credits.</p>
      </form>
      {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
      {done && <p role="status" className="text-xs">{done}</p>}
      {res && !res.ok && (
        <div role="alert" className="rounded-md border border-border p-2 text-xs"><p className="font-medium">That suggestion couldn’t be used.</p><ul className="mt-1 list-disc pl-4 text-muted-foreground">{res.errors?.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul><p className="mt-1 text-muted-foreground">Try rephrasing. Your document was not changed.</p></div>
      )}
      {res?.ok && res.proposal && (
        <section aria-label="Proposed changes" className="space-y-2 rounded-md border border-border p-3">
          <p className="text-sm font-medium">{res.proposal.summary}</p>
          <ul className="text-xs text-muted-foreground">
            {Object.entries(counts).map(([k, n]) => <li key={k}>{n} element{n === 1 ? "" : "s"} {k}</li>)}
            {(res.changes?.tokens.length ?? 0) > 0 && <li>{res.changes!.tokens.length} design token change(s)</li>}
            {(res.changes?.classes.length ?? 0) > 0 && <li>{res.changes!.classes.length} class change(s)</li>}
          </ul>
          <details className="text-xs"><summary className="cursor-pointer">Affected elements</summary><ul className="mt-1 list-disc pl-4 text-muted-foreground">{res.changes?.nodes.slice(0, 20).map((c) => <li key={c.id + c.kind}>{name(c.id)} — {c.kind}</li>)}</ul></details>
          <div className="flex gap-2"><Button size="sm" onClick={() => void accept()} disabled={busy}>Accept</Button><Button size="sm" variant="secondary" onClick={() => void reject()} disabled={busy}>Reject</Button></div>
        </section>
      )}
    </div>
  );
}
