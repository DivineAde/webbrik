"use client";
import { Archive, ArchiveRestore, ArrowUpDown, Copy, ExternalLink, LayoutGrid, List, MoreHorizontal, Pencil, Plus, Search, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";
import { shellCache } from "@/lib/shell-cache";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell, type ShellNav, type ShellWorkspace } from "@/components/AppShell";
import { BrickPattern } from "@/components/BrickPattern";
import { Button } from "@/components/ui/button";
import { ask } from "@/components/ui/confirm";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/time";
import { Checklist } from "@/features/help/Checklist";

interface Project { id: string; name: string; description?: string; thumbnail?: string; updatedAt: number; createdAt: number; archivedAt?: number }
type Sort = "updated" | "name" | "created";
const SORTS: { id: Sort; label: string }[] = [{ id: "updated", label: "Last modified" }, { id: "name", label: "Name" }, { id: "created", label: "Date created" }];

function ProjectMenu({ p, onRename, onChanged, onNotice, archived }: { p: Project; archived: boolean; onRename: (p: Project) => void; onChanged: () => void; onNotice: (m: string) => void }) {
  const router = useRouter();
  const run = async (fn: () => Promise<unknown>, done: string) => { try { await fn(); onNotice(done); onChanged(); } catch (e) { onNotice((e as Error).message); } };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Actions for ${p.name}`} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-accent"><MoreHorizontal className="size-[18px]" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => { router.push(`/editor/${p.id}`); }}><ExternalLink />Open editor</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { router.push(`/projects/${p.id}`); }}><Settings2 />Project settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onRename(p)}><Pencil />Rename</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run(() => api(`/projects/${p.id}/duplicate`, { method: "POST" }), "Project duplicated")}><Copy />Duplicate</DropdownMenuItem>
        {archived
          ? <DropdownMenuItem onSelect={() => void run(() => api(`/projects/${p.id}/restore`, { method: "POST" }), "Project restored")}><ArchiveRestore />Restore</DropdownMenuItem>
          : <DropdownMenuItem onSelect={() => void run(() => api(`/projects/${p.id}/archive`, { method: "POST" }), "Project archived")}><Archive />Archive</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={async () => { if (await ask(`Delete “${p.name}”? It is removed from your workspace.`, { confirmLabel: "Delete", destructive: true })) void run(() => api(`/projects/${p.id}`, { method: "DELETE" }), "Project deleted"); }}><Trash2 />Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Thumb({ p, className }: { p: Project; className?: string }) {
  return p.thumbnail
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={p.thumbnail} alt="" className={cn("size-full object-cover", className)} />
    : <BrickPattern seed={p.id} className={cn("size-full", className)} />;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(shellCache.user);
  const [ws, setWs] = useState<ShellWorkspace[]>(shellCache.ws);
  const [active, setActive] = useState(shellCache.active);
  const [nav, setNav] = useState<ShellNav>("projects");
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("updated");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // Keyboard: "/" jumps to search, "N" starts a new project (ignored while typing or in a dialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable], [role=dialog], [role=menu]")) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key.toLowerCase() === "n" && nav === "projects" && active) { e.preventDefault(); setName(""); setErr(null); setCreating(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, active]);

  useEffect(() => { if (new URLSearchParams(location.search).get("view") === "archived") setNav("archived"); }, []);
  useEffect(() => { try { const v = localStorage.getItem("webbrik.dashboard.view"); if (v === "list" || v === "grid") setView(v); const s = localStorage.getItem("webbrik.dashboard.sort"); if (SORTS.some((x) => x.id === s)) setSort(s as Sort); } catch { /* storage unavailable */ } }, []);
  useEffect(() => { try { localStorage.setItem("webbrik.dashboard.view", view); localStorage.setItem("webbrik.dashboard.sort", sort); } catch { /* storage unavailable */ } }, [view, sort]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 3500); return () => clearTimeout(t); }, [notice]);

  const load = useCallback(async (wid: string, which: ShellNav, order: Sort) => {
    if (!wid) return;
    try {
      const sortParam = order === "updated" ? "updated" : order, dir = order === "name" ? "asc" : "desc";
      setProjects((await api<{ projects: Project[] }>(`/workspaces/${wid}/projects?sort=${sortParam}&order=${dir}${which === "archived" ? "&archived=true" : ""}`)).projects);
    } catch (e) { setErr((e as Error).message); }
  }, []);

  useEffect(() => {
    api<{ user: { name: string; email: string } }>("/auth/me").then((r) => { shellCache.user = r.user; setUser(r.user); }).catch(() => undefined);
    api<{ workspaces: ShellWorkspace[] }>("/workspaces").then((r) => {
      setWs(r.workspaces); shellCache.ws = r.workspaces;
      let saved = ""; try { saved = localStorage.getItem("webbrik.workspace") ?? ""; } catch { /* storage unavailable */ }
      const first = r.workspaces.find((w) => w.id === saved) ?? r.workspaces[0];
      if (first) { shellCache.active = first.id; setActive(first.id); }
    }).catch((e: { status?: number; message: string }) => { if (e.status === 401) router.replace("/login"); else setErr(e.message); });
  }, [router]);
  useEffect(() => { setProjects(null); void load(active, nav, sort); }, [active, nav, sort, load]);

  const shown = useMemo(() => (projects ?? []).filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())), [projects, q]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); if (!name.trim() || !active) return;
    setBusy(true); setErr(null);
    try { const r = await api<{ project: Project }>(`/workspaces/${active}/projects`, { method: "POST", body: { name: name.trim() } }); router.push(`/editor/${r.project.id}`); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  async function rename(e: React.FormEvent) {
    e.preventDefault(); if (!renaming || !renameTo.trim()) return;
    try { await api(`/projects/${renaming.id}`, { method: "PATCH", body: { name: renameTo.trim() } }); setRenaming(null); setNotice("Project renamed"); void load(active, nav, sort); } catch (e) { setErr((e as Error).message); }
  }
  const reload = () => void load(active, nav, sort);
  const archived = nav === "archived";

  return (
    <AppShell
      user={user} workspaces={ws} activeId={active} nav={nav}
      onSwitch={(id) => { setActive(id); try { localStorage.setItem("webbrik.workspace", id); } catch { /* storage unavailable */ } }}
      onNav={setNav}
      onSignOut={async () => { await api("/auth/logout", { method: "POST" }); router.push("/login"); }}
    >
      <div className="mx-auto w-full max-w-[1200px] px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-xl font-semibold">{archived ? "Archived projects" : "Projects"}</h1>
            <p className="text-sm text-muted-foreground">{projects === null ? <span className="inline-block h-4 w-16 translate-y-0.5 animate-pulse rounded bg-muted motion-reduce:animate-none" aria-label="Loading" /> : `${projects.length} ${projects.length === 1 ? "project" : "projects"}`}</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input ref={searchRef} aria-label="Search projects" placeholder="Search projects" className="pl-8 pr-8" value={q} onChange={(e) => setQ(e.target.value)} />
            <kbd aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">/</kbd>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm shadow-[var(--shadow-sm)] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><span className="sr-only">Sort and view: </span><ArrowUpDown className="size-4 text-muted-foreground" />{SORTS.find((s) => s.id === sort)?.label}</DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as Sort)}>{SORTS.map((s) => <DropdownMenuRadioItem key={s.id} value={s.id}>{s.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={view === "list"} onCheckedChange={(c) => setView(c ? "list" : "grid")}>Show as list</DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div role="group" aria-label="Layout" className="hidden h-9 items-center rounded-md border border-border bg-background p-0.5 shadow-[var(--shadow-sm)] sm:flex">
            {([["grid", LayoutGrid, "Grid view"], ["list", List, "List view"]] as const).map(([v, Icon, label]) => (
              <button key={v} type="button" aria-label={label} aria-pressed={view === v} onClick={() => setView(v)} className={cn("flex size-8 items-center justify-center rounded text-muted-foreground hover:text-foreground", view === v && "bg-accent text-foreground")}><Icon className="size-4" /></button>
            ))}
          </div>
          {!archived && <Button onClick={() => { setName(""); setErr(null); setCreating(true); }}><Plus className="size-4" />New project</Button>}
        </header>

        {!archived && projects && projects.length > 0 && (() => {
          const week = Date.now() - 7 * 864e5, recent = projects.filter((p) => p.updatedAt > week).length, last = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)[0]!;
          const hour = new Date().getHours(), hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening", first = user?.name?.split(" ")[0];
          return (
            <div className="mt-6 grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr]" aria-label="Overview">
              <div className="relative overflow-hidden rounded-xl border border-border bg-primary p-5 text-primary-foreground">
                <p className="relative text-lg font-semibold tracking-tight">{hello}{first ? `, ${first}` : ""}.</p>
                <Link href={`/editor/${last.id}`} className="relative mt-1 inline-flex items-center gap-1.5 text-sm text-primary-foreground/80 underline-offset-4 hover:text-primary-foreground hover:underline">Continue with {last.name}<ExternalLink className="size-3.5" aria-hidden /></Link>
              </div>
              {([["Projects", String(projects.length)], ["Edited this week", String(recent)], ["Last edit", timeAgo(last.updatedAt)]] as const).map(([k, v]) => (
                <div key={k} className="rounded-xl border border-border bg-background p-5 shadow-[var(--shadow-sm)] transition-transform duration-200 hover:-translate-y-0.5">
                  <p className="text-2xl font-semibold tabular-nums tracking-tight">{v}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{k}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {!archived && projects && active && <div className="mt-6"><Checklist workspaceId={active} projectCount={projects.length} firstProjectId={projects[0]?.id} /></div>}
        {err && !creating && <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{err}</p>}

        <section aria-label="Projects" className="mt-6">
          {projects === null ? (
            <ul className={view === "grid" ? "grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(270px,1fr))]" : "space-y-2"} aria-busy="true">
              {[0, 1, 2].map((i) => <li key={i} className={cn("animate-pulse rounded-xl bg-muted", view === "grid" ? "aspect-[16/12]" : "h-16")} />)}
            </ul>
          ) : projects.length === 0 ? (
            <div className="relative overflow-hidden rounded-2xl border border-border">
              <BrickPattern seed={archived ? "archive" : "welcome"} bold neutral className="absolute inset-0 size-full opacity-70" />
              <div className="relative mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
                <h2 className="text-xl font-semibold">{archived ? "Nothing archived" : "Build your first site"}</h2>
                <p className="text-sm text-muted-foreground">{archived ? "Projects you archive are kept here until you restore or delete them." : "Start from a blank canvas. You can drag in layouts, set up your design tokens, and publish when you are ready."}</p>
                {!archived && <Button size="lg" onClick={() => { setName(""); setCreating(true); }}><Plus className="size-4" />New project</Button>}
              </div>
            </div>
          ) : shown.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No projects match “{q}”.</p>
          ) : view === "grid" ? (
            <ul className="grid gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(270px,1fr))]">
              {shown.map((p) => (
                <li key={p.id} className="group">
                  <Link href={archived ? `/projects/${p.id}` : `/editor/${p.id}`} className="block overflow-hidden rounded-xl border border-border bg-muted shadow-[var(--shadow-sm)] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    <div className="relative aspect-[16/10]"><Thumb p={p} />{!archived && <span aria-hidden className="absolute bottom-2.5 right-2.5 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background opacity-0 shadow-[var(--shadow-md)] transition-opacity duration-150 group-hover:opacity-100">Open editor</span>}</div>
                  </Link>
                  <div className="mt-3 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Link href={archived ? `/projects/${p.id}` : `/editor/${p.id}`} className="block truncate text-sm font-medium hover:underline">{p.name}</Link>
                      <p className="text-xs text-muted-foreground">Edited {timeAgo(p.updatedAt)}</p>
                    </div>
                    <ProjectMenu p={p} archived={archived} onRename={(x) => { setRenaming(x); setRenameTo(x.name); }} onChanged={reload} onNotice={setNotice} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {shown.map((p) => (
                <li key={p.id} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/50">
                  <Link href={archived ? `/projects/${p.id}` : `/editor/${p.id}`} className="h-12 w-20 shrink-0 overflow-hidden rounded-md border border-border"><Thumb p={p} /></Link>
                  <Link href={archived ? `/projects/${p.id}` : `/editor/${p.id}`} className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.name}</span><span className="block text-xs text-muted-foreground">Edited {timeAgo(p.updatedAt)}</span></Link>
                  <span className="hidden text-xs text-muted-foreground md:block">Created {new Date(p.createdAt).toLocaleDateString()}</span>
                  <ProjectMenu p={p} archived={archived} onRename={(x) => { setRenaming(x); setRenameTo(x.name); }} onChanged={reload} onNotice={setNotice} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Dialog open={creating} onOpenChange={(o) => { if (!busy) setCreating(o); }}>
        <DialogContent title="New project" description="Give it a name. You can change it later.">
          <form onSubmit={create} className="mt-4 space-y-4">
            <label className="block text-sm font-medium">Project name<Input autoFocus required className="mt-1.5 h-10" placeholder="Portfolio, Landing page, Studio site…" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
            {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
            <div className="flex justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary">Cancel</Button></DialogClose><Button type="submit" disabled={!name.trim() || busy}>{busy ? "Creating…" : "Create project"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!renaming} onOpenChange={(o) => { if (!o) setRenaming(null); }}>
        <DialogContent title="Rename project">
          <form onSubmit={rename} className="mt-4 space-y-4">
            <label className="block text-sm font-medium">Project name<Input autoFocus required className="mt-1.5 h-10" value={renameTo} onChange={(e) => setRenameTo(e.target.value)} maxLength={100} /></label>
            <div className="flex justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary">Cancel</Button></DialogClose><Button type="submit" disabled={!renameTo.trim()}>Save name</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      {notice && <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-foreground px-4 py-2.5 text-sm text-background shadow-[var(--shadow-lg)]">{notice}</div>}
    </AppShell>
  );
}
