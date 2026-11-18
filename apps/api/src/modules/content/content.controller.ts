import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Inject, NotFoundException, Param, Patch, Post, Put, Query, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { queryItems, sanitizeItemData, validateItem, visibleItems, type CollectionSchema, type ContentItem } from "@webbrik/content-engine";
import { validateSubmission } from "@webbrik/integrations";
import { Db, type ItemRec } from "../../common/db";
import { Access, parseBody, Public, RateLimit, type AuthedRequest } from "../../common/http";
import { MAILER, safeSend, type Mailer } from "../../common/mailer";
import { formSubmission } from "../../common/emails";
import { publishedContent } from "../../common/content";
import { sendWebhook } from "../../common/webhooks";

const FIELD_TYPES = ["text", "richtext", "number", "boolean", "date", "image", "file", "url", "reference", "multireference", "slug", "json"] as const;
const SLUG = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60);
const schemaBody = z.object({ slug: SLUG, name: z.string().trim().min(1).max(80), fields: z.array(z.object({ name: z.string().regex(/^[a-zA-Z_]\w{0,40}$/), type: z.enum(FIELD_TYPES), required: z.boolean().optional(), to: z.string().optional() })).min(1).max(60) });
const itemBody = z.object({ slug: SLUG, data: z.record(z.string(), z.unknown()), status: z.enum(["draft", "published", "scheduled"]).default("draft"), publishAt: z.string().optional() });

@Controller()
export class ContentController {
  constructor(@Inject(Db) private db: Db, @Inject(Access) private access: Access, @Inject(MAILER) private mailer: Mailer) {}
  private mailed = new Map<string, number[]>();

  private collection(pid: string, cid: string) {
    const c = this.db.collections.get(cid);
    if (!c || c.projectId !== pid) throw new NotFoundException({ code: "not_found", message: "Collection not found" });
    return c;
  }

  private checkRefs(pid: string, schema: CollectionSchema, data: Record<string, unknown>) {
    for (const f of schema.fields) {
      if (f.type !== "reference" && f.type !== "multireference") continue;
      const target = this.db.collections.find((c) => c.projectId === pid && c.schema.slug === f.to);
      if (!target) throw new BadRequestException({ code: "invalid_reference", message: `${f.name}: unknown target collection` });
      const ids = f.type === "reference" ? [data[f.name]].filter(Boolean) : ((data[f.name] as string[] | undefined) ?? []);
      for (const id of ids) if (!this.db.items.find((i) => i.id === id && i.collectionId === target.id)) throw new BadRequestException({ code: "invalid_reference", message: `${f.name}: referenced item not found` });
    }
  }

  private checkStatus(b: z.infer<typeof itemBody>) {
    if (b.status === "scheduled" && (!b.publishAt || Number.isNaN(Date.parse(b.publishAt)))) throw new BadRequestException({ code: "invalid_schedule", message: "Scheduled items need a valid publishAt date" });
  }

  @Post("projects/:id/collections")
  createCollection(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    this.access.project(req, id, "project:design");
    const b = parseBody(schemaBody, body);
    if (this.db.collections.find((c) => c.projectId === id && c.schema.slug === b.slug)) throw new BadRequestException({ code: "duplicate", message: "A collection with that slug exists" });
    return { collection: this.db.collections.insert({ projectId: id, slug: b.slug, schema: b }) };
  }

  @Get("projects/:id/collections")
  collections(@Req() req: AuthedRequest, @Param("id") id: string) {
    this.access.project(req, id);
    return { collections: this.db.collections.filter((c) => c.projectId === id) };
  }

  @Put("projects/:id/collections/:cid")
  updateCollection(@Req() req: AuthedRequest, @Param("id") id: string, @Param("cid") cid: string, @Body() body: unknown) {
    this.access.project(req, id, "project:design");
    const c = this.collection(id, cid);
    const b = parseBody(schemaBody, body);
    if (b.slug !== c.schema.slug) throw new BadRequestException({ code: "immutable", message: "Collection slug cannot change" });
    // Existing items must still validate against the new schema.
    const bad = this.db.items.filter((i) => i.collectionId === cid).find((i) => !validateItem(b, i.data).ok);
    if (bad) throw new BadRequestException({ code: "schema_conflict", message: `Item "${bad.slug}" would no longer be valid` });
    this.db.collections.update(cid, { schema: b });
    return { collection: this.db.collections.get(cid) };
  }

