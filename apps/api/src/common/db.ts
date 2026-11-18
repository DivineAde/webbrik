import { randomBytes } from "node:crypto";
import type { AnalyticsConfig } from "@webbrik/integrations";
import type { AssetRecord } from "@webbrik/assets";
import type { CollectionSchema, ItemStatus } from "@webbrik/content-engine";
import type { FormField } from "@webbrik/integrations";
import type { Document } from "@webbrik/document-model";
import type { Role } from "@webbrik/shared";

export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;

export class Table<T extends { id: string }> {
  private rows = new Map<string, T>();
  /** @param immutable rows are never modified after insert (revisions, audit log), so persistence skips re-serialising them. */
  constructor(private prefix: string, readonly immutable = false) {}
  all(): T[] { return [...this.rows.values()]; }
  /** Load persisted rows at startup, keeping their ids. */
  restore(rows: T[]) { for (const r of rows) this.rows.set(r.id, r); }
  insert(row: Omit<T, "id"> & { id?: string }): T {
    const full = { ...row, id: row.id ?? newId(this.prefix) } as T;
    this.rows.set(full.id, full);
    return full;
  }
  get(id: string | undefined | null): T | undefined { return id ? this.rows.get(id) : undefined; }
  find(pred: (r: T) => boolean): T | undefined { for (const r of this.rows.values()) if (pred(r)) return r; return undefined; }
  filter(pred: (r: T) => boolean = () => true): T[] { return [...this.rows.values()].filter(pred); }
  update(id: string, patch: Partial<T>): T | undefined { const r = this.rows.get(id); if (!r) return undefined; Object.assign(r, patch); return r; }
  delete(id: string): boolean { return this.rows.delete(id); }
  deleteWhere(pred: (r: T) => boolean) { for (const [k, r] of this.rows) if (pred(r)) this.rows.delete(k); }
}

export interface UserRec { id: string; email: string; passwordHash: string | null; name: string; emailVerified: boolean; mfaSecret?: string; mfaEnabled: boolean; recoveryHashes?: string[]; createdAt: number; emailVerifiedAt?: number; avatarUrl?: string; lastLoginAt?: number }
export interface SessionRec { id: string; userId: string; tokenHash: string; expiresAt: number; userAgent?: string; createdAt?: number }
export interface TokenRec { id: string; kind: "verify" | "reset" | "invite" | "review" | "email-change"; tokenHash: string; userId?: string; workspaceId?: string; projectId?: string; email?: string; role?: Role; expiresAt: number; usedAt?: number; approvedAt?: number }
export interface BillingState {
  status: "active" | "past_due" | "canceling" | "expired";
  /** Paid access lasts until this moment (extended by every successful charge). */
  currentPeriodEnd: number;
  customerCode?: string; customerEmail?: string; subscriptionCode?: string; emailToken?: string;
}
export interface WorkspaceRec { id: string; name: string; slug: string; plan: string; createdAt: number; billing?: BillingState }
export interface PaymentRec {
  id: string; workspaceId: string; userId: string; email: string; reference: string; plan: string;
  /** Total charged (net + tax), smallest currency unit. This is the amount Paystack must confirm. */
  amount: number; currency: string; status: "pending" | "success" | "failed"; failure?: string; paidAt?: number; createdAt: number;
  /** Price breakdown: list price, coupon discount, tax, and what kind of charge this is. */
  listPrice?: number; discount?: number; tax?: number; taxPercent?: number; coupon?: string; kind?: "new" | "upgrade" | "renewal";
  /** Assigned when the payment succeeds. */
  invoiceNo?: string;
}
export interface CouponRec { id: string; code: string; percentOff: number; plans?: string[]; maxRedemptions?: number; redeemed: number; expiresAt?: number; active: boolean; createdAt: number; redeemedBy: string[] }
export interface MembershipRec { id: string; userId: string; workspaceId: string; role: Role; createdAt?: number }
export interface WebhookRec { id: string; url: string; secret: string; events: string[] }
export interface ProjectRec { id: string; workspaceId: string; name: string; slug: string; description: string; thumbnail?: string; archivedAt?: number; deletedAt?: number; createdAt: number; updatedAt: number; headRevision: number; analytics: AnalyticsConfig[]; webhooks: WebhookRec[]; forms: Record<string, FormField[]>; formSettings?: Record<string, FormSettings> }
export interface FormSettings { successMessage?: string; redirectUrl?: string; notifyEmails?: string[] }
export interface RevisionRec { id: string; projectId: string; revision: number; document: Document; authorId?: string; createdAt: number }
export interface VersionRec { id: string; projectId: string; name: string; revision: number; authorId?: string; createdAt: number }
export interface CommentRec { id: string; projectId: string; elementId?: string; authorId?: string; authorName: string; body: string; resolvedAt?: number; createdAt: number }
export interface DeploymentRec { id: string; projectId: string; provider: string; providerId: string; target: "production" | "preview"; status: string; revision: number; url?: string; logs: string[]; createdAt: number }
export interface DomainRec { id: string; projectId: string; hostname: string; verified: boolean; primary: boolean; redirectTo?: string }
export interface EnvRec { id: string; projectId: string; key: string; valueCipher: string }
export interface CollectionRec { id: string; projectId: string; slug: string; schema: CollectionSchema }
export interface ItemRec { id: string; collectionId: string; slug: string; data: Record<string, unknown>; status: ItemStatus; publishAt?: string; updatedAt: number; revisions: { at: number; data: Record<string, unknown>; by?: string }[] }
export interface SubmissionRec { id: string; projectId: string; formId: string; data: Record<string, unknown>; createdAt: number }
export interface UsageRec { id: string; workspaceId: string; metric: string; period: string; quantity: number }
export interface AuditRec { id: string; workspaceId: string; projectId?: string; actorId?: string; action: string; target?: string; createdAt: number }
export interface WebhookDeliveryRec { id: string; projectId: string; webhookId: string; url: string; event: string; ok: boolean; error?: string; durationMs: number; createdAt: number }
export interface ProposalRec { id: string; projectId: string; userId: string; summary: string; operations: unknown[]; baseRevision: number; createdAt: number; status: "pending" | "accepted" | "rejected" }

