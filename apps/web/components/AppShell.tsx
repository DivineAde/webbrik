"use client";
import { Archive, Check, ChevronsUpDown, FolderKanban, LifeBuoy, LogOut, Menu, Settings, Sparkles, UserRound, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { shellCache } from "@/lib/shell-cache";
import { PLANS } from "@webbrik/shared";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { LogoMark } from "@/components/Logo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/time";

export interface ShellWorkspace { id: string; name: string; plan: string; role: string }
export type ShellNav = "projects" | "archived" | "workspace" | "settings" | "help";

interface Props {
  user: { name: string; email: string } | null;
  workspaces: ShellWorkspace[];
  activeId: string;
  onSwitch: (id: string) => void;
  nav: ShellNav;
  /** Omit on pages other than the dashboard: Projects and Archived then link to it. */
  onNav?: (n: ShellNav) => void;
  onSignOut: () => void;
  children: ReactNode;
}

const link = "group/nav relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-background aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:shadow-[var(--shadow-sm)] aria-[current=page]:ring-1 aria-[current=page]:ring-border [&_svg]:size-[18px] [&_svg]:shrink-0 aria-[current=page]:[&_svg]:text-foreground before:absolute before:-left-3 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-foreground before:opacity-0 aria-[current=page]:before:opacity-100";
const count = "ml-auto rounded-full bg-muted px-2 text-xs font-medium tabular-nums text-muted-foreground group-aria-[current=page]/nav:bg-accent";

/** Sidebar layout for the signed-in app: workspace switcher on top, navigation in the middle, account menu at the bottom. */
export function AppShell({ user, workspaces, activeId, onSwitch, nav, onNav, onSignOut, children }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Project count for the sidebar badge and plan meter, from the workspace usage endpoint.
  const [used, setUsed] = useState<number | null>(shellCache.used[activeId] ?? null);
  useEffect(() => { setUsed(shellCache.used[activeId] ?? null); if (!activeId) return; let live = true; api<{ usage: { projects: number } }>(`/workspaces/${activeId}/usage`).then((r) => { if (live) { shellCache.used[activeId] = r.usage.projects; setUsed(r.usage.projects); } }).catch(() => undefined); return () => { live = false; }; }, [activeId]);
  const counts = { projects: used ?? undefined, archived: undefined as number | undefined };
  const ws = workspaces.find((w) => w.id === activeId);
  const side = (
    <div className="flex h-full w-[264px] flex-col bg-panel">
      <div className="flex h-14 items-center gap-2 px-4 text-foreground"><LogoMark size={24} /><span className="text-[15px] font-semibold tracking-tight">Webbrik</span></div>
      <div className="px-3 pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-11 w-full items-center gap-2.5 rounded-lg border border-border bg-background px-2.5 text-left shadow-[var(--shadow-sm)] hover:border-ring/60 focus-visible:outline-2 focus-visible:outline-ring">
            <span className="sr-only">Switch workspace: </span>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">{initials(ws?.name ?? "W")}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium leading-4">{ws?.name ?? "Workspace"}</span><span className="block text-xs capitalize leading-4 text-muted-foreground">{ws?.plan ?? "free"} plan</span></span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[240px]">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem key={w.id} onSelect={() => onSwitch(w.id)}>
                <span className="flex size-6 items-center justify-center rounded bg-muted text-[11px] font-semibold">{initials(w.name)}</span>
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                {w.id === activeId && <Check className="!text-foreground" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { router.push(`/workspaces/${activeId}`); }}><Users />Members and billing</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      <p className="px-6 pb-1 pt-5 text-xs font-medium text-muted-foreground">Build</p>
      <nav aria-label="Main" className="space-y-0.5 px-3">
        {onNav ? (
          <>
            <button type="button" className={cn(link, "w-full")} aria-current={nav === "projects" ? "page" : undefined} onClick={() => { onNav("projects"); setOpen(false); }}><FolderKanban />Projects{counts?.projects != null && <span className={count}>{counts.projects}</span>}</button>
            <button type="button" className={cn(link, "w-full")} aria-current={nav === "archived" ? "page" : undefined} onClick={() => { onNav("archived"); setOpen(false); }}><Archive />Archived{!!counts?.archived && <span className={count}>{counts.archived}</span>}</button>
          </>
        ) : (
          <>
            <Link className={link} href="/dashboard"><FolderKanban />Projects{counts.projects != null && <span className={count}>{counts.projects}</span>}</Link>
            <Link className={link} href="/dashboard?view=archived"><Archive />Archived</Link>
          </>
        )}
      </nav>
      <p className="px-6 pb-1 pt-5 text-xs font-medium text-muted-foreground">Manage</p>
      <nav aria-label="Manage" className="space-y-0.5 px-3">
        <Link className={link} href={`/workspaces/${activeId}`} aria-current={nav === "workspace" ? "page" : undefined}><Users />Workspace</Link>
        <Link className={link} href="/settings" aria-current={nav === "settings" ? "page" : undefined}><Settings />Account settings</Link>
      </nav>
      <div className="flex-1" />
      {ws && counts?.projects != null && (() => {
        const max = PLANS[ws.plan]?.maxProjects ?? PLANS["free"]!.maxProjects, pct = Math.min(100, Math.round((counts.projects / Math.max(max, 1)) * 100));
        return (
          <Link href={`/workspaces/${activeId}?tab=plan`} className="mx-3 mb-3 block rounded-xl border border-border bg-background p-3.5 shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-ring">
            <span className="flex items-center justify-between text-sm font-medium"><span className="capitalize">{ws.plan} plan</span><Sparkles className="size-4 text-muted-foreground" aria-hidden /></span>
            <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full rounded-full", pct >= 90 ? "bg-destructive" : "bg-foreground")} style={{ width: `${pct}%` }} /></span>
            <span className="mt-2 block text-xs text-muted-foreground">{counts.projects} of {max} projects used</span>
          </Link>
        );
      })()}
      </div>
      <div className="shrink-0 space-y-0.5 border-t border-border px-3 py-3">
        <Link className={link} href="/help" aria-current={nav === "help" ? "page" : undefined}><LifeBuoy />Help center</Link>
        <DropdownMenu>
          <DropdownMenuTrigger className="mt-1 flex h-12 w-full items-center gap-2.5 rounded-lg px-2.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
            <span className="sr-only">Account menu: </span>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">{initials(user?.name ?? "")}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium leading-4">{user?.name ?? "Account"}</span><span className="block truncate text-xs leading-4 text-muted-foreground">{user?.email ?? ""}</span></span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-[240px]">
            <div className="flex items-center gap-2 px-2.5 py-2"><UserRound className="size-4 text-muted-foreground" /><span className="truncate text-sm">{user?.email}</span>{ws && <Badge className="ml-auto capitalize">{ws.plan}</Badge>}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { router.push("/settings"); }}><Settings />Account settings</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { router.push("/help"); }}><LifeBuoy />Help center</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSignOut}><LogOut />Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden shrink-0 border-r border-border md:block">{side}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 shadow-[var(--shadow-lg)]">{side}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4 md:hidden">
          <button aria-label={open ? "Close menu" : "Open menu"} className="flex size-9 items-center justify-center rounded-md hover:bg-accent" onClick={() => setOpen((v) => !v)}>{open ? <X className="size-5" /> : <Menu className="size-5" />}</button>
          <LogoMark /><span className="font-semibold">Webbrik</span>
        </div>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
