import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, Post, Req, ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import { buildContext, reviewProposal } from "@webbrik/ai";
import { applyOperations, diffDocuments, type Document, type Operation } from "@webbrik/document-model";
import { PLANS, checkQuota } from "@webbrik/shared";
import { Db } from "../../common/db";
import { Access, parseBody, RateLimit, type AuthedRequest } from "../../common/http";
import { Realtime } from "../../common/realtime";
import { CollabHub, DbDocumentStore, DocumentsService } from "../projects/documents.service";

export const AI_PROVIDER = Symbol("AI_PROVIDER");
export interface AiProvider { propose(input: { prompt: string; context: unknown; document: Document }): Promise<unknown> }

/** NOTE: not exercised against the live API in this repo (no network/API key here). Asks for JSON matching the proposal schema. */
export function anthropicProvider(apiKey: string, model = "claude-sonnet-4-5", f: typeof fetch = fetch): AiProvider {
  return {
    async propose({ prompt, context }) {
      const res = await f("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model, max_tokens: 4000,
          system: 'You edit a website document by proposing operations. Reply with ONLY JSON: {"summary": string, "operations": Operation[]}. Allowed operation types: insertSubtree, deleteElement, moveElement, updateElement, setStyle, addClass, removeClass, upsertClass, duplicateElement, setToken. Never invent ids that already exist; new element nodes need unique ids.',
          messages: [{ role: "user", content: `Context:\n${JSON.stringify(context)}\n\nRequest: ${prompt}` }],
        }),
      });
      if (!res.ok) throw new Error(`AI provider error ${res.status}`);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = data.content?.find((c) => c.type === "text")?.text ?? "";
      return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    },
  };
}

@Controller()
export class AiController {
  private docs: DocumentsService;
  constructor(@Inject(Db) private db: Db, @Inject(Access) private access: Access, @Inject(AI_PROVIDER) private provider: AiProvider | null, @Inject(CollabHub) hub: CollabHub, @Inject(Realtime) realtime: Realtime) {
    this.docs = new DocumentsService(new DbDocumentStore(db, (pid) => { hub.invalidate(pid); realtime.notify(pid, { type: "ops", revision: db.projects.get(pid)?.headRevision ?? 0 }); }));
  }

  private head(id: string, rev: number) { return this.db.revisions.find((r) => r.projectId === id && r.revision === rev)!.document; }

  @RateLimit(20, 60_000) @Post("projects/:id/ai/proposals")
  async propose(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { project, workspace, user } = this.access.project(req, id, "project:edit");
    if (!this.provider) throw new ServiceUnavailableException({ code: "ai_unavailable", message: "No AI provider is configured" });
    const b = parseBody(z.object({ prompt: z.string().trim().min(1).max(2000), selectedId: z.string().nullable().default(null) }), body);
    if (!checkQuota(workspace.plan, "aiCreditsPerMonth", this.db.usageOf(workspace.id, "aiCredits"))) throw new ForbiddenException({ code: "quota_exceeded", message: `Your plan allows ${PLANS[workspace.plan]?.aiCreditsPerMonth ?? 0} AI requests per month` });
    const doc = this.head(id, project.headRevision);
    let raw: unknown;
    try { raw = await this.provider.propose({ prompt: b.prompt, context: buildContext(doc, b.selectedId), document: doc }); }
    catch { throw new ServiceUnavailableException({ code: "ai_failed", message: "The AI request failed. Try again." }); }
    this.db.addUsage(workspace.id, "aiCredits");
    const review = reviewProposal(doc, raw);
    if (!review.ok) return { ok: false, errors: review.errors };
    const rec = this.db.proposals.insert({ projectId: id, userId: user.id, summary: review.summary!, operations: review.operations!, baseRevision: project.headRevision, createdAt: Date.now(), status: "pending" });
    return { ok: true, proposal: { id: rec.id, summary: rec.summary, operations: rec.operations }, changes: diffDocuments(doc, review.preview!) };
  }

  @HttpCode(200) @Post("projects/:id/ai/proposals/:pid/accept")
  async accept(@Req() req: AuthedRequest, @Param("id") id: string, @Param("pid") pid: string) {
    const { project, user } = this.access.project(req, id, "project:edit");
    const p = this.db.proposals.get(pid);
    if (!p || p.projectId !== id || p.userId !== user.id) throw new NotFoundException({ code: "not_found", message: "Proposal not found" });
    if (p.status !== "pending") throw new BadRequestException({ code: "not_pending", message: "Proposal was already handled" });
    // Re-validate against the *current* head: the document may have changed since the proposal was made.
    const head = this.head(id, project.headRevision);
    const review = reviewProposal(head, { summary: p.summary, operations: p.operations });
    if (!review.ok) throw new BadRequestException({ code: "proposal_stale", message: "The document changed and this proposal no longer applies", details: review.errors });
    const r = await this.docs.save(id, project.headRevision, applyOperations(head, p.operations as Operation[]).doc, user.id);
    if (!r.ok) throw new BadRequestException({ code: "invalid_document", message: "Result failed validation" });
    this.db.proposals.update(pid, { status: "accepted" });
    this.db.logAudit(project.workspaceId, "ai.accept", user.id, pid, id);
    return { revision: r.revision, undoToRevision: project.headRevision };
  }

  @HttpCode(200) @Post("projects/:id/ai/proposals/:pid/reject")
  reject(@Req() req: AuthedRequest, @Param("id") id: string, @Param("pid") pid: string) {
    const { user } = this.access.project(req, id, "project:edit");
    const p = this.db.proposals.get(pid);
    if (!p || p.projectId !== id || p.userId !== user.id) throw new NotFoundException({ code: "not_found", message: "Proposal not found" });
    this.db.proposals.update(pid, { status: "rejected" });
    return { ok: true };
  }

  @Get("projects/:id/ai/status")
  status(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.project(req, id);
    return { available: !!this.provider };
  }
}
