import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, Post, Query, Req, Res, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { Response } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Access, Public, RateLimit, parseBody, type AuthedRequest } from "../../common/http";
import { Db, type PaymentRec, type WorkspaceRec } from "../../common/db";
import { COUPON_MESSAGES, PAID_PLANS, PERIOD_MS, checkCoupon, listPrice, planCodeFor, planName, quote, renewalTotal, type PaidPlan, type Quote } from "../../common/pricing";
import { renderInvoicePdf } from "../../common/invoice";
import { appUrl } from "../../common/emails";
import * as emails from "../../common/emails";
import { MAILER, safeSend, type Mailer } from "../../common/mailer";
import { PaystackError, verifyPaystackSignature, type PaystackClient, type PaystackConfig, type VerifyResult } from "../../common/paystack";

export const PAYSTACK = Symbol("PAYSTACK");
export interface PaystackSetup { client: PaystackClient; config: PaystackConfig }

const adminEmails = () => (process.env["ADMIN_EMAILS"] ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const money = (amount: number, currency: string) => { try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount / 100); } catch { return `${(amount / 100).toFixed(2)} ${currency}`; } };

@Controller()
export class BillingController {
  constructor(@Inject(Db) private db: Db, @Inject(Access) private access: Access, @Inject(PAYSTACK) private paystack: PaystackSetup | null, @Inject(MAILER) private mailer: Mailer) {}

