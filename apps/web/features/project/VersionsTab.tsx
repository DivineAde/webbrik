"use client";
import { useState } from "react";
import { ask } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAction, useQuery } from "./hooks";
import { VisualDiff } from "./VisualDiff";

interface Version { id: string; name: string; revision: number; createdAt: number }

export function VersionsTab({ id }: { id: string }) {
  const q = useQuery<{ versions: Version[] }>(`/projects/${id}/versions`);
  const [name, setName] = useState("");
  const [diff, setDiff] = useState<Version | null>(null);
  const { run, error, busy } = useAction(q.reload);
  return (
    <section className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void run(async () => { await api(`/projects/${id}/versions`, { method: "POST", body: { name: name.trim() } }); setName(""); }); }}>
        <Input aria-label="Version name" placeholder="Name this version, e.g. “Before launch”" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={busy || !name.trim()}>Save version</Button>
      </form>
      {(error ?? q.error) && <p role="alert" className="text-xs text-destructive">{error ?? q.error}</p>}
      <ul className="divide-y divide-border rounded-md border border-border">
        {q.data?.versions.length === 0 && <li className="p-3 text-muted-foreground">No saved versions yet.</li>}
        {q.data?.versions.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-2 p-3">
            <span><span className="font-medium">{v.name}</span> <span className="text-xs text-muted-foreground">r{v.revision} · {new Date(v.createdAt).toLocaleString()}</span></span>
            <span className="flex gap-1">
              <Button size="sm" variant="secondary" onClick={() => setDiff(diff?.id === v.id ? null : v)} aria-pressed={diff?.id === v.id}>Compare to current</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={async () => { if (await ask(`Restore “${v.name}”? Your current state stays in history.`)) void run(() => api(`/projects/${id}/versions/${v.id}/restore`, { method: "POST" })); }}>Restore</Button>
            </span>
          </li>
        ))}
      </ul>
      {diff && <VisualDiff projectId={id} fromRevision={diff.revision} label={diff.name} />}
    </section>
  );
}
