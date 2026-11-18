import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, Post, Put, Query, Req } from "@nestjs/common";
import { z } from "zod";
import { visibleItems } from "@webbrik/content-engine";
import type { ContentData } from "@webbrik/renderer";
import type { DeploymentProvider } from "@webbrik/deployment";
import { analyticsHeadAll } from "@webbrik/integrations";
import { sendWebhook } from "../../common/webhooks";
import { publishedContent } from "../../common/content";
import { publicApiUrl } from "../../common/public-url";
import { analyze, summarize } from "@webbrik/quality";
import { PLANS, checkQuota } from "@webbrik/shared";
import { Db } from "../../common/db";
import { decryptSecret, encryptSecret } from "../../common/crypto";
import { Access, parseBody, type AuthedRequest } from "../../common/http";
import { DEPLOY_PROVIDER, DeploymentsService } from "./deployments.service";

const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

@Controller()
export class DeploymentsController {
  private svc: DeploymentsService;
  constructor(@Inject(Db) private db: Db, @Inject(Access) private access: Access, @Inject(DEPLOY_PROVIDER) private provider: DeploymentProvider) {
    this.svc = new DeploymentsService(provider);
  }

  @Post("projects/:id/deployments")
  async publish(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown, @Query("strict") strict?: string) {
    const { project, workspace, user } = this.access.project(req, id, "project:publish");
    const b = parseBody(z.object({ target: z.enum(["production", "preview"]).default("preview") }), body ?? {});
    if (!checkQuota(workspace.plan, "publishesPerMonth", this.db.usageOf(workspace.id, "publishes")))
      throw new ForbiddenException({ code: "quota_exceeded", message: `Your plan allows ${PLANS[workspace.plan]?.publishesPerMonth ?? 0} publishes per month` });
    const doc = this.db.revisions.find((r) => r.projectId === id && r.revision === project.headRevision)!.document;
    const findings = analyze(doc);
    const quality = summarize(findings);
    if (strict === "1" && quality.errors > 0) throw new BadRequestException({ code: "quality_gate", message: `Publishing blocked: ${quality.errors} quality error(s)`, details: findings.filter((f) => f.severity === "error") });
    let result;
    try { result = await this.svc.publish(id, project.slug, doc, b.target, analyticsHeadAll(project.analytics), publishedContent(this.db, id), { endpoint: publicApiUrl(req), projectId: id }); }
    catch (e) { throw new BadRequestException({ code: "build_failed", message: e instanceof Error ? e.message : "Build failed" }); }
    const d = result.deployment;
    const rec = this.db.deployments.insert({ projectId: id, provider: d.providerName, providerId: d.providerId, target: b.target, status: d.status, revision: project.headRevision, url: d.url, logs: await this.provider.getLogs(d.providerId).catch(() => []), createdAt: Date.now() });
    this.db.addUsage(workspace.id, "publishes");
    this.db.logAudit(workspace.id, `deploy.${b.target}`, user.id, rec.id, id);
    this.notify(project.id, d.status === "error" ? "deployment.failed" : "deployment.ready", { deploymentId: rec.id, url: d.url, target: b.target });
    return { deployment: rec, warnings: result.warnings, quality };
  }

  /** Fire-and-forget signed webhook delivery; failures never fail the publish. */
  private notify(projectId: string, event: string, payload: unknown) {
    const p = this.db.projects.get(projectId);
    for (const h of p?.webhooks ?? []) if (h.events.includes(event)) void sendWebhook(this.db, projectId, h, event, payload);
  }

  @Get("projects/:id/deployments")
  list(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.project(req, id);
    return { deployments: this.db.deployments.filter((d) => d.projectId === id).sort((a, b) => b.createdAt - a.createdAt) };
  }

  private dep(id: string, did: string) {
    const d = this.db.deployments.get(did);
    if (!d || d.projectId !== id) throw new NotFoundException({ code: "not_found", message: "Deployment not found" });
    return d;
  }

  @Get("projects/:id/deployments/:did")
  async get(@Req() req: AuthedRequest, @Param("id") id: string, @Param("did") did: string) {
    this.access.project(req, id);
    const d = this.dep(id, did);
    const live = await this.provider.getDeployment(d.providerId).catch(() => null);
    if (live && live.status !== d.status) this.db.deployments.update(d.id, { status: live.status, url: live.url ?? d.url });
    return { deployment: this.db.deployments.get(did) };
  }

  @Get("projects/:id/deployments/:did/logs")
  async logs(@Req() req: AuthedRequest, @Param("id") id: string, @Param("did") did: string) {
    this.access.project(req, id);
    const d = this.dep(id, did);
    const fresh = await this.provider.getLogs(d.providerId).catch(() => d.logs);
    this.db.deployments.update(d.id, { logs: fresh });
    return { logs: fresh };
  }

  @HttpCode(200) @Post("projects/:id/deployments/:did/rollback")
  async rollback(@Req() req: AuthedRequest, @Param("id") id: string, @Param("did") did: string) {
    const { project, workspace, user } = this.access.project(req, id, "project:publish");
    const d = this.dep(id, did);
    if (d.status !== "ready") throw new BadRequestException({ code: "not_ready", message: "Only ready deployments can be promoted" });
    const promoted = await this.provider.rollback(project.slug, d.providerId);
    this.db.deployments.update(d.id, { target: "production", url: promoted.url ?? d.url });
    this.db.logAudit(workspace.id, "deploy.rollback", user.id, did, id);
    return { deployment: this.db.deployments.get(did) };
  }

