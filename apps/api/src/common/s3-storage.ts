import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { MemoryStorage, type ObjectStorage } from "@webbrik/assets";

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  /** Backblaze B2: the application key's keyID. */
  accessKeyId: string;
  /** Backblaze B2: the application key itself. */
  secretAccessKey: string;
  /** Path-style addressing (https://endpoint/bucket/key). Works on Backblaze B2, MinIO and R2. Default true. */
  forcePathStyle?: boolean;
}

/** Object storage over the S3 API. Built for Backblaze B2 (and works with MinIO, R2, S3). */
export class S3Storage implements ObjectStorage {
  private client: S3Client;
  constructor(private cfg: S3Config) {
    this.client = new S3Client({
      endpoint: cfg.endpoint, region: cfg.region, forcePathStyle: cfg.forcePathStyle ?? true,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      // Backblaze rejects the extra checksum headers newer SDKs add by default.
      requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
      maxAttempts: 3,
    });
  }
  get bucket() { return this.cfg.bucket; }
  async put(key: string, bytes: Uint8Array, mime: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: bytes, ContentType: mime, ContentLength: bytes.length }));
  }
  async get(key: string) {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      if (!r.Body) return null;
      return { bytes: await r.Body.transformToByteArray(), mime: r.ContentType ?? "application/octet-stream" };
    } catch (e) {
      const x = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (x.name === "NoSuchKey" || x.name === "NotFound" || x.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }
  /** Fails with a readable reason when the bucket, keys or endpoint are wrong. */
  async check() {
    try { await this.client.send(new HeadBucketCommand({ Bucket: this.cfg.bucket })); }
    catch (e) { throw new Error(hint(e)); }
  }
}

function hint(e: unknown) {
  const x = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number }; code?: string };
  const status = x.$metadata?.httpStatusCode;
  if (status === 403 || x.name === "AccessDenied" || x.name === "InvalidAccessKeyId" || x.name === "SignatureDoesNotMatch") return "The storage keys were rejected. Check S3_ACCESS_KEY (the keyID), S3_SECRET_KEY (the application key), and that the key is allowed to use this bucket.";
  if (status === 404 || x.name === "NoSuchBucket" || x.name === "NotFound") return "The bucket was not found. Check S3_BUCKET and that S3_ENDPOINT is the endpoint shown for that bucket.";
  if (x.code === "ENOTFOUND" || /ENOTFOUND|getaddrinfo/.test(x.message ?? "")) return "The storage endpoint could not be found. Check S3_ENDPOINT.";
  return `Could not reach object storage: ${x.message ?? x.name ?? "unknown error"}`;
}

export function s3ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): S3Config | null {
  const { S3_ENDPOINT: endpoint, S3_BUCKET: bucket, S3_ACCESS_KEY: accessKeyId, S3_SECRET_KEY: secretAccessKey } = env;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  // Backblaze endpoints look like https://s3.us-west-004.backblazeb2.com; the region is the middle part.
  const region = env.S3_REGION || /^https?:\/\/s3\.([^.]+)\./.exec(endpoint)?.[1] || "us-east-1";
  return { endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle: env.S3_FORCE_PATH_STYLE !== "0" };
}

/** S3/Backblaze when configured, otherwise memory (files are lost on restart). */
export function objectStorageFromEnv(env: NodeJS.ProcessEnv = process.env): ObjectStorage {
  const cfg = s3ConfigFromEnv(env);
  return cfg ? new S3Storage(cfg) : new MemoryStorage();
}
export const describeObjectStorage = (s: ObjectStorage) => (s instanceof S3Storage ? `bucket ${s.bucket} (S3 compatible)` : "in memory (uploaded files are lost on restart)");