  @HttpCode(204) @Delete("projects/:id/collections/:cid")
  deleteCollection(@Req() req: AuthedRequest, @Param("id") id: string, @Param("cid") cid: string) {
    this.access.project(req, id, "project:design");
    this.collection(id, cid);
    const referenced = this.db.collections.filter(() => true).some((c) => c.projectId === id && c.id !== cid && c.schema.fields.some((f) => f.to === this.db.collections.get(cid)!.schema.slug));
    if (referenced) throw new BadRequestException({ code: "in_use", message: "Another collection references this one" });
    this.db.items.deleteWhere((i) => i.collectionId === cid);
    this.db.collections.delete(cid);
  }

  @Post("projects/:id/collections/:cid/items")
  createItem(@Req() req: AuthedRequest, @Param("id") id: string, @Param("cid") cid: string, @Body() body: unknown) {
    const { membership } = this.access.project(req, id, "project:edit");
    const c = this.collection(id, cid);
    const b = parseBody(itemBody, body);
    this.checkStatus(b);
    if (b.status !== "draft") this.access.project(req, id, "content:publish");
    void membership;
    const v = validateItem(c.schema, b.data);
    if (!v.ok) throw new BadRequestException({ code: "invalid_item", message: "Item failed validation", details: v.errors });
    this.checkRefs(id, c.schema, b.data);
    b.data = sanitizeItemData(c.schema, b.data);
    if (this.db.items.find((i) => i.collectionId === cid && i.slug === b.slug)) throw new BadRequestException({ code: "duplicate", message: "An item with that slug exists" });
    return { item: this.db.items.insert({ collectionId: cid, slug: b.slug, data: b.data, status: b.status, publishAt: b.publishAt, updatedAt: Date.now(), revisions: [] }) };
  }

  @Get("projects/:id/collections/:cid/items")
  items(@Req() req: AuthedRequest, @Param("id") id: string, @Param("cid") cid: string, @Query() q: Record<string, string>) {
    this.access.project(req, id);
    this.collection(id, cid);
    const rows = this.db.items.filter((i) => i.collectionId === cid);
    return queryItems(rows.map((r) => this.asContent(r)), { sortBy: q["sortBy"], order: q["order"] === "desc" ? "desc" : "asc", page: q["page"] ? Number(q["page"]) : undefined, pageSize: q["pageSize"] ? Math.min(100, Number(q["pageSize"])) : 50 });
  }

  private asContent(r: ItemRec): ContentItem { return { id: r.id, slug: r.slug, data: r.data, status: r.status, publishAt: r.publishAt }; }

  @Patch("projects/:id/collections/:cid/items/:iid")
  updateItem(@Req() req: AuthedRequest, @Param("id") id: string, @Param("cid") cid: string, @Param("iid") iid: string, @Body() body: unknown) {
    const { user } = this.access.project(req, id, "project:edit");
    const c = this.collection(id, cid);
    const item = this.db.items.get(iid);
    if (!item || item.collectionId !== cid) throw new NotFoundException({ code: "not_found", message: "Item not found" });
    const b = parseBody(z.object({ data: z.record(z.string(), z.unknown()) }), body);
    const v = validateItem(c.schema, b.data);
    if (!v.ok) throw new BadRequestException({ code: "invalid_item", message: "Item failed validation", details: v.errors });
    this.checkRefs(id, c.schema, b.data);
    const data = sanitizeItemData(c.schema, b.data);
    this.db.items.update(iid, { revisions: [...item.revisions, { at: Date.now(), data: item.data, by: user.id }].slice(-50), data, updatedAt: Date.now() });
    return { item: this.db.items.get(iid) };
  }

