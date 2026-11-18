import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpPaystack, type PaystackConfig } from "../src/common/paystack";
import { quote } from "../src/common/pricing";
import { startEnv, type Env } from "./helpers";

interface Tx { status: string; amount: number; currency: string; paid_at?: string; email: string; metadata?: Record<string, unknown> }
const SECRET = "sk_test_extras";
const txs = new Map<string, Tx>(); const inits: any[] = [];
let server: Server; let url = "";
const cfg = (): PaystackConfig => ({ secretKey: SECRET, planCode: "PLN_pro", teamPlanCode: "PLN_team", amount: 1_000_000, currency: "NGN", taxPercent: 7.5, taxLabel: "VAT", seller: { name: "Webbrik Ltd", address: "1 Marina, Lagos", taxId: "TIN-123" }, baseUrl: url });
let env: Env;
beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
      const body = raw ? JSON.parse(raw) : undefined; const send = (j: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
      if (req.url === "/transaction/initialize") { inits.push(body); txs.set(body.reference, { status: "pending", amount: body.amount, currency: body.currency, email: body.email, metadata: body.metadata }); return send({ status: true, data: { authorization_url: "https://pay.test/" + body.reference, access_code: "a", reference: body.reference } }); }
      const v = /^\/transaction\/verify\/(.+)$/.exec(req.url!);
      if (v) { const t = txs.get(v[1]!)!; return send({ status: true, data: { status: t.status, reference: v[1], amount: t.amount, currency: t.currency, paid_at: t.paid_at, customer: { email: t.email, customer_code: "CUS_x" }, metadata: t.metadata ?? {} } }); }
      send({ status: true, data: {} });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r)); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ADMIN_EMAILS = "boss@x.com"; process.env.APP_URL = "https://app.webbrik.test";
  env = await startEnv({ paystack: { client: new HttpPaystack(cfg()), config: cfg() } });
});
afterAll(async () => { await env.close(); server.close(); delete process.env.ADMIN_EMAILS; delete process.env.APP_URL; });
const paid = (ref: string) => Object.assign(txs.get(ref)!, { status: "success", paid_at: new Date().toISOString() });

describe("pricing", () => {
  it("adds tax last, rounds to whole units and never discounts below 1", () => {
    const c = cfg();
    expect(quote(c, { plan: "pro" })).toMatchObject({ listPrice: 1_000_000, discount: 0, tax: 75_000, total: 1_075_000, recurring: true });
    expect(quote(c, { plan: "team" }).listPrice).toBe(3_000_000); // team defaults to 3x pro
    const full = quote(c, { plan: "pro", coupon: { id: "c", code: "FREE", percentOff: 100, redeemed: 0, active: true, createdAt: 0, redeemedBy: [] } });
    expect(full.net).toBe(1); expect(full.recurring).toBe(false);
  });
  it("prorates an upgrade by the unused part of the period", () => {
    const now = 1_000_000_000_000, half = now + (31 * 24 * 3600 * 1000) / 2;
    const q = quote(cfg(), { plan: "team", current: { plan: "pro", periodEnd: half }, now });
    expect(q).toMatchObject({ kind: "upgrade", listPrice: 1_000_000, remaining: 0.5, tax: 75_000, total: 1_075_000, recurring: false });
  });
});

