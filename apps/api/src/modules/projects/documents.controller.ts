import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Inject, NotFoundException, Optional, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Response } from "express";
import { z } from "zod";
import { Presence, presenceColor, type Tx } from "@webbrik/collaboration";
import { applyOperations, diffDocuments, OperationError, validateDocument, type Document, type Operation } from "@webbrik/document-model";
import { analyze, summarize } from "@webbrik/quality";
import { publishedContent } from "../../common/content";
import { publicApiUrl } from "../../common/public-url";
import { exportReact, exportStatic, zipFiles } from "@webbrik/exporter";
import { Db } from "../../common/db";
import { Access, hashToken, parseBody, Public, RateLimit, type AuthedRequest } from "../../common/http";
import { PERSISTENCE, type Persistence } from "../../common/persistence";
import { Realtime } from "../../common/realtime";
import { CollabHub, ConflictError, DbDocumentStore, DocumentsService } from "./documents.service";

const PRESENCE_TTL = 15_000;

@Controller()
export class DocumentsController {
  private docs: DocumentsService;
  private presence = new Map<string, Presence>();

  constructor(@Inject(Db) private db: Db, @Inject(Access) private access: Access, @Inject(CollabHub) private hub: CollabHub, @Optional() @Inject(PERSISTENCE) private persistence: Persistence | null, @Inject(Realtime) private realtime: Realtime) {
    this.docs = new DocumentsService(new DbDocumentStore(db, (pid) => { hub.invalidate(pid); realtime.notify(pid, { type: "ops", revision: db.projects.get(pid)?.headRevision ?? 0 }); }));
  }

  /** With several API instances: wait for the database to accept the write, and refuse it if another instance committed the same revision first. */
  private async commit(projectId: string) {
    if (!this.persistence?.writeThrough) return;
    const { rejected } = await this.persistence.flush();
    if (rejected.some((r) => r.table === "revisions" && r.row?.projectId === projectId)) {
      this.hub.invalidate(projectId);
      throw new ConflictException({ code: "revision_conflict", message: "Another editor saved first; reload to continue", headRevision: this.db.projects.get(projectId)?.headRevision ?? 0 });
    }
  }

  private head(projectId: string): { revision: number; document: Document } {
    const p = this.db.projects.get(projectId)!;
    return { revision: p.headRevision, document: this.db.revisions.find((r) => r.projectId === projectId && r.revision === p.headRevision)!.document };
  }

  @Get("projects/:id/document")
  get(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.project(req, id);
    return this.head(id);
  }

  @Put("projects/:id/document")
  async save(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { project, user } = this.access.project(req, id, "project:edit");
    const b = parseBody(z.object({ baseRevision: z.number().int().min(0), document: z.unknown() }), body);
    try {
      await this.persistence?.syncFresh(0).catch(() => undefined);
      const r = await this.docs.save(project.id, b.baseRevision, b.document, user.id);
      if (!r.ok) throw new BadRequestException({ code: "invalid_document", message: "Document failed validation", details: r.issues });
      await this.commit(project.id);
      return { revision: r.revision };
    } catch (e) {
      if (e instanceof ConflictError) throw new ConflictException({ code: "revision_conflict", message: "The project changed since you loaded it", headRevision: e.headRevision });
      throw e;
    }
  }

  @Get("projects/:id/revisions")
  revisions(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.project(req, id);
    return { revisions: this.db.revisions.filter((r) => r.projectId === id).sort((a, b) => b.revision - a.revision).slice(0, 200).map((r) => ({ revision: r.revision, authorId: r.authorId, createdAt: r.createdAt })) };
  }

  @Get("projects/:id/revisions/:n")
  revision(@Req() req: AuthedRequest, @Param("id") id: string, @Param("n") n: string) {
    this.access.project(req, id);
    const r = this.db.revisions.find((x) => x.projectId === id && x.revision === Number(n));
    if (!r) throw new NotFoundException({ code: "not_found", message: "Revision not found" });
    return { revision: r.revision, document: r.document };
  }

  @Post("projects/:id/versions")
  createVersion(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { project, user } = this.access.project(req, id, "project:edit");
    const b = parseBody(z.object({ name: z.string().trim().min(1).max(100), revision: z.number().int().optional() }), body);
    const revision = b.revision ?? project.headRevision;
    if (!this.db.revisions.find((r) => r.projectId === id && r.revision === revision)) throw new NotFoundException({ code: "not_found", message: "Revision not found" });
    return { version: this.db.versions.insert({ projectId: id, name: b.name, revision, authorId: user.id, createdAt: Date.now() }) };
  }

  @Get("projects/:id/versions")
  versions(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.project(req, id);
    return { versions: this.db.versions.filter((v) => v.projectId === id).sort((a, b) => b.createdAt - a.createdAt) };
  }

