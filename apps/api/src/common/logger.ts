import { ConsoleLogger, Logger } from "@nestjs/common";

/** Nest prints one line per route and per module at start-up; the banner in main.ts replaces that noise. */
const QUIET = new Set(["InstanceLoader", "RoutesResolver", "RouterExplorer", "NestFactory", "NestApplication"]);

export class ApiLogger extends ConsoleLogger {
  override log(message: unknown, ...rest: unknown[]) {
    const ctx = rest[rest.length - 1];
    if (typeof ctx === "string" && QUIET.has(ctx)) return;
    super.log(message, ...rest);
  }
}

/** Log levels from LOG_LEVEL (error | warn | log | debug); silent under test. */
export function loggerFromEnv() {
  if (process.env.NODE_ENV === "test") return false as const;
  const level = process.env.LOG_LEVEL ?? "log";
  const levels = (level === "debug" ? ["error", "warn", "log", "debug"] : level === "warn" ? ["error", "warn"] : level === "error" ? ["error"] : ["error", "warn", "log"]) as ("error" | "warn" | "log" | "debug")[];
  return new ApiLogger("Webbrik", { logLevels: levels });
}

/** Express middleware: one line per request with method, path, status and time. Polling endpoints stay quiet unless LOG_LEVEL=debug. */
export function requestLogger() {
  const log = new Logger("HTTP");
  const verbose = process.env.LOG_LEVEL === "debug";
  return (req: { method: string; originalUrl?: string; url?: string }, res: { statusCode: number; on(e: string, f: () => void): void }, next: () => void) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const path = (req.originalUrl ?? req.url ?? "").split("?")[0]!;
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      if (!verbose && res.statusCode < 400 && req.method === "GET" && /\/(ops|health)$|\/realtime/.test(path)) return;
      const line = `${req.method} ${path} ${res.statusCode} ${ms < 10 ? ms.toFixed(1) : Math.round(ms)}ms`;
      if (res.statusCode >= 500) log.error(line); else if (res.statusCode >= 400) log.warn(line); else log.log(line);
    });
    next();
  };
}
