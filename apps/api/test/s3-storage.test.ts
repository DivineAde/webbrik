import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { S3Storage, s3ConfigFromEnv, objectStorageFromEnv } from "../src/common/s3-storage";
import { MemoryStorage } from "@webbrik/assets";

/** A tiny S3-compatible server (path-style PUT/GET/DELETE/HEAD) so the real AWS client code runs end to end. */
function fakeS3(opts: { reject?: boolean } = {}) {
  const objects = new Map<string, { body: Buffer; type: string }>();
  const seen: { method: string; headers: Record<string, string | string[] | undefined> }[] = [];
  const server = createServer((req, res) => {
    seen.push({ method: req.method ?? "", headers: req.headers });
    const path = decodeURIComponent((req.url ?? "").split("?")[0]!);
    const [, bucket, ...rest] = path.split("/"); const key = rest.join("/");
    if (opts.reject) { res.writeHead(403, { "content-type": "application/xml" }); res.end('<Error><Code>InvalidAccessKeyId</Code></Error>'); return; }
    if (bucket !== "test-bucket") { res.writeHead(404, { "content-type": "application/xml" }); res.end('<Error><Code>NoSuchBucket</Code></Error>'); return; }
    if (!key) { res.writeHead(200); res.end(); return; }
    if (req.method === "PUT") { const c: Buffer[] = []; req.on("data", (d) => c.push(d)); req.on("end", () => { objects.set(key, { body: Buffer.concat(c), type: String(req.headers["content-type"] ?? "") }); res.writeHead(200, { etag: '"x"' }); res.end(); }); return; }
    if (req.method === "GET") { const o = objects.get(key); if (!o) { res.writeHead(404, { "content-type": "application/xml" }); res.end('<Error><Code>NoSuchKey</Code></Error>'); return; } res.writeHead(200, { "content-type": o.type, "content-length": o.body.length }); res.end(o.body); return; }
    if (req.method === "DELETE") { objects.delete(key); res.writeHead(204); res.end(); return; }
    res.writeHead(405); res.end();
  });
  return { server, objects, seen };
}
const listen = (s: Server) => new Promise<string>((r) => s.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)));

describe("S3Storage", () => {
  const f = fakeS3(); let endpoint = "";
  beforeAll(async () => { endpoint = await listen(f.server); });
  afterAll(() => { f.server.close(); });
  const make = (bucket = "test-bucket") => new S3Storage({ endpoint, region: "us-west-004", bucket, accessKeyId: "id", secretAccessKey: "secret" });

  it("stores, reads back and deletes an object", async () => {
    const s = make(); await s.check();
    const bytes = new Uint8Array([1, 2, 3, 250]);
    await s.put("p1/ab/abc/logo.png", bytes, "image/png");
    expect(f.objects.get("p1/ab/abc/logo.png")?.type).toBe("image/png");
    const got = await s.get("p1/ab/abc/logo.png");
    expect(got?.mime).toBe("image/png"); expect([...got!.bytes]).toEqual([1, 2, 3, 250]);
    await s.delete("p1/ab/abc/logo.png");
    expect(await s.get("p1/ab/abc/logo.png")).toBeNull();
  });
  it("returns null for a missing object", async () => { expect(await make().get("nope/key")).toBeNull(); });
  it("does not send the checksum headers Backblaze rejects", async () => {
    await make().put("k", new Uint8Array([1]), "text/plain");
    const put = f.seen.filter((x) => x.method === "PUT").at(-1)!;
    expect(Object.keys(put.headers).filter((h) => h.startsWith("x-amz-checksum") || h === "x-amz-sdk-checksum-algorithm")).toEqual([]);
  });
  it("explains a missing bucket", async () => { await expect(make("other").check()).rejects.toThrow(/bucket was not found/i); });
  it("explains rejected keys", async () => {
    const bad = fakeS3({ reject: true }); const url = await listen(bad.server);
    await expect(new S3Storage({ endpoint: url, region: "r", bucket: "test-bucket", accessKeyId: "x", secretAccessKey: "y" }).check()).rejects.toThrow(/keys were rejected/i);
    bad.server.close();
  });
});

describe("storage config", () => {
  const env = { S3_ENDPOINT: "https://s3.us-west-004.backblazeb2.com", S3_BUCKET: "b", S3_ACCESS_KEY: "k", S3_SECRET_KEY: "s" } as NodeJS.ProcessEnv;
  it("reads Backblaze settings and infers the region", () => { expect(s3ConfigFromEnv(env)).toMatchObject({ region: "us-west-004", bucket: "b", forcePathStyle: true }); });
  it("honours an explicit region", () => { expect(s3ConfigFromEnv({ ...env, S3_REGION: "eu-central-003" })?.region).toBe("eu-central-003"); });
  it("falls back to memory when anything is missing", () => { expect(objectStorageFromEnv({ ...env, S3_SECRET_KEY: "" })).toBeInstanceOf(MemoryStorage); expect(objectStorageFromEnv(env)).toBeInstanceOf(S3Storage); });
});
