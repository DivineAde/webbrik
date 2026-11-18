import "./load-env"; // must stay first: loads .env before anything reads process.env
import { Logger } from "@nestjs/common";
import { createApp, setupSwagger } from "./app.module";
import { S3Storage, describeObjectStorage, objectStorageFromEnv } from "./common/s3-storage";
import { smtpConfigFromEnv } from "./common/mailer";
import { paystackConfigFromEnv } from "./common/paystack";
import { storeFromEnv } from "./common/stores";

const log = new Logger("Bootstrap");
const prod = process.env.NODE_ENV === "production";

/** Where the data lives, described without leaking a password. */
function describeStorage() {
  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) { try { const u = new URL(url); return `PostgreSQL ${u.host}${u.pathname}`; } catch { return "PostgreSQL"; } }
  if (process.env.SQLITE_PATH) return `SQLite ${process.env.SQLITE_PATH}`;
  return "in memory (data is lost on restart)";
}

function hint(message: string) {
  if (/password authentication failed|authentication failed/i.test(message)) return "The database rejected the username or password in DATABASE_URL.";
  if (/ENOTFOUND|getaddrinfo/i.test(message)) return "The database host in DATABASE_URL could not be found. Check the host name and your internet connection.";
  if (/ECONNREFUSED|ETIMEDOUT|timeout/i.test(message)) return "Could not reach the database. Is it running, and does DATABASE_URL have the right host and port? Neon free databases may need a few seconds to wake up; try again.";
  if (/SSL|certificate|self.signed/i.test(message)) return "The SSL connection failed. Neon needs ?sslmode=require at the end of DATABASE_URL.";
  if (/EADDRINUSE/i.test(message)) return `Port ${process.env.PORT ?? 4000} is already in use. Stop the other process or set a different PORT.`;
  return undefined;
}

async function bootstrap() {
  if (prod && !process.env.SECRET_KEY) throw new Error("SECRET_KEY must be set in production");
  if (prod && !smtpConfigFromEnv() && process.env.ALLOW_OUTBOX !== "1") throw new Error("Set SMTP_URL (or SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS) and MAIL_FROM so verification, reset and invitation emails are delivered, or ALLOW_OUTBOX=1 to discard them");
  if (prod && !process.env.APP_URL) throw new Error("APP_URL must be set (the public web address used in email links)");
  const store = storeFromEnv();
  if (!store) {
    if (prod && process.env.ALLOW_EPHEMERAL !== "1") throw new Error("Set DATABASE_URL (postgres://…) or SQLITE_PATH so data survives restarts, or ALLOW_EPHEMERAL=1 to run without persistence");
    log.warn("No DATABASE_URL or SQLITE_PATH set: data is kept in memory and will be lost on restart.");
  } else log.log(`Connecting to ${describeStorage()} …`);
  const objects = objectStorageFromEnv();
  if (objects instanceof S3Storage) { await objects.check(); log.log(`Connected to object storage: ${describeObjectStorage(objects)}`); }
  else if (prod && process.env.ALLOW_EPHEMERAL !== "1") throw new Error("Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY (Backblaze B2) so uploaded files survive restarts, or ALLOW_EPHEMERAL=1 to keep them in memory");
  else log.warn("No S3_* object storage set: uploaded files are kept in memory and will be lost on restart.");
  const app = await createApp({ store, storage: objects });
  for (const sig of ["SIGTERM", "SIGINT"] as const) process.once(sig, () => void app.close().then(() => process.exit(0)));
  setupSwagger(app);
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  const mail = smtpConfigFromEnv();
  const pay = (() => { try { return paystackConfigFromEnv(); } catch { return null; } })();
  log.log(`Webbrik API is running on http://localhost:${port}/v1  (${prod ? "production" : process.env.NODE_ENV ?? "development"})`);
  log.log(`  Storage:    ${describeStorage()}`);
  log.log(`  Files:      ${describeObjectStorage(objects)}`);
  log.log(`  Web origin: ${process.env.WEB_ORIGIN ?? "http://localhost:3000"}`);
  log.log(`  Email:      ${mail ? `SMTP via ${mail.host}:${mail.port}` : "not configured (emails are not delivered)"}`);
  log.log(`  Payments:   ${pay ? "Paystack" : "not configured"}`);
  log.log(`  AI:         ${process.env.ANTHROPIC_API_KEY ? "Anthropic" : "not configured"}   Publishing: ${process.env.VERCEL_TOKEN ? "Vercel" : "not configured (simulated)"}`);
  log.log(`  Requests are logged below. LOG_LEVEL=debug shows everything, LOG_LEVEL=warn only problems.`);
}

bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  log.error(`Failed to start: ${message}`, err instanceof Error ? err.stack : undefined);
  const h = hint(message);
  if (h) log.error(h);
  process.exit(1);
});
