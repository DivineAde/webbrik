"use client";
import { Eye, EyeOff, Github } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthShell, FormError } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useSignedInRedirect } from "@/lib/use-signed-in-redirect";
import { enabledProviders, startOAuth } from "@/lib/oauth";
import { resetShellCache } from "@/lib/shell-cache";

export default function Login() {
  const checking = useSignedInRedirect();
  useEffect(() => { if (!checking) resetShellCache(); }, [checking]);
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ name: "", email: "", password: "", mfaCode: "" });
  const [err, setErr] = useState<string | null>(null);
  const [needMfa, setNeedMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const login = mode === "login";

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api(login ? "/auth/login" : "/auth/register", { method: "POST", body: login ? { email: f.email, password: f.password, mfaCode: f.mfaCode || undefined } : { email: f.email, password: f.password, name: f.name } });
      const next = new URLSearchParams(location.search).get("next"); router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    } catch (e) {
      const x = e as { code?: string; message?: string };
      if (x.code === "mfa_required") setNeedMfa(true);
      setErr(x.message ?? "Something went wrong. Try again.");
    } finally { setBusy(false); }
  }
  const providers = enabledProviders();
  const field = "mt-1.5 h-11";

  if (checking) return <div className="min-h-dvh bg-background" aria-busy="true" />;
  return (
    <AuthShell
      title={login ? "Welcome back" : "Create your account"}
      subtitle={login ? "Sign in to pick up where you left off." : "Free to start. No card needed."}
      footer={
        <div className="space-y-3">
          <p>
            <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={() => { setMode(login ? "register" : "login"); setErr(null); }}>{login ? "Need an account? Register" : "Have an account? Sign in"}</button>
          </p>
          <p><Link className="underline underline-offset-4 hover:text-foreground" href="/editor">Try the editor without an account</Link></p>
        </div>
      }
    >
      {providers.length > 0 && (
        <>
          <div className="space-y-2" role="group" aria-label="Other ways to sign in">
            {providers.map((p) => <Button key={p.name} type="button" variant="secondary" size="lg" className="w-full" onClick={() => startOAuth(p.name, new URLSearchParams(location.search).get("next"))}>{p.name === "github" && <Github className="size-4" />}Continue with {p.label}</Button>)}
          </div>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or use email<span className="h-px flex-1 bg-border" /></div>
        </>
      )}
      <form onSubmit={submit} className="space-y-4" noValidate={false}>
        {!login && <label className="block text-sm font-medium">Name<Input required className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>}
        <label className="block text-sm font-medium">Email<Input required type="email" className={field} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
        <div>
          <div className="flex items-baseline justify-between"><label htmlFor="pw" className="text-sm font-medium">Password</label>{login && <Link className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" href="/forgot-password">Forgot your password?</Link>}</div>
          <div className="relative">
            <Input id="pw" required type={reveal ? "text" : "password"} className={`${field} pr-11`} minLength={login ? 1 : 10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={login ? "current-password" : "new-password"} />
            <button type="button" aria-label={reveal ? "Hide characters" : "Show characters"} aria-pressed={reveal} onClick={() => setReveal((v) => !v)} className="absolute right-1 top-1/2 flex size-9 -translate-y-[calc(50%-3px)] items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{reveal ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}</button>
          </div>
          {!login && <p className="mt-1.5 text-xs text-muted-foreground">At least 10 characters.</p>}
        </div>
        {needMfa && <label className="block text-sm font-medium">Authentication code or recovery code<Input className={field} value={f.mfaCode} onChange={(e) => setF({ ...f, mfaCode: e.target.value })} autoComplete="one-time-code" inputMode="numeric" autoFocus /></label>}
        {err && <FormError>{err}</FormError>}
        <Button type="submit" size="lg" disabled={busy} className="w-full">{busy ? "Please wait…" : login ? "Sign in" : "Create account"}</Button>
      </form>
    </AuthShell>
  );
}
