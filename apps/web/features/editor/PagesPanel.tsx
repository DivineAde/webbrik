"use client";
import { Home, Plus, Trash2 } from "lucide-react";
import { createId, createNode } from "@webbrik/document-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useEditor } from "./store";

const slug = (s: string) => "/" + (s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page");

export function PagesPanel() {
  const doc = useEditor((s) => s.doc);
  const pageId = useEditor((s) => s.pageId);
  const setPage = useEditor((s) => s.setPage);
  const commit = useEditor((s) => s.commit);
  const collections = useEditor((s) => s.collections);
  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]!;

  const add = () => {
    let n = doc.pages.length + 1, route = slug(`page ${n}`);
    while (doc.pages.some((p) => p.route === route)) route = slug(`page ${++n}`);
    const rootId = createId("root"), id = createId("page");
    if (commit("Add page", [{ type: "addPage", page: { id, name: `Page ${n}`, route, rootId, meta: {}, isHome: false }, rootNode: createNode({ id: rootId, parentId: null, tag: "main", name: "Page" }) }])) setPage(id);
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-2">
      <div className="flex items-center justify-between"><span className="text-xs font-medium">Pages</span><Button size="sm" variant="secondary" onClick={add}><Plus className="h-3.5 w-3.5" />Add</Button></div>
      <ul className="space-y-0.5">
        {doc.pages.map((p) => (
          <li key={p.id}>
            <button onClick={() => setPage(p.id)} className={cn("flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent", p.id === page.id && "bg-accent font-medium")}>
              {p.isHome && <Home className="h-3.5 w-3.5" aria-label="Home page" />}<span className="truncate">{p.name}</span><span className="ml-auto text-xs text-muted-foreground">{p.route}</span>
            </button>
          </li>
        ))}
      </ul>
      <fieldset className="space-y-2 border-t border-border pt-3" key={page.id}>
        <legend className="text-xs font-medium">Page settings</legend>
        {([["Name", "name", page.name], ["Route", "route", page.route], ["SEO title", "title", page.meta.title ?? ""], ["SEO description", "description", page.meta.description ?? ""]] as const).map(([label, key, value]) => (
          <label key={key} className="block text-xs text-muted-foreground">{label}
            <Input defaultValue={value} onBlur={(e) => {
              const v = e.target.value; if (v === value) return;
              commit(`Update page ${key}`, [{ type: "updatePage", pageId: page.id, patch: key === "title" || key === "description" ? { meta: { ...page.meta, [key]: v } } : { [key]: v } }]);
            }} />
          </label>
        ))}
        {/:slug(\/|$)/.test(page.route) ? (
          <label className="block text-xs text-muted-foreground">Generate one page per item of
            <select aria-label="Page collection" className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs" value={page.collectionId ?? ""} onChange={(e) => commit("Set page collection", [{ type: "updatePage", pageId: page.id, patch: { collectionId: e.target.value || undefined } }])}>
              <option value="">Choose a collection…</option>{collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        ) : <p className="text-xs text-muted-foreground">Use a route like <code>/blog/:slug</code> to generate pages from a collection. SEO fields can use {"{title}"}-style placeholders.</p>}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={page.isHome} onClick={() => commit("Set home page", [{ type: "setHomePage", pageId: page.id }])}>Make home</Button>
          <Button size="sm" variant="secondary" disabled={page.isHome || doc.pages.length === 1} onClick={() => { const next = doc.pages.find((p) => p.id !== page.id)!; if (commit("Delete page", [{ type: "removePage", pageId: page.id }])) setPage(next.id); }}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
        </div>
      </fieldset>
    </div>
  );
}
