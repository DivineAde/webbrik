import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createDocument, createId, type Document } from "@webbrik/document-model";
import { sendWebhook } from "../../common/webhooks";
import { AnalyticsConfigSchema, WebhookEndpointSchema, isPublicHttpsUrl } from "@webbrik/integrations";
import { PLANS, can, checkQuota } from "@webbrik/shared";
import { Db, type ProjectRec } from "../../common/db";
import { Access, parseBody, type AuthedRequest } from "../../common/http";
import { slugify } from "../auth/auth.controller";

const brief = (p: ProjectRec) => ({ id: p.id, workspaceId: p.workspaceId, name: p.name, slug: p.slug, description: p.description, thumbnail: p.thumbnail, archivedAt: p.archivedAt, createdAt: p.createdAt, updatedAt: p.updatedAt, headRevision: p.headRevision });

@Controller()
export class ProjectsController {
  constructor(@Inject(Db) private db: Db, @Inject(Access) private access: Access) {}

  private uniqueSlug(workspaceId: string, name: string) {
    const base = slugify(name);
    let slug = base, i = 2;
    while (this.db.projects.find((p) => p.workspaceId === workspaceId && p.slug === slug && !p.deletedAt)) slug = `${base}-${i++}`;
    return slug;
  }

  private checkProjectQuota(workspaceId: string, plan: string) {
    const used = this.db.projects.filter((p) => p.workspaceId === workspaceId && !p.deletedAt).length;
    if (!checkQuota(plan, "maxProjects", used)) throw new ForbiddenException({ code: "quota_exceeded", message: `Your plan allows ${PLANS[plan]?.maxProjects ?? 0} projects` });
  }

  private createProject(workspaceId: string, name: string, description: string, doc: Document, userId: string) {
    const now = Date.now();
    const p = this.db.projects.insert({ workspaceId, name, slug: this.uniqueSlug(workspaceId, name), description, createdAt: now, updatedAt: now, headRevision: 1, analytics: [], webhooks: [], forms: {} });
    this.db.revisions.insert({ projectId: p.id, revision: 1, document: doc, authorId: userId, createdAt: now });
    this.db.logAudit(workspaceId, "project.create", userId, p.id, p.id);
    return p;
  }

  @Post("workspaces/:wid/projects")
  create(@Req() req: AuthedRequest, @Param("wid") wid: string, @Body() body: unknown) {
    const { workspace, user } = this.access.workspace(req, wid, "project:edit");
    const b = parseBody(z.object({ name: z.string().trim().min(1).max(100), description: z.string().max(500).default("") }), body);
    this.checkProjectQuota(wid, workspace.plan);
    return { project: brief(this.createProject(wid, b.name, b.description, createDocument(b.name), user.id)) };
  }

  @Get("workspaces/:wid/projects")
  list(@Req() req: AuthedRequest, @Param("wid") wid: string, @Query() q: Record<string, string>) {
    this.access.workspace(req, wid);
    const sort = (["name", "updated", "created"] as const).includes(q["sort"] as "name") ? q["sort"]! : "updated";
    const dir = q["order"] === "asc" ? 1 : -1;
    const term = (q["q"] ?? "").toLowerCase();
    const wantArchived = q["archived"] === "true";
    const rows = this.db.projects.filter((p) => p.workspaceId === wid && !p.deletedAt && !!p.archivedAt === wantArchived && (!term || p.name.toLowerCase().includes(term) || p.description.toLowerCase().includes(term)));
    rows.sort((a, b) => dir * (sort === "name" ? a.name.localeCompare(b.name) : sort === "created" ? a.createdAt - b.createdAt : a.updatedAt - b.updatedAt));
    return { projects: rows.map(brief) };
  }

