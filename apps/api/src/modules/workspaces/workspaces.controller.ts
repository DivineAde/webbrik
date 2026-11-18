import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post, Req } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { PLANS, can, type Role } from "@webbrik/shared";
import { Db } from "../../common/db";
import { Access, hashToken, parseBody, type AuthedRequest } from "../../common/http";
import { MAILER, safeSend, type Mailer } from "../../common/mailer";
import * as emails from "../../common/emails";
import { PAYSTACK } from "../billing/billing.controller";
import { slugify } from "../auth/auth.controller";

const ROLES = ["OWNER", "ADMIN", "EDITOR", "DESIGNER", "DEVELOPER", "VIEWER"] as const;
const role = z.enum(ROLES);

@Controller()
export class WorkspacesController {
  constructor(@Inject(Db) private db: Db, @Inject(Access) private access: Access, @Inject(MAILER) private mailer: Mailer, @Inject(PAYSTACK) private paystack: unknown) {}

  @Post("workspaces")
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const user = this.access.user(req);
    const b = parseBody(z.object({ name: z.string().trim().min(1).max(80) }), body);
    const ws = this.db.workspaces.insert({ name: b.name, slug: `${slugify(b.name)}-${randomBytes(3).toString("hex")}`, plan: "free", createdAt: Date.now() });
    this.db.memberships.insert({ userId: user.id, workspaceId: ws.id, role: "OWNER" });
    this.db.logAudit(ws.id, "workspace.create", user.id, ws.id);
    return { workspace: ws };
  }

  @Get("workspaces")
  list(@Req() req: AuthedRequest) {
    const user = this.access.user(req);
    return { workspaces: this.db.memberships.filter((m) => m.userId === user.id).map((m) => ({ ...this.db.workspaces.get(m.workspaceId)!, role: m.role })) };
  }

  @Patch("workspaces/:id")
  rename(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { workspace, user } = this.access.workspace(req, id, "workspace:settings");
    const b = parseBody(z.object({ name: z.string().trim().min(1).max(80) }), body);
    this.db.workspaces.update(workspace.id, { name: b.name });
    this.db.logAudit(workspace.id, "workspace.rename", user.id, workspace.id);
    return { workspace: this.db.workspaces.get(workspace.id) };
  }

  @Get("workspaces/:id/members")
  members(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.workspace(req, id);
    return { members: this.db.memberships.filter((m) => m.workspaceId === id).map((m) => { const u = this.db.users.get(m.userId)!; return { userId: u.id, name: u.name, email: u.email, role: m.role }; }) };
  }

  private ownerCount(workspaceId: string) { return this.db.memberships.filter((m) => m.workspaceId === workspaceId && m.role === "OWNER").length; }

  @Post("workspaces/:id/invites")
  async invite(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { workspace, membership, user } = this.access.workspace(req, id, "workspace:invite");
    const b = parseBody(z.object({ email: z.string().email().transform((e) => e.toLowerCase()), role }), body);
    if (b.role === "OWNER" && membership.role !== "OWNER") throw new ForbiddenException({ code: "forbidden", message: "Only owners can invite owners" });
    const limit = (PLANS[workspace.plan] ?? PLANS["free"]!).maxMembers;
    const pending = this.db.tokens.filter((t) => t.kind === "invite" && t.workspaceId === id && !t.usedAt && t.expiresAt > Date.now()).length;
    if (this.db.memberships.filter((m) => m.workspaceId === id).length + pending >= limit) throw new ForbiddenException({ code: "quota_exceeded", message: `Your plan allows ${limit} member(s)` });
    const raw = randomBytes(24).toString("base64url");
    this.db.tokens.insert({ kind: "invite", tokenHash: hashToken(raw), workspaceId: id, email: b.email, role: b.role, expiresAt: Date.now() + 7 * 24 * 3600 * 1000 });
    const emailSent = await safeSend(this.mailer, emails.invite(b.email, workspace.name, user.name, raw));
    this.db.logAudit(id, "member.invite", user.id, b.email);
    return { ok: true, emailSent };
  }

  @Get("workspaces/:id/invites")
  invites(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.workspace(req, id, "workspace:invite");
    return { invites: this.db.tokens.filter((t) => t.kind === "invite" && t.workspaceId === id && !t.usedAt && t.expiresAt > Date.now()).map((t) => ({ id: t.id, email: t.email, role: t.role, expiresAt: t.expiresAt })) };
  }

  @HttpCode(204) @Delete("workspaces/:id/invites/:inviteId")
  revokeInvite(@Req() req: AuthedRequest, @Param("id") id: string, @Param("inviteId") inviteId: string) {
    const { user } = this.access.workspace(req, id, "workspace:invite");
    const t = this.db.tokens.get(inviteId);
    if (!t || t.kind !== "invite" || t.workspaceId !== id || t.usedAt) throw new NotFoundException({ code: "not_found", message: "Invitation not found" });
    this.db.tokens.update(t.id, { usedAt: Date.now() }); // consumed = unusable
    this.db.logAudit(id, "member.invite.revoke", user.id, t.email);
  }

  @HttpCode(200) @Post("invites/accept")
  accept(@Req() req: AuthedRequest, @Body() body: unknown) {
    const user = this.access.user(req);
    const { token } = parseBody(z.object({ token: z.string().min(10) }), body);
    const h = hashToken(token);
    const t = this.db.tokens.find((x) => x.kind === "invite" && x.tokenHash === h && !x.usedAt && x.expiresAt > Date.now());
    if (!t || !t.workspaceId || !t.role) throw new BadRequestException({ code: "invalid_token", message: "This invitation is invalid or has expired" });
    if (t.email !== user.email) throw new ForbiddenException({ code: "wrong_account", message: "This invitation was sent to a different email address" });
    if (!user.emailVerified) throw new ForbiddenException({ code: "unverified", message: "Verify your email before accepting invitations" });
    this.db.tokens.update(t.id, { usedAt: Date.now() });
    if (!this.db.memberships.find((m) => m.userId === user.id && m.workspaceId === t.workspaceId)) this.db.memberships.insert({ userId: user.id, workspaceId: t.workspaceId, role: t.role });
    this.db.logAudit(t.workspaceId, "member.join", user.id, user.id);
    return { workspaceId: t.workspaceId };
  }

  @Patch("workspaces/:id/members/:userId")
  setRole(@Req() req: AuthedRequest, @Param("id") id: string, @Param("userId") userId: string, @Body() body: unknown) {
    const { membership, user } = this.access.workspace(req, id, "workspace:manage-members");
    const b = parseBody(z.object({ role }), body);
    const target = this.db.memberships.find((m) => m.workspaceId === id && m.userId === userId);
    if (!target) throw new NotFoundException({ code: "not_found", message: "Member not found" });
    if ((b.role === "OWNER" || target.role === "OWNER") && membership.role !== "OWNER") throw new ForbiddenException({ code: "forbidden", message: "Only owners can change owner roles" });
    if (target.role === "OWNER" && b.role !== "OWNER" && this.ownerCount(id) <= 1) throw new BadRequestException({ code: "last_owner", message: "A workspace needs at least one owner" });
    this.db.memberships.update(target.id, { role: b.role as Role });
    this.db.logAudit(id, "member.role", user.id, `${userId}:${b.role}`);
    return { ok: true };
  }

  @HttpCode(204) @Delete("workspaces/:id/members/:userId")
  remove(@Req() req: AuthedRequest, @Param("id") id: string, @Param("userId") userId: string) {
    const { membership, user } = this.access.workspace(req, id);
    const target = this.db.memberships.find((m) => m.workspaceId === id && m.userId === userId);
    if (!target) throw new NotFoundException({ code: "not_found", message: "Member not found" });
    const self = userId === user.id;
    if (!self && !can(membership.role, "workspace:manage-members")) throw new ForbiddenException({ code: "forbidden", message: "Missing permission: workspace:manage-members" });
    if (target.role === "OWNER" && (!self || this.ownerCount(id) <= 1) && (membership.role !== "OWNER" || this.ownerCount(id) <= 1)) throw new BadRequestException({ code: "last_owner", message: "A workspace needs at least one owner" });
    this.db.memberships.delete(target.id);
    this.db.logAudit(id, "member.remove", user.id, userId);
  }

  @HttpCode(204) @Delete("workspaces/:id")
  deleteWorkspace(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { membership, workspace } = this.access.workspace(req, id);
    if (membership.role !== "OWNER") throw new ForbiddenException({ code: "forbidden", message: "Only owners can delete a workspace" });
    const b = parseBody(z.object({ confirmName: z.string() }), body);
    if (b.confirmName !== workspace.name) throw new BadRequestException({ code: "confirm_mismatch", message: "Type the workspace name exactly to confirm" });
    this.db.purgeWorkspace(id);
  }

  @Get("workspaces/:id/usage")
  usage(@Req() req: AuthedRequest, @Param("id") id: string) {
    const { workspace } = this.access.workspace(req, id);
    const projects = this.db.projects.filter((p) => p.workspaceId === id && !p.deletedAt);
    const storage = this.db.assets.filter((a) => projects.some((p) => p.id === a.projectId)).reduce((n, a) => n + a.sizeBytes, 0);
    return {
      plan: workspace.plan,
      entitlements: PLANS[workspace.plan] ?? PLANS["free"],
      usage: { projects: projects.length, members: this.db.memberships.filter((m) => m.workspaceId === id).length, storageBytes: storage, publishes: this.db.usageOf(id, "publishes"), aiCredits: this.db.usageOf(id, "aiCredits") },
    };
  }

  /** Development/test shortcut that changes the plan without payment. Refused in production and whenever Paystack is configured. */
  @HttpCode(200) @Post("workspaces/:id/plan")
  setPlan(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { workspace, user } = this.access.workspace(req, id, "workspace:billing");
    if (this.paystack || process.env.NODE_ENV === "production") throw new ForbiddenException({ code: "billing_managed", message: "Plans are changed through checkout and cancellation" });
    const b = parseBody(z.object({ plan: z.string() }), body);
    if (!PLANS[b.plan]) throw new BadRequestException({ code: "unknown_plan", message: "Unknown plan" });
    this.db.workspaces.update(workspace.id, { plan: b.plan });
    this.db.logAudit(id, "plan.change", user.id, b.plan);
    return { plan: b.plan };
  }

  @Get("workspaces/:id/audit")
  audit(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.workspace(req, id, "workspace:settings");
    return { entries: this.db.audit.filter((a) => a.workspaceId === id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 200) };
  }
}
