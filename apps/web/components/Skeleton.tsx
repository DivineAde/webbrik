"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { shellCache } from "@/lib/shell-cache";
import { AppShell, type ShellNav } from "@/components/AppShell";

/** A placeholder block. Pulses, and stands still for people who ask for reduced motion. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)} />;
}

const noop = () => undefined;

/** The real sidebar (filled from what the app already knows) around loading content, so a loading page has the same frame as the loaded one. */
export function ShellSkeleton({ nav, width = "max-w-4xl", children }: { nav: ShellNav; width?: string; children?: ReactNode }) {
  return (
    <AppShell user={shellCache.user} workspaces={shellCache.ws} activeId={shellCache.active} nav={nav} onSwitch={noop} onSignOut={noop}>
      <div className={cn("mx-auto w-full px-5 py-8 sm:px-8 lg:px-10", width)} role="status" aria-busy="true" aria-label="Loading">
        {children ?? <PageBody />}
      </div>
    </AppShell>
  );
}

/** Title, description and a few cards. */
export function PageBody({ cards = 3 }: { cards?: number }) {
  return (
    <>
      <div className="pb-6"><Skeleton className="h-7 w-56" /><Skeleton className="mt-2.5 h-4 w-80 max-w-full" /></div>
      <div className="space-y-4">{Array.from({ length: cards }, (_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}</div>
    </>
  );
}

/** Just the content area, for a page whose frame is already on screen. */
export function ContentSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className={cn("space-y-3", className)}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className={cn("h-16 w-full rounded-xl", i === 0 && "h-24")} />)}
    </div>
  );
}

export function ProjectsSkeleton() {
  return (
    <ShellSkeleton nav="projects" width="max-w-[1200px]">
      <div className="flex items-center gap-3 pb-6"><div className="mr-auto"><Skeleton className="h-6 w-32" /><Skeleton className="mt-2 h-4 w-20" /></div><Skeleton className="hidden h-9 w-64 sm:block" /><Skeleton className="h-9 w-32" /></div>
      <ul className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(270px,1fr))]">{[0, 1, 2].map((i) => <li key={i}><Skeleton className="aspect-[16/10] rounded-xl" /><Skeleton className="mt-3 h-4 w-40" /></li>)}</ul>
    </ShellSkeleton>
  );
}

export function ProjectSkeleton() {
  return (
    <ShellSkeleton nav="projects">
      <Skeleton className="mb-3 h-4 w-40" />
      <div className="flex items-start pb-6"><Skeleton className="h-8 w-60" /><Skeleton className="ml-auto h-9 w-28" /></div>
      <div className="mb-6 flex gap-4 border-b border-border pb-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-4 w-16" />)}</div>
      <div className="space-y-3"><Skeleton className="h-28 w-full rounded-xl" /><Skeleton className="h-28 w-full rounded-xl" /></div>
    </ShellSkeleton>
  );
}
