"use client";
import { ContentSkeleton, ShellSkeleton } from "@/components/Skeleton";
import { use, useCallback, useEffect, useState } from "react";
import { PLANS } from "@webbrik/shared";
import { ask } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import { Msg, Page, useMe } from "@/features/account/ui";
import { initials } from "@/lib/time";

const ROLES = ["OWNER", "ADMIN", "EDITOR", "DESIGNER", "DEVELOPER", "VIEWER"] as const;
const ROLE_HELP: Record<string, string> = { OWNER: "Everything, including billing and deleting", ADMIN: "Manage members and settings", EDITOR: "Edit content and publish", DESIGNER: "Edit design, no publishing", DEVELOPER: "Edit and manage code/integrations", VIEWER: "View and comment only" };
interface Member { userId: string; name: string; email: string; role: string }
interface Invite { id: string; email: string; role: string; expiresAt: number }
interface Usage { plan: string; entitlements: Record<string, number | boolean>; usage: { projects: number; members: number; storageBytes: number; publishes: number; aiCredits: number } }
interface Entry { id: string; action: string; actorId?: string; target?: string; createdAt: number }

function useAct(after: () => Promise<unknown> | void) {
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  return { error, busy, run: async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); await after(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } } };
}

function Meter({ label, used, limit, unit = "" }: { label: string; used: number; limit: number; unit?: string }) {
  const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-baseline justify-between gap-2 text-sm"><span className="font-medium">{label}</span><span className="tabular-nums text-muted-foreground">{used}{unit} of {limit}{unit}</span></div>
      <div role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-[width] duration-500", pct >= 90 ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Members({ id, role, selfId }: { id: string; role: string; selfId: string }) {
  const [members, setMembers] = useState<Member[]>([]); const [invites, setInvites] = useState<Invite[]>([]);
  const canManage = role === "OWNER" || role === "ADMIN";
  const load = useCallback(async () => {
    setMembers((await api<{ members: Member[] }>(`/workspaces/${id}/members`)).members);
    if (canManage) setInvites((await api<{ invites: Invite[] }>(`/workspaces/${id}/invites`)).invites);
  }, [id, canManage]);
  useEffect(() => { void load(); }, [load]);
  const { run, error, busy } = useAct(load);
  const [email, setEmail] = useState(""); const [r, setR] = useState("EDITOR"); const [sent, setSent] = useState<string | null>(null);
  return (
    <section className="space-y-4">
      {canManage && (
        <form className="space-y-3 rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow-sm)]" onSubmit={(e) => { e.preventDefault(); void run(async () => { const res = await api<{ emailSent?: boolean }>(`/workspaces/${id}/invites`, { method: "POST", body: { email, role: r } }); setSent(res.emailSent === false ? `Invitation created for ${email}, but the email could not be delivered. Check the mail settings, then revoke and invite again.` : `Invitation sent to ${email}.`); setEmail(""); }); }}>
          <div className="flex gap-2">
            <Input aria-label="Invite email" type="email" placeholder="teammate@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <select aria-label="Invite role" className="h-9 rounded-md border border-border bg-background px-2 text-xs" value={r} onChange={(e) => setR(e.target.value)}>{ROLES.filter((x) => role === "OWNER" || x !== "OWNER").map((x) => <option key={x}>{x}</option>)}</select>
            <Button type="submit" disabled={busy}>Invite</Button>
          </div>
          <p className="text-xs text-muted-foreground">{ROLE_HELP[r]}. Invitations expire after 7 days.</p>
          <Msg error={error} ok={sent} />
        </form>
      )}
      <ul aria-label="Members" className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background shadow-[var(--shadow-sm)]">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 p-4">
            <span className="flex min-w-0 items-center gap-3"><span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{initials(m.name)}</span><span className="min-w-0"><span className="font-medium">{m.name}</span>{m.userId === selfId && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}<span className="block truncate text-sm text-muted-foreground">{m.email}</span></span></span>
            <span className="flex items-center gap-1">
              {canManage && m.userId !== selfId ? (
                <select aria-label={`Role of ${m.email}`} className="h-8 rounded-md border border-border bg-background px-1 text-xs" value={m.role} onChange={(e) => void run(() => api(`/workspaces/${id}/members/${m.userId}`, { method: "PATCH", body: { role: e.target.value } }))}>{ROLES.map((x) => <option key={x}>{x}</option>)}</select>
              ) : <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize">{m.role.toLowerCase()}</span>}
              {(canManage && m.userId !== selfId) || (m.userId === selfId && members.length > 1) ? <Button size="sm" variant="ghost" onClick={async () => { if (await ask(m.userId === selfId ? "Leave this workspace?" : `Remove ${m.email}?`)) void run(async () => { await api(`/workspaces/${id}/members/${m.userId}`, { method: "DELETE" }); if (m.userId === selfId) location.assign("/dashboard"); }); }}>{m.userId === selfId ? "Leave" : "Remove"}</Button> : null}
            </span>
          </li>
        ))}
      </ul>
      {invites.length > 0 && (
        <div><h2 className="mb-1 text-xs font-medium">Pending invitations</h2>
          <ul className="divide-y divide-border rounded-md border border-border">{invites.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 p-2 text-xs"><span>{i.email} · {i.role} <span className="text-muted-foreground">· expires {new Date(i.expiresAt).toLocaleDateString()}</span></span><Button size="sm" variant="ghost" onClick={() => void run(() => api(`/workspaces/${id}/invites/${i.id}`, { method: "DELETE" }))}>Revoke</Button></li>))}</ul></div>
      )}
      {!canManage && <Msg ok="Only owners and admins can invite or remove people." />}
    </section>
  );
}