  @HttpCode(200) @Post("projects/:id/collections/:cid/items/:iid/status")
  setStatus(@Req() req: AuthedRequest, @Param("id") id: string, @Param("cid") cid: string, @Param("iid") iid: string, @Body() body: unknown) {
    this.access.project(req, id, "content:publish");
    this.collection(id, cid);
    const item = this.db.items.get(iid);
    if (!item || item.collectionId !== cid) throw new NotFoundException({ code: "not_found", message: "Item not found" });
    const b = parseBody(z.object({ status: z.enum(["draft", "published", "scheduled"]), publishAt: z.string().optional() }), body);
    this.checkStatus({ ...b, slug: item.slug, data: {} });
    this.db.items.update(iid, { status: b.status, publishAt: b.status === "scheduled" ? b.publishAt : undefined, updatedAt: Date.now() });
    return { item: this.db.items.get(iid) };
  }

  @Get("projects/:id/collections/:cid/items/:iid/revisions")
  revisions(@Req() req: AuthedRequest, @Param("id") id: string, @Param("cid") cid: string, @Param("iid") iid: string) {
    this.access.project(req, id);
    this.collection(id, cid);
    const item = this.db.items.get(iid);
    if (!item || item.collectionId !== cid) throw new NotFoundException({ code: "not_found", message: "Item not found" });
    return { revisions: item.revisions.map((r, index) => ({ index, at: r.at, by: r.by, data: r.data })).reverse() };
  }

  /** Restore an earlier version. The restored data must still satisfy the current schema and references; the current data is kept as a new revision so a revert can itself be undone. */
  @HttpCode(200) @Post("projects/:id/collections/:cid/items/:iid/revert/:n")
  revert(@Req() req: AuthedRequest, @Param("id") id: string, @Param("cid") cid: string, @Param("iid") iid: string, @Param("n") n: string) {
    const { user } = this.access.project(req, id, "project:edit");
    const c = this.collection(id, cid);
    const item = this.db.items.get(iid);
    const rev = item?.revisions[Number(n)];
    if (!item || item.collectionId !== cid || !rev) throw new NotFoundException({ code: "not_found", message: "Revision not found" });
    const v = validateItem(c.schema, rev.data);
    if (!v.ok) throw new BadRequestException({ code: "invalid_item", message: "That version no longer fits the collection's fields", details: v.errors });
    this.checkRefs(id, c.schema, rev.data);
    this.db.items.update(iid, { revisions: [...item.revisions, { at: Date.now(), data: item.data, by: user.id }].slice(-50), data: sanitizeItemData(c.schema, rev.data), updatedAt: Date.now() });
    return { item: this.db.items.get(iid) };
  }

  @HttpCode(204) @Delete("projects/:id/collections/:cid/items/:iid")
  deleteItem(@Req() req: AuthedRequest, @Param("id") id: string, @Param("cid") cid: string, @Param("iid") iid: string) {
    this.access.project(req, id, "project:edit");
    const c = this.collection(id, cid);
    const item = this.db.items.get(iid);
    if (!item || item.collectionId !== cid) throw new NotFoundException({ code: "not_found", message: "Item not found" });
    for (const other of this.db.collections.filter((x) => x.projectId === id))
      for (const f of other.schema.fields.filter((f) => f.to === c.schema.slug))
        if (this.db.items.filter((i) => i.collectionId === other.id).some((i) => (Array.isArray(i.data[f.name]) ? (i.data[f.name] as string[]).includes(iid) : i.data[f.name] === iid)))
          throw new BadRequestException({ code: "in_use", message: "This item is referenced by another item" });
    this.db.items.delete(iid);
  }