  /** Restoring never rewrites history: it appends a new revision containing the old document. */
  @HttpCode(200) @Post("projects/:id/versions/:vid/restore")
  async restore(@Req() req: AuthedRequest, @Param("id") id: string, @Param("vid") vid: string) {
    const { project, user } = this.access.project(req, id, "project:edit");
    const v = this.db.versions.get(vid);
    const rev = v && v.projectId === id && this.db.revisions.find((r) => r.projectId === id && r.revision === v.revision);
    if (!v || !rev) throw new NotFoundException({ code: "not_found", message: "Version not found" });
    const r = await this.docs.save(id, project.headRevision, structuredClone(rev.document), user.id);
    if (!r.ok) throw new BadRequestException({ code: "invalid_document", message: "Stored version failed validation" });
    this.db.logAudit(project.workspaceId, "version.restore", user.id, v.name, id);
    return { revision: r.revision };
  }

  @Get("projects/:id/compare")
  compare(@Req() req: AuthedRequest, @Param("id") id: string, @Query("from") from: string, @Query("to") to?: string) {
    const { project } = this.access.project(req, id);
    const get = (n: number) => this.db.revisions.find((r) => r.projectId === id && r.revision === n)?.document;
    const a = get(Number(from)), b = get(to ? Number(to) : project.headRevision);
    if (!a || !b) throw new NotFoundException({ code: "not_found", message: "Revision not found" });
    return diffDocuments(a, b);
  }

  // ----- Real-time collaboration (server-ordered ops over HTTP; clients poll `ops?since=`) -----
  @Post("projects/:id/ops")
  async submitOps(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { project, user } = this.access.project(req, id, "project:edit");
    const b = parseBody(z.object({ id: z.string().min(1).max(100), clientId: z.string().min(1).max(100), baseRevision: z.number().int().min(0), ops: z.array(z.record(z.string(), z.unknown())).min(1).max(500) }), body);
    await this.persistence?.syncFresh(0).catch(() => undefined);
    const server = this.hub.server(project.id);
    const tx: Tx = { id: b.id, clientId: b.clientId, baseRevision: b.baseRevision, ops: b.ops as unknown as Operation[] };
    const r = server.submit(tx);
    if (!r.ok) throw new ConflictException({ code: r.reason === "invalid" ? "invalid_ops" : "revision_conflict", message: r.message, headRevision: r.headRevision });
    const v = validateDocument(server.doc);
    if (!v.ok) { this.hub.invalidate(project.id); throw new BadRequestException({ code: "invalid_document", message: "Operations produce an invalid document" }); }
    if (!this.db.revisions.find((x) => x.projectId === id && x.revision === r.committed.revision)) {
      this.db.revisions.insert({ projectId: id, revision: r.committed.revision, document: server.doc, authorId: user.id, createdAt: Date.now() });
      this.db.projects.update(id, { headRevision: r.committed.revision, updatedAt: Date.now() });
    }
    await this.commit(id);
    this.realtime.notify(id, { type: "ops", revision: r.committed.revision });
    return { committed: r.committed };
  }

  @Get("projects/:id/ops")
  ops(@Req() req: AuthedRequest, @Param("id") id: string, @Query("since") since = "0") {
    const { project } = this.access.project(req, id);
    const list = this.hub.server(project.id).since(Number(since));
    if (list === null) return { resync: true, ...this.head(id) };
    return { resync: false, committed: list, revision: project.headRevision };
  }

  @HttpCode(204) @Post("projects/:id/presence")
  setPresence(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { user } = this.access.project(req, id);
    const b = parseBody(z.object({ clientId: z.string().min(1).max(100), selection: z.array(z.string()).max(50).default([]), pageId: z.string().optional() }), body);
    let p = this.presence.get(id);
    if (!p) this.presence.set(id, (p = new Presence(PRESENCE_TTL)));
    p.update({ clientId: b.clientId, name: user.name, color: presenceColor(b.clientId), selection: b.selection, pageId: b.pageId });
    this.realtime.notify(id, { type: "presence" });
  }

  @Get("projects/:id/presence")
  getPresence(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.project(req, id);
    return { users: this.presence.get(id)?.active() ?? [] };
  }

  // ----- Comments & review -----
  @Get("projects/:id/comments")
  comments(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.project(req, id);
    return { comments: this.db.comments.filter((c) => c.projectId === id).sort((a, b) => a.createdAt - b.createdAt) };
  }

  @Post("projects/:id/comments")
  addComment(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { user } = this.access.project(req, id, "comment:write");
    const b = parseBody(z.object({ body: z.string().trim().min(1).max(4000), elementId: z.string().optional() }), body);
    return { comment: this.db.comments.insert({ projectId: id, elementId: b.elementId, authorId: user.id, authorName: user.name, body: b.body, createdAt: Date.now() }) };
  }

