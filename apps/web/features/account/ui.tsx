"use client";
import { useEffect, useState } from "react";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api";
import { AppFrame } from "@/components/AppFrame";
import type { ShellNav } from "@/components/AppShell";

export function Msg({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (ok) return <p role="status" className="text-sm text-muted-foreground">{ok}</p>;
  return null;
}

export const tokenFromUrl = () => (typeof window === "undefined" ? "" : new URLSearchParams(location.search).get("token") ?? "");

export interface Me { user: { id: string; email: string; name: string; emailVerified: boolean; mfaEnabled: boolean }; workspaces: { id: string; name: string; plan: string; role: string }[] }

/** Current user, redirecting to /login on 401. */
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () => api<Me>("/auth/me").then(setMe).catch((e: { status?: number; message: string }) => { if (e.status === 401) location.replace("/login"); else setError(e.message); });
  useEffect(() => { void reload(); }, []);
  return { me, error, reload };
}

export function Page({ title, back, nav, cards, wide, children }: { title: string; back?: { href: string; label: string }; nav?: ShellNav; cards?: boolean; wide?: boolean; children: React.ReactNode }) {
  // Signed-in pages pass `nav` and get the sidebar layout; the rest (verify email, invitations, OAuth) keep the plain centred page.
  if (nav) {
    return (
      <AppFrame nav={nav} title={title} crumbs={back ? [{ href: back.href, label: back.label }, { label: title }] : []} width={wide ? "max-w-5xl" : "max-w-3xl"}>
        <div className={cards ? "space-y-5 [&>section]:space-y-3 [&>section]:rounded-xl [&>section]:border [&>section]:border-border [&>section]:bg-background [&>section]:p-5 [&>section]:shadow-[var(--shadow-sm)] [&>section>h2]:text-base [&>section>h2]:font-semibold" : "space-y-6"}>{children}</div>
      </AppFrame>
    );
  }
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <header className="space-y-4"><Brand className="text-[15px]" />{back && <a href={back.href} className="block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">← {back.label}</a>}<h1 className="text-2xl font-semibold">{title}</h1></header>
      {children}
    </main>
  );
}
