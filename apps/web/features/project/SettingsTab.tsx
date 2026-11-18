"use client";
import { useEffect, useState } from "react";
import { ask } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAction, useQuery } from "./hooks";

type Analytics = { provider: "ga4"; measurementId: string } | { provider: "gtm"; containerId: string } | { provider: "plausible"; domain: string };
interface Hook { id: string; url: string; events: string[] }
interface Delivery { id: string; webhookId: string; url: string; event: string; ok: boolean; error?: string; durationMs: number; createdAt: number }
const EVENTS = [["deployment.ready", "Deployment ready"], ["deployment.failed", "Deployment failed"], ["content.published", "Content published"], ["comment.created", "Comment created"]] as const;
const FIELD = { ga4: ["measurementId", "G-XXXXXXXXXX"], gtm: ["containerId", "GTM-XXXXXXX"], plausible: ["domain", "example.com"] } as const;

export function SettingsTab({ id }: { id: string }) {
  const q = useQuery<{ analytics: Analytics[]; webhooks: Hook[] }>(`/projects/${id}/integrations`);
  const log = useQuery<{ deliveries: Delivery[] }>(`/projects/${id}/webhooks/deliveries`);
  const { run, error, busy } = useAction(async () => { await q.reload(); await log.reload(); });
  const [list, setList] = useState<Analytics[]>([]);
  const [provider, setProvider] = useState<keyof typeof FIELD>("ga4"); const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (q.data) setList(q.data.analytics); }, [q.data]);
  const [url, setUrl] = useState(""); const [events, setEvents] = useState<string[]>(["deployment.ready"]);
  const [secret, setSecret] = useState<string | null>(null);
  const label = (a: Analytics) => `${a.provider.toUpperCase()} · ${"measurementId" in a ? a.measurementId : "containerId" in a ? a.containerId : a.domain}`;
  return (
    <section className="space-y-8">
      {(error ?? q.error) && <p role="alert" className="text-xs text-destructive">{error ?? q.error}</p>}
      <div className="space-y-2">
        <h2 className="text-sm font-medium">Analytics</h2>
        <p className="text-xs text-muted-foreground">Snippets are generated from validated IDs only, and added to every published page on the next publish.</p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const [k] = FIELD[provider]; setList([...list, { provider, [k]: value.trim() } as Analytics]); setValue(""); setSaved(false); }}>
          <select aria-label="Analytics provider" className="h-9 rounded-md border border-border bg-background px-2 text-xs" value={provider} onChange={(e) => setProvider(e.target.value as keyof typeof FIELD)}><option value="ga4">Google Analytics 4</option><option value="gtm">Google Tag Manager</option><option value="plausible">Plausible</option></select>
          <Input aria-label="Analytics ID" placeholder={FIELD[provider][1]} value={value} onChange={(e) => setValue(e.target.value)} /><Button type="submit" variant="secondary" disabled={!value.trim()}>Add</Button>
        </form>
        <ul className="divide-y divide-border rounded-md border border-border">
          {list.length === 0 && <li className="p-3 text-muted-foreground">No analytics configured.</li>}
          {list.map((a, i) => <li key={i} className="flex items-center justify-between p-2"><span>{label(a)}</span><Button size="sm" variant="ghost" onClick={() => { setList(list.filter((_, j) => j !== i)); setSaved(false); }}>Remove</Button></li>)}
        </ul>
        <div className="flex items-center gap-2"><Button disabled={busy} onClick={() => void run(async () => { await api(`/projects/${id}/integrations/analytics`, { method: "PUT", body: { configs: list } }); setSaved(true); })}>Save analytics</Button>{saved && <span role="status" className="text-xs text-muted-foreground">Saved. Publish to apply.</span>}</div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Webhooks</h2>
        <p className="text-xs text-muted-foreground">Webhooks are signed (HMAC) so your server can verify them. URLs must be public https addresses.</p>
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await api<{ secret: string }>(`/projects/${id}/webhooks`, { method: "POST", body: { url, events } }); setSecret(r.secret); setUrl(""); }); }}>
          <Input aria-label="Webhook URL" type="url" placeholder="https://example.com/hooks/webbrik" required value={url} onChange={(e) => setUrl(e.target.value)} />
          <fieldset className="flex flex-wrap gap-3"><legend className="sr-only">Events</legend>
            {EVENTS.map(([v, l]) => <label key={v} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={events.includes(v)} onChange={(e) => setEvents(e.target.checked ? [...events, v] : events.filter((x) => x !== v))} />{l}</label>)}
          </fieldset>
          <Button type="submit" disabled={busy || events.length === 0}>Add webhook</Button>
        </form>
        {secret && <div role="status" className="rounded-md border border-border p-2 text-xs"><p className="font-medium">Signing secret — copy it now, it won’t be shown again.</p><code aria-label="Signing secret" className="mt-1 block break-all rounded bg-muted p-1.5">{secret}</code><Button size="sm" variant="ghost" className="mt-1" onClick={() => setSecret(null)}>Done</Button></div>}
        <ul className="divide-y divide-border rounded-md border border-border">
          {q.data?.webhooks.length === 0 && <li className="p-3 text-muted-foreground">No webhooks yet.</li>}
          {q.data?.webhooks.map((h) => <li key={h.id} className="flex items-center justify-between gap-2 p-2"><span className="min-w-0"><span className="block truncate">{h.url}</span><span className="text-xs text-muted-foreground">{h.events.join(", ")}</span></span><span className="flex shrink-0"><Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => api(`/projects/${id}/webhooks/${h.id}/test`, { method: "POST" }))}>Send test</Button><Button size="sm" variant="ghost" onClick={async () => { if (await ask(`Delete webhook ${h.url}?`)) void run(() => api(`/projects/${id}/webhooks/${h.id}`, { method: "DELETE" })); }}>Delete</Button></span></li>)}
        </ul>
        <h3 className="pt-2 text-xs font-medium">Recent deliveries</h3>
        <ul aria-label="Webhook deliveries" className="divide-y divide-border rounded-md border border-border">
          {log.data?.deliveries.length === 0 && <li className="p-3 text-muted-foreground">Nothing delivered yet. Use “Send test” to check an endpoint.</li>}
          {log.data?.deliveries.slice(0, 20).map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-2 p-2">
              <span className="min-w-0"><span className="block truncate"><strong className={d.ok ? "font-medium" : "font-medium text-destructive"}>{d.ok ? "Delivered" : "Failed"}</strong> · <code>{d.event}</code> · {d.url}</span>{d.error && <span className="block text-xs text-muted-foreground">{d.error}</span>}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{d.durationMs} ms · <time>{new Date(d.createdAt).toLocaleString()}</time></span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
