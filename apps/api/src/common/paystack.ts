import { createHmac, timingSafeEqual } from "node:crypto";

export interface PaystackConfig {
  secretKey: string;
  /** Paystack plan code for the paid plan (PLN_…). Optional: without it, payments are one-off for one period. */
  planCode?: string;
  /** Pro list price for one period, excluding tax, in the currency's smallest unit (kobo for NGN, pesewas for GHS, cents for ZAR/USD). */
  amount: number;
  /** Team plan: Paystack plan code and list price (defaults to 3x Pro). Pro and Team are the only paid plans. */
  teamPlanCode?: string;
  teamAmount?: number;
  /** Tax added on top of the list price (VAT/GST). 0 when unset. Paystack plan amounts must already include it. */
  taxPercent?: number;
  taxLabel?: string;
  /** Printed on invoices. */
  seller?: { name: string; address?: string; taxId?: string; email?: string };
  currency: string;
  baseUrl: string;
}

export interface InitResult { authorizationUrl: string; reference: string }
export interface VerifyResult { status: string; reference: string; amount: number; currency: string; paidAt?: string; customerEmail?: string; customerCode?: string; metadata: Record<string, unknown>; planCode?: string }

export interface PaystackClient {
  initialize(p: { email: string; amount: number; currency: string; reference: string; callbackUrl: string; planCode?: string; metadata: Record<string, unknown> }): Promise<InitResult>;
  verify(reference: string): Promise<VerifyResult>;
  disableSubscription(code: string, emailToken: string): Promise<void>;
  /** Fetches subscription details (next payment date, email token). */
  subscription(code: string): Promise<{ status: string; nextPaymentDate?: string; emailToken?: string }>;
}

export class PaystackError extends Error { constructor(message: string, public status?: number) { super(message); } }

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});

export class HttpPaystack implements PaystackClient {
  constructor(private cfg: PaystackConfig, private fetchImpl: typeof fetch = fetch) {}
  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<Json> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.cfg.baseUrl}${path}`, { method, headers: { authorization: `Bearer ${this.cfg.secretKey}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000) });
    } catch (e) { throw new PaystackError(`Could not reach Paystack: ${(e as Error).message}`); }
    const json = obj(await res.json().catch(() => ({})));
    if (!res.ok || json["status"] !== true) throw new PaystackError(typeof json["message"] === "string" ? json["message"] : `Paystack error ${res.status}`, res.status);
    return obj(json["data"]);
  }
  async initialize(p: Parameters<PaystackClient["initialize"]>[0]): Promise<InitResult> {
    const d = await this.call("POST", "/transaction/initialize", { email: p.email, amount: p.amount, currency: p.currency, reference: p.reference, callback_url: p.callbackUrl, metadata: p.metadata, ...(p.planCode ? { plan: p.planCode } : {}) });
    if (typeof d["authorization_url"] !== "string") throw new PaystackError("Paystack did not return a checkout address");
    return { authorizationUrl: d["authorization_url"], reference: String(d["reference"] ?? p.reference) };
  }
  async verify(reference: string): Promise<VerifyResult> {
    const d = await this.call("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
    const c = obj(d["customer"]);
    return { status: String(d["status"]), reference: String(d["reference"]), amount: Number(d["amount"]), currency: String(d["currency"]), paidAt: typeof d["paid_at"] === "string" ? d["paid_at"] : undefined, customerEmail: typeof c["email"] === "string" ? c["email"] : undefined, customerCode: typeof c["customer_code"] === "string" ? c["customer_code"] : undefined, metadata: obj(d["metadata"]), planCode: typeof obj(d["plan_object"])["plan_code"] === "string" ? (obj(d["plan_object"])["plan_code"] as string) : undefined };
  }
  async disableSubscription(code: string, emailToken: string) { await this.call("POST", "/subscription/disable", { code, token: emailToken }); }
  async subscription(code: string) {
    const d = await this.call("GET", `/subscription/${encodeURIComponent(code)}`);
    return { status: String(d["status"]), nextPaymentDate: typeof d["next_payment_date"] === "string" ? d["next_payment_date"] : undefined, emailToken: typeof d["email_token"] === "string" ? d["email_token"] : undefined };
  }
}

/** Paystack signs the raw request body with HMAC-SHA512 using your secret key (header x-paystack-signature). */
export function verifyPaystackSignature(rawBody: Buffer | string, signature: string | undefined, secretKey: string): boolean {
  if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function paystackConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PaystackConfig | null {
  const secretKey = env["PAYSTACK_SECRET_KEY"];
  if (!secretKey) return null;
  const amount = Number(env["PAYSTACK_PRO_AMOUNT"]);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("PAYSTACK_PRO_AMOUNT must be the Pro price in the currency's smallest unit (e.g. 1500000 for ₦15,000)");
  const currency = (env["PAYSTACK_CURRENCY"] ?? "NGN").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("PAYSTACK_CURRENCY must be a 3-letter code such as NGN, GHS, ZAR, KES or USD");
  const teamAmount = env["PAYSTACK_TEAM_AMOUNT"] ? Number(env["PAYSTACK_TEAM_AMOUNT"]) : amount * 3;
  if (!Number.isInteger(teamAmount) || teamAmount <= 0) throw new Error("PAYSTACK_TEAM_AMOUNT must be a whole number in the currency's smallest unit");
  const taxPercent = env["BILLING_TAX_PERCENT"] ? Number(env["BILLING_TAX_PERCENT"]) : 0;
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 50) throw new Error("BILLING_TAX_PERCENT must be between 0 and 50 (e.g. 7.5 for Nigerian VAT)");
  const sellerName = env["INVOICE_SELLER_NAME"];
  return { secretKey, planCode: env["PAYSTACK_PLAN_PRO"] || undefined, teamPlanCode: env["PAYSTACK_PLAN_TEAM"] || undefined, teamAmount, taxPercent, taxLabel: env["BILLING_TAX_LABEL"] || "VAT", ...(sellerName ? { seller: { name: sellerName, address: env["INVOICE_SELLER_ADDRESS"], taxId: env["INVOICE_SELLER_TAX_ID"], email: env["INVOICE_SELLER_EMAIL"] } } : {}), amount, currency, baseUrl: (env["PAYSTACK_BASE_URL"] ?? "https://api.paystack.co").replace(/\/+$/, "") };
}
