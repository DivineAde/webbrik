import type { CouponRec } from "./db";
import type { PaystackConfig } from "./paystack";

export const PAID_PLANS = ["pro", "team"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export const PERIOD_MS = 31 * 24 * 3600 * 1000;
export const planName = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

export const listPrice = (c: PaystackConfig, plan: PaidPlan) => (plan === "team" ? c.teamAmount ?? c.amount * 3 : c.amount);
export const planCodeFor = (c: PaystackConfig, plan: PaidPlan) => (plan === "team" ? c.teamPlanCode : c.planCode);

export interface Quote {
  plan: PaidPlan; kind: "new" | "upgrade" | "renewal";
  /** Price before discount and tax (for an upgrade: the prorated difference). */
  listPrice: number; discount: number; net: number; tax: number; taxPercent: number; total: number;
  currency: string; coupon?: string;
  /** Only subscription charges (no coupon, no proration) can use a Paystack plan and renew automatically. */
  recurring: boolean;
  /** Upgrades: fraction of the current period still unused. */
  remaining?: number;
}
export type CouponCheck = { ok: true; coupon: CouponRec } | { ok: false; reason: "unknown" | "inactive" | "expired" | "used_up" | "not_for_plan" | "already_used" };

export function checkCoupon(c: CouponRec | undefined, plan: string, workspaceId: string, now = Date.now()): CouponCheck {
  if (!c) return { ok: false, reason: "unknown" };
  if (!c.active) return { ok: false, reason: "inactive" };
  if (c.expiresAt && c.expiresAt <= now) return { ok: false, reason: "expired" };
  if (c.maxRedemptions !== undefined && c.redeemed >= c.maxRedemptions) return { ok: false, reason: "used_up" };
  if (c.plans?.length && !c.plans.includes(plan)) return { ok: false, reason: "not_for_plan" };
  if (c.redeemedBy.includes(workspaceId)) return { ok: false, reason: "already_used" };
  return { ok: true, coupon: c };
}
export const COUPON_MESSAGES: Record<string, string> = {
  unknown: "That coupon code isn't valid", inactive: "That coupon is no longer active", expired: "That coupon has expired",
  used_up: "That coupon has been fully redeemed", not_for_plan: "That coupon doesn't apply to this plan", already_used: "This workspace has already used that coupon",
};

/**
 * Price of a purchase. Upgrades from an active paid plan are prorated: you pay the difference between the plans for the
 * unused part of the period you already paid for (the period end doesn't move). Coupons discount the list price; tax is added last.
 */
export function quote(c: PaystackConfig, o: { plan: PaidPlan; current?: { plan: string; periodEnd: number } | null; coupon?: CouponRec; now?: number }): Quote {
  const now = o.now ?? Date.now();
  const taxPercent = c.taxPercent ?? 0;
  let kind: Quote["kind"] = "new", base = listPrice(c, o.plan), remaining: number | undefined;
  const cur = o.current;
  if (cur && cur.plan !== o.plan && cur.periodEnd > now && (PAID_PLANS as readonly string[]).includes(cur.plan)) {
    remaining = Math.min(1, (cur.periodEnd - now) / PERIOD_MS);
    kind = "upgrade";
    base = Math.max(1, Math.round((listPrice(c, o.plan) - listPrice(c, cur.plan as PaidPlan)) * remaining));
  }
  const discount = o.coupon ? Math.min(base - 1, Math.round((base * o.coupon.percentOff) / 100)) : 0;
  const net = base - discount;
  const tax = Math.round((net * taxPercent) / 100);
  return { plan: o.plan, kind, listPrice: base, discount, net, tax, taxPercent, total: net + tax, currency: c.currency, ...(o.coupon ? { coupon: o.coupon.code } : {}), recurring: kind === "new" && !o.coupon, ...(remaining !== undefined ? { remaining } : {}) };
}

/** What a renewal of `plan` costs under the current price list (used to validate renewal charges). */
export const renewalTotal = (c: PaystackConfig, plan: PaidPlan) => quote(c, { plan }).total;
