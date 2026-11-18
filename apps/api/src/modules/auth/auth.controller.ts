import { ConflictException, Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post, Req, Res, UnauthorizedException, BadRequestException } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { Db, newId, type UserRec } from "../../common/db";
import { newTotpSecret, otpauthUrl, verifyTotp } from "../../common/crypto";
import { Access, hashToken, parseBody, Public, RateLimit, SESSION_COOKIE, type AuthedRequest } from "../../common/http";
import { MAILER, safeSend, type Mailer } from "../../common/mailer";
import * as emails from "../../common/emails";
import { hashPassword, newSessionToken, verifyPassword } from "./auth.service";
import { OAUTH_PROVIDERS, type OAuthProvider } from "./oauth";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";

const SESSION_MS = 30 * 24 * 3600 * 1000;
const password = z.string().min(10, "Use at least 10 characters").max(200);
const email = z.string().email().max(200).transform((e) => e.toLowerCase());

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Access) private access: Access,
    @Inject(MAILER) private mailer: Mailer,
    @Inject(OAUTH_PROVIDERS) private providers: Record<string, OAuthProvider>,
  ) {}

  private publicUser(u: UserRec) { return { id: u.id, email: u.email, name: u.name, emailVerified: u.emailVerified, mfaEnabled: u.mfaEnabled }; }

  private startSession(res: Response, user: UserRec, userAgent?: string) {
    const { token, tokenHash } = newSessionToken();
    this.db.sessions.insert({ userId: user.id, tokenHash, expiresAt: Date.now() + SESSION_MS, userAgent, createdAt: Date.now() });
    this.db.users.update(user.id, { lastLoginAt: Date.now() });
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: SESSION_MS, path: "/" });
  }

  private static readonly RECOVERY_COUNT = 8;
  private newRecoveryCodes(user: UserRec) {
    const codes = Array.from({ length: AuthController.RECOVERY_COUNT }, () => { const h = randomBytes(5).toString("hex"); return `${h.slice(0, 5)}-${h.slice(5)}`; });
    this.db.users.update(user.id, { recoveryHashes: codes.map(hashToken) });
    return codes;
  }
  /** One-time recovery code; consumed on success. */
  private useRecoveryCode(user: UserRec, raw: string) {
    const h = hashToken(raw.trim().toLowerCase());
    if (!user.recoveryHashes?.includes(h)) return false;
    this.db.users.update(user.id, { recoveryHashes: user.recoveryHashes.filter((x) => x !== h) });
    return true;
  }

  private issueToken(kind: "verify" | "reset" | "email-change", userId: string, ttlMs: number, newEmail?: string) {
    const raw = randomBytes(24).toString("base64url");
    this.db.tokens.insert({ kind, tokenHash: hashToken(raw), userId, ...(newEmail ? { email: newEmail } : {}), expiresAt: Date.now() + ttlMs });
    return raw;
  }

  private consumeToken(kind: "verify" | "reset" | "email-change", raw: string) {
    const h = hashToken(raw);
    const t = this.db.tokens.find((x) => x.kind === kind && x.tokenHash === h && !x.usedAt && x.expiresAt > Date.now());
    if (!t) throw new BadRequestException({ code: "invalid_token", message: "This link is invalid or has expired" });
    this.db.tokens.update(t.id, { usedAt: Date.now() });
    return t;
  }

  private createUserWithWorkspace(e: string, name: string, passwordHash: string | null, emailVerified: boolean) {
    const user = this.db.users.insert({ email: e, passwordHash, name, emailVerified, emailVerifiedAt: emailVerified ? Date.now() : undefined, mfaEnabled: false, createdAt: Date.now() });
    const ws = this.db.workspaces.insert({ name: `${name}'s workspace`, slug: `${slugify(name)}-${randomBytes(3).toString("hex")}`, plan: "free", createdAt: Date.now() });
    this.db.memberships.insert({ userId: user.id, workspaceId: ws.id, role: "OWNER" });
    this.db.logAudit(ws.id, "workspace.create", user.id, ws.id);
    return user;
  }

  @Public() @RateLimit(10, 60_000) @Post("register")
  async register(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const b = parseBody(z.object({ email, password, name: z.string().trim().min(1).max(80) }), body);
    if (this.db.users.find((u) => u.email === b.email)) {
      // Same response shape as success would reveal existence; keep it explicit but non-specific.
      throw new BadRequestException({ code: "registration_failed", message: "Could not create an account with those details" });
    }
    const user = this.createUserWithWorkspace(b.email, b.name, await hashPassword(b.password), false);
    const raw = this.issueToken("verify", user.id, 48 * 3600 * 1000);
    void safeSend(this.mailer, emails.verifyEmail(user.email, raw));
    this.startSession(res, user, req.headers["user-agent"]);
    return { user: this.publicUser(user) };
  }

  @Public() @RateLimit(10, 60_000) @HttpCode(200) @Post("login")
  async login(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const b = parseBody(z.object({ email, password: z.string().max(200), mfaCode: z.string().optional() }), body);
    const user = this.db.users.find((u) => u.email === b.email);
    // Always run a hash comparison to keep timing similar for unknown emails.
    const ok = user?.passwordHash ? await verifyPassword(b.password, user.passwordHash) : (await verifyPassword(b.password, "scrypt$00$00"), false);
    if (!user || !ok) throw new UnauthorizedException({ code: "invalid_credentials", message: "Incorrect email or password" });
    if (user.mfaEnabled) {
      if (!b.mfaCode) throw new UnauthorizedException({ code: "mfa_required", message: "Enter your authentication code" });
      const totpOk = !!user.mfaSecret && verifyTotp(user.mfaSecret, b.mfaCode);
      if (!totpOk && !this.useRecoveryCode(user, b.mfaCode)) throw new UnauthorizedException({ code: "invalid_mfa", message: "Incorrect authentication code" });
    }
    this.startSession(res, user, req.headers["user-agent"]);
    return { user: this.publicUser(user) };
  }

  @HttpCode(204) @Post("logout")
  logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    if (req.sessionId) this.db.sessions.delete(req.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  @Get("me")
  me(@Req() req: AuthedRequest) {
    const user = this.access.user(req);
    const workspaces = this.db.memberships.filter((m) => m.userId === user.id).map((m) => ({ ...this.db.workspaces.get(m.workspaceId)!, role: m.role }));
    return { user: this.publicUser(user), workspaces };
  }

  @Patch("me")
  updateMe(@Req() req: AuthedRequest, @Body() body: unknown) {
    const user = this.access.user(req);
    const b = parseBody(z.object({ name: z.string().trim().min(1).max(80) }), body);
    this.db.users.update(user.id, { name: b.name });
    return { user: this.publicUser(this.db.users.get(user.id)!) };
  }

  @Public() @RateLimit(10, 60_000) @HttpCode(200) @Post("verify-email")
  verifyEmail(@Body() body: unknown) {
    const { token } = parseBody(z.object({ token: z.string().min(10) }), body);
    const t = this.consumeToken("verify", token);
    this.db.users.update(t.userId!, { emailVerified: true, emailVerifiedAt: Date.now() });
    return { ok: true };
  }

  /** Step 1: ask to change the sign-in email. The new address must be confirmed before anything changes. */
  @RateLimit(5, 60_000) @HttpCode(202) @Post("email/change")
  async changeEmail(@Req() req: AuthedRequest, @Body() body: unknown) {
    const user = this.access.user(req);
    const b = parseBody(z.object({ email, password: z.string().max(200).optional() }), body);
    if (user.passwordHash && !(b.password && (await verifyPassword(b.password, user.passwordHash)))) throw new UnauthorizedException({ code: "invalid_credentials", message: "Password is incorrect" });
    if (b.email === user.email) throw new BadRequestException({ code: "same_email", message: "That is already your email address" });
    if (this.db.users.find((u) => u.email === b.email)) throw new ConflictException({ code: "email_taken", message: "That email address is already in use" });
    void safeSend(this.mailer, emails.confirmNewEmail(b.email, this.issueToken("email-change", user.id, 24 * 3600 * 1000, b.email)));
    return { ok: true };
  }

  /** Step 2: the link sent to the new address. Applies the change and tells the old address. */
  @Public() @RateLimit(10, 60_000) @HttpCode(200) @Post("email/confirm")
  confirmEmail(@Body() body: unknown) {
    const { token } = parseBody(z.object({ token: z.string().min(10) }), body);
    const t = this.consumeToken("email-change", token);
    const user = this.db.users.get(t.userId!);
    if (!user || !t.email) throw new BadRequestException({ code: "invalid_token", message: "This link is invalid or has expired" });
    if (this.db.users.find((u) => u.email === t.email && u.id !== user.id)) throw new ConflictException({ code: "email_taken", message: "That email address is already in use" });
    const old = user.email;
    this.db.users.update(user.id, { email: t.email, emailVerified: true, emailVerifiedAt: Date.now() });
    void safeSend(this.mailer, emails.emailChanged(old, t.email));
    return { ok: true, email: t.email };
  }

  @RateLimit(3, 60_000) @HttpCode(202) @Post("resend-verification")
  async resend(@Req() req: AuthedRequest) {
    const user = this.access.user(req);
    if (user.emailVerified) return { ok: true };
    void safeSend(this.mailer, emails.verifyEmail(user.email, this.issueToken("verify", user.id, 48 * 3600 * 1000)));
    return { ok: true };
  }

  @Public() @RateLimit(5, 60_000) @HttpCode(202) @Post("password/forgot")
  async forgot(@Body() body: unknown) {
    const b = parseBody(z.object({ email }), body);
    const user = this.db.users.find((u) => u.email === b.email);
    // Not awaited: response time must not reveal whether the account exists.
    if (user) void safeSend(this.mailer, emails.resetPassword(user.email, this.issueToken("reset", user.id, 3600 * 1000)));
    return { ok: true }; // identical response whether or not the account exists
  }

  @Public() @RateLimit(10, 60_000) @HttpCode(200) @Post("password/reset")
  async reset(@Body() body: unknown) {
    const b = parseBody(z.object({ token: z.string().min(10), password }), body);
    const t = this.consumeToken("reset", b.token);
    this.db.users.update(t.userId!, { passwordHash: await hashPassword(b.password) });
    this.db.sessions.deleteWhere((s) => s.userId === t.userId); // revoke every session
    return { ok: true };
  }

  @RateLimit(10, 60_000) @HttpCode(200) @Post("password/change")
  async change(@Req() req: AuthedRequest, @Body() body: unknown) {
    const user = this.access.user(req);
    const b = parseBody(z.object({ current: z.string(), password }), body);
    if (!user.passwordHash || !(await verifyPassword(b.current, user.passwordHash))) throw new UnauthorizedException({ code: "invalid_credentials", message: "Current password is incorrect" });
    this.db.users.update(user.id, { passwordHash: await hashPassword(b.password) });
    this.db.sessions.deleteWhere((s) => s.userId === user.id && s.id !== req.sessionId);
    return { ok: true };
  }

  // ----- MFA -----
  @Post("mfa/setup")
  async mfaSetup(@Req() req: AuthedRequest) {
    const user = this.access.user(req);
    if (user.mfaEnabled) throw new BadRequestException({ code: "mfa_enabled", message: "MFA is already enabled" });
    const secret = newTotpSecret();
    this.db.users.update(user.id, { mfaSecret: secret });
    const url = otpauthUrl(user.email, secret);
    const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return { secret, otpauthUrl: url, qrSvg };
  }

  @HttpCode(200) @Post("mfa/enable")
  mfaEnable(@Req() req: AuthedRequest, @Body() body: unknown) {
    const user = this.access.user(req);
    const { code } = parseBody(z.object({ code: z.string() }), body);
    if (!user.mfaSecret || !verifyTotp(user.mfaSecret, code)) throw new BadRequestException({ code: "invalid_mfa", message: "Incorrect authentication code" });
    this.db.users.update(user.id, { mfaEnabled: true });
    return { ok: true, recoveryCodes: this.newRecoveryCodes(user) }; // shown once
  }

  @HttpCode(200) @Post("mfa/disable")
  async mfaDisable(@Req() req: AuthedRequest, @Body() body: unknown) {
    const user = this.access.user(req);
    const b = parseBody(z.object({ password: z.string(), code: z.string() }), body);
    if (!user.passwordHash || !(await verifyPassword(b.password, user.passwordHash)) || !user.mfaSecret || !verifyTotp(user.mfaSecret, b.code))
      throw new UnauthorizedException({ code: "invalid_credentials", message: "Password or code is incorrect" });
    this.db.users.update(user.id, { mfaEnabled: false, mfaSecret: undefined, recoveryHashes: undefined });
    return { ok: true };
  }

  @HttpCode(200) @Post("mfa/recovery-codes")
  async mfaRegenerate(@Req() req: AuthedRequest, @Body() body: unknown) {
    const user = this.access.user(req);
    const b = parseBody(z.object({ password: z.string(), code: z.string() }), body);
    if (!user.mfaEnabled || !user.passwordHash || !(await verifyPassword(b.password, user.passwordHash)) || !user.mfaSecret || !verifyTotp(user.mfaSecret, b.code))
      throw new UnauthorizedException({ code: "invalid_credentials", message: "Password or code is incorrect" });
    return { recoveryCodes: this.newRecoveryCodes(user) };
  }

  @Get("mfa/recovery-codes")
  mfaRecoveryRemaining(@Req() req: AuthedRequest) {
    return { remaining: this.access.user(req).recoveryHashes?.length ?? 0 };
  }

  // ----- Account deletion -----
  @HttpCode(204) @Delete("me")
  async deleteMe(@Req() req: AuthedRequest, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const user = this.access.user(req);
    const b = parseBody(z.object({ password: z.string().optional(), confirmEmail: z.string().optional(), mfaCode: z.string().optional() }), body);
    if (user.passwordHash) {
      if (!b.password || !(await verifyPassword(b.password, user.passwordHash))) throw new UnauthorizedException({ code: "invalid_credentials", message: "Password is incorrect" });
    } else if ((b.confirmEmail ?? "").toLowerCase() !== user.email) {
      throw new UnauthorizedException({ code: "invalid_credentials", message: "Type your email address to confirm" });
    }
    if (user.mfaEnabled && (!b.mfaCode || !user.mfaSecret || !verifyTotp(user.mfaSecret, b.mfaCode)))
      throw new UnauthorizedException({ code: "invalid_mfa", message: "Incorrect authentication code" });
    const mine = this.db.memberships.filter((m) => m.userId === user.id);
    const blocked: string[] = [];
    for (const m of mine) {
      if (m.role !== "OWNER") continue;
      const others = this.db.memberships.filter((x) => x.workspaceId === m.workspaceId && x.userId !== user.id);
      if (others.length && !others.some((x) => x.role === "OWNER")) blocked.push(this.db.workspaces.get(m.workspaceId)?.name ?? m.workspaceId);
    }
    if (blocked.length) throw new BadRequestException({ code: "transfer_required", message: `Make another member an owner of: ${blocked.join(", ")} (or remove the members) before deleting your account` });
    for (const m of mine) {
      const rest = this.db.memberships.filter((x) => x.workspaceId === m.workspaceId && x.userId !== user.id);
      if (rest.length === 0) this.db.purgeWorkspace(m.workspaceId);
      else { this.db.memberships.delete(m.id); this.db.logAudit(m.workspaceId, "member.remove", user.id, user.id); }
    }
    this.db.sessions.deleteWhere((s) => s.userId === user.id);
    this.db.tokens.deleteWhere((t) => t.userId === user.id);
    this.db.users.delete(user.id);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  // ----- OAuth -----
  @Public() @RateLimit(20, 60_000) @HttpCode(200) @Post("oauth/:provider")
  async oauth(@Param("provider") name: string, @Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const provider = this.providers[name];
    if (!provider) throw new NotFoundException({ code: "unknown_provider", message: "Unknown sign-in provider" });
    const b = parseBody(z.object({ code: z.string().min(1), redirectUri: z.string().url().optional() }), body);
    let profile;
    try { profile = await provider.exchange(b.code, b.redirectUri); } catch { throw new UnauthorizedException({ code: "oauth_failed", message: "Sign-in failed" }); }
    if (!profile.emailVerified) throw new UnauthorizedException({ code: "oauth_unverified", message: "The provider has not verified this email address" });
    const link = this.db.tokens.find((t) => t.kind === "verify" && t.email === `${name}:${profile.id}`);
    void link; // account linking is by verified email; provider ids are not stored in the in-memory model
    const e = profile.email.toLowerCase();
    let user = this.db.users.find((u) => u.email === e);
    if (!user) user = this.createUserWithWorkspace(e, profile.name, null, true);
    else if (!user.emailVerified) this.db.users.update(user.id, { emailVerified: true, emailVerifiedAt: Date.now() });
    if (user.mfaEnabled) throw new UnauthorizedException({ code: "mfa_required", message: "Sign in with your password and authentication code" });
    this.startSession(res, user, req.headers["user-agent"]);
    return { user: this.publicUser(user) };
  }

  // ----- Sessions -----
  @Get("sessions")
  sessions(@Req() req: AuthedRequest) {
    const user = this.access.user(req);
    return { sessions: this.db.sessions.filter((s) => s.userId === user.id).map((s) => ({ id: s.id, userAgent: s.userAgent, expiresAt: s.expiresAt, current: s.id === req.sessionId })) };
  }

  @HttpCode(204) @Delete("sessions/:id")
  revoke(@Req() req: AuthedRequest, @Param("id") id: string) {
    const user = this.access.user(req);
    const s = this.db.sessions.get(id);
    if (!s || s.userId !== user.id) throw new NotFoundException({ code: "not_found", message: "Session not found" });
    this.db.sessions.delete(id);
  }
}
void newId;
