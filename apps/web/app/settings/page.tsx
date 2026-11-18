"use client";
import { ShellSkeleton } from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { ask } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { Msg, Page, useMe } from "@/features/account/ui";
import { initials } from "@/lib/time";
import { BadgeCheck, MailWarning } from "lucide-react";
import type { ReactNode } from "react";

interface Session { id: string; userAgent?: string; expiresAt: number; current: boolean }

function useForm() {
  const [error, setError] = useState<string | null>(null); const [ok, setOk] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<string | void>) => { setBusy(true); setError(null); setOk(null); try { setOk((await fn()) ?? null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return { error, ok, busy, run };
}

/** One settings group: what it is on the left, the controls in a raised card on the right. */
function Panel({ id, title, description, tone, children }: { id: string; title: string; description: string; tone?: "danger"; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="grid scroll-mt-24 gap-4 border-t border-border pt-8 lg:grid-cols-[240px_1fr] lg:gap-10">
      <header className="lg:pt-1">
        <h2 id={`${id}-h`} className={`text-base font-semibold ${tone === "danger" ? "text-destructive" : ""}`}>{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </header>
      <div className={`min-w-0 space-y-4 rounded-2xl border bg-background p-6 shadow-[var(--shadow-sm)] ${tone === "danger" ? "border-destructive/30 bg-destructive/[0.02]" : "border-border"}`}>{children}</div>
    </section>
  );
}

function ProfileHeader({ name, email, verified }: { name: string; email: string; verified: boolean }) {
  const [sending, setSending] = useState(false), [sent, setSent] = useState(false), [resendErr, setResendErr] = useState(""), [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);
  const resend = async () => {
    setSending(true); setResendErr("");
    try { await api("/auth/resend-verification", { method: "POST" }); setSent(true); setCooldown(60); }
    catch (e) { const x = e as { status?: number; message?: string }; setResendErr(x.status === 429 ? "Too many requests. Wait a minute and try again." : x.message ?? "Could not send the email. Try again."); setCooldown(x.status === 429 ? 60 : 0); }
    finally { setSending(false); }
  };
  return (
    <div className="mb-8 flex items-center gap-5 rounded-2xl border border-border bg-background p-6 shadow-[var(--shadow-sm)]">
      <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground ring-4 ring-muted">{initials(name)}</span>
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold tracking-tight">{name}</p>
        <p className="truncate text-sm text-muted-foreground">{email}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
            {verified ? <BadgeCheck className="size-3.5" aria-hidden /> : <MailWarning className="size-3.5" aria-hidden />}{verified ? "Email verified" : "Email not verified"}
          </p>
          {!verified && (
            <>
              <Button type="button" size="sm" variant="secondary" disabled={sending || cooldown > 0} onClick={resend}>{sending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : sent ? "Send again" : "Resend verification email"}</Button>
              <span role="status" className="text-xs text-muted-foreground">{sent && `Sent to ${email}. Check your inbox and spam folder.`}{resendErr}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { me, error, reload } = useMe();
  const [name, setName] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const loadSessions = () => api<{ sessions: Session[] }>("/auth/sessions").then((r) => setSessions(r.sessions)).catch(() => undefined);
  useEffect(() => { void loadSessions(); }, []);
  useEffect(() => { if (me) setName(me.user.name); }, [me]);
  const profile = useForm(), emailForm = useForm(), pw = useForm(), mfa = useForm(), sess = useForm();
  const [newEmail, setNewEmail] = useState(""); const [emailPw, setEmailPw] = useState("");
  const [cur, setCur] = useState(""); const [next, setNext] = useState("");
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qrSvg: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null); const [remaining, setRemaining] = useState<number | null>(null);
  const [delPw, setDelPw] = useState(""); const [delMfa, setDelMfa] = useState(""); const del = useForm();
  useEffect(() => { if (me?.user.mfaEnabled) api<{ remaining: number }>("/auth/mfa/recovery-codes").then((r) => setRemaining(r.remaining)).catch(() => undefined); }, [me?.user.mfaEnabled, codes]);
  const [code, setCode] = useState(""); const [offPw, setOffPw] = useState("");
  if (error) return <Page title="Settings" nav="settings" wide><Msg error={error} /></Page>;
  if (!me) return <ShellSkeleton nav="settings" width="max-w-5xl" />;
  return (
    <Page title="Account settings" nav="settings" wide>
      <ProfileHeader name={me.user.name} email={me.user.email} verified={!!me.user.emailVerified} />
      <Panel id="profile" title="Profile" description="Your name and the email address you sign in with.">
                <form className="flex max-w-lg gap-2" onSubmit={(e) => { e.preventDefault(); void profile.run(async () => { await api("/auth/me", { method: "PATCH", body: { name } }); await reload(); return "Saved."; }); }}>
          <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} /><Button type="submit" disabled={profile.busy || !name.trim()}>Save</Button>
        </form>
        <Msg error={profile.error} ok={profile.ok} />
        <form className="grid max-w-lg gap-3 pt-2" aria-label="Change email" onSubmit={(e) => { e.preventDefault(); void emailForm.run(async () => { await api("/auth/email/change", { method: "POST", body: { email: newEmail, password: emailPw || undefined } }); setNewEmail(""); setEmailPw(""); return "Check the new address for a confirmation link. Your email changes once you confirm it."; }); }}>
          <label className="grid gap-1.5 text-sm font-medium">New email address<Input type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required /></label>
          <label className="grid gap-1.5 text-sm font-medium">Password to confirm<Input type="password" autoComplete="current-password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} /></label>
          <Button type="submit" variant="secondary" disabled={emailForm.busy || !newEmail}>Change email</Button><Msg error={emailForm.error} ok={emailForm.ok} />
        </form>
      </Panel>

      <Panel id="password" title="Password" description="Use at least 10 characters. Changing it signs out your other devices.">
        <form className="grid max-w-lg gap-3" onSubmit={(e) => { e.preventDefault(); void pw.run(async () => { await api("/auth/password/change", { method: "POST", body: { current: cur, password: next } }); setCur(""); setNext(""); await loadSessions(); return "Password changed. Your other sessions were signed out."; }); }}>
          <label className="grid gap-1.5 text-sm font-medium">Current password<Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></label>
          <label className="grid gap-1.5 text-sm font-medium">New password (10+ characters)<Input type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required /></label>
          <Button type="submit" disabled={pw.busy}>Change password</Button><Msg error={pw.error} ok={pw.ok} />
        </form>
      </Panel>

      <Panel id="two-factor" title="Two-factor authentication" description="Ask for a code from an authenticator app each time you sign in.">
        {me.user.mfaEnabled ? (
          <form className="grid max-w-lg gap-3" onSubmit={(e) => { e.preventDefault(); void mfa.run(async () => { await api("/auth/mfa/disable", { method: "POST", body: { password: offPw, code } }); setOffPw(""); setCode(""); await reload(); return "Two-factor authentication is off."; }); }}>
            <p className="text-sm text-muted-foreground">Enabled. To turn it off, confirm your password and a current code.</p>
            <label className="grid gap-1.5 text-sm font-medium">Password<Input type="password" autoComplete="current-password" value={offPw} onChange={(e) => setOffPw(e.target.value)} required /></label>
            <label className="grid gap-1.5 text-sm font-medium">Authentication code<Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required /></label>
            <Button type="submit" variant="secondary" disabled={mfa.busy}>Turn off</Button><Msg error={mfa.error} ok={mfa.ok} />
            <div className="mt-2 space-y-1 border-t border-border pt-2">
              <p className="text-sm text-muted-foreground">Recovery codes left: {remaining ?? "…"}. Each works once if you lose your device.</p>
              <Button type="button" variant="secondary" disabled={mfa.busy || !offPw || !code} onClick={() => void mfa.run(async () => { const r = await api<{ recoveryCodes: string[] }>("/auth/mfa/recovery-codes", { method: "POST", body: { password: offPw, code } }); setCodes(r.recoveryCodes); setCode(""); })}>Generate new recovery codes</Button>
              <p className="text-sm text-muted-foreground">Enter your password and a current code above first. New codes replace the old ones.</p>
            </div>
          </form>
        ) : setup ? (
          <form className="grid max-w-lg gap-3" onSubmit={(e) => { e.preventDefault(); void mfa.run(async () => { const r = await api<{ recoveryCodes: string[] }>("/auth/mfa/enable", { method: "POST", body: { code } }); setCodes(r.recoveryCodes); setSetup(null); setCode(""); await reload(); return "Two-factor authentication is on."; }); }}>
            <p className="text-sm text-muted-foreground">Scan this QR code with your authenticator app, or enter the setup key by hand, then enter the 6-digit code it shows.</p>
            {/* Server-generated QR image, embedded as an <img> so it cannot run script. */}
            <img alt="QR code for your authenticator app" width={176} height={176} className="rounded-md border border-border bg-white p-1" src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`} />
            <code aria-label="Setup key" className="break-all rounded-md bg-muted p-2 text-xs">{setup.secret}</code>
            <label className="grid gap-1.5 text-sm font-medium">Authentication code<Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required /></label>
            <Button type="submit" disabled={mfa.busy}>Turn on</Button><Msg error={mfa.error} ok={mfa.ok} />
          </form>
        ) : (
          <div className="space-y-2"><p className="text-sm text-muted-foreground">Add a second step at sign-in using an authenticator app.</p>
            <Button variant="secondary" disabled={mfa.busy} onClick={() => void mfa.run(async () => { setSetup(await api("/auth/mfa/setup", { method: "POST" })); })}>Set up</Button><Msg error={mfa.error} ok={mfa.ok} /></div>
        )}
      </Panel>

      {codes && (
        <section role="status" aria-label="Recovery codes" className="space-y-2 rounded-md border border-border p-3">
          <h2 className="text-sm font-medium">Save your recovery codes</h2>
          <p className="text-sm text-muted-foreground">Each code signs you in once if you lose your authenticator. They won’t be shown again.</p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-xs">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
          <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(codes.join("\n"))}>Copy</Button><Button size="sm" onClick={() => setCodes(null)}>I saved them</Button></div>
        </section>
      )}

      <Panel id="sessions" title="Active sessions" description="Devices that are signed in to your account right now.">
        <ul className="divide-y divide-border rounded-md border border-border">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 p-3">
              <span className="min-w-0 truncate text-xs">{s.userAgent ?? "Unknown device"} <span className="text-muted-foreground">· expires {new Date(s.expiresAt).toLocaleDateString()}</span>{s.current && <strong className="ml-2 font-medium">This device</strong>}</span>
              {!s.current && <Button size="sm" variant="secondary" disabled={sess.busy} onClick={() => void sess.run(async () => { await api(`/auth/sessions/${s.id}`, { method: "DELETE" }); await loadSessions(); })}>Sign out</Button>}
            </li>
          ))}
        </ul>
        <Msg error={sess.error} />
      </Panel>

      <Panel id="danger" tone="danger" title="Delete account" description="This cannot be undone.">
        <p className="text-sm text-muted-foreground">Permanently deletes your account and any workspace where you are the only member. Workspaces with other members stay with them; make someone else an owner first.</p>
        <form className="grid max-w-lg gap-3" onSubmit={async (e) => { e.preventDefault(); if (!await ask("Delete your account permanently?")) return; void del.run(async () => { await api("/auth/me", { method: "DELETE", body: me.user.mfaEnabled ? { password: delPw, confirmEmail: delPw, mfaCode: delMfa } : { password: delPw, confirmEmail: delPw } }); window.location.href = "/login"; }); }}>
          <label className="grid gap-1.5 text-sm font-medium">Your password (or your email address if you sign in with a provider)<Input type="password" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} required /></label>
          {me.user.mfaEnabled && <label className="grid gap-1.5 text-sm font-medium">Authentication code<Input inputMode="numeric" value={delMfa} onChange={(e) => setDelMfa(e.target.value)} required /></label>}
          <Button type="submit" variant="secondary" disabled={del.busy}>Delete my account</Button><Msg error={del.error} />
        </form>
      </Panel>
    </Page>
  );
}
