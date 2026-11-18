"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Page } from "@/features/account/ui";
import { OAUTH, redirectUriFor, takeOAuthState, type OAuthName } from "@/lib/oauth";

/** Landing page the provider redirects to: checks `state`, trades the code for a Webbrik session through the API. */
export default function OAuthCallback() {
  const { provider } = useParams<{ provider: string }>();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const name = provider as OAuthName;
    if (!OAUTH.some((p) => p.name === name)) return setErr("Unknown sign-in provider.");
    const q = new URLSearchParams(location.search);
    if (q.get("error")) return setErr("Sign-in was cancelled.");
    const st = takeOAuthState(name, q.get("state")); const code = q.get("code");
    if (!st.ok || !code) return setErr("This sign-in attempt could not be verified. Please try again.");
    api(`/auth/oauth/${name}`, { method: "POST", body: { code, redirectUri: redirectUriFor(name) } })
      .then(() => router.replace(st.next && st.next.startsWith("/") && !st.next.startsWith("//") ? st.next : "/dashboard"))
      .catch((e: { message?: string }) => setErr(e.message ?? "Sign-in failed."));
  }, [provider, router]);
  return (
    <Page title="Signing you in">
      {err ? <p role="alert">{err} <Link className="underline" href="/login">Back to sign in</Link></p> : <p className="text-muted-foreground">Finishing sign-in…</p>}
    </Page>
  );
}