interface Quote { plan: string; kind: "new" | "upgrade" | "renewal"; listPrice: number; discount: number; net: number; tax: number; taxPercent: number; total: number; currency: string; coupon?: string; recurring: boolean }
interface Billing { enabled: boolean; plan: string; price: { amount: number; currency: string; interval: string } | null; plans: { id: string; name: string; amount: number; currency: string; interval: string }[]; tax: { percent: number; label: string } | null; subscription: { status: "active" | "past_due" | "canceling" | "expired"; currentPeriodEnd: number; renews: boolean; cancellable: boolean } | null; payments: { reference: string; amount: number; currency: string; paidAt?: number; discount: number; tax: number; coupon?: string; invoiceNo?: string; kind: string; plan: string }[] }
const money = (amount: number, currency: string) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount / 100); } catch { return `${(amount / 100).toFixed(2)} ${currency}`; } };

/** Plan picker with a live price (coupon, proration for upgrades, tax) taken from the server's own quote. */
function Purchase({ id, b, busy, act }: { id: string; b: Billing; busy: boolean; act: (fn: () => Promise<void>) => Promise<void> }) {
  const options = b.plans.filter((p) => p.id !== b.plan);
  const [plan, setPlan] = useState(options[0]?.id ?? "pro"); const [coupon, setCoupon] = useState(""); const [applied, setApplied] = useState("");
  const [q, setQ] = useState<Quote | null>(null); const [qErr, setQErr] = useState<string | null>(null); const [couponErr, setCouponErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true; setQErr(null);
    api<{ quote: Quote }>(`/workspaces/${id}/billing/quote?plan=${plan}${applied ? `&coupon=${encodeURIComponent(applied)}` : ""}`).then((r) => live && setQ(r.quote)).catch((e: Error) => { if (!live) return; if (applied) { setCouponErr(e.message); setApplied(""); } else { setQ(null); setQErr(e.message); } });
    return () => { live = false; };
  }, [id, plan, applied]);
  const name = b.plans.find((p) => p.id === plan)?.name ?? plan;
  return (
    <div className="space-y-2">
      {options.length > 1 && (
        <div role="radiogroup" aria-label="Plan" className="flex gap-2">
          {options.map((p) => <label key={p.id} className={`flex-1 cursor-pointer rounded-md border p-2 text-xs ${plan === p.id ? "border-foreground" : "border-border"}`}><input type="radio" name="plan" className="sr-only" checked={plan === p.id} onChange={() => { setPlan(p.id); setApplied(""); }} /><strong>{p.name}</strong><br />{money(p.amount, p.currency)}/{p.interval}{b.tax ? ` + ${b.tax.label}` : ""}</label>)}
        </div>
      )}
      <p className="text-xs">{name} is <strong>{money(b.plans.find((p) => p.id === plan)?.amount ?? 0, b.plans[0]?.currency ?? "")}</strong> per month{b.tax ? ` plus ${b.tax.label} (${b.tax.percent}%)` : ""}: {plan === "team" ? "high limits for larger teams, custom domains and priority headroom." : "more projects, members, storage, publishes and AI credits, plus custom domains."} Pay securely with Paystack.</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setCouponErr(null); setApplied(coupon.trim()); }}>
        <Input aria-label="Coupon code" placeholder="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value)} className="max-w-[10rem]" />
        <Button type="submit" variant="secondary" disabled={!coupon.trim()}>Apply</Button>
      </form>
      {(couponErr ?? qErr) && <p role="alert" className="text-xs text-destructive">{couponErr ?? qErr}</p>}
      {q && (
        <dl aria-label="Price" className="grid max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-xs">
          <dt>{q.kind === "upgrade" ? `${name} (prorated for the rest of this period)` : `${name}, one month`}</dt><dd className="text-right">{money(q.listPrice, q.currency)}</dd>
          {q.discount > 0 && <><dt>Coupon {q.coupon}</dt><dd className="text-right">−{money(q.discount, q.currency)}</dd></>}
          {q.tax > 0 && <><dt>{b.tax?.label ?? "Tax"} ({q.taxPercent}%)</dt><dd className="text-right">{money(q.tax, q.currency)}</dd></>}
          <dt className="font-medium">Total today</dt><dd className="text-right font-medium">{money(q.total, q.currency)}</dd>
        </dl>
      )}
      {q && !q.recurring && <p className="text-xs text-muted-foreground">{q.kind === "upgrade" ? "This is a one-off charge. Your paid period and renewal date stay the same." : "Discounted purchases are a single payment for one month and don't renew automatically."}</p>}
      <Button disabled={busy || !q} onClick={() => void act(async () => { const r = await api<{ authorizationUrl: string }>(`/workspaces/${id}/billing/checkout`, { method: "POST", body: { plan, coupon: applied || undefined } }); window.location.href = r.authorizationUrl; })}>{q?.kind === "upgrade" ? `Upgrade to ${name} for ${money(q.total, q.currency)}` : `Upgrade to ${name}`}</Button>
    </div>
  );
}