describe("coupons, upgrades, invoices over HTTP", () => {
  it("only platform admins manage coupons; customers can preview prices with a coupon", async () => {
    const boss = await env.signup("boss@x.com"), cust = await env.signup("cust@x.com");
    expect((await cust.post("/admin/coupons", { code: "SAVE20", percentOff: 20 })).status).toBe(403);
    expect((await boss.post("/admin/coupons", { code: "save20", percentOff: 20, plans: ["pro"], maxRedemptions: 1 })).status).toBe(201);
    expect((await boss.post("/admin/coupons", { code: "SAVE20", percentOff: 5 })).status).toBe(400);
    const ws = cust.workspaceId;
    const plain = (await cust.get(`/workspaces/${ws}/billing/quote?plan=pro`)).data.quote;
    expect(plain).toMatchObject({ total: 1_075_000, tax: 75_000, discount: 0 });
    const withCoupon = (await cust.get(`/workspaces/${ws}/billing/quote?plan=pro&coupon=Save20`)).data.quote;
    expect(withCoupon).toMatchObject({ discount: 200_000, net: 800_000, tax: 60_000, total: 860_000, recurring: false, coupon: "SAVE20" });
    expect((await cust.get(`/workspaces/${ws}/billing/quote?plan=pro&coupon=NOPE`)).status).toBe(400);
    expect((await cust.get(`/workspaces/${ws}/billing/quote?plan=team&coupon=SAVE20`)).status).toBe(400); // pro-only coupon
    const view = (await cust.get(`/workspaces/${ws}/billing`)).data;
    expect(view.tax).toEqual({ percent: 7.5, label: "VAT" }); expect(view.plans.map((p: any) => p.id)).toEqual(["pro", "team"]);
  });

  it("charges the discounted, taxed total as a one-off, redeems the coupon once, and issues an invoice PDF", async () => {
    const c = await env.signup("buyer@x.com"); const ws = c.workspaceId;
    const r = await c.post(`/workspaces/${ws}/billing/checkout`, { plan: "pro", coupon: "SAVE20" });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const init = inits.at(-1); expect(init.amount).toBe(860_000); expect(init.plan).toBeUndefined(); // coupons can't use the fixed-price Paystack plan
    paid(r.data.reference);
    const v = (await c.post(`/workspaces/${ws}/billing/verify`, { reference: r.data.reference })).data;
    expect(v.status).toBe("success"); expect(v.plan).toBe("pro"); expect(v.subscription.renews).toBe(false);
    const row = v.payments[0]; expect(row).toMatchObject({ amount: 860_000, discount: 200_000, tax: 60_000, coupon: "SAVE20" }); expect(row.invoiceNo).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(env.db.coupons.find((x) => x.code === "SAVE20")!.redeemed).toBe(1);
    const other = await env.signup("buyer2@x.com");
    expect((await other.get(`/workspaces/${other.workspaceId}/billing/quote?plan=pro&coupon=SAVE20`)).status).toBe(400); // fully redeemed

    const pdf = await c.get(`/workspaces/${ws}/billing/invoices/${r.data.reference}`);
    expect(pdf.status).toBe(200); expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(pdf.data.subarray(0, 5).toString()).toBe("%PDF-"); expect(pdf.data.length).toBeGreaterThan(1500);
    expect((await other.get(`/workspaces/${other.workspaceId}/billing/invoices/${r.data.reference}`)).status).toBe(404); // someone else's invoice
  });

  it("upgrades Pro to Team for the prorated difference, keeps the paid period, and refuses downgrades", async () => {
    const c = await env.signup("up@x.com"); const ws = c.workspaceId;
    const first = (await c.post(`/workspaces/${ws}/billing/checkout`, { plan: "pro" })).data.reference; paid(first);
    await c.post(`/workspaces/${ws}/billing/verify`, { reference: first });
    const end = Date.now() + (31 * 24 * 3600 * 1000) / 2;
    env.db.workspaces.update(ws, { billing: { ...env.db.workspaces.get(ws)!.billing!, currentPeriodEnd: end } });
    const q = (await c.get(`/workspaces/${ws}/billing/quote?plan=team`)).data.quote;
    expect(q.kind).toBe("upgrade"); expect(Math.abs(q.listPrice - 1_000_000)).toBeLessThan(200); expect(q.total).toBe(q.listPrice + q.tax);
    const r = await c.post(`/workspaces/${ws}/billing/checkout`, { plan: "team" }); paid(r.data.reference);
    expect(inits.at(-1).plan).toBeUndefined();
    const v = (await c.post(`/workspaces/${ws}/billing/verify`, { reference: r.data.reference })).data;
    expect(v.plan).toBe("team"); expect(v.subscription.currentPeriodEnd).toBe(end);
    expect(v.payments.find((p: any) => p.reference === r.data.reference).kind).toBe("upgrade");
    expect((await c.get(`/workspaces/${ws}/usage`)).data.entitlements.maxMembers).toBe(50);
    const down = await c.get(`/workspaces/${ws}/billing/quote?plan=pro`);
    expect(down.status).toBe(400); expect(down.data.error?.code ?? down.data.code).toBe("downgrade_unsupported");
    expect((await c.post(`/workspaces/${ws}/billing/checkout`, { plan: "team" })).status).toBe(400); // already on Team
  });
});
