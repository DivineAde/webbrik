"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthShell, FormError } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { tokenFromUrl } from "@/features/account/ui";

export default function Reset() {
  const [token, setToken] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => setToken(tokenFromUrl()), []);
  return (
    <AuthShell title="Choose a new password" subtitle="Pick something you have not used here before.">
      {done ? <p role="status" className="rounded-md border border-border bg-panel px-4 py-3 text-sm">Password updated. <Link className="font-medium underline underline-offset-4" href="/login">Sign in</Link></p> : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setErr(null); setBusy(true); api("/auth/password/reset", { method: "POST", body: { token, password: pw } }).then(() => setDone(true)).catch((x: Error) => setErr(x.message)).finally(() => setBusy(false)); }}>
          <label className="block text-sm font-medium">New password (10+ characters)<Input type="password" minLength={10} required autoComplete="new-password" className="mt-1.5 h-11" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          {!token && <FormError>This reset link is missing its token. Request a new one from the sign-in page.</FormError>}
          {err && <FormError>{err}</FormError>}
          <Button type="submit" size="lg" className="w-full" disabled={!token || busy}>{busy ? "Updating…" : "Update password"}</Button>
        </form>
      )}
    </AuthShell>
  );
}