function BillingPanel({ id, role, onChange }: { id: string; role: string; onChange: () => void }) {
  const [b, setB] = useState<Billing | null>(null); const [err, setErr] = useState<string | null>(null); const [note, setNote] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = () => api<Billing>(`/workspaces/${id}/billing`).then(setB).catch((e: Error) => setErr(e.message));
  useEffect(() => {
    // Paystack sends the customer back with ?reference=…: confirm the payment with the server, then tidy the address bar.
    const ref = new URLSearchParams(window.location.search).get("reference");
    if (ref) {
      setNote("Confirming your payment…");
      api<{ status: string; failure?: string }>(`/workspaces/${id}/billing/verify`, { method: "POST", body: { reference: ref } })
        .then((r) => { setNote(r.status === "success" ? "Payment received. Your plan is now active." : r.status === "pending" ? "Your payment is still processing. This page will update once Paystack confirms it." : "The payment did not go through. You have not been charged for Pro."); onChange(); })
        .catch((e: Error) => setNote(e.message))
        .finally(() => { window.history.replaceState(null, "", window.location.pathname + "?tab=plan"); void load(); });
    } else void load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  if (!b) return err ? <Msg error={err} /> : <ContentSkeleton rows={3} />;
  const owner = role === "OWNER";
  const sub = b.subscription;
  const planLabel = b.plans.find((p) => p.id === b.plan)?.name ?? "Pro";
  const end = sub ? new Date(sub.currentPeriodEnd).toLocaleDateString(undefined, { dateStyle: "long" }) : "";
  return (
    <div className="space-y-2 rounded-md border border-border p-3" aria-label="Billing">
      <h2 className="text-sm font-medium">Billing</h2>
      {note && <p role="status" className="text-xs">{note}</p>}
      {!b.enabled && <p className="text-xs text-muted-foreground">Online payment isn’t set up on this server, so plans can’t be purchased here.</p>}
      {b.enabled && b.plan === "free" && b.price && (
        <div className="space-y-2">
          {sub?.status === "expired" && <p className="text-xs text-muted-foreground">Your Pro subscription ended on {end}. Your projects are kept; limits are back to the free plan.</p>}
          {owner ? <Purchase id={id} b={b} busy={busy} act={act} /> : <p className="text-xs text-muted-foreground">Only the workspace owner can upgrade.</p>}
        </div>
      )}
      {b.plan !== "free" && sub && (
        <div className="space-y-2 text-xs">
          {sub.status === "active" && <p>{planLabel} is active. {sub.renews ? `Renews automatically around ${end}.` : `Paid through ${end}. It does not renew automatically.`}</p>}
          {sub.status === "past_due" && <p role="alert">The last renewal payment failed. {planLabel} stays active until {end}; Paystack will retry, or you can start a new payment after that date.</p>}
          {sub.status === "canceling" && <p>Subscription cancelled. {planLabel} access continues until {end}, then the workspace returns to the free plan.</p>}
          {owner && b.plan === "pro" && sub.status === "active" && b.plans.some((p) => p.id === "team") && <details className="rounded-md border border-border p-2"><summary className="cursor-pointer">Upgrade to Team</summary><div className="pt-2"><Purchase id={id} b={b} busy={busy} act={act} /></div></details>}
          {owner && sub.cancellable && <Button variant="secondary" disabled={busy} onClick={async () => { if (await ask(`Cancel ${planLabel}? Access continues until the end of the period you've paid for.`)) void act(async () => { await api(`/workspaces/${id}/billing/cancel`, { method: "POST" }); await load(); onChange(); }); }}>Cancel subscription</Button>}
        </div>
      )}
      {b.payments.length > 0 && (
        <div><h3 className="mb-1 text-xs font-medium">Payments</h3>
          <ul aria-label="Payments" className="divide-y divide-border rounded-md border border-border text-xs">{b.payments.map((p) => <li key={p.reference} className="flex items-center justify-between gap-2 p-2"><span>{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : ""} <span className="text-muted-foreground">{p.plan} · {p.kind}{p.coupon ? ` · ${p.coupon}` : ""}</span></span><span className="flex items-center gap-3"><span>{money(p.amount, p.currency)}</span>{p.invoiceNo && <a className="underline" href={`/api/workspaces/${id}/billing/invoices/${p.reference}`} download>Invoice {p.invoiceNo}</a>}</span></li>)}</ul></div>
      )}
      <Msg error={err} />
    </div>
  );
}

function Plan({ id, role }: { id: string; role: string }) {
  const [u, setU] = useState<Usage | null>(null); const [err, setErr] = useState<string | null>(null);
  const loadUsage = () => api<Usage>(`/workspaces/${id}/usage`).then(setU).catch((e: Error) => setErr(e.message));
  useEffect(() => { void loadUsage(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <Msg error={err} />;
  if (!u) return <ContentSkeleton rows={2} />;
  const e = u.entitlements as Record<string, number | boolean>;
  const mb = Math.round(u.usage.storageBytes / 1024 / 1024);
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-border bg-primary p-6 text-primary-foreground"><div><p className="text-sm text-primary-foreground/70">Current plan</p><p className="mt-0.5 text-2xl font-semibold capitalize tracking-tight"><strong className="font-semibold">{u.plan}</strong></p></div><p className="max-w-[16rem] text-right text-sm text-primary-foreground/70">Custom domains: {e["customDomains"] ? "included" : "not included"}.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Meter label="Projects" used={u.usage.projects} limit={e["maxProjects"] as number} />
        <Meter label="Members" used={u.usage.members} limit={e["maxMembers"] as number} />
        <Meter label="Storage" used={mb} limit={e["storageMb"] as number} unit=" MB" />
        <Meter label="Publishes this month" used={u.usage.publishes} limit={e["publishesPerMonth"] as number} />
        <Meter label="AI credits this month" used={u.usage.aiCredits} limit={e["aiCreditsPerMonth"] as number} />
      </div>
            <div className="rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-3 text-base font-semibold">Plans</h2>
        <ul className="grid gap-3 sm:grid-cols-3">{Object.entries(PLANS).map(([name, p]) => (
          <li key={name} className={cn("rounded-xl border p-4 text-sm", name === u.plan ? "border-foreground bg-muted/50" : "border-border text-muted-foreground")}>
            <span className="flex items-center justify-between"><span className="text-base font-semibold capitalize text-foreground">{name}</span>{name === u.plan && <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">Current</span>}</span>
            <span className="mt-2 block">{p.maxProjects} projects · {p.maxMembers} member{p.maxMembers === 1 ? "" : "s"} · {p.storageMb / 1000} GB · {p.publishesPerMonth} publishes/mo{p.customDomains ? " · custom domains" : ""}</span>
          </li>
        ))}</ul>
      </div>
      <BillingPanel id={id} role={role} onChange={() => void loadUsage()} />
    </section>
  );
}

function Activity({ id }: { id: string }) {
  const [rows, setRows] = useState<Entry[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<{ entries: Entry[] }>(`/workspaces/${id}/audit`).then((r) => setRows(r.entries)).catch((e: Error) => setErr(e.message)); }, [id]);
  if (err) return <Msg error={err} />;
  if (!rows) return <ContentSkeleton rows={4} />;
  return (
    <ul className="divide-y divide-border rounded-md border border-border text-xs">
      {rows.length === 0 && <li className="p-3 text-muted-foreground">No activity yet.</li>}
      {rows.map((r) => <li key={r.id} className="flex justify-between gap-2 p-2"><span><code>{r.action}</code>{r.target ? <span className="text-muted-foreground"> · {r.target}</span> : null}</span><time className="shrink-0 text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</time></li>)}
    </ul>
  );
}

function General({ id, name, role, reload }: { id: string; name: string; role: string; reload: () => void }) {
  const [v, setV] = useState(name); const { run, error, busy } = useAct(async () => reload());
  const can = role === "OWNER" || role === "ADMIN";
  return (
    <form className="max-w-sm space-y-2" onSubmit={(e) => { e.preventDefault(); void run(() => api(`/workspaces/${id}`, { method: "PATCH", body: { name: v } })); }}>
      <label className="block text-xs">Workspace name<Input value={v} disabled={!can} onChange={(e) => setV(e.target.value)} /></label>
      {can ? <Button type="submit" disabled={busy || !v.trim() || v === name}>Save</Button> : <Msg ok="Only owners and admins can rename the workspace." />}
      <Msg error={error} />
      {role === "OWNER" && <DangerZone id={id} name={name} />}
    </form>
  );
}

function DangerZone({ id, name }: { id: string; name: string }) {
  const [confirm, setConfirm] = useState(""); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  return (
    <div className="mt-8 space-y-2 rounded-md border border-destructive/40 p-3" onClick={(e) => e.stopPropagation()}>
      <h2 className="text-sm font-medium text-destructive">Delete workspace</h2>
      <p className="text-xs text-muted-foreground">Permanently deletes this workspace, all of its projects, content, assets, deployments records and members’ access. This cannot be undone. Type <strong>{name}</strong> to confirm.</p>
      <Input aria-label="Name to confirm deletion" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <Button type="button" variant="secondary" disabled={busy || confirm !== name} onClick={async () => { setBusy(true); setErr(null); try { await api(`/workspaces/${id}`, { method: "DELETE", body: { confirmName: confirm } }); window.location.href = "/dashboard"; } catch (e) { setErr((e as Error).message); setBusy(false); } }}>Delete workspace</Button>
      <Msg error={err} />
    </div>
  );
}

const TABS = ["Members", "Plan & usage", "Activity", "General"] as const;
export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me, reload } = useMe();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Members");
  useEffect(() => { const q = new URLSearchParams(window.location.search); if (q.get("tab") === "plan" || q.get("reference")) setTab("Plan & usage"); }, []);
  const ws = me?.workspaces.find((w) => w.id === id);
  if (!me) return <ShellSkeleton nav="workspace" width="max-w-5xl" />;
  if (!ws) return <Page title="Workspace" nav="workspace" wide back={{ href: "/dashboard", label: "Projects" }}><p role="alert">Workspace not found.</p></Page>;
  return (
    <Page title={ws.name} nav="workspace" wide>
      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow-sm)]">
        <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary text-xl font-semibold text-primary-foreground">{initials(ws.name)}</span>
        <div className="min-w-0"><p className="truncate text-lg font-semibold tracking-tight">{ws.name}</p><p className="text-sm text-muted-foreground"><span className="capitalize">{ws.plan}</span> plan · you are {/^[aeiou]/i.test(ws.role) ? "an" : "a"} <span className="lowercase">{ws.role}</span></p></div>
      </div>
      <div role="tablist" className="mb-6 inline-flex gap-1 rounded-lg bg-muted p-1" aria-label="Workspace sections">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded-md px-3.5 py-1.5 text-sm transition-colors", tab === t ? "bg-background font-medium shadow-[var(--shadow-sm)]" : "text-muted-foreground hover:text-foreground")}>{t}</button>)}
      </div>
      <div role="tabpanel">
        {tab === "Members" && <Members id={id} role={ws.role} selfId={me.user.id} />}
        {tab === "Plan & usage" && <Plan id={id} role={ws.role} />}
        {tab === "Activity" && (ws.role === "OWNER" || ws.role === "ADMIN" ? <Activity id={id} /> : <Msg ok="Only owners and admins can see activity." />)}
        {tab === "General" && <General id={id} name={ws.name} role={ws.role} reload={reload} />}
      </div>
    </Page>
  );
}
