import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, HttpException, Inject, Injectable, Optional, NotFoundException, SetMetadata, UnauthorizedException, type ArgumentsHost, type ExceptionFilter, Catch, HttpStatus } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import type { ZodTypeAny, z } from "zod";
import { can, type Permission, type Role } from "@webbrik/shared";
import { createHash } from "node:crypto";
import { PERSISTENCE, type Persistence } from "./persistence";
import { Db, type MembershipRec, type ProjectRec, type UserRec, type WorkspaceRec } from "./db";

export const Public = () => SetMetadata("isPublic", true);
export const RateLimit = (limit: number, windowMs: number) => SetMetadata("rateLimit", { limit, windowMs });
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const SESSION_COOKIE = "sid";

export interface AuthedRequest extends Request { user?: UserRec; sessionId?: string; viaCookie?: boolean }

export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ code: "validation", message: "Invalid request", details: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  return r.data;
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) { const [k, ...v] = part.trim().split("="); if (k === name) return decodeURIComponent(v.join("=")); }
  return undefined;
}

/** Resolves the session (cookie or Bearer). Cookie-authenticated mutations require `x-requested-with: webbrik` (CSRF defence; cross-origin pages can't set it without CORS approval). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private reflector: Reflector, @Inject(Db) private db: Db, @Optional() @Inject(PERSISTENCE) private persistence: Persistence | null) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const isPublic = this.reflector.get<boolean>("isPublic", ctx.getHandler());
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    const cookie = readCookie(req, SESSION_COOKIE);
    const token = bearer ?? cookie;
    if (token) {
      const hash = hashToken(token);
      // With several API instances, rows written elsewhere arrive via the change feed; keep this instance at most ~250 ms behind.
      if (this.persistence?.syncable) await this.persistence.syncFresh(this.persistence.writeThrough ? 0 : 250).catch(() => undefined);
      const find = () => this.db.sessions.find((x) => x.tokenHash === hash && x.expiresAt > Date.now());
      let s = find();
      // Signed in on another API instance a moment ago? Pull its latest writes once before giving up.
      if (!s && this.persistence?.syncable) { await this.persistence.syncFresh(100).catch(() => undefined); s = find(); }
      const user = s && this.db.users.get(s.userId);
      if (s && user) { req.user = user; req.sessionId = s.id; req.viaCookie = !bearer; }
    }
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException({ code: "unauthenticated", message: "Sign in required" });
    if (req.viaCookie && !["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers["x-requested-with"] !== "webbrik")
      throw new ForbiddenException({ code: "csrf", message: "Missing x-requested-with header" });
    return true;
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private hits = new Map<string, number[]>();
  constructor(@Inject(Reflector) private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const cfg = this.reflector.get<{ limit: number; windowMs: number } | undefined>("rateLimit", ctx.getHandler());
    if (!cfg || (process.env.DISABLE_RATE_LIMIT === "1" && process.env.NODE_ENV !== "production")) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const k = `${req.ip}:${req.method}:${req.route?.path ?? req.path}`;
    const now = Date.now();
    const recent = (this.hits.get(k) ?? []).filter((t) => now - t < cfg.windowMs);
    if (recent.length >= cfg.limit) throw new HttpException({ code: "rate_limited", message: "Too many requests" }, HttpStatus.TOO_MANY_REQUESTS);
    recent.push(now);
    this.hits.set(k, recent);
    return true;
  }
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (err instanceof HttpException) {
      const body = err.getResponse();
      const o = typeof body === "string" ? { message: body } : (body as Record<string, unknown>);
      res.status(err.getStatus()).json({ error: { code: o["code"] ?? HttpStatus[err.getStatus()]?.toLowerCase() ?? "error", message: o["message"] ?? err.message, ...(o["details"] ? { details: o["details"] } : {}), ...(o["headRevision"] !== undefined ? { headRevision: o["headRevision"] } : {}) } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: "internal", message: "Internal server error" } });
  }
}

export interface ProjectAccess { project: ProjectRec; workspace: WorkspaceRec; membership: MembershipRec; user: UserRec }

/** Single choke point for tenant isolation. Non-members get 404 (existence is not revealed). */
@Injectable()
export class Access {
  constructor(@Inject(Db) private db: Db) {}
  user(req: AuthedRequest): UserRec { if (!req.user) throw new UnauthorizedException({ code: "unauthenticated", message: "Sign in required" }); return req.user; }
  workspace(req: AuthedRequest, workspaceId: string, perm?: Permission) {
    const user = this.user(req);
    const membership = this.db.memberships.find((m) => m.workspaceId === workspaceId && m.userId === user.id);
    const workspace = this.db.workspaces.get(workspaceId);
    if (!membership || !workspace) throw new NotFoundException({ code: "not_found", message: "Workspace not found" });
    this.lapse(workspace);
    if (perm && !can(membership.role, perm)) throw new ForbiddenException({ code: "forbidden", message: `Missing permission: ${perm}` });
    return { workspace, membership, user };
  }
  /** Paid access ends when the paid period does (3 days of grace for late renewals); data is kept, limits return to the free plan. */
  lapse(workspace: { id: string; plan: string; billing?: import("./db").BillingState }) {
    const b = workspace.billing;
    if (workspace.plan === "free" || !b || b.status === "expired" || Date.now() <= b.currentPeriodEnd + 3 * 24 * 3600 * 1000) return;
    this.db.workspaces.update(workspace.id, { plan: "free", billing: { ...b, status: "expired" } });
    this.db.logAudit(workspace.id, "plan.change", "system", "free");
  }
  project(req: AuthedRequest, projectId: string, perm: Permission = "project:view", opts: { allowDeleted?: boolean } = {}): ProjectAccess {
    const project = this.db.projects.get(projectId);
    if (!project || (project.deletedAt && !opts.allowDeleted)) throw new NotFoundException({ code: "not_found", message: "Project not found" });
    return { project, ...this.workspace(req, project.workspaceId, perm) };
  }
  role(role: Role) { return role; }
}
