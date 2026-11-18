import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpPaystack, paystackConfigFromEnv, verifyPaystackSignature, type PaystackConfig } from "../src/common/paystack";
import { startEnv, type Env } from "./helpers";

const SECRET = "sk_test_secret";
interface Tx { status: string; amount: number; currency: string; paid_at?: string; email: string; customer_code: string; metadata?: Record<string, unknown> }

/** A stand-in Paystack server that checks the bearer key and speaks the real response shapes. */
class FakePaystack {
  server!: Server; url = "";
  txs = new Map<string, Tx>(); calls: { method: string; path: string; body: any }[] = [];
  subs = new Map<string, { token: string; disabled: boolean }>();
  async start() {
    this.server = createServer((req, res) => {
      let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
        const body = raw ? JSON.parse(raw) : undefined; const path = req.url!;
        this.calls.push({ method: req.method!, path, body });
        const send = (code: number, json: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(json)); };
        if (req.headers.authorization !== `Bearer ${SECRET}`) return send(401, { status: false, message: "Invalid key" });
        if (path === "/transaction/initialize") {
          this.txs.set(body.reference, { status: "pending", amount: body.amount, currency: body.currency, email: body.email, customer_code: "CUS_" + body.email.split("@")[0], metadata: body.metadata });
          return send(200, { status: true, data: { authorization_url: `https://checkout.paystack.test/${body.reference}`, access_code: "ac", reference: body.reference } });
        }
        const v = /^\/transaction\/verify\/(.+)$/.exec(path);
        if (v) { const t = this.txs.get(decodeURIComponent(v[1]!)); return t ? send(200, { status: true, data: { status: t.status, reference: decodeURIComponent(v[1]!), amount: t.amount, currency: t.currency, paid_at: t.paid_at, customer: { email: t.email, customer_code: t.customer_code }, metadata: t.metadata ?? {} } }) : send(404, { status: false, message: "Transaction reference not found" }); }
        if (path === "/subscription/disable") { const s = this.subs.get(body.code); if (!s || s.token !== body.token) return send(400, { status: false, message: "Invalid token" }); s.disabled = true; return send(200, { status: true, message: "Subscription disabled successfully" }); }
        const sub = /^\/subscription\/(.+)$/.exec(path);
        if (sub) { const s = this.subs.get(decodeURIComponent(sub[1]!)); return s ? send(200, { status: true, data: { status: "active", email_token: s.token, next_payment_date: "2030-01-01T00:00:00.000Z" } }) : send(404, { status: false, message: "Subscription not found" }); }
        send(404, { status: false, message: "no route" });
      });
    });
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
  pay(reference: string, over: Partial<Tx> = {}) { const t = this.txs.get(reference)!; Object.assign(t, { status: "success", paid_at: new Date().toISOString() }, over); }
  stop() { this.server.close(); }
}

const fake = new FakePaystack();
const cfg = (): PaystackConfig => ({ secretKey: SECRET, planCode: "PLN_pro", amount: 1_500_000, currency: "NGN", baseUrl: fake.url });
let env: Env;
beforeAll(async () => {
  await fake.start();
  process.env.APP_URL = "https://app.webbrik.test";
  env = await startEnv({ paystack: { client: new HttpPaystack(cfg()), config: cfg() } });
});
afterAll(async () => { await env.close(); fake.stop(); delete process.env.APP_URL; });

