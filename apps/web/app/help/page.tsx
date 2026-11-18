"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { AppFrame } from "@/components/AppFrame";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { shellCache } from "@/lib/shell-cache";
import { Input } from "@/components/ui/input";
import { ARTICLES } from "@/features/help/articles";

/** Inside the app for signed-in people (same sidebar as everywhere else); a plain public page for everyone else. */
export default function HelpCenter() {
  const [signedIn, setSignedIn] = useState<boolean | null>(shellCache.user ? true : null);
  useEffect(() => { api("/auth/me").then(() => setSignedIn(true), () => setSignedIn(false)); }, []);
  if (signedIn === null) return <div className="mx-auto max-w-3xl space-y-4 px-5 py-10" aria-busy="true"><Skeleton className="h-6 w-32" /><Skeleton className="h-10 w-full" /><Skeleton className="h-16 w-full rounded-xl" /><Skeleton className="h-16 w-full rounded-xl" /></div>;
  return signedIn
    ? <AppFrame nav="help" title="Help" description="Guides and answers for building, publishing and managing your site." width="max-w-3xl"><Articles /></AppFrame>
    : <main className="mx-auto max-w-3xl space-y-6 px-5 py-10 sm:px-8"><header className="flex items-center justify-between"><Brand className="block text-[15px]" /><Link className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href="/login">Sign in</Link></header><h1 className="text-2xl font-semibold tracking-tight">How can we help?</h1><Articles /></main>;
}

function Articles() {
  const [q, setQ] = useState("");
  const found = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return ARTICLES.filter((a) => terms.every((t) => `${a.title} ${a.section} ${a.keywords ?? ""} ${a.body.join(" ")}`.toLowerCase().includes(t)));
  }, [q]);
  const sections = [...new Set(found.map((a) => a.section))];
  return (
    <div className="space-y-6">
      <div role="search"><Input type="search" aria-label="Search help" placeholder="Search help: e.g. domain, coupon, shortcut" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <p role="status" className="text-xs text-muted-foreground">{found.length} {found.length === 1 ? "article" : "articles"}</p>
      {sections.map((s) => (
        <section key={s} aria-labelledby={`h-${s.replace(/\W+/g, "-")}`} className="space-y-3">
          <h2 id={`h-${s.replace(/\W+/g, "-")}`} className="pt-2 text-lg font-semibold text-foreground">{s}</h2>
          {found.filter((a) => a.section === s).map((a) => (
            <details key={a.id} id={a.id} className="rounded-xl border border-border bg-background p-4 shadow-[var(--shadow-sm)] open:bg-panel" open={found.length <= 2 || q.length > 0 ? true : undefined}>
              <summary className="cursor-pointer text-[15px] font-medium">{a.title}</summary>
              <div className="mt-2 space-y-2 text-sm">{a.body.map((l, i) => l.startsWith("• ") ? <p key={i} className="pl-4 -indent-3">• {l.slice(2)}</p> : <p key={i}>{l}</p>)}</div>
            </details>
          ))}
        </section>
      ))}
      {found.length === 0 && <p className="text-sm">Nothing matches “{q}”. Try a single word such as “publish” or “form”.</p>}
    </div>
  );
}
