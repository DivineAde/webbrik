"use client";
import { useState, type ReactNode } from "react";
import { Check, Code2, Copy, ExternalLink, Globe, KeyRound, Rocket, RotateCcw } from "lucide-react";
import Link from "next/link";
import { shellCache } from "@/lib/shell-cache";
import { ask } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/Skeleton";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import { EXPORT_TARGETS, downloadProjectExport, type ExportTarget } from "@/features/editor/export";
import { useAction, useQuery } from "./hooks";

interface Deployment { id: string; target: string; status: string; revision: number; url?: string; createdAt: number }
interface Domain { id: string; hostname: string; verified: boolean; primary: boolean }
interface Dns { type: string; name: string; value: string }

const ago = (t: number) => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
};

function Panel({ title, description, icon, children, action }: { title: string; description?: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-background shadow-[var(--shadow-sm)]">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        {icon && <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg]:size-4" aria-hidden>{icon}</span>}
        <div className="min-w-0 flex-1"><h2 className="text-[15px] font-semibold">{title}</h2>{description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}</div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Status as a dot plus a word, so it never relies on colour alone. */
function Status({ status }: { status: string }) {
  const tone = status === "ready" ? "bg-emerald-600" : status === "error" || status === "canceled" ? "bg-destructive" : "bg-amber-500 animate-pulse motion-reduce:animate-none";
  return <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize"><span aria-hidden className={cn("size-1.5 rounded-full", tone)} />{status === "ready" ? "Live" : status}</span>;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={label} title={label} onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => undefined); }}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-4">
      {done ? <Check aria-hidden /> : <Copy aria-hidden />}
    </button>
  );
}