const sign = (body: string, key = SECRET) => createHmac("sha512", key).update(body).digest("hex");
const hook = async (event: object, signature?: string) => {
  const body = JSON.stringify(event);
  return fetch(`${env.base}/v1/billing/paystack/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-paystack-signature": signature ?? sign(body) }, body });
};
async function checkout(email: string) {
  const c = await env.signup(email);
  const ws = c.workspaceId;
  const r = await c.post(`/workspaces/${ws}/billing/checkout`, { plan: "pro" });
  expect(r.status, JSON.stringify(r.data)).toBe(200);
  return { c, ws, reference: r.data.reference as string, url: r.data.authorizationUrl as string };
}
const wsRec = (id: string) => env.db.workspaces.get(id)!;

describe("Paystack billing", () => {
  it("starts a checkout with the real HTTP client (auth header, plan, amount, callback, metadata)", async () => {
    const { ws, url, reference } = await checkout("pay1@example.com");
    expect(url).toBe(`https://checkout.paystack.test/${reference}`);
    const call = fake.calls.find((x) => x.path === "/transaction/initialize" && x.body.reference === reference)!;
    expect(call.body).toMatchObject({ amount: 1_500_000, currency: "NGN", plan: "PLN_pro", email: "pay1@example.com", callback_url: `https://app.webbrik.test/workspaces/${ws}?tab=plan`, metadata: { workspaceId: ws, plan: "pro" } });
    expect(wsRec(ws).plan).toBe("free"); // nothing is granted before payment
  });

  it("activates Pro after the return-page verify, idempotently, and sends a receipt", async () => {
    const { c, ws, reference } = await checkout("pay2@example.com");
    let v = (await c.post(`/workspaces/${ws}/billing/verify`, { reference })).data;
    expect(v.status).toBe("pending");                      // customer abandoned/hasn't paid yet
    expect(wsRec(ws).plan).toBe("free");
    fake.pay(reference);
    v = (await c.post(`/workspaces/${ws}/billing/verify`, { reference })).data;
    expect(v.status).toBe("success");
    expect(v.plan).toBe("pro");
    expect(wsRec(ws).billing).toMatchObject({ status: "active", customerCode: "CUS_pay2" });
    const end1 = wsRec(ws).billing!.currentPeriodEnd;
    expect(end1).toBeGreaterThan(Date.now() + 30 * 24 * 3600 * 1000);
    await c.post(`/workspaces/${ws}/billing/verify`, { reference });   // second call changes nothing
    expect(wsRec(ws).billing!.currentPeriodEnd).toBe(end1);
    expect(env.mailer.outbox.some((m) => m.to === "pay2@example.com" && m.subject.includes("Pro plan is active"))).toBe(true);
    const view = (await c.get(`/workspaces/${ws}/billing`)).data;
    expect(view.payments).toHaveLength(1);
    expect(view.entitlements ?? view.plan).toBeDefined();
    expect((await c.get(`/workspaces/${ws}/usage`)).data.entitlements.maxProjects).toBe(50); // entitlements follow the plan
    expect((await c.post(`/workspaces/${ws}/billing/checkout`, { plan: "pro" })).status).toBe(400); // already subscribed
  });

  it("rejects wrong amounts, wrong currencies and payments for another workspace", async () => {
    for (const [label, over] of [["amount", { amount: 100 }], ["currency", { currency: "USD" }]] as const) {
      const { c, ws, reference } = await checkout(`bad-${label}@example.com`);
      fake.pay(reference, over);
      const v = (await c.post(`/workspaces/${ws}/billing/verify`, { reference })).data;
      expect(v.status).toBe("failed"); expect(v.failure).toBe("amount_mismatch");
      expect(wsRec(ws).plan).toBe("free");
    }
    const a = await checkout("owner-a@example.com"); const b = await checkout("owner-b@example.com");
    expect((await a.c.post(`/workspaces/${a.ws}/billing/verify`, { reference: b.reference })).status).toBe(404); // someone else's reference
    fake.pay(a.reference, { metadata: { workspaceId: b.ws } });                                                   // tampered metadata
    expect((await a.c.post(`/workspaces/${a.ws}/billing/verify`, { reference: a.reference })).data.failure).toBe("workspace_mismatch");
    expect(wsRec(a.ws).plan).toBe("free");
  });

  it("only owners can check out, and members of other workspaces cannot", async () => {
    const o = await env.signup("own-x@example.com"); const e = await env.signup("ed-x@example.com"); const out = await env.signup("out-x@example.com");
    env.db.memberships.insert({ userId: e.userId, workspaceId: o.workspaceId, role: "EDITOR" });
    expect((await e.post(`/workspaces/${o.workspaceId}/billing/checkout`, { plan: "pro" })).status).toBe(403);
    expect((await out.post(`/workspaces/${o.workspaceId}/billing/checkout`, { plan: "pro" })).status).toBe(404);
    expect((await o.post(`/workspaces/${o.workspaceId}/billing/checkout`, { plan: "enterprise" })).status).toBe(400);
    expect((await o.post(`/workspaces/${o.workspaceId}/plan`, { plan: "pro" })).status).toBe(403); // no free upgrades while billing is on
  });

  describe("webhook", () => {
    it("rejects missing, malformed and wrongly signed requests", async () => {
      const body = JSON.stringify({ event: "charge.success", data: { reference: "x" } });
      for (const sig of [undefined, "abc", sign(body, "wrong-key"), sign(body).toUpperCase().slice(0, 100)]) {
        const r = await fetch(`${env.base}/v1/billing/paystack/webhook`, { method: "POST", headers: { "content-type": "application/json", ...(sig ? { "x-paystack-signature": sig } : {}) }, body });
        expect(r.status).toBe(401);
      }
      expect(verifyPaystackSignature(body, sign(body), SECRET)).toBe(true);
    });

    it("activates a plan from charge.success even if the customer never returns to the site, and retries are harmless", async () => {
      const { ws, reference } = await checkout("hook1@example.com");
      fake.pay(reference);
      const ev = { event: "charge.success", data: { reference, amount: 1_500_000, currency: "NGN", customer: { email: "hook1@example.com", customer_code: "CUS_hook1" } } };
      expect((await hook(ev)).status).toBe(200);
      expect(wsRec(ws).plan).toBe("pro");
      const end = wsRec(ws).billing!.currentPeriodEnd;
      expect((await hook(ev)).status).toBe(200);                        // Paystack retries on timeouts
      expect(wsRec(ws).billing!.currentPeriodEnd).toBe(end);
      expect(env.db.payments.filter((p) => p.reference === reference)).toHaveLength(1);
    });

    it("does not trust the event body: a forged amount with a valid signature still needs Paystack to confirm", async () => {
      const { ws, reference } = await checkout("hook2@example.com");   // transaction stays pending at Paystack
      await hook({ event: "charge.success", data: { reference, amount: 1_500_000, currency: "NGN", customer: { email: "hook2@example.com" } } });
      expect(wsRec(ws).plan).toBe("free");
    });

    it("links subscription events and renewals to the workspace, handles failure and cancellation", async () => {
      const { c, ws, reference } = await checkout("sub1@example.com");
      fake.pay(reference);
      await c.post(`/workspaces/${ws}/billing/verify`, { reference });
      const first = wsRec(ws).billing!.currentPeriodEnd;
      await hook({ event: "subscription.create", data: { subscription_code: "SUB_1", email_token: "tok_1", next_payment_date: "2030-02-01T00:00:00.000Z", customer: { customer_code: "CUS_sub1", email: "sub1@example.com" } } });
      expect(wsRec(ws).billing).toMatchObject({ subscriptionCode: "SUB_1", emailToken: "tok_1" });
      expect(wsRec(ws).billing!.currentPeriodEnd).toBe(Date.parse("2030-02-01T00:00:00.000Z"));
      // renewal: a new reference Paystack created itself, found through the customer code
      fake.txs.set("renew_1", { status: "success", amount: 1_500_000, currency: "NGN", paid_at: new Date().toISOString(), email: "sub1@example.com", customer_code: "CUS_sub1" });
      await hook({ event: "charge.success", data: { reference: "renew_1", amount: 1_500_000, currency: "NGN", customer: { email: "sub1@example.com", customer_code: "CUS_sub1" } } });
      expect(wsRec(ws).billing!.currentPeriodEnd).toBeGreaterThan(first);
      expect(env.db.payments.filter((p) => p.workspaceId === ws && p.status === "success")).toHaveLength(2);
      await hook({ event: "invoice.payment_failed", data: { subscription: { subscription_code: "SUB_1" } } });
      expect(wsRec(ws).billing!.status).toBe("past_due");
      expect(wsRec(ws).plan).toBe("pro");                                // still inside the paid period
      // user cancels in the app: Paystack is told, access continues until the period ends
      fake.subs.set("SUB_1", { token: "tok_1", disabled: false });
      const cancelled = await c.post(`/workspaces/${ws}/billing/cancel`);
      expect(cancelled.data.subscription.status).toBe("canceling");
      expect(fake.subs.get("SUB_1")!.disabled).toBe(true);
      expect(wsRec(ws).plan).toBe("pro");
      expect((await c.post(`/workspaces/${ws}/billing/cancel`)).status).toBe(400);
    });

    it("unknown events and unknown customers are acknowledged without changes", async () => {
      expect((await hook({ event: "transfer.success", data: {} })).status).toBe(200);
      expect((await hook({ event: "charge.success", data: { reference: "nobody", customer: { customer_code: "CUS_none" } } })).status).toBe(200);
    });
  });

  it("drops back to the free plan when the paid period (plus 3 days' grace) has passed, keeping the data", async () => {
    const { c, ws, reference } = await checkout("lapse@example.com");
    fake.pay(reference); await c.post(`/workspaces/${ws}/billing/verify`, { reference });
    const p = (await c.post(`/workspaces/${ws}/projects`, { name: "Keep" })).data.project;
    env.db.workspaces.update(ws, { billing: { ...wsRec(ws).billing!, currentPeriodEnd: Date.now() - 2 * 24 * 3600 * 1000 } });
    expect((await c.get(`/workspaces/${ws}/usage`)).data.plan).toBe("pro");          // inside grace
    env.db.workspaces.update(ws, { billing: { ...wsRec(ws).billing!, currentPeriodEnd: Date.now() - 4 * 24 * 3600 * 1000 } });
    const usage = (await c.get(`/workspaces/${ws}/usage`)).data;
    expect(usage.plan).toBe("free");
    expect(usage.entitlements.maxProjects).toBe(3);
    expect((await c.get(`/projects/${p.id}`)).status).toBe(200);                      // data kept
    expect((await c.get(`/workspaces/${ws}/billing`)).data.subscription.status).toBe("expired");
    expect(env.db.audit.filter((a) => a.workspaceId === ws && a.action === "plan.change" && a.target === "free")).toHaveLength(1);
    const again = await c.post(`/workspaces/${ws}/billing/checkout`, { plan: "pro" });  // can resubscribe
    expect(again.status).toBe(200);
  });

  it("reports Paystack outages and bad keys as clean errors", async () => {
    const bad = new HttpPaystack({ ...cfg(), secretKey: "sk_wrong" });
    await expect(bad.initialize({ email: "a@b.co", amount: 1, currency: "NGN", reference: "r", callbackUrl: "http://x", metadata: {} })).rejects.toThrow(/Invalid key/);
    const down = await startEnv({ paystack: { client: new HttpPaystack({ ...cfg(), baseUrl: "http://127.0.0.1:1" }), config: cfg() } });
    const c = await down.signup("down2@example.com");
    const r = await c.post(`/workspaces/${c.workspaceId}/billing/checkout`, { plan: "pro" });
    expect(r.status).toBe(400); expect(r.data.error.code).toBe("checkout_failed");
    expect(down.db.payments.all()).toHaveLength(0);                                    // no dangling pending row
    await down.close();
  });

  it("billing is unavailable (and manual plan changes work only outside production) when Paystack isn't configured", async () => {
    const off = await startEnv({ paystack: null });
    const c = await off.signup("off@example.com");
    expect((await c.post(`/workspaces/${c.workspaceId}/billing/checkout`, { plan: "pro" })).status).toBe(503);
    expect((await c.get(`/workspaces/${c.workspaceId}/billing`)).data.enabled).toBe(false);
    expect((await fetch(`${off.base}/v1/billing/paystack/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(503);
    await off.close();
  });

  it("reads configuration from the environment", () => {
    expect(paystackConfigFromEnv({})).toBeNull();
    expect(paystackConfigFromEnv({ PAYSTACK_SECRET_KEY: "sk", PAYSTACK_PRO_AMOUNT: "500000", PAYSTACK_PLAN_PRO: "PLN_x", PAYSTACK_CURRENCY: "ghs" })).toMatchObject({ amount: 500000, currency: "GHS", planCode: "PLN_x", baseUrl: "https://api.paystack.co" });
    expect(() => paystackConfigFromEnv({ PAYSTACK_SECRET_KEY: "sk" })).toThrow(/PAYSTACK_PRO_AMOUNT/);
    expect(() => paystackConfigFromEnv({ PAYSTACK_SECRET_KEY: "sk", PAYSTACK_PRO_AMOUNT: "10.5" })).toThrow();
    expect(() => paystackConfigFromEnv({ PAYSTACK_SECRET_KEY: "sk", PAYSTACK_PRO_AMOUNT: "1000", PAYSTACK_CURRENCY: "NAIRA" })).toThrow(/CURRENCY/);
  });
});
