import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// ---------- Analytics: head snippets built only from validated identifiers ----------
export const AnalyticsConfigSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("ga4"), measurementId: z.string().regex(/^G-[A-Z0-9]{4,14}$/) }),
  z.object({ provider: z.literal("gtm"), containerId: z.string().regex(/^GTM-[A-Z0-9]{4,10}$/) }),
  z.object({ provider: z.literal("plausible"), domain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i), scriptSrc: z.string().url().startsWith("https://").optional() }),
]);
export type AnalyticsConfig = z.infer<typeof AnalyticsConfigSchema>;

export function analyticsHead(cfg: AnalyticsConfig): string {
  const c = AnalyticsConfigSchema.parse(cfg);
  switch (c.provider) {
    case "ga4":
      return `<script async src="https://www.googletagmanager.com/gtag/js?id=${c.measurementId}"></script>\n<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${c.measurementId}");</script>`;
    case "gtm":
      return `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({"gtm.start":new Date().getTime(),event:"gtm.js"});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src="https://www.googletagmanager.com/gtm.js?id="+i;f.parentNode.insertBefore(j,f);})(window,document,"script","dataLayer","${c.containerId}");</script>`;
    case "plausible":
      return `<script defer data-domain="${c.domain}" src="${c.scriptSrc ?? "https://plausible.io/js/script.js"}"></script>`;
  }
}

export const analyticsHeadAll = (cfgs: AnalyticsConfig[]) => cfgs.map(analyticsHead).join("\n");

// ---------- Webhooks: HMAC-signed deliveries with replay protection ----------
export function signWebhook(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return { timestamp, signature: `t=${timestamp},v1=${sig}` };
}

export function verifyWebhook(secret: string, body: string, header: string, toleranceSec = 300, now = Math.floor(Date.now() / 1000)): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts["t"]), v1 = parts["v1"];
  if (!Number.isFinite(t) || !v1 || Math.abs(now - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest();
  const given = Buffer.from(v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const WebhookEndpointSchema = z.object({ url: z.string().url().startsWith("https://"), events: z.array(z.enum(["deployment.ready", "deployment.failed", "content.published", "comment.created", "form.submitted"])).min(1) });

/** Block webhook targets on private/loopback addresses (SSRF guard for literal hosts; resolve+check at delivery time too). */
export function isPublicHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
    if (/^\[?(::1|fc|fd|fe80)/i.test(h)) return false;
    const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
    if (m) { const [a, b] = [Number(m[1]), Number(m[2])]; if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return false; }
    return true;
  } catch { return false; }
}

export async function deliverWebhook(endpoint: { url: string; secret: string }, event: string, payload: unknown, fetchImpl: typeof fetch = fetch) {
  if (!isPublicHttpsUrl(endpoint.url)) throw new Error("Webhook URL is not a public https URL");
  const body = JSON.stringify({ event, payload });
  const { signature } = signWebhook(endpoint.secret, body);
  const res = await fetchImpl(endpoint.url, { method: "POST", headers: { "content-type": "application/json", "x-webbrik-signature": signature }, body, redirect: "error" });
  return res.ok;
}

// ---------- Forms ----------
export interface FormField { name: string; type: "text" | "email" | "textarea" | "number" | "checkbox"; required?: boolean; maxLength?: number }

/** Validates a public form submission; a filled honeypot field marks it as spam. */
export function validateSubmission(fields: FormField[], data: Record<string, unknown>, honeypot = "_hp") {
  if (data[honeypot]) return { ok: false as const, spam: true, errors: ["spam"] };
  const errors: string[] = [];
  const clean: Record<string, string | number | boolean> = {};
  const known = new Set(fields.map((f) => f.name));
  for (const k of Object.keys(data)) if (k !== honeypot && !known.has(k)) errors.push(`${k}: unknown field`);
  for (const f of fields) {
    const v = data[f.name];
    if (v === undefined || v === "" || v === null) { if (f.required) errors.push(`${f.name}: required`); continue; }
    if (f.type === "checkbox") { clean[f.name] = v === true || v === "on" || v === "true"; continue; }
    if (f.type === "number") { const n = Number(v); if (!Number.isFinite(n)) errors.push(`${f.name}: must be a number`); else clean[f.name] = n; continue; }
    const s = String(v);
    if (s.length > (f.maxLength ?? (f.type === "textarea" ? 5000 : 500))) { errors.push(`${f.name}: too long`); continue; }
    if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) { errors.push(`${f.name}: invalid email`); continue; }
    clean[f.name] = s;
  }
  return errors.length ? { ok: false as const, spam: false, errors } : { ok: true as const, data: clean };
}

// ---------- Payments: link-based checkout (no card data ever touches Webbrik) ----------
export function isStripePaymentLink(url: string): boolean {
  try { const u = new URL(url); return u.protocol === "https:" && (u.hostname === "buy.stripe.com" || u.hostname === "checkout.stripe.com"); } catch { return false; }
}

// ---------- Generic provider registry ----------
export interface IntegrationProvider { id: string; category: "analytics" | "marketing" | "payments" | "forms" | "crm" | "content" | "auth"; label: string }
export class IntegrationRegistry {
  private m = new Map<string, IntegrationProvider>();
  register(p: IntegrationProvider) { if (this.m.has(p.id)) throw new Error(`Duplicate integration: ${p.id}`); this.m.set(p.id, p); }
  byCategory(c: IntegrationProvider["category"]) { return [...this.m.values()].filter((p) => p.category === c); }
}
