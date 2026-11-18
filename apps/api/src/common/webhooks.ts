import { deliverWebhook } from "@webbrik/integrations";
import type { Db, WebhookRec } from "./db";

const KEEP = 100;

/** Sends one signed webhook and records the outcome (never throws). */
export async function sendWebhook(db: Db, projectId: string, hook: WebhookRec, event: string, payload: unknown) {
  const started = Date.now();
  let ok = false; let error: string | undefined;
  try { ok = await deliverWebhook(hook, event, payload); if (!ok) error = "Endpoint did not return a 2xx response"; }
  catch (e) { error = (e as Error).message.slice(0, 200); }
  const rec = db.webhookDeliveries.insert({ projectId, webhookId: hook.id, url: hook.url, event, ok, error, durationMs: Date.now() - started, createdAt: Date.now() });
  const all = db.webhookDeliveries.filter((d) => d.projectId === projectId).sort((a, b) => b.createdAt - a.createdAt);
  for (const old of all.slice(KEEP)) db.webhookDeliveries.delete(old.id);
  return rec;
}
