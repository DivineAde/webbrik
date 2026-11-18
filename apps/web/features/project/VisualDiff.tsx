"use client";
import { Skeleton } from "@/components/Skeleton";
import { useEffect, useMemo, useState } from "react";
import { diffDocuments, type Document, type DocumentDiff } from "@webbrik/document-model";
import { renderPage } from "@webbrik/renderer";
import { api } from "@/lib/api";

const COLORS = { added: "#16a34a", removed: "#dc2626", changed: "#d97706", moved: "#2563eb" } as const;
type Kind = keyof typeof COLORS;
const kindOf = (k: DocumentDiff["nodes"][number]["kind"]): Kind => (k === "added" ? "added" : k === "removed" ? "removed" : k === "moved" || k === "structure" ? "moved" : "changed");

function highlightCss(ids: Map<string, Kind>) {
  return [...ids].map(([id, k]) => `[data-node-id="${id.replace(/"/g, "")}"]{outline:2px solid ${COLORS[k]}!important;outline-offset:-2px;background-image:linear-gradient(${COLORS[k]}1f,${COLORS[k]}1f)}`).join("");
}
function frameHtml(doc: Document, pageId: string, marks: Map<string, Kind>): string {
  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]!;
  const html = renderPage(doc, page, { editor: true }).html;
  return html.replace("</head>", `<style>${highlightCss(marks)}a{pointer-events:none}</style></head>`);
}

/** Before/after of the same page, rendered by the publishing renderer, with changes outlined: green added, red removed, amber edited, blue moved. */
export function VisualDiff({ projectId, fromRevision, label }: { projectId: string; fromRevision: number; label: string }) {
  const [docs, setDocs] = useState<{ a: Document; b: Document } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pageId, setPageId] = useState<string>("");
  useEffect(() => {
    let live = true; setDocs(null); setErr(null);
    (async () => {
      const list = await api<{ revisions: { revision: number }[] }>(`/projects/${projectId}/revisions`);
      const head = list.revisions[0]?.revision; if (head === undefined) throw new Error("No revisions");
      const [a, b] = await Promise.all([api<{ document: Document }>(`/projects/${projectId}/revisions/${fromRevision}`), api<{ document: Document }>(`/projects/${projectId}/revisions/${head}`)]);
      if (live) { setDocs({ a: a.document, b: b.document }); setPageId(b.document.pages[0]?.id ?? ""); }
    })().catch((e: { message?: string }) => live && setErr(e.message ?? "Could not load the versions"));
    return () => { live = false; };
  }, [projectId, fromRevision]);

  const diff = useMemo(() => (docs ? diffDocuments(docs.a, docs.b) : null), [docs]);
  const view = useMemo(() => {
    if (!docs || !diff || !pageId) return null;
    const before = new Map<string, Kind>(), after = new Map<string, Kind>();
    for (const c of diff.nodes) { const k = kindOf(c.kind); (k === "removed" ? before : after).set(c.id, k); if (k !== "added" && k !== "removed") before.set(c.id, k); }
    const pa = docs.a.pages.find((p) => p.id === pageId) ? pageId : docs.a.pages[0]!.id;
    const pb = docs.b.pages.find((p) => p.id === pageId) ? pageId : docs.b.pages[0]!.id;
    return { a: frameHtml(docs.a, pa, before), b: frameHtml(docs.b, pb, after) };
  }, [docs, diff, pageId]);

  if (err) return <p role="alert" className="text-xs text-destructive">{err}</p>;
  if (!docs || !diff || !view) return <Skeleton className="h-48 w-full rounded-lg" />;
  const textual = diff.nodes.filter((n) => n.kind === "content" && n.detail);
  return (
    <div className="space-y-3 rounded-md border border-border p-3 text-xs" role="region" aria-label="Visual comparison" data-testid="visual-diff">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-medium">“{label}” → current</p>
        <span className="text-muted-foreground">{diff.summary.added} added · {diff.summary.removed} removed · {diff.summary.changed} changed</span>
        <ul className="flex gap-2" aria-label="Legend">{(Object.keys(COLORS) as Kind[]).map((k) => <li key={k} className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={{ background: COLORS[k] }} />{k}</li>)}</ul>
        {docs.b.pages.length > 1 && <select aria-label="Page" className="h-8 rounded-md border border-border bg-background px-1" value={pageId} onChange={(e) => setPageId(e.target.value)}>{docs.b.pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {([["Before", view.a], ["Now", view.b]] as const).map(([t, html]) => (
          <figure key={t}><figcaption className="mb-1 text-muted-foreground">{t}</figcaption>
            <iframe title={`${t} version`} sandbox="" srcDoc={html} className="h-80 w-full rounded border border-border bg-white" /></figure>
        ))}
      </div>
      {textual.length > 0 && (
        <ul className="space-y-0.5 text-muted-foreground" aria-label="Text changes">{textual.slice(0, 12).map((n, i) => <li key={i} className="truncate">✎ {n.detail}</li>)}</ul>
      )}
      {(diff.tokens.length > 0 || diff.pages.length > 0) && <p className="text-muted-foreground">{diff.pages.length} page change(s) · {diff.tokens.length} design token change(s)</p>}
    </div>
  );
}
