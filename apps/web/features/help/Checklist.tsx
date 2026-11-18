"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ArrowRight, Check, FolderPlus, Globe, MailCheck, MousePointerClick, UserPlus } from "lucide-react";

interface Step { id: string; label: string; done: boolean; href?: string; action?: string }
const KEY = "webbrik.onboarding.dismissed";

/** "Get started" checklist on the dashboard. Each step completes from real data (not from clicking), and the whole card can be dismissed. */
export function Checklist({ workspaceId, projectCount, firstProjectId }: { workspaceId: string; projectCount: number; firstProjectId?: string }) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem(KEY) === "1"); } catch { setHidden(false); } }, []);
  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    Promise.all([
      api<{ user: { emailVerified: boolean } }>("/auth/me").catch(() => null),
      api<{ usage: { members: number; publishes: number } }>(`/workspaces/${workspaceId}/usage`).catch(() => null),
    ]).then(([me, usage]) => {
      if (!live) return;
      setSteps([
        { id: "project", label: "Create a project", done: projectCount > 0 },
        { id: "build", label: "Add and style a few elements in the editor", done: false, href: firstProjectId ? `/editor/${firstProjectId}` : undefined, action: "Open editor" },
        { id: "publish", label: "Publish your site", done: (usage?.usage.publishes ?? 0) > 0, href: firstProjectId ? `/projects/${firstProjectId}?tab=Publish` : undefined, action: "Publish" },
        { id: "verify", label: "Verify your email", done: me?.user.emailVerified ?? true, href: "/settings", action: "Account" },
        { id: "team", label: "Invite a teammate", done: (usage?.usage.members ?? 1) > 1, href: `/workspaces/${workspaceId}`, action: "Invite" },
      ]);
    });
    return () => { live = false; };
  }, [workspaceId, projectCount, firstProjectId]);
  if (hidden || !steps) return null;
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const ICONS: Record<string, typeof FolderPlus> = { project: FolderPlus, build: MousePointerClick, publish: Globe, verify: MailCheck, team: UserPlus };
  const pct = done / steps.length, R = 34, C = 2 * Math.PI * R;
  return (
    <section aria-labelledby="gs-h" className="overflow-hidden rounded-2xl border border-border bg-background shadow-[var(--shadow-sm)]" data-testid="checklist">
      <div className="grid lg:grid-cols-[340px_1fr]">
        <div className="relative flex flex-col justify-between gap-6 bg-primary p-6 text-primary-foreground">
          <div className="relative flex items-center gap-4">
            <div className="relative size-20 shrink-0" role="progressbar" aria-label="Setup progress" aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length}>
              <svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden>
                <circle cx="40" cy="40" r={R} fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="6" />
                <circle cx="40" cy="40" r={R} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} className="transition-[stroke-dashoffset] duration-700 ease-out" />
              </svg>
              <span aria-hidden className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums">{done}/{steps.length}</span>
            </div>
            <div><h2 id="gs-h" className="text-lg font-semibold tracking-tight">Get started</h2><p className="text-sm text-primary-foreground/70">{done} of {steps.length} steps done</p></div>
          </div>
          <div className="relative">
            {next ? (
              <>
                <p className="text-sm text-primary-foreground/70">Next up</p>
                <p className="mt-0.5 font-medium">{next.label}</p>
                {next.href && <a href={next.href} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-background px-4 text-sm font-medium text-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0">{next.action}<ArrowRight className="size-4" aria-hidden /></a>}
              </>
            ) : <p className="font-medium">You have done everything on the list.</p>}
          </div>
        </div>
        <div className="p-3 sm:p-4">
          <div className="flex items-center justify-between px-3 pb-1 pt-1"><p className="text-sm font-medium text-muted-foreground">Setup steps</p><Button size="sm" variant="ghost" onClick={() => { try { localStorage.setItem(KEY, "1"); } catch { /* storage blocked */ } setHidden(true); }}>Dismiss</Button></div>
          <ul>
            {steps.map((s) => {
              const Icon = ICONS[s.id] ?? FolderPlus, isNext = s === next;
              return (
                <li key={s.id} className={`flex min-h-14 items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors ${isNext ? "bg-muted" : "hover:bg-muted/50"}`}>
                  <span className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className={`flex size-9 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-foreground text-background" : isNext ? "bg-background text-foreground ring-1 ring-border" : "bg-muted text-muted-foreground"}`}>{s.done ? <Check className="size-4" /> : <Icon className="size-4" />}</span>
                    <span className={`min-w-0 text-sm ${s.done ? "text-muted-foreground line-through decoration-border" : "font-medium"}`}>{s.label}{s.done && <span className="sr-only"> (done)</span>}</span>
                  </span>
                  {!s.done && s.href && <a className="shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium shadow-[var(--shadow-sm)] transition-colors hover:bg-accent" href={s.href}>{s.action}</a>}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