  /** Public, read-only: only items visible at request time (published, or scheduled and due). */
  @Public() @RateLimit(120, 60_000) @Get("public/projects/:id/content/:slug")
  publicContent(@Param("id") id: string, @Param("slug") slug: string, @Query() q: Record<string, string>) {
    const p = this.db.projects.get(id);
    const c = p && !p.deletedAt && this.db.collections.find((x) => x.projectId === id && x.schema.slug === slug);
    if (!c) throw new NotFoundException({ code: "not_found", message: "Not found" });
    const visible = visibleItems(this.db.items.filter((i) => i.collectionId === c.id).map((r) => this.asContent(r)));
    const filter = q["filter"] ? (() => { try { return JSON.parse(q["filter"]!) as Record<string, unknown>; } catch { return undefined; } })() : undefined;
    return queryItems(visible, { filter, sortBy: q["sortBy"], order: q["order"] === "desc" ? "desc" : "asc", page: q["page"] ? Number(q["page"]) : 1, pageSize: Math.min(100, Number(q["pageSize"] ?? 20)) });
  }

  // ----- Forms -----
  private formView(projectId: string, formId: string) {
    const p = this.db.projects.get(projectId)!;
    return { id: formId, fields: p.forms[formId] ?? [], settings: p.formSettings?.[formId] ?? {}, submissionCount: this.db.submissions.filter((s) => s.projectId === projectId && s.formId === formId).length };
  }

  @Get("projects/:id/forms")
  listForms(@Req() req: AuthedRequest, @Param("id") id: string) {
    const { project } = this.access.project(req, id, "project:view");
    return { forms: Object.keys(project.forms).sort().map((fid) => this.formView(id, fid)) };
  }

  @Put("projects/:id/forms/:formId")
  defineForm(@Req() req: AuthedRequest, @Param("id") id: string, @Param("formId") formId: string, @Body() body: unknown) {
    const { project } = this.access.project(req, id, "project:design");
    if (!/^[a-z0-9-]{1,40}$/.test(formId)) throw new BadRequestException({ code: "invalid_form", message: "Form ids use lowercase letters, numbers and hyphens" });
    const b = parseBody(z.object({
      fields: z.array(z.object({ name: z.string().regex(/^[a-zA-Z_]\w{0,40}$/).refine((n) => n !== "_hp", "reserved name"), type: z.enum(["text", "email", "textarea", "number", "checkbox"]), required: z.boolean().optional(), maxLength: z.number().int().max(10000).optional() })).min(1).max(30).refine((l) => new Set(l.map((f) => f.name)).size === l.length, "field names must be unique"),
      successMessage: z.string().trim().max(300).optional(),
      redirectUrl: z.string().trim().max(500).regex(/^(\/(?!\/)|https:\/\/)/, "Use a path starting with / or an https:// address").optional().or(z.literal("")),
      notifyEmails: z.array(z.string().email()).max(5).optional(),
    }), body);
    const settings = { ...(b.successMessage ? { successMessage: b.successMessage } : {}), ...(b.redirectUrl ? { redirectUrl: b.redirectUrl } : {}), ...(b.notifyEmails?.length ? { notifyEmails: [...new Set(b.notifyEmails.map((e) => e.toLowerCase()))] } : {}) };
    this.db.projects.update(id, { forms: { ...project.forms, [formId]: b.fields }, formSettings: { ...(project.formSettings ?? {}), [formId]: settings } });
    return { ok: true, form: this.formView(id, formId) };
  }

  @Delete("projects/:id/forms/:formId") @HttpCode(204)
  deleteForm(@Req() req: AuthedRequest, @Param("id") id: string, @Param("formId") formId: string) {
    const { project } = this.access.project(req, id, "project:design");
    if (!project.forms[formId]) throw new NotFoundException({ code: "not_found", message: "Form not found" });
    const { [formId]: _f, ...forms } = project.forms;
    const { [formId]: _s, ...formSettings } = project.formSettings ?? {};
    this.db.projects.update(id, { forms, formSettings });
    for (const s of this.db.submissions.filter((x) => x.projectId === id && x.formId === formId)) this.db.submissions.delete(s.id);
  }