  @Get("projects/:id/health")
  async health(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.project(req, id);
    const latest = this.db.deployments.filter((d) => d.projectId === id && d.target === "production" && !!d.url).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!latest?.url) return { healthy: null, message: "No production deployment" };
    return { healthy: await this.provider.healthCheck(latest.url), url: latest.url };
  }

  // ----- Domains -----
  @Post("projects/:id/domains")
  async addDomain(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { project, workspace, user } = this.access.project(req, id, "project:settings");
    if (!(PLANS[workspace.plan] ?? PLANS["free"]!).customDomains) throw new ForbiddenException({ code: "upgrade_required", message: "Custom domains are not included in your plan" });
    const b = parseBody(z.object({ hostname: z.string().trim().toLowerCase() }), body);
    if (!HOST.test(b.hostname)) throw new BadRequestException({ code: "invalid_domain", message: "Enter a valid domain name" });
    if (this.db.domains.find((d) => d.hostname === b.hostname)) throw new BadRequestException({ code: "domain_taken", message: "That domain is already connected" });
    const status = await this.provider.addDomain(project.slug, b.hostname);
    const rec = this.db.domains.insert({ projectId: id, hostname: b.hostname, verified: status.verified, primary: !this.db.domains.find((d) => d.projectId === id && d.primary) });
    this.db.logAudit(workspace.id, "domain.add", user.id, b.hostname, id);
    return { domain: rec, dnsInstructions: status.dnsInstructions };
  }

  @Get("projects/:id/domains")
  domains(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.project(req, id);
    return { domains: this.db.domains.filter((d) => d.projectId === id) };
  }

  private domain(id: string, did: string) {
    const d = this.db.domains.get(did);
    if (!d || d.projectId !== id) throw new NotFoundException({ code: "not_found", message: "Domain not found" });
    return d;
  }

  @HttpCode(200) @Post("projects/:id/domains/:did/verify")
  async verifyDomain(@Req() req: AuthedRequest, @Param("id") id: string, @Param("did") did: string) {
    const { project } = this.access.project(req, id, "project:settings");
    const d = this.domain(id, did);
    const s = await this.provider.verifyDomain(project.slug, d.hostname);
    this.db.domains.update(d.id, { verified: s.verified });
    return { verified: s.verified, dnsInstructions: s.dnsInstructions };
  }

  @HttpCode(200) @Post("projects/:id/domains/:did/primary")
  primary(@Req() req: AuthedRequest, @Param("id") id: string, @Param("did") did: string) {
    this.access.project(req, id, "project:settings");
    const d = this.domain(id, did);
    if (!d.verified) throw new BadRequestException({ code: "unverified", message: "Verify the domain before making it primary" });
    for (const x of this.db.domains.filter((x) => x.projectId === id)) this.db.domains.update(x.id, { primary: x.id === d.id, redirectTo: x.id === d.id ? undefined : x.redirectTo });
    return { ok: true };
  }

  /** Non-primary domains redirect to the primary one by default; an explicit target can be set. */
  @Put("projects/:id/domains/:did/redirect")
  redirect(@Req() req: AuthedRequest, @Param("id") id: string, @Param("did") did: string, @Body() body: unknown) {
    this.access.project(req, id, "project:settings");
    const d = this.domain(id, did);
    const b = parseBody(z.object({ redirectTo: z.string().toLowerCase().nullable() }), body);
    if (b.redirectTo !== null && !this.db.domains.find((x) => x.projectId === id && x.hostname === b.redirectTo)) throw new BadRequestException({ code: "invalid_redirect", message: "Redirect target must be another domain of this project" });
    if (b.redirectTo === d.hostname) throw new BadRequestException({ code: "invalid_redirect", message: "A domain cannot redirect to itself" });
    this.db.domains.update(d.id, { redirectTo: b.redirectTo ?? undefined });
    return { domain: this.db.domains.get(d.id) };
  }

  @HttpCode(204) @Delete("projects/:id/domains/:did")
  async removeDomain(@Req() req: AuthedRequest, @Param("id") id: string, @Param("did") did: string) {
    const { project, workspace, user } = this.access.project(req, id, "project:settings");
    const d = this.domain(id, did);
    await this.provider.removeDomain(project.slug, d.hostname);
    this.db.domains.delete(d.id);
    const next = this.db.domains.find((x) => x.projectId === id);
    if (d.primary && next) this.db.domains.update(next.id, { primary: true });
    this.db.logAudit(workspace.id, "domain.remove", user.id, d.hostname, id);
  }

  // ----- Environment variables (encrypted at rest; values never returned) -----
  @Get("projects/:id/env")
  env(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.project(req, id, "project:settings");
    return { variables: this.db.env.filter((e) => e.projectId === id).map((e) => ({ key: e.key })) };
  }

  @Put("projects/:id/env")
  async setEnv(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { project, workspace, user } = this.access.project(req, id, "project:settings");
    const b = parseBody(z.object({ key: z.string().regex(/^[A-Z_][A-Z0-9_]{0,63}$/, "Use UPPER_SNAKE_CASE"), value: z.string().max(5000) }), body);
    const existing = this.db.env.find((e) => e.projectId === id && e.key === b.key);
    const cipher = encryptSecret(b.value);
    if (existing) this.db.env.update(existing.id, { valueCipher: cipher });
    else this.db.env.insert({ projectId: id, key: b.key, valueCipher: cipher });
    await this.provider.setEnv(project.slug, { [b.key]: decryptSecret(cipher) });
    this.db.logAudit(workspace.id, "env.set", user.id, b.key, id);
    return { ok: true };
  }

  @HttpCode(204) @Delete("projects/:id/env/:key")
  delEnv(@Req() req: AuthedRequest, @Param("id") id: string, @Param("key") key: string) {
    this.access.project(req, id, "project:settings");
    this.db.env.deleteWhere((e) => e.projectId === id && e.key === key);
  }
}