  private need(): PaystackSetup {
    if (!this.paystack) throw new ServiceUnavailableException({ code: "billing_unavailable", message: "Online payments are not set up on this server" });
    return this.paystack;
  }
  private view(ws: WorkspaceRec) {
    const b = ws.billing, cfg = this.paystack?.config;
    return {
      enabled: !!this.paystack,
      plan: ws.plan,
      // `price` stays the Pro list price for older clients; `plans` is the full price list (before tax).
      price: cfg ? { amount: cfg.amount, currency: cfg.currency, interval: "month" } : null,
      plans: cfg ? PAID_PLANS.map((id) => ({ id, name: planName(id), amount: listPrice(cfg, id), currency: cfg.currency, interval: "month" })) : [],
      tax: cfg && cfg.taxPercent ? { percent: cfg.taxPercent, label: cfg.taxLabel ?? "Tax" } : null,
      subscription: b ? { status: b.status, currentPeriodEnd: b.currentPeriodEnd, renews: b.status === "active" && !!b.subscriptionCode, cancellable: b.status === "active" || b.status === "past_due" } : null,
      payments: this.db.payments.filter((p) => p.workspaceId === ws.id && p.status === "success").sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0)).slice(0, 20).map((p) => ({ reference: p.reference, plan: p.plan, amount: p.amount, currency: p.currency, paidAt: p.paidAt, discount: p.discount ?? 0, tax: p.tax ?? 0, coupon: p.coupon, invoiceNo: p.invoiceNo, kind: p.kind ?? "new" })),
    };
  }

  private quoteFor(ws: WorkspaceRec, plan: PaidPlan, couponCode?: string): Quote {
    const { config } = this.need();
    let coupon;
    if (couponCode) {
      const chk = checkCoupon(this.db.coupons.find((c) => c.code === couponCode.trim().toUpperCase()), plan, ws.id);
      if (!chk.ok) throw new BadRequestException({ code: "coupon_invalid", message: COUPON_MESSAGES[chk.reason] });
      coupon = chk.coupon;
    }
    const b = ws.billing;
    const current = ws.plan !== "free" && b && (b.status === "active" || b.status === "canceling" || b.status === "past_due") ? { plan: ws.plan, periodEnd: b.currentPeriodEnd } : null;
    if (current?.plan === plan && b?.status === "active") throw new BadRequestException({ code: "already_subscribed", message: `This workspace is already on the ${planName(plan)} plan` });
    if (current && current.plan !== plan && listPrice(config, plan) < listPrice(config, current.plan as PaidPlan) && current.periodEnd > Date.now()) throw new BadRequestException({ code: "downgrade_unsupported", message: `To move to ${planName(plan)}, let your current plan end first (cancel it, then choose ${planName(plan)} after ${new Date(current.periodEnd).toLocaleDateString("en")})` });
    return quote(config, { plan, current, coupon });
  }

  @Get("workspaces/:id/billing")
  billing(@Req() req: AuthedRequest, @Param("id") id: string) {
    return this.view(this.access.workspace(req, id).workspace);
  }

  /** Price preview for a plan (with an optional coupon): list price, discount, tax, total. Nothing is charged. */
  @RateLimit(30, 60_000) @Get("workspaces/:id/billing/quote")
  quoteView(@Req() req: AuthedRequest, @Param("id") id: string, @Query("plan") plan = "pro", @Query("coupon") coupon?: string) {
    const { workspace } = this.access.workspace(req, id, "workspace:billing");
    this.need();
    if (!(PAID_PLANS as readonly string[]).includes(plan)) throw new BadRequestException({ code: "unknown_plan", message: "Unknown plan" });
    return { quote: this.quoteFor(workspace, plan as PaidPlan, coupon || undefined) };
  }

  @RateLimit(10, 60_000) @HttpCode(200) @Post("workspaces/:id/billing/checkout")
  async checkout(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { workspace, user } = this.access.workspace(req, id, "workspace:billing");
    const { client, config } = this.need();
    const b = parseBody(z.object({ plan: z.enum(PAID_PLANS), coupon: z.string().trim().max(40).optional() }), body);
    const q = this.quoteFor(workspace, b.plan, b.coupon || undefined);
    const reference = `wb_${randomBytes(12).toString("hex")}`;
    this.db.payments.insert({ workspaceId: id, userId: user.id, email: user.email, reference, plan: b.plan, amount: q.total, currency: q.currency, status: "pending", createdAt: Date.now(), listPrice: q.listPrice, discount: q.discount, tax: q.tax, taxPercent: q.taxPercent, coupon: q.coupon, kind: q.kind });
    try {
      // Only a plain subscription purchase uses a Paystack plan (fixed amount, renews). Coupons and prorated upgrades are one-off charges.
      const r = await client.initialize({ email: user.email, amount: q.total, currency: q.currency, reference, callbackUrl: `${appUrl()}/workspaces/${id}?tab=plan`, planCode: q.recurring ? planCodeFor(config, b.plan) : undefined, metadata: { workspaceId: id, userId: user.id, plan: b.plan } });
      return { authorizationUrl: r.authorizationUrl, reference, quote: q };
    } catch (e) {
      this.db.payments.deleteWhere((p) => p.reference === reference);
      throw new BadRequestException({ code: "checkout_failed", message: e instanceof PaystackError ? e.message : "Could not start checkout" });
    }
  }

  /** Called by the return page after Paystack redirects back. Idempotent: the webhook may have activated the plan already. */
  @RateLimit(20, 60_000) @HttpCode(200) @Post("workspaces/:id/billing/verify")
  async verify(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { workspace } = this.access.workspace(req, id, "workspace:billing");
    const { client } = this.need();
    const b = parseBody(z.object({ reference: z.string().min(4).max(100) }), body);
    const payment = this.db.payments.find((p) => p.reference === b.reference && p.workspaceId === id);
    if (!payment) throw new NotFoundException({ code: "not_found", message: "Payment not found" });
    if (payment.status === "pending") {
      let v: VerifyResult;
      try { v = await client.verify(payment.reference); } catch (e) { throw new ServiceUnavailableException({ code: "verify_failed", message: e instanceof PaystackError ? e.message : "Could not reach Paystack" }); }
      await this.settle(payment, v);
    }
    const fresh = this.db.payments.get(payment.id)!;
    return { status: fresh.status, failure: fresh.failure, ...this.view(this.db.workspaces.get(workspace.id)!) };
  }

  @HttpCode(200) @Post("workspaces/:id/billing/cancel")
  async cancel(@Req() req: AuthedRequest, @Param("id") id: string) {
    const { workspace, user } = this.access.workspace(req, id, "workspace:billing");
    const b = workspace.billing;
    if (!b || b.status === "expired" || b.status === "canceling") throw new BadRequestException({ code: "nothing_to_cancel", message: "There is no active subscription to cancel" });
    if (b.subscriptionCode) {
      const { client } = this.need();
      let token = b.emailToken;
      try {
        if (!token) token = (await client.subscription(b.subscriptionCode)).emailToken;
        if (!token) throw new PaystackError("Missing subscription token");
        await client.disableSubscription(b.subscriptionCode, token);
      } catch (e) { throw new BadRequestException({ code: "cancel_failed", message: e instanceof PaystackError ? e.message : "Could not cancel the subscription" }); }
    }
    this.db.workspaces.update(id, { billing: { ...b, status: "canceling" } });
    this.db.logAudit(id, "billing.cancel", user.id, "pro");
    return this.view(this.db.workspaces.get(id)!);
  }

  /** Paystack calls this for every event. Authenticated only by the HMAC-SHA512 signature of the raw body. */
  @Public() @HttpCode(200) @Post("billing/paystack/webhook")
  async webhook(@Req() req: AuthedRequest & { rawBody?: Buffer }) {
    if (!this.paystack) throw new ServiceUnavailableException({ code: "billing_unavailable", message: "Online payments are not set up" });
    const raw = req.rawBody;
    if (!raw || !verifyPaystackSignature(raw, req.headers["x-paystack-signature"] as string | undefined, this.paystack.config.secretKey)) throw new UnauthorizedException({ code: "bad_signature", message: "Invalid signature" });
    const event = obj(JSON.parse(raw.toString("utf8")));
    const data = obj(event["data"]);
    switch (event["event"]) {
      case "charge.success": await this.onCharge(data); break;
      case "subscription.create": this.onSubscription(data); break;
      case "subscription.disable": case "subscription.not_renew": this.onSubscriptionEnd(data); break;
      case "invoice.payment_failed": this.onPaymentFailed(data); break;
      default: break; // other events are acknowledged and ignored
    }
    return { received: true };
  }

  private workspaceByCustomer(code?: string, subscriptionCode?: string, email?: string) {
    if (subscriptionCode) { const w = this.db.workspaces.find((x) => x.billing?.subscriptionCode === subscriptionCode); if (w) return w; }
    if (code) { const w = this.db.workspaces.find((x) => x.billing?.customerCode === code); if (w) return w; }
    if (email) { // first events can arrive before our own records link the customer: fall back to their latest checkout
      const p = this.db.payments.filter((x) => x.email.toLowerCase() === email.toLowerCase()).sort((a, b) => b.createdAt - a.createdAt)[0];
      if (p) return this.db.workspaces.get(p.workspaceId);
    }
    return undefined;
  }

  private async onCharge(data: Json) {
    const reference = str(data["reference"]);
    if (!reference) return;
    const customer = obj(data["customer"]);
    let payment = this.db.payments.find((p) => p.reference === reference);
    if (payment?.status === "success") return; // retry of an event we already handled
    if (!payment) {
      // A renewal charged by the subscription: no checkout row exists, so link it through the customer/subscription.
      const ws = this.workspaceByCustomer(str(customer["customer_code"]), str(obj(data["subscription"])["subscription_code"]));
      if (!ws) { console.warn(`[billing] charge ${reference} matches no workspace; ignored`); return; }
      const plan = (PAID_PLANS as readonly string[]).includes(ws.plan) ? (ws.plan as PaidPlan) : "pro"; // a renewal is always for the plan the workspace is on
      const rq = quote(this.need().config, { plan });
      payment = this.db.payments.insert({ workspaceId: ws.id, userId: "", email: str(customer["email"]) ?? "", reference, plan, amount: rq.total, currency: rq.currency, status: "pending", createdAt: Date.now(), listPrice: rq.listPrice, discount: 0, tax: rq.tax, taxPercent: rq.taxPercent, kind: "renewal" });
    }
    const { client } = this.need();
    const v = await client.verify(reference); // never trust the event body alone for money
    await this.settle(payment, v);
  }

  /** Marks a payment paid only if Paystack confirms the exact amount and currency for this workspace. */
  private async settle(payment: PaymentRec, v: VerifyResult) {
    const { config } = this.need();
    if (payment.status === "success") return;
    const fail = (why: string) => { this.db.payments.update(payment.id, { status: "failed", failure: why }); };
    if (["failed", "abandoned", "reversed"].includes(v.status)) return fail(`payment ${v.status}`);
    if (v.status !== "success") return; // still processing: stays pending, the webhook or a later verify settles it
    if (v.amount !== payment.amount || v.currency.toUpperCase() !== config.currency) { console.warn(`[billing] ${payment.reference}: amount/currency mismatch`); return fail("amount_mismatch"); }
    const metaWs = str(v.metadata["workspaceId"]);
    if (metaWs && metaWs !== payment.workspaceId) return fail("workspace_mismatch");
    const ws = this.db.workspaces.get(payment.workspaceId);
    if (!ws) return fail("workspace_missing");
    const paidAt = v.paidAt ? Date.parse(v.paidAt) || Date.now() : Date.now();
    const live = ws.billing?.status === "active" || ws.billing?.status === "past_due";
    const base = Math.max(paidAt, live ? ws.billing!.currentPeriodEnd : 0);
    const upgrade = payment.kind === "upgrade" && !!ws.billing;
    const invoiceNo = `INV-${new Date(paidAt).getUTCFullYear()}-${String(this.db.payments.filter((x) => !!x.invoiceNo).length + 1).padStart(6, "0")}`;
    this.db.payments.update(payment.id, { status: "success", paidAt, failure: undefined, invoiceNo });
    if (payment.coupon) { const cp = this.db.coupons.find((c) => c.code === payment.coupon); if (cp) this.db.coupons.update(cp.id, { redeemed: cp.redeemed + 1, redeemedBy: [...cp.redeemedBy, ws.id] }); }
    // An upgrade changes the plan but not the period you already paid for. Its old auto-renewing subscription (for the old price) must stop.
    if (upgrade && ws.billing?.subscriptionCode) void this.stopOldSubscription(ws);
    this.db.workspaces.update(ws.id, { plan: payment.plan, billing: { ...ws.billing, status: ws.billing?.status === "canceling" ? "canceling" : "active", currentPeriodEnd: upgrade ? ws.billing!.currentPeriodEnd : base + PERIOD_MS, ...(upgrade ? { subscriptionCode: undefined, emailToken: undefined } : {}), customerCode: v.customerCode ?? ws.billing?.customerCode, customerEmail: v.customerEmail ?? ws.billing?.customerEmail } });
    this.db.logAudit(ws.id, "plan.change", payment.userId || "paystack", payment.plan);
    const to = payment.email || v.customerEmail;
    if (to) void safeSend(this.mailer, emails.receipt(to, ws.name, planName(payment.plan), money(v.amount, v.currency), invoiceNo));
  }

  private onSubscription(data: Json) {
    const code = str(data["subscription_code"]);
    if (!code) return;
    const customer = obj(data["customer"]);
    const ws = this.workspaceByCustomer(str(customer["customer_code"]), code, str(customer["email"]));
    if (!ws) return;
    const next = str(data["next_payment_date"]);
    const b = ws.billing;
    this.db.workspaces.update(ws.id, { billing: { ...b, status: b?.status ?? "active", currentPeriodEnd: Math.max(b?.currentPeriodEnd ?? 0, next ? Date.parse(next) || 0 : 0), subscriptionCode: code, emailToken: str(data["email_token"]) ?? b?.emailToken, customerCode: str(customer["customer_code"]) ?? b?.customerCode, customerEmail: str(customer["email"]) ?? b?.customerEmail } });
  }
  private onSubscriptionEnd(data: Json) {
    const ws = this.workspaceByCustomer(undefined, str(data["subscription_code"]));
    if (ws?.billing && ws.billing.status !== "expired") this.db.workspaces.update(ws.id, { billing: { ...ws.billing, status: "canceling" } });
  }
  private onPaymentFailed(data: Json) {
    const ws = this.workspaceByCustomer(undefined, str(obj(data["subscription"])["subscription_code"]));
    if (ws?.billing && ws.billing.status === "active") this.db.workspaces.update(ws.id, { billing: { ...ws.billing, status: "past_due" } });
  }

  private async stopOldSubscription(ws: WorkspaceRec) {
    const b = ws.billing; if (!b?.subscriptionCode || !this.paystack) return;
    try {
      const token = b.emailToken ?? (await this.paystack.client.subscription(b.subscriptionCode)).emailToken;
      if (token) await this.paystack.client.disableSubscription(b.subscriptionCode, token);
    } catch (e) { console.warn(`[billing] could not stop the old subscription ${b.subscriptionCode} after an upgrade: ${(e as Error).message}`); }
  }

  /** Printable invoice for a successful payment (PDF). */
  @Get("workspaces/:id/billing/invoices/:reference")
  async invoice(@Req() req: AuthedRequest, @Param("id") id: string, @Param("reference") reference: string, @Res() res: Response) {
    const { workspace } = this.access.workspace(req, id, "workspace:billing");
    const { config } = this.need();
    const p = this.db.payments.find((x) => x.reference === reference && x.workspaceId === id && x.status === "success");
    if (!p || !p.invoiceNo) throw new NotFoundException({ code: "not_found", message: "Invoice not found" });
    const pdf = await renderInvoicePdf({ payment: p, workspaceName: workspace.name, config });
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", `attachment; filename="${p.invoiceNo}.pdf"`);
    res.end(pdf);
  }

  // ----- Coupons (platform admins only: emails listed in ADMIN_EMAILS) -----
  private admin(req: AuthedRequest) {
    const u = req.user;
    if (!u || !adminEmails().includes(u.email.toLowerCase())) throw new ForbiddenException({ code: "forbidden", message: "Platform admins only" });
    return u;
  }
  @Get("admin/coupons")
  coupons(@Req() req: AuthedRequest) { this.admin(req); return { coupons: this.db.coupons.all().sort((a, b) => b.createdAt - a.createdAt) }; }

  @Post("admin/coupons")
  createCoupon(@Req() req: AuthedRequest, @Body() body: unknown) {
    this.admin(req);
    const b = parseBody(z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/), percentOff: z.number().int().min(1).max(100), plans: z.array(z.enum(PAID_PLANS)).optional(), maxRedemptions: z.number().int().min(1).optional(), expiresAt: z.number().int().optional() }), body);
    if (this.db.coupons.find((c) => c.code === b.code)) throw new BadRequestException({ code: "coupon_exists", message: "That code already exists" });
    return { coupon: this.db.coupons.insert({ ...b, redeemed: 0, active: true, createdAt: Date.now(), redeemedBy: [] }) };
  }

  @HttpCode(204) @Delete("admin/coupons/:id")
  deactivateCoupon(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.admin(req);
    if (!this.db.coupons.get(id)) throw new NotFoundException({ code: "not_found", message: "Coupon not found" });
    this.db.coupons.update(id, { active: false });
  }
}
