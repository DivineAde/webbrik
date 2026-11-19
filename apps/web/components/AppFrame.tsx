"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { resetShellCache, shellCache } from "@/lib/shell-cache";
import { AppShell, type ShellNav, type ShellWorkspace } from "@/components/AppShell";

/** The signed-in layout for every page outside the dashboard and editor: sidebar, page title, breadcrumb, content. */
export function AppFrame({ nav, title, description, crumbs = [], actions, width = "max-w-4xl", children }: {
  nav: ShellNav; title: ReactNode; description?: ReactNode; crumbs?: { href?: string; label: string }[]; actions?: ReactNode; width?: string; children: ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState(shellCache.user);
  const [ws, setWs] = useState<ShellWorkspace[]>(shellCache.ws);
  const [active, setActive] = useState(shellCache.active);
  useEffect(() => {
    api<{ user: { name: string; email: string } }>("/auth/me").then((r) => { shellCache.user = r.user; setUser(r.user); }).catch((e: { status?: number }) => { if (e.status === 401) router.replace("/login"); });
    api<{ workspaces: ShellWorkspace[] }>("/workspaces").then((r) => {
      setWs(r.workspaces); shellCache.ws = r.workspaces;
      let saved = ""; try { saved = localStorage.getItem("webbrik.workspace") ?? ""; } catch { /* storage unavailable */ }
      const first = r.workspaces.find((w) => w.id === saved) ?? r.workspaces[0];
      if (first) { shellCache.active = first.id; setActive(first.id); }
    }).catch(() => undefined);
  }, [router]);
  return (
    <AppShell
      user={user} workspaces={ws} activeId={active} nav={nav}
      onSwitch={(id) => { shellCache.active = id; setActive(id); try { localStorage.setItem("webbrik.workspace", id); } catch { /* storage unavailable */ } router.push(`/workspaces/${id}`); }}
      onSignOut={async () => { await api("/auth/logout", { method: "POST" }); resetShellCache(); router.push("/login"); }}
    >
      <div className={`mx-auto w-full ${width} px-5 py-8 sm:px-8 lg:px-10`}>
        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
                {c.href ? <Link href={c.href} className="underline-offset-4 hover:text-foreground hover:underline">{c.label}</Link> : <span aria-current="page" className="text-foreground">{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <header className="flex flex-wrap items-start gap-3 pb-6">
          <div className="mr-auto min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </header>
        {children}
      </div>
    </AppShell>
  );
}
