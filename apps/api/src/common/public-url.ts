/** Public origin of this API, as visitors' browsers reach it: PUBLIC_API_URL if set, otherwise the address the request came in on. */
export function publicApiUrl(req?: { protocol?: string; get?: (h: string) => string | undefined; headers?: Record<string, unknown> }): string {
  const env = process.env["PUBLIC_API_URL"];
  if (env) return env.replace(/\/+$/, "");
  const host = req?.get?.("host");
  if (!host) return "";
  const proto = String(req?.headers?.["x-forwarded-proto"] ?? req?.protocol ?? "http").split(",")[0];
  return `${proto}://${host}`;
}