export function PublishTab({ id }: { id: string }) {
  const deps = useQuery<{ deployments: Deployment[] }>(`/projects/${id}/deployments`);
  const doms = useQuery<{ domains: Domain[] }>(`/projects/${id}/domains`);
  const env = useQuery<{ variables: { key: string }[] }>(`/projects/${id}/env`);
  const reloadAll = async () => { await Promise.all([deps.reload(), doms.reload(), env.reload()]); };
  const { run: runAction, error, busy } = useAction(reloadAll);
  const [zone, setZone] = useState<"site" | "domains" | "env">("site");
  const runIn = (z: "site" | "domains" | "env") => (fn: () => Promise<unknown>) => { setZone(z); return runAction(fn); };
  const run = runIn("site"); const runDomains = runIn("domains"), runEnv = runIn("env");
  const Err = ({ z }: { z: typeof zone }) => (zone === z && error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}{/plan/i.test(error) && shellCache.active && <> <Link href={`/workspaces/${shellCache.active}?tab=plan`} className="font-medium underline underline-offset-2">See plans</Link></>}</p> : null);
  const [notes, setNotes] = useState<string[]>([]);
  const [exporting, setExporting] = useState<ExportTarget | null>(null); const [exportError, setExportError] = useState<string | null>(null);
  const exportAs = async (t: ExportTarget) => { setExporting(t); setExportError(null); try { await downloadProjectExport(id, t); } catch (e) { setExportError((e as Error).message); } finally { setExporting(null); } };
  const [host, setHost] = useState(""); const [k, setK] = useState(""); const [v, setV] = useState("");
  const [dns, setDns] = useState<Dns[] | null>(null);
  const [working, setWorking] = useState<"preview" | "production" | null>(null);
  const deploy = (target: "preview" | "production") => { setWorking(target); setZone("site"); return run(async () => {
    const r = await api<{ warnings?: string[]; quality?: { errors: number; warnings: number } }>(`/projects/${id}/deployments`, { method: "POST", body: { target } });
    setNotes([...(r.warnings ?? []), ...(r.quality ? [`Quality: ${r.quality.errors} errors, ${r.quality.warnings} warnings`] : [])]);
  }).finally(() => setWorking(null)); };

  const list = deps.data?.deployments;
  const live = list?.find((d) => d.target === "production" && d.status === "ready");
  const latest = list?.[0];
  const primary = doms.data?.domains.find((d) => d.primary && d.verified);
  const liveUrl = primary ? `https://${primary.hostname}` : live?.url;

  return (
    <div className="space-y-5">
      <Panel title="Your site" icon={<Rocket />} description={live ? "Your latest production publish is live." : "Publish to put your site on the internet. Use a preview to check it first."}>
        {!list ? <Skeleton className="h-16 w-full rounded-xl" /> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/60 p-3.5">
              <div className="min-w-0 flex-1">
                {liveUrl ? (
                  <>
                    <a href={liveUrl} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1.5 truncate text-sm font-medium underline-offset-4 hover:underline"><span className="truncate">{liveUrl.replace(/^https:\/\//, "")}</span><ExternalLink className="size-3.5 shrink-0" aria-hidden /></a>
                    <p className="mt-0.5 text-xs text-muted-foreground">{live ? <>Revision {live.revision}, published {ago(live.createdAt)}</> : "Domain connected"}</p>
                  </>
                ) : (
                  <><p className="text-sm font-medium">Not published yet</p><p className="mt-0.5 text-xs text-muted-foreground">{latest ? "Only previews so far." : "Nothing is live."}</p></>
                )}
              </div>
              {liveUrl && <CopyButton text={liveUrl} label="Copy site address" />}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void deploy("production")}>{working === "production" ? "Publishing…" : "Publish to production"}</Button>
              <Button variant="secondary" disabled={busy} onClick={() => void deploy("preview")}>{working === "preview" ? "Deploying…" : "Deploy preview"}</Button>
            </div>
            {notes.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground" aria-label="Publish notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            {zone === "site" && (error ?? deps.error) && <p role="alert" className="text-sm text-destructive">{error ?? deps.error}</p>}
          </div>
        )}
      </Panel>

      <Panel title="Deployments" description="Every publish and preview, newest first.">
        {!list ? <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : list.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Nothing published yet.</p>
        ) : (
          <ol className="-my-1 divide-y divide-border">
            {list.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="text-sm font-medium capitalize">{d.target}</span><span className="text-xs text-muted-foreground">Revision {d.revision}</span>{d === live && <span className="rounded-full bg-foreground px-2 py-px text-[11px] font-medium text-background">Current</span>}</div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground" title={new Date(d.createdAt).toLocaleString()}>{ago(d.createdAt)}{d.url && <> · <a className="underline underline-offset-2 hover:text-foreground" href={d.url} target="_blank" rel="noreferrer noopener">{d.url.replace(/^https:\/\//, "")}</a></>}</p>
                </div>
                <Status status={d.status} />
                {d.target === "production" && d !== live && <Button size="sm" variant="secondary" disabled={busy} onClick={async () => { if (await ask("Roll back to this deployment?")) void run(() => api(`/projects/${id}/deployments/${d.id}/rollback`, { method: "POST" })); }}><RotateCcw className="size-3.5" aria-hidden />Roll back</Button>}
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel title="Export code" icon={<Code2 />} description="Take the site with you. The code has no runtime that depends on Webbrik.">
        <div className="grid gap-2 sm:grid-cols-3">
          {EXPORT_TARGETS.map((t) => (
            <Button key={t.id} variant="secondary" className="h-auto flex-col items-start gap-0.5 px-4 py-3 text-left" disabled={exporting !== null} onClick={() => void exportAs(t.id)}>
              <span className="font-medium">{exporting === t.id ? "Preparing…" : t.label}</span>
              <span className="text-xs font-normal text-muted-foreground">{t.note}</span>
            </Button>
          ))}
        </div>
        {exportError && <p role="alert" className="mt-3 text-sm text-destructive">{exportError}</p>}
      </Panel>

      <Panel title="Domains" icon={<Globe />} description="Serve the site from your own address.">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void runDomains(async () => { const r = await api<{ dnsInstructions?: Dns[] }>(`/projects/${id}/domains`, { method: "POST", body: { hostname: host } }); setDns(r.dnsInstructions?.length ? r.dnsInstructions : null); setHost(""); }); }}>
          <Input aria-label="Domain" placeholder="www.example.com" value={host} onChange={(e) => setHost(e.target.value)} className="sm:max-w-sm" /><Button type="submit" disabled={busy || !host.trim()}>Add domain</Button>
        </form>
        {dns && (
          <div className="mt-4 overflow-hidden rounded-xl border border-border" role="group" aria-label="DNS records to create">
            <p className="bg-muted/60 px-3.5 py-2 text-xs text-muted-foreground">Add this record at your DNS provider, then choose Verify. It can take a while to take effect.</p>
            <table className="w-full text-left text-sm"><thead className="sr-only"><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead>
              <tbody>{dns.map((r, i) => <tr key={i} className="border-t border-border"><td className="w-16 px-3.5 py-2 font-medium">{r.type}</td><td className="px-2 py-2"><code>{r.name}</code></td><td className="px-2 py-2"><code className="break-all">{r.value}</code></td><td className="w-10 pr-2"><CopyButton text={r.value} label={`Copy ${r.type} value`} /></td></tr>)}</tbody></table>
          </div>
        )}
        {doms.data && doms.data.domains.length > 0 && (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {doms.data.domains.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{d.hostname}</p><p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><span aria-hidden className={cn("size-1.5 rounded-full", d.verified ? "bg-emerald-600" : "bg-amber-500")} />{d.verified ? "Verified" : "Unverified"}</span>{d.primary && <span className="rounded-full bg-foreground px-2 py-px text-[11px] font-medium text-background">Primary</span>}</p></div>
                <span className="flex gap-1">
                  {!d.verified && <Button size="sm" variant="secondary" onClick={() => void runDomains(async () => { const r = await api<{ verified: boolean; dnsInstructions?: Dns[] }>(`/projects/${id}/domains/${d.id}/verify`, { method: "POST" }); if (!r.verified) { if (r.dnsInstructions?.length) setDns(r.dnsInstructions); throw new Error("DNS not verified yet. Records can take time to propagate."); } })}>Verify</Button>}
                  {d.verified && !d.primary && <Button size="sm" variant="secondary" onClick={() => void runDomains(() => api(`/projects/${id}/domains/${d.id}/primary`, { method: "POST" }))}>Make primary</Button>}
                  <Button size="sm" variant="ghost" onClick={async () => { if (await ask(`Remove ${d.hostname}?`)) void runDomains(() => api(`/projects/${id}/domains/${d.id}`, { method: "DELETE" })); }}>Remove</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Err z="domains" />
        {doms.data?.domains.length === 0 && !dns && <p className="mt-4 text-sm text-muted-foreground">No custom domain yet. Your site uses its Vercel address until you add one.</p>}
      </Panel>

      <Panel title="Environment variables" icon={<KeyRound />} description="Values are encrypted and never shown again after saving.">
        <form className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]" onSubmit={(e) => { e.preventDefault(); void runEnv(async () => { await api(`/projects/${id}/env`, { method: "PUT", body: { key: k, value: v } }); setK(""); setV(""); }); }}>
          <Input aria-label="Variable name" placeholder="API_KEY" value={k} onChange={(e) => setK(e.target.value.toUpperCase())} /><Input aria-label="Variable value" type="password" autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} /><Button type="submit" disabled={busy || !k || !v}>Save</Button>
        </form>
        <Err z="env" />
        {env.data && env.data.variables.length > 0 && (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {env.data.variables.map((x) => <li key={x.key} className="flex items-center justify-between px-3.5 py-2"><code className="text-sm">{x.key}</code><Button size="sm" variant="ghost" onClick={() => void runEnv(() => api(`/projects/${id}/env/${x.key}`, { method: "DELETE" }))}>Delete</Button></li>)}
          </ul>
        )}
      </Panel>
    </div>
  );
}
