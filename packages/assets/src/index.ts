import { createHash } from "node:crypto";
import type { Document } from "@webbrik/document-model";

export type AssetKind = "image" | "svg" | "video" | "font" | "document";

export interface UploadInput {
  name: string;
  declaredMime?: string;
  bytes: Uint8Array;
}
export type UploadResult =
  | { ok: true; kind: AssetKind; mime: string; ext: string; sizeBytes: number; sha256: string; width?: number; height?: number; safeName: string; bytes: Uint8Array }
  | { ok: false; reason: string };

export const SIZE_LIMITS: Record<AssetKind, number> = { image: 15 * 2 ** 20, svg: 1 * 2 ** 20, video: 200 * 2 ** 20, font: 5 * 2 ** 20, document: 25 * 2 ** 20 };

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

interface Sniffed { kind: AssetKind; mime: string; ext: string[] }

export function sniff(b: Uint8Array): Sniffed | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mime: "image/png", ext: ["png"] };
  if (startsWith(b, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg", ext: ["jpg", "jpeg"] };
  if (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a") return { kind: "image", mime: "image/gif", ext: ["gif"] };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return { kind: "image", mime: "image/webp", ext: ["webp"] };
  if (ascii(b, 0, 4) === "%PDF") return { kind: "document", mime: "application/pdf", ext: ["pdf"] };
  if (ascii(b, 0, 4) === "wOFF") return { kind: "font", mime: "font/woff", ext: ["woff"] };
  if (ascii(b, 0, 4) === "wOF2") return { kind: "font", mime: "font/woff2", ext: ["woff2"] };
  if (startsWith(b, [0, 1, 0, 0])) return { kind: "font", mime: "font/ttf", ext: ["ttf"] };
  if (ascii(b, 0, 4) === "OTTO") return { kind: "font", mime: "font/otf", ext: ["otf"] };
  if (ascii(b, 4, 8) === "ftyp") return { kind: "video", mime: "video/mp4", ext: ["mp4", "m4v"] };
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) return { kind: "video", mime: "video/webm", ext: ["webm"] };
  const head = new TextDecoder().decode(b.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return { kind: "svg", mime: "image/svg+xml", ext: ["svg"] };
  return null;
}

/** Image dimensions for PNG, GIF, JPEG and WebP without decoding. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47]) && b.length >= 24) return { width: dv.getUint32(16), height: dv.getUint32(20) };
  if (ascii(b, 0, 3) === "GIF" && b.length >= 10) return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  if (startsWith(b, [0xff, 0xd8])) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1]!;
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
      i += 2 + dv.getUint16(i + 2);
    }
    return null;
  }
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP" && b.length >= 30) {
    const fmt = ascii(b, 12, 16);
    if (fmt === "VP8X") return { width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)) };
    if (fmt === "VP8 ") return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
    if (fmt === "VP8L") { const bits = dv.getUint32(21, true); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
  }
  return null;
}

const SVG_ELEMENTS = new Set(["svg", "g", "path", "circle", "rect", "ellipse", "line", "polyline", "polygon", "text", "tspan", "defs", "lineargradient", "radialgradient", "stop", "clippath", "mask", "pattern", "title", "desc", "symbol", "use"]);
const DROP_WITH_CONTENT = new Set(["script", "style", "foreignobject", "iframe", "object", "embed", "animate", "set", "animatetransform", "animatemotion", "metadata", "image", "a"]);

/** Allow-list SVG sanitiser: unknown elements and unsafe attributes/URLs are removed; scripts/CSS/foreignObject are dropped with their content. */
export function sanitizeSvg(input: string): string {
  const src = input.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "").replace(/<\?[\s\S]*?\?>/g, "");
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let out = "", last = 0, skipDepth = 0, skipName = "";
  for (let m = tag.exec(src); m; m = tag.exec(src)) {
    const [whole, closing, rawName, rawAttrs, selfClose] = m as unknown as [string, string, string, string, string];
    const name = rawName.toLowerCase();
    const between = src.slice(last, m.index);
    last = m.index + whole.length;
    if (skipDepth > 0) {
      if (name === skipName) skipDepth += closing ? -1 : selfClose ? 0 : 1;
      continue;
    }
    out += between.replace(/</g, "&lt;");
    if (DROP_WITH_CONTENT.has(name)) { if (!closing && !selfClose) { skipDepth = 1; skipName = name; } continue; }
    if (!SVG_ELEMENTS.has(name)) continue;
    if (closing) { out += `</${name}>`; continue; }
    const attrs: string[] = [];
    for (const a of rawAttrs.matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      const n = a[1]!, v = a[2] ?? a[3] ?? a[4] ?? "";
      if (!/^[a-zA-Z][\w:.-]*$/.test(n) || /^on/i.test(n) || n.toLowerCase() === "style") continue;
      if (/^(xlink:)?href$/i.test(n) && !v.startsWith("#")) continue;
      if (/javascript:|data:|vbscript:|expression\(|url\(\s*['"]?(?!#)/i.test(v)) continue;
      attrs.push(`${n}="${v.replace(/"/g, "&quot;")}"`);
    }
    out += `<${rawName}${attrs.length ? " " + attrs.join(" ") : ""}${selfClose ? "/" : ""}>`;
  }
  if (skipDepth === 0) out += src.slice(last).replace(/</g, "&lt;");
  return out.trim();
}

export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const clean = base.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").replace(/^\.+/, "").slice(-100);
  return clean || "file";
}

export const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

/** Validate an upload by content (magic bytes), not by trusting the name or declared type. SVGs are sanitised. */
export function validateUpload(input: UploadInput): UploadResult {
  const { bytes } = input;
  if (bytes.length === 0) return { ok: false, reason: "File is empty" };
  const sniffed = sniff(bytes);
  if (!sniffed) return { ok: false, reason: "Unsupported or unrecognised file type" };
  const ext = (input.name.split(".").pop() ?? "").toLowerCase();
  if (!sniffed.ext.includes(ext)) return { ok: false, reason: `File extension .${ext} does not match its contents (${sniffed.mime})` };
  if (input.declaredMime && input.declaredMime !== sniffed.mime && !(input.declaredMime === "image/jpg" && sniffed.mime === "image/jpeg"))
    return { ok: false, reason: `Declared type ${input.declaredMime} does not match contents (${sniffed.mime})` };
  if (bytes.length > SIZE_LIMITS[sniffed.kind]) return { ok: false, reason: `File exceeds the ${Math.round(SIZE_LIMITS[sniffed.kind] / 2 ** 20)} MB limit for ${sniffed.kind}s` };

  let out = bytes;
  if (sniffed.kind === "svg") {
    const clean = sanitizeSvg(new TextDecoder().decode(bytes));
    if (!/^<svg[\s>]/i.test(clean)) return { ok: false, reason: "SVG has no safe root element" };
    out = new TextEncoder().encode(clean);
  }
  const dims = sniffed.kind === "image" ? imageSize(bytes) : null;
  return { ok: true, kind: sniffed.kind, mime: sniffed.mime, ext: sniffed.ext[0]!, sizeBytes: out.length, sha256: sha256(out), width: dims?.width, height: dims?.height, safeName: safeFileName(input.name), bytes: out };
}

export const storageKey = (projectId: string, hash: string, name: string) => `${projectId}/${hash.slice(0, 2)}/${hash}/${safeFileName(name)}`;

export interface ObjectStorage {
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<{ bytes: Uint8Array; mime: string } | null>;
  delete(key: string): Promise<void>;
}

export class MemoryStorage implements ObjectStorage {
  private m = new Map<string, { bytes: Uint8Array; mime: string }>();
  async put(key: string, bytes: Uint8Array, mime: string) { this.m.set(key, { bytes, mime }); }
  async get(key: string) { return this.m.get(key) ?? null; }
  async delete(key: string) { this.m.delete(key); }
  get size() { return this.m.size; }
}

export interface AssetRecord { id: string; projectId: string; name: string; folder: string; sha256: string; storageKey: string; mime: string; kind: AssetKind; sizeBytes: number; width?: number; height?: number; altText?: string }

/** Content-addressed store: identical bytes in the same project are stored once and reported as duplicates. */
export class AssetLibrary {
  private records = new Map<string, AssetRecord>();
  private n = 0;
  constructor(private storage: ObjectStorage) {}

  async upload(projectId: string, input: UploadInput, folder = "/") {
    const v = validateUpload(input);
    if (!v.ok) return v;
    const existing = [...this.records.values()].find((r) => r.projectId === projectId && r.sha256 === v.sha256);
    if (existing) return { ok: true as const, duplicate: true, record: existing };
    const key = storageKey(projectId, v.sha256, v.safeName);
    await this.storage.put(key, v.bytes, v.mime);
    const record: AssetRecord = { id: `asset_${++this.n}`, projectId, name: v.safeName, folder, sha256: v.sha256, storageKey: key, mime: v.mime, kind: v.kind, sizeBytes: v.sizeBytes, width: v.width, height: v.height };
    this.records.set(record.id, record);
    return { ok: true as const, duplicate: false, record };
  }
  list(projectId: string, folder?: string, q?: string) {
    return [...this.records.values()].filter((r) => r.projectId === projectId && (!folder || r.folder === folder) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));
  }
  get(id: string) { return this.records.get(id); }
  rename(id: string, name: string) { const r = this.records.get(id); if (!r) return false; r.name = safeFileName(name); return true; }
  setAlt(id: string, alt: string) { const r = this.records.get(id); if (!r) return false; r.altText = alt; return true; }
  async remove(id: string, doc?: Document) {
    const r = this.records.get(id);
    if (!r) return { ok: false as const, reason: "Not found" };
    if (doc && assetUsage(doc, id).length) return { ok: false as const, reason: "Asset is still used in the project" };
    this.records.delete(id);
    if (![...this.records.values()].some((x) => x.storageKey === r.storageKey)) await this.storage.delete(r.storageKey);
    return { ok: true as const };
  }
  /** Replace the bytes behind an asset id (keeps references intact). */
  async replace(id: string, input: UploadInput) {
    const r = this.records.get(id);
    if (!r) return { ok: false as const, reason: "Not found" };
    const v = validateUpload(input);
    if (!v.ok) return v;
    const key = storageKey(r.projectId, v.sha256, v.safeName);
    await this.storage.put(key, v.bytes, v.mime);
    Object.assign(r, { sha256: v.sha256, storageKey: key, mime: v.mime, kind: v.kind, sizeBytes: v.sizeBytes, width: v.width, height: v.height });
    return { ok: true as const, record: r };
  }
}

/** Assets are referenced from documents as `asset:<id>` in attributes. Returns the node ids using the asset. */
export function assetUsage(doc: Document, assetId: string): string[] {
  const ref = `asset:${assetId}`;
  return Object.values(doc.nodes).filter((n) => Object.values(n.attributes).some((v) => v === ref)).map((n) => n.id);
}

/** Responsive delivery: widths → srcset against an image-transform URL pattern. */
export function buildSrcSet(baseUrl: string, widths: number[], maxWidth?: number): { srcset: string; sizes: string } {
  const ws = [...new Set(widths)].filter((w) => w > 0 && (!maxWidth || w <= maxWidth)).sort((a, b) => a - b);
  const u = (w: number) => `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}w=${w}`;
  return { srcset: ws.map((w) => `${u(w)} ${w}w`).join(", "), sizes: "(max-width: 768px) 100vw, 50vw" };
}