/** In-memory persistence. The Prisma schema in infrastructure/database mirrors these tables; swap this class for a Prisma-backed one. */
export class Db {
  users = new Table<UserRec>("usr");
  sessions = new Table<SessionRec>("ses");
  tokens = new Table<TokenRec>("tok");
  coupons = new Table<CouponRec>("cpn");
  workspaces = new Table<WorkspaceRec>("ws");
  memberships = new Table<MembershipRec>("mem");
  projects = new Table<ProjectRec>("prj");
  revisions = new Table<RevisionRec>("rev", true);
  versions = new Table<VersionRec>("ver");
  assets = new Table<AssetRecord>("ast");
  comments = new Table<CommentRec>("cmt");
  deployments = new Table<DeploymentRec>("dep");
  domains = new Table<DomainRec>("dom");
  env = new Table<EnvRec>("env");
  collections = new Table<CollectionRec>("col");
  items = new Table<ItemRec>("itm");
  submissions = new Table<SubmissionRec>("sub");
  usage = new Table<UsageRec>("use");
  audit = new Table<AuditRec>("aud", true);
  proposals = new Table<ProposalRec>("prp");
  webhookDeliveries = new Table<WebhookDeliveryRec>("whd");
  payments = new Table<PaymentRec>("pay");

  /** Every table by name; the persistence layer iterates this. */
  get tables(): Record<string, Table<{ id: string }>> {
    const out: Record<string, Table<{ id: string }>> = {};
    for (const [k, v] of Object.entries(this)) if (v instanceof Table) out[k] = v as Table<{ id: string }>;
    return out;
  }

  logAudit(workspaceId: string, action: string, actorId?: string, target?: string, projectId?: string) {
    this.audit.insert({ workspaceId, action, actorId, target, projectId, createdAt: Date.now() });
  }

  /** Permanently removes a project and everything that belongs to it. */
  purgeProject(projectId: string) {
    for (const c of this.collections.filter((x) => x.projectId === projectId)) this.items.deleteWhere((i) => i.collectionId === c.id);
    this.collections.deleteWhere((x) => x.projectId === projectId);
    for (const t of [this.revisions, this.versions, this.assets, this.comments, this.deployments, this.domains, this.env, this.submissions, this.proposals, this.webhookDeliveries] as Table<{ id: string; projectId: string }>[])
      t.deleteWhere((r) => r.projectId === projectId);
    this.tokens.deleteWhere((t) => t.projectId === projectId);
    this.projects.delete(projectId);
  }

  /** Permanently removes a workspace, its projects, memberships, invites, usage and audit trail. */
  purgeWorkspace(workspaceId: string) {
    for (const p of this.projects.filter((x) => x.workspaceId === workspaceId)) this.purgeProject(p.id);
    this.memberships.deleteWhere((m) => m.workspaceId === workspaceId);
    this.tokens.deleteWhere((t) => t.workspaceId === workspaceId);
    this.usage.deleteWhere((u) => u.workspaceId === workspaceId);
    this.payments.deleteWhere((p) => p.workspaceId === workspaceId);
    this.audit.deleteWhere((a) => a.workspaceId === workspaceId);
    this.workspaces.delete(workspaceId);
  }

  period(now = new Date()) { return now.toISOString().slice(0, 7); }
  usageOf(workspaceId: string, metric: string) { return this.usage.find((u) => u.workspaceId === workspaceId && u.metric === metric && u.period === this.period())?.quantity ?? 0; }
  addUsage(workspaceId: string, metric: string, n = 1) {
    const p = this.period();
    const r = this.usage.find((u) => u.workspaceId === workspaceId && u.metric === metric && u.period === p);
    if (r) r.quantity += n;
    else this.usage.insert({ workspaceId, metric, period: p, quantity: n });
  }
}