  @Get("projects/recent")
  recent(@Req() req: AuthedRequest) {
    const user = this.access.user(req);
    const ws = new Set(this.db.memberships.filter((m) => m.userId === user.id).map((m) => m.workspaceId));
    return { projects: this.db.projects.filter((p) => ws.has(p.workspaceId) && !p.deletedAt && !p.archivedAt).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10).map(brief) };
  }

  @Get("projects/:id")
  get(@Req() req: AuthedRequest, @Param("id") id: string) {
    const { project, membership } = this.access.project(req, id);
    return { project: brief(project), role: membership.role };
  }

  @Patch("projects/:id")
  update(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { project, user } = this.access.project(req, id, "project:edit");
    const b = parseBody(z.object({ name: z.string().trim().min(1).max(100).optional(), description: z.string().max(500).optional(), thumbnail: z.string().max(500).nullable().optional() }), body);
    this.db.projects.update(project.id, { ...(b.name !== undefined ? { name: b.name } : {}), ...(b.description !== undefined ? { description: b.description } : {}), ...(b.thumbnail !== undefined ? { thumbnail: b.thumbnail ?? undefined } : {}), updatedAt: Date.now() });
    this.db.logAudit(project.workspaceId, "project.update", user.id, project.id, project.id);
    return { project: brief(this.db.projects.get(project.id)!) };
  }

  @Post("projects/:id/duplicate")
  duplicate(@Req() req: AuthedRequest, @Param("id") id: string) {
    const { project, workspace, user } = this.access.project(req, id, "project:edit");
    this.checkProjectQuota(workspace.id, workspace.plan);
    const head = this.db.revisions.find((r) => r.projectId === id && r.revision === project.headRevision)!;
    const doc = { ...(structuredClone(head.document) as Document), id: createId("doc") };
    const copy = this.createProject(workspace.id, `${project.name} copy`, project.description, { ...doc, name: `${project.name} copy` }, user.id);
    return { project: brief(copy) };
  }

  @HttpCode(200) @Post("projects/:id/archive")
  archive(@Req() req: AuthedRequest, @Param("id") id: string) {
    const { project, user } = this.access.project(req, id, "project:settings");
    this.db.projects.update(id, { archivedAt: Date.now() });
    this.db.logAudit(project.workspaceId, "project.archive", user.id, id, id);
    return { ok: true };
  }

  @HttpCode(200) @Post("projects/:id/restore")
  restore(@Req() req: AuthedRequest, @Param("id") id: string) {
    const { project, user } = this.access.project(req, id, "project:settings");
    this.db.projects.update(id, { archivedAt: undefined });
    this.db.logAudit(project.workspaceId, "project.restore", user.id, id, id);
    return { ok: true };
  }

  @HttpCode(204) @Delete("projects/:id")
  remove(@Req() req: AuthedRequest, @Param("id") id: string) {
    const { project, user } = this.access.project(req, id, "project:delete");
    this.db.projects.update(id, { deletedAt: Date.now() });
    this.db.logAudit(project.workspaceId, "project.delete", user.id, id, id);
  }

  @HttpCode(200) @Post("projects/:id/undelete")
  undelete(@Req() req: AuthedRequest, @Param("id") id: string) {
    const { project, user } = this.access.project(req, id, "project:delete", { allowDeleted: true });
    if (!project.deletedAt) throw new BadRequestException({ code: "not_deleted", message: "Project is not deleted" });
    this.db.projects.update(id, { deletedAt: undefined });
    this.db.logAudit(project.workspaceId, "project.undelete", user.id, id, id);
    return { ok: true };
  }

  @HttpCode(200) @Post("projects/:id/transfer")
  transfer(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { project, user } = this.access.project(req, id, "project:delete");
    const b = parseBody(z.object({ workspaceId: z.string() }), body);
    const target = this.access.workspace(req, b.workspaceId, "project:edit");
    if (!can(target.membership.role, "workspace:manage-members")) throw new ForbiddenException({ code: "forbidden", message: "You need admin rights in the destination workspace" });
    if (b.workspaceId === project.workspaceId) throw new BadRequestException({ code: "same_workspace", message: "Project is already in that workspace" });
    this.checkProjectQuota(b.workspaceId, target.workspace.plan);
    const from = project.workspaceId;
    this.db.projects.update(id, { workspaceId: b.workspaceId, slug: this.uniqueSlug(b.workspaceId, project.name) });
    this.db.logAudit(from, "project.transfer-out", user.id, id, id);
    this.db.logAudit(b.workspaceId, "project.transfer-in", user.id, id, id);
    return { ok: true };
  }

  @Get("projects/:id/activity")
  activity(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.project(req, id);
    return { entries: this.db.audit.filter((a) => a.projectId === id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100) };
  }

  // ----- Integrations settings -----
  @Put("projects/:id/integrations/analytics")
  setAnalytics(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { project, user } = this.access.project(req, id, "project:settings");
    const b = parseBody(z.object({ configs: z.array(AnalyticsConfigSchema).max(5) }), body);
    this.db.projects.update(project.id, { analytics: b.configs });
    this.db.logAudit(project.workspaceId, "integration.analytics", user.id, id, id);
    return { configs: b.configs };
  }

  @Get("projects/:id/integrations")
  integrations(@Req() req: AuthedRequest, @Param("id") id: string) {
    const { project } = this.access.project(req, id, "project:settings");
    return { analytics: project.analytics, webhooks: project.webhooks.map((w) => ({ id: w.id, url: w.url, events: w.events })) };
  }

  @Post("projects/:id/webhooks")
  addWebhook(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { project, user } = this.access.project(req, id, "project:settings");
    const b = parseBody(WebhookEndpointSchema, body);
    if (!isPublicHttpsUrl(b.url)) throw new BadRequestException({ code: "invalid_url", message: "Webhook URL must be a public https URL" });
    const secret = `whsec_${randomBytes(24).toString("base64url")}`;
    const hook = { id: `wh_${randomBytes(6).toString("hex")}`, url: b.url, secret, events: b.events };
    this.db.projects.update(project.id, { webhooks: [...project.webhooks, hook] });
    this.db.logAudit(project.workspaceId, "webhook.create", user.id, hook.id, id);
    return { webhook: { id: hook.id, url: hook.url, events: hook.events }, secret }; // secret is shown once
  }

  @Get("projects/:id/webhooks/deliveries")
  deliveries(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.project(req, id);
    return { deliveries: this.db.webhookDeliveries.filter((d) => d.projectId === id).sort((a, b) => b.createdAt - a.createdAt) };
  }

  @HttpCode(200) @Post("projects/:id/webhooks/:hid/test")
  async testWebhook(@Req() req: AuthedRequest, @Param("id") id: string, @Param("hid") hid: string) {
    const { project } = this.access.project(req, id, "project:settings");
    const hook = project.webhooks.find((w) => w.id === hid);
    if (!hook) throw new NotFoundException({ code: "not_found", message: "Webhook not found" });
    return { delivery: await sendWebhook(this.db, project.id, hook, "webhook.test", { projectId: project.id, test: true }) };
  }

  @HttpCode(204) @Delete("projects/:id/webhooks/:hid")
  removeWebhook(@Req() req: AuthedRequest, @Param("id") id: string, @Param("hid") hid: string) {
    const { project } = this.access.project(req, id, "project:settings");
    if (!project.webhooks.some((w) => w.id === hid)) throw new NotFoundException({ code: "not_found", message: "Webhook not found" });
    this.db.projects.update(project.id, { webhooks: project.webhooks.filter((w) => w.id !== hid) });
  }
}