  @Public() @RateLimit(10, 60_000) @HttpCode(201) @Post("public/forms/:id/:formId")
  submit(@Param("id") id: string, @Param("formId") formId: string, @Body() body: unknown) {
    const p = this.db.projects.get(id);
    const fields = p && !p.deletedAt ? p.forms[formId] : undefined;
    if (!p || !fields) throw new NotFoundException({ code: "not_found", message: "Form not found" });
    const r = validateSubmission(fields, (body ?? {}) as Record<string, unknown>);
    if (!r.ok) {
      if (r.spam) return { ok: true }; // silently accept so bots learn nothing
      throw new BadRequestException({ code: "invalid_submission", message: "Check the form fields", details: r.errors });
    }
    const rec = this.db.submissions.insert({ projectId: id, formId, data: r.data, createdAt: Date.now() });
    for (const h of p.webhooks) if (h.events.includes("form.submitted")) void sendWebhook(this.db, id, h, "form.submitted", { formId, submissionId: rec.id, data: r.data });
    // Notification emails, at most 20 per form per hour so a form can't be used to flood an inbox.
    const key = `${id}/${formId}`, now = Date.now();
    const recent = (this.mailed.get(key) ?? []).filter((t) => now - t < 3_600_000);
    const to = p.formSettings?.[formId]?.notifyEmails ?? [];
    if (to.length && recent.length < 20) { recent.push(now); for (const addr of to) void safeSend(this.mailer, formSubmission(addr, p.name, formId, r.data, id)); }
    this.mailed.set(key, recent);
    return { ok: true };
  }

  @Get("projects/:id/forms/:formId/submissions")
  submissions(@Req() req: AuthedRequest, @Param("id") id: string, @Param("formId") formId: string) {
    this.access.project(req, id, "project:edit");
    return { submissions: this.db.submissions.filter((s) => s.projectId === id && s.formId === formId).sort((a, b) => b.createdAt - a.createdAt).slice(0, 500) };
  }

  @Get("projects/:id/forms/:formId/submissions.csv")
  submissionsCsv(@Req() req: AuthedRequest, @Param("id") id: string, @Param("formId") formId: string, @Res() res: Response) {
    const { project } = this.access.project(req, id, "project:edit");
    const names = (project.forms[formId] ?? []).map((f) => f.name);
    // Cells starting with = + - @ are prefixed so spreadsheets don't run submitted text as a formula.
    const cell = (v: unknown) => { let t = v === undefined ? "" : String(v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
    const rows = this.db.submissions.filter((s) => s.projectId === id && s.formId === formId).sort((a, b) => a.createdAt - b.createdAt);
    const csv = [["submitted_at", ...names].map(cell).join(","), ...rows.map((s) => [new Date(s.createdAt).toISOString(), ...names.map((n) => (s.data as Record<string, unknown>)[n])].map(cell).join(","))].join("\r\n") + "\r\n";
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="${project.slug}-${formId}-submissions.csv"`);
    res.send("\ufeff" + csv);
  }

  @Delete("projects/:id/forms/:formId/submissions/:sid") @HttpCode(204)
  deleteSubmission(@Req() req: AuthedRequest, @Param("id") id: string, @Param("formId") formId: string, @Param("sid") sid: string) {
    this.access.project(req, id, "project:edit");
    const s = this.db.submissions.get(sid);
    if (!s || s.projectId !== id || s.formId !== formId) throw new NotFoundException({ code: "not_found", message: "Submission not found" });
    this.db.submissions.delete(sid);
  }

  /** Published content for exported sites that fetch it at run time. Only items that are published (or scheduled and due) are returned. */
  @Public() @RateLimit(120, 60_000) @Get("public/content/:id")
  publicSiteContent(@Param("id") id: string, @Req() req: AuthedRequest, @Res() res: Response) {
    const p = this.db.projects.get(id);
    if (!p || p.deletedAt) throw new NotFoundException({ code: "not_found", message: "Project not found" });
    const body = JSON.stringify({ content: publishedContent(this.db, id) });
    const etag = `"${createHash("sha1").update(body).digest("hex")}"`;
    res.setHeader("etag", etag);
    res.setHeader("cache-control", "public, max-age=30, stale-while-revalidate=300");
    if (req.headers["if-none-match"] === etag) { res.status(304).end(); return; }
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.send(body);
  }
}
