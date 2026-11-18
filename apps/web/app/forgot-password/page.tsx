"use client";
import { useState } from "react";
import Link from "next/link";
import { AuthShell, FormError } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useSignedInRedirect } from "@/lib/use-signed-in-redirect";

export default function Forgot() {
  const checking = useSignedInRedirect();
  const [email, setEmail] = useState(""); const [sent, setSent] = useState(false); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (checking) return <div className="min-h-dvh bg-background" aria-busy="true" />;
  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we will send you a link to choose a new one." footer={<Link className="font-medium text-foreground underline underline-offset-4" href="/login">Back to sign in</Link>}>
      {sent ? <p role="status" className="rounded-md border border-border bg-panel px-4 py-3 text-sm">If an account exists for {email}, a reset link is on its way.</p> : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setErr(null); setBusy(true); api("/auth/password/forgot", { method: "POST", body: { email } }).then(() => setSent(true)).catch((x: Error) => setErr(x.message)).finally(() => setBusy(false)); }}>
          <label className="block text-sm font-medium">Email<Input type="email" required autoComplete="email" className="mt-1.5 h-11" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {err && <FormError>{err}</FormError>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
        </form>
      )}
    </AuthShell>
  );
}
