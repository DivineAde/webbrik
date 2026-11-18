import "reflect-metadata";
import { Logger, Module, type DynamicModule, type Provider } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { loggerFromEnv, requestLogger } from "./common/logger";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, type Express } from "express";
import { type ObjectStorage } from "@webbrik/assets";
import { objectStorageFromEnv } from "./common/s3-storage";
import { MemoryProvider, VercelProvider, type DeploymentProvider } from "@webbrik/deployment";
import { Db } from "./common/db";
import { Access, AuthGuard, ErrorFilter, RateLimitGuard } from "./common/http";
import { MAILER, OutboxMailer, mailerFromEnv, type Mailer } from "./common/mailer";
import { WriteThroughInterceptor } from "./common/write-through";
import { PERSISTENCE, Persistence, type RowStore } from "./common/persistence";
import { AiController, AI_PROVIDER, anthropicProvider, type AiProvider } from "./modules/ai/ai.controller";
import { AssetsController, OBJECT_STORAGE } from "./modules/assets/assets.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { OAUTH_PROVIDERS, githubProvider, googleProvider, type OAuthProvider } from "./modules/auth/oauth";
import { ContentController } from "./modules/content/content.controller";
import { DeploymentsController } from "./modules/deployments/deployments.controller";
import { DEPLOY_PROVIDER } from "./modules/deployments/deployments.service";
import { HealthController } from "./modules/health/health.controller";
import { InternalController } from "./modules/projects/internal.controller";
import { Realtime } from "./common/realtime";
import { CollabHub } from "./modules/projects/documents.service";
import { DocumentsController } from "./modules/projects/documents.controller";
import { ProjectsController } from "./modules/projects/projects.controller";
import { BillingController, PAYSTACK, type PaystackSetup } from "./modules/billing/billing.controller";
import { HttpPaystack, paystackConfigFromEnv } from "./common/paystack";
import { WorkspacesController } from "./modules/workspaces/workspaces.controller";

export interface AppOverrides {
  db?: Db;
  mailer?: Mailer;
  oauth?: Record<string, OAuthProvider>;
  deploy?: DeploymentProvider;
  storage?: ObjectStorage;
  ai?: AiProvider | null;
  /** Paystack client + pricing. Omit to read PAYSTACK_* from the environment; null disables online payments. */
  paystack?: PaystackSetup | null;
  /** Durable storage for the in-memory tables. Omit for ephemeral data (tests, local trials). */
  store?: RowStore | null;
  /** Several API instances share the database: document writes wait for the database (default: MULTI_INSTANCE=1). */
  multiInstance?: boolean;
}

function defaultOAuth(): Record<string, OAuthProvider> {
  const o: Record<string, OAuthProvider> = {};
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) o["github"] = githubProvider(process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET);
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) o["google"] = googleProvider(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  return o;
}

@Module({})
export class AppModule {
  static register(o: AppOverrides = {}, persistence: Persistence | null = null): DynamicModule {
    const db = o.db ?? new Db();
    const providers: Provider[] = [
      { provide: Db, useValue: db },
      Access,
      { provide: CollabHub, useValue: new CollabHub(db) },
      Realtime,
      { provide: PERSISTENCE, useValue: persistence },
      { provide: MAILER, useValue: o.mailer ?? mailerFromEnv() ?? new OutboxMailer() },
      { provide: PAYSTACK, useValue: o.paystack === undefined ? (() => { const c = paystackConfigFromEnv(); return c ? { client: new HttpPaystack(c), config: c } : null; })() : o.paystack },
      { provide: OAUTH_PROVIDERS, useValue: o.oauth ?? defaultOAuth() },
      { provide: DEPLOY_PROVIDER, useValue: o.deploy ?? (process.env.VERCEL_TOKEN ? new VercelProvider({ token: process.env.VERCEL_TOKEN, teamId: process.env.VERCEL_TEAM_ID }) : new MemoryProvider()) },
      { provide: OBJECT_STORAGE, useValue: o.storage ?? objectStorageFromEnv() },
      { provide: AI_PROVIDER, useValue: o.ai === undefined ? (process.env.ANTHROPIC_API_KEY ? anthropicProvider(process.env.ANTHROPIC_API_KEY) : null) : o.ai },
      // Nest calls onApplicationShutdown on app.close(): flush unsaved rows and close the store.
      ...(persistence ? [{ provide: "PERSISTENCE_LIFECYCLE", useValue: { onApplicationShutdown: () => persistence.close() } }] : []),
      ...(persistence?.writeThrough ? [{ provide: APP_INTERCEPTOR, useClass: WriteThroughInterceptor }] : []),
      { provide: APP_GUARD, useClass: RateLimitGuard },
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: APP_FILTER, useClass: ErrorFilter },
    ];
    return { module: AppModule, controllers: [HealthController, InternalController, AuthController, WorkspacesController, ProjectsController, DocumentsController, DeploymentsController, AssetsController, ContentController, AiController, BillingController], providers };
  }
}

export async function createApp(o: AppOverrides = {}) {
  const db = o.db ?? new Db();
  const persistence = o.store ? new Persistence(db, o.store, { writeThrough: o.multiInstance ?? process.env.MULTI_INSTANCE === "1" }) : null;
  if (persistence) await persistence.load();
  const app = await NestFactory.create(AppModule.register({ ...o, db }, persistence), { bodyParser: false, logger: loggerFromEnv() });
  const http = app.getHttpAdapter().getInstance() as Express;
  http.disable("x-powered-by");
  if (process.env.NODE_ENV !== "test" && process.env.LOG_REQUESTS !== "0") app.use(requestLogger());
  app.use(json({ limit: "30mb", verify: (req: { url?: string; rawBody?: Buffer }, _res: unknown, buf: Buffer) => { if (req.url?.includes("/billing/paystack/webhook")) req.rawBody = buf; } }));
  app.use((_req: unknown, res: { setHeader(k: string, v: string): void }, next: () => void) => {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("cache-control", "no-store");
    next();
  });
  if (persistence) {
    // Any request that might have changed data schedules a (debounced) write to the store.
    app.use((req: { method: string }, res: { on(e: string, f: () => void): void }, next: () => void) => {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) res.on("finish", () => persistence.schedule());
      next();
    });
  }
  // Published sites call these from their own domains (form posts, live content): open to any origin, never with cookies.
  app.use((req: { path: string; method: string }, res: { setHeader(k: string, v: string): void; status(c: number): { end(): void } }, next: () => void) => {
    if (/^\/v1\/public\/(forms|content|projects)\//.test(req.path)) {
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type");
      res.setHeader("access-control-max-age", "600");
      if (req.method === "OPTIONS") { res.status(204).end(); return; }
    }
    next();
  });
  app.setGlobalPrefix("v1");
  app.enableCors({ origin: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(","), credentials: true, allowedHeaders: ["content-type", "authorization", "x-requested-with"] });
  // WebSocket push (hints only; see common/realtime.ts). Attaches to the same HTTP server, no extra port.
  const realtime = app.get(Realtime);
  await app.init();
  realtime.attach(app.getHttpServer(), db, persistence, (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(","));
  return app;
}

export function setupSwagger(app: Awaited<ReturnType<typeof createApp>>) {
  // Swagger reads decorator type metadata, which esbuild-based runners (tsx/vitest) don't emit. Docs are optional: never block startup.
  try {
    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, new DocumentBuilder().setTitle("Webbrik API").setVersion("1").addBearerAuth().build()));
  } catch (e) {
    new Logger("Docs").log("Swagger UI at /docs is only available in the compiled build (pnpm --filter @webbrik/api build, then node dist/main.js).");
  }
}
