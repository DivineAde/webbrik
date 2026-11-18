import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post, Put, Query, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { AssetLibrary, safeFileName, type ObjectStorage } from "@webbrik/assets";
import { PLANS } from "@webbrik/shared";
import { Db } from "../../common/db";
import { Access, parseBody, type AuthedRequest } from "../../common/http";

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");

const upload = z.object({ name: z.string().min(1).max(200), contentBase64: z.string().min(1), mime: z.string().optional(), folder: z.string().max(200).regex(/^\/[\w\-/ ]*$/).default("/") });

@Controller()
export class AssetsController {
  private lib: AssetLibrary;
  constructor(@Inject(Db) private db: Db, @Inject(Access) private access: Access, @Inject(OBJECT_STORAGE) private storage: ObjectStorage) {
    this.lib = new AssetLibrary(storage);
  }

  private used(pid: string) { return this.db.assets.filter((a) => a.projectId === pid); }
  private bytes(b64: string) {
    if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) throw new BadRequestException({ code: "invalid_upload", message: "contentBase64 is not valid base64" });
    return new Uint8Array(Buffer.from(b64, "base64"));
  }

  @Post("projects/:id/assets")
  async upload(@Req() req: AuthedRequest, @Param("id") id: string, @Body() body: unknown) {
    const { project, workspace } = this.access.project(req, id, "project:edit");
    const b = parseBody(upload, body);
    const bytes = this.bytes(b.contentBase64);
    const wsBytes = this.db.assets.filter((a) => this.db.projects.get(a.projectId)?.workspaceId === workspace.id).reduce((n, a) => n + a.sizeBytes, 0);
    if (wsBytes + bytes.length > (PLANS[workspace.plan] ?? PLANS["free"]!).storageMb * 2 ** 20) throw new ForbiddenException({ code: "quota_exceeded", message: "Storage limit reached for your plan" });
    const r = await this.lib.upload(project.id, { name: b.name, declaredMime: b.mime, bytes }, b.folder);
    if (!r.ok) throw new BadRequestException({ code: "invalid_upload", message: r.reason });
    // AssetLibrary keeps its own index; mirror the record into the shared table (id preserved for references).
    const existing = this.db.assets.find((a) => a.projectId === project.id && a.sha256 === r.record.sha256);
    const record = existing ?? this.db.assets.insert({ ...r.record });
    return { asset: record, duplicate: !!existing };
  }

  @Get("projects/:id/assets")
  list(@Req() req: AuthedRequest, @Param("id") id: string, @Query("folder") folder?: string, @Query("q") q?: string) {
    this.access.project(req, id);
    return { assets: this.used(id).filter((a) => (!folder || a.folder === folder) && (!q || a.name.toLowerCase().includes(q.toLowerCase()))) };
  }

  private asset(id: string, aid: string) {
    const a = this.db.assets.get(aid);
    if (!a || a.projectId !== id) throw new NotFoundException({ code: "not_found", message: "Asset not found" });
    return a;
  }

  @Patch("projects/:id/assets/:aid")
  patch(@Req() req: AuthedRequest, @Param("id") id: string, @Param("aid") aid: string, @Body() body: unknown) {
    this.access.project(req, id, "project:edit");
    const a = this.asset(id, aid);
    const b = parseBody(z.object({ name: z.string().min(1).max(200).optional(), altText: z.string().max(500).optional(), folder: upload.shape.folder.optional() }), body);
    this.db.assets.update(a.id, { ...(b.name ? { name: safeFileName(b.name) } : {}), ...(b.altText !== undefined ? { altText: b.altText } : {}), ...(b.folder ? { folder: b.folder } : {}) });
    return { asset: this.db.assets.get(a.id) };
  }

  /** Replace the bytes behind an asset while keeping its id (and so every reference). */
  @Put("projects/:id/assets/:aid/content")
  async replace(@Req() req: AuthedRequest, @Param("id") id: string, @Param("aid") aid: string, @Body() body: unknown) {
    this.access.project(req, id, "project:edit");
    const a = this.asset(id, aid);
    const b = parseBody(upload.pick({ name: true, contentBase64: true, mime: true }), body);
    const probe = await new AssetLibrary(this.storage).upload(`replace-${id}`, { name: b.name, declaredMime: b.mime, bytes: this.bytes(b.contentBase64) });
    if (!probe.ok) throw new BadRequestException({ code: "invalid_upload", message: probe.reason });
    const r = probe.record;
    await this.storage.delete(a.storageKey);
    this.db.assets.update(a.id, { sha256: r.sha256, storageKey: r.storageKey, mime: r.mime, kind: r.kind, sizeBytes: r.sizeBytes, width: r.width, height: r.height });
    return { asset: this.db.assets.get(a.id) };
  }

  @HttpCode(204) @Delete("projects/:id/assets/:aid")
  async remove(@Req() req: AuthedRequest, @Param("id") id: string, @Param("aid") aid: string) {
    const { project } = this.access.project(req, id, "project:edit");
    const a = this.asset(id, aid);
    const doc = this.db.revisions.find((r) => r.projectId === id && r.revision === project.headRevision)!.document;
    const inUse = Object.values(doc.nodes).some((n) => Object.values(n.attributes).includes(`asset:${a.id}`));
    if (inUse) throw new BadRequestException({ code: "asset_in_use", message: "This asset is still used in the project" });
    this.db.assets.delete(a.id);
    if (!this.db.assets.find((x) => x.storageKey === a.storageKey)) await this.storage.delete(a.storageKey);
  }

  /** Authenticated raw delivery with hardening headers; production delivery goes through the CDN. */
  @Get("projects/:id/assets/:aid/raw")
  async raw(@Req() req: AuthedRequest, @Param("id") id: string, @Param("aid") aid: string, @Res() res: Response) {
    this.access.project(req, id);
    const a = this.asset(id, aid);
    const obj = await this.storage.get(a.storageKey);
    if (!obj) throw new NotFoundException({ code: "not_found", message: "Asset data missing" });
    res.setHeader("content-type", obj.mime);
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("content-security-policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    res.setHeader("content-disposition", a.kind === "image" || a.kind === "svg" ? "inline" : `attachment; filename="${a.name}"`);
    res.end(Buffer.from(obj.bytes));
  }
}