  @HttpCode(200) @Post("projects/:id/comments/:cid/resolve")
  resolve(@Req() req: AuthedRequest, @Param("id") id: string, @Param("cid") cid: string) {
    this.access.project(req, id, "comment:write");
    const c = this.db.comments.get(cid);
    if (!c || c.projectId !== id) throw new NotFoundException({ code: "not_found", message: "Comment not found" });
    this.db.comments.update(cid, { resolvedAt: Date.now() });
    return { ok: true };
  }

  @Post("projects/:id/review-links")
  reviewLink(@Req() req: AuthedRequest, @Param("id") id: string) {
    const { project, user } = this.access.project(req, id, "project:edit");
    const raw = randomBytes(24).toString("base64url");
    this.db.tokens.insert({ kind: "review", tokenHash: hashToken(raw), projectId: id, expiresAt: Date.now() + 14 * 24 * 3600 * 1000 });
    this.db.logAudit(project.workspaceId, "review.link", user.id, id, id);
    return { token: raw, expiresInDays: 14 };
  }

  private reviewToken(raw: string) {
    const h = hashToken(raw);
    const t = this.db.tokens.find((x) => x.kind === "review" && x.tokenHash === h && x.expiresAt > Date.now());
    if (!t || !t.projectId || !this.db.projects.get(t.projectId) || this.db.projects.get(t.projectId)!.deletedAt) throw new NotFoundException({ code: "not_found", message: "Review link not found or expired" });
    return t;
  }

  /** Read-only access for clients: the document and comments only, nothing else about the workspace. */
  @Public() @RateLimit(60, 60_000) @Get("public/review/:token")
  reviewView(@Param("token") token: string) {
    const t = this.reviewToken(token);
    const p = this.db.projects.get(t.projectId!)!;
    return { project: { name: p.name }, ...this.head(p.id), comments: this.db.comments.filter((c) => c.projectId === p.id), approvedAt: t.approvedAt ?? null };
  }

  @Public() @RateLimit(20, 60_000) @Post("public/review/:token/comments")
  reviewComment(@Param("token") token: string, @Body() body: unknown) {
    const t = this.reviewToken(token);
    const b = parseBody(z.object({ authorName: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(4000), elementId: z.string().optional() }), body);
    return { comment: this.db.comments.insert({ projectId: t.projectId!, elementId: b.elementId, authorName: `${b.authorName} (reviewer)`, body: b.body, createdAt: Date.now() }) };
  }

  @Public() @RateLimit(10, 60_000) @HttpCode(200) @Post("public/review/:token/approve")
  approve(@Param("token") token: string, @Body() body: unknown) {
    const t = this.reviewToken(token);
    const b = parseBody(z.object({ name: z.string().trim().min(1).max(80) }), body);
    this.db.tokens.update(t.id, { approvedAt: Date.now() });
    const p = this.db.projects.get(t.projectId!)!;
    this.db.logAudit(p.workspaceId, "review.approved", undefined, b.name, p.id);
    return { ok: true };
  }

  // ----- Quality & export -----
  @Get("projects/:id/quality")
  quality(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.project(req, id);
    const findings = analyze(this.head(id).document);
    return { summary: summarize(findings), findings };
  }

  @Get("projects/:id/export")
  export(@Req() req: AuthedRequest, @Param("id") id: string, @Query("target") target = "static", @Query("format") format = "zip", @Query("live") live: string | undefined, @Res() res: Response) {
    const { project } = this.access.project(req, id, "project:view");
    if (!["static", "next", "vite"].includes(target)) throw new BadRequestException({ code: "invalid_target", message: "target must be static, next or vite" });
    const doc = this.head(id).document;
    try {
      const content = publishedContent(this.db, id);
      const forms = { endpoint: publicApiUrl(req), projectId: id };
      const out = target === "static" ? exportStatic(doc, { content, forms }) : exportReact(doc, target as "next" | "vite", { content, forms, live: live === "1" || live === "true" ? forms : undefined });
      if (format === "json") { res.json(out); return; }
      res.setHeader("content-type", "application/zip");
      res.setHeader("content-disposition", `attachment; filename="${project.slug}-${target}.zip"`);
      res.setHeader("x-export-warnings", encodeURIComponent(JSON.stringify(out.warnings)));
      res.end(Buffer.from(zipFiles(out.files)));
    } catch (e) {
      if (e instanceof OperationError || e instanceof Error) throw new BadRequestException({ code: "export_failed", message: e.message });
      throw e;
    }
  }
}
void applyOperations;
