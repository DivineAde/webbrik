import { Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Query, Req, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { Body } from "@nestjs/common";
import { z } from "zod";
import { publishedContent } from "../../common/content";
import { Db } from "../../common/db";
import { Public, parseBody, type AuthedRequest } from "../../common/http";
import { analyticsHeadAll } from "@webbrik/integrations";

/**
 * Service-to-service API for the build worker. Authenticated by a shared secret (WORKER_TOKEN), not a user session:
 * the worker asks for what to build by project id and reports what happened. It never receives documents in the job queue,
 * so a job can't be tampered with or go stale; it always builds the revision the API says is current.
 */
@Controller("internal")
export class InternalController {
  constructor(@Inject(Db) private db: Db) {}

  private authorize(req: AuthedRequest) {
    const expected = process.env["WORKER_TOKEN"];
    const given = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
    const a = Buffer.from(given), b = Buffer.from(expected ?? "");
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException({ code: "unauthenticated", message: "Invalid worker token" });
  }

  @Public() @Get("projects/:id/build-input")
  buildInput(@Req() req: AuthedRequest, @Param("id") id: string, @Query("revision") revision?: string) {
    this.authorize(req);
    const p = this.db.projects.get(id);
    if (!p || p.deletedAt) throw new NotFoundException({ code: "not_found", message: "Project not found" });
    const n = revision ? Number(revision) : p.headRevision;
    const rev = this.db.revisions.find((r) => r.projectId === id && r.revision === n);
    if (!rev) throw new NotFoundException({ code: "not_found", message: "Revision not found" });
    return { projectId: id, workspaceId: p.workspaceId, projectSlug: p.slug, revision: n, document: rev.document, content: publishedContent(this.db, id), injectHead: analyticsHeadAll(p.analytics) };
  }

  @Public() @HttpCode(200) @Post("projects/:id/build-result")
  buildResult(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    this.authorize(req);
    const p = this.db.projects.get(id);
    if (!p) throw new NotFoundException({ code: "not_found", message: "Project not found" });
    const b = parseBody(z.object({ revision: z.number().int(), ok: z.boolean(), files: z.number().int().min(0), bytes: z.number().int().min(0), logs: z.array(z.string().max(500)).max(200) }), body);
    if (!this.db.revisions.find((r) => r.projectId === id && r.revision === b.revision)) throw new BadRequestException({ code: "bad_revision", message: "Unknown revision" });
    this.db.logAudit(p.workspaceId, b.ok ? "build.ok" : "build.failed", "worker", `r${b.revision}: ${b.ok ? `${b.files} files, ${b.bytes} bytes` : (b.logs[0] ?? "failed")}`, id);
    return { recorded: true };
  }
}
