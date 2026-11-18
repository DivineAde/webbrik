import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Load the repo-root .env (API_URL, NEXT_PUBLIC_*) without overriding variables that are already set.
const rootEnv = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ["@webbrik/component-system", "@webbrik/quality", "@webbrik/editor-core", "@webbrik/collaboration", "@webbrik/css-engine", "@webbrik/design-system", "@webbrik/document-model", "@webbrik/exporter", "@webbrik/renderer", "@webbrik/shared"],
  reactStrictMode: true,
  devIndicators: false,
  // Same-origin API: cookies stay first-party and no CORS is needed in production.
  async rewrites() {
    const api = process.env.API_URL ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${api}/v1/:path*` }];
  },
};
