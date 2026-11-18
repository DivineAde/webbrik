import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// ----- AES-256-GCM for secrets at rest (env vars) -----
const key = () => createHash("sha256").update(process.env.SECRET_KEY ?? "dev-only-insecure-key").digest();
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64")) as [Buffer, Buffer, Buffer];
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

// ----- TOTP (RFC 6238, SHA-1, 6 digits, 30s) -----
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const base32Encode = (buf: Buffer) => { let bits = 0, v = 0, out = ""; for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(v << (5 - bits)) & 31]; return out; };
export const base32Decode = (s: string) => { let bits = 0, v = 0; const out: number[] = []; for (const ch of s.replace(/=+$/, "").toUpperCase()) { const i = B32.indexOf(ch); if (i < 0) throw new Error("bad base32"); v = (v << 5) | i; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
export const newTotpSecret = () => base32Encode(randomBytes(20));
export function totp(secret: string, atMs = Date.now(), digits = 6, step = 30): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / step)));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1]! & 15;
  const code = (((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!) % 10 ** digits;
  return String(code).padStart(digits, "0");
}
export function verifyTotp(secret: string, code: string, atMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((w) => { const a = Buffer.from(totp(secret, atMs + w * 30_000)), b = Buffer.from(code); return a.length === b.length && timingSafeEqual(a, b); });
}
export const otpauthUrl = (email: string, secret: string) => `otpauth://totp/Webbrik:${encodeURIComponent(email)}?secret=${secret}&issuer=Webbrik`;
