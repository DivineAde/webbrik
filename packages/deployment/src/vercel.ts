import { createHash } from "node:crypto";
import type { Deployment, DeploymentProvider, DeploymentRequest, DeploymentStatus, DomainStatus } from "./index";
import { withRetry } from "./retry";

interface VercelOptions {
  token: string;
  teamId?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const STATUS: Record<string, DeploymentStatus> = {
  QUEUED: "queued",
  INITIALIZING: "queued",
  BUILDING: "building",
  READY: "ready",
  ERROR: "error",
  CANCELED: "canceled",
};

/**
 * Vercel implementation of DeploymentProvider (REST API).
 * NOTE: not exercised against the live API in this repo; see docs/engineering/known-gaps.md.
 */
export class VercelProvider implements DeploymentProvider {
  readonly name = "vercel";
  private base: string;
  private f: typeof fetch;

  constructor(private opts: VercelOptions) {
    this.base = opts.baseUrl ?? "https://api.vercel.com";
    this.f = opts.fetchImpl ?? fetch;
  }

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = new URL(this.base + path);
    if (this.opts.teamId) url.searchParams.set("teamId", this.opts.teamId);
    return withRetry(
      async () => {
        const res = await this.f(url, {
          ...init,
          headers: { Authorization: `Bearer ${this.opts.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
        });
        if (!res.ok) {
          const err = new Error(`Vercel ${res.status}: ${await res.text()}`) as Error & { status: number };
          err.status = res.status;
          throw err;
        }
        return (res.status === 204 ? undefined : await res.json()) as T;
      },
      { shouldRetry: (e) => ((e as { status?: number }).status ?? 500) >= 500 || (e as { status?: number }).status === 429 },
    );
  }

  private map(d: any, target: Deployment["target"] = "preview"): Deployment {
    return {
      id: d.id ?? d.uid,
      providerId: d.id ?? d.uid,
      providerName: this.name,
      status: STATUS[d.readyState ?? d.status] ?? "queued",
      target: d.target === "production" ? "production" : target,
      url: d.url ? `https://${d.url}` : undefined,
      createdAt: new Date(d.createdAt ?? Date.now()).toISOString(),
      error: d.errorMessage,
    };
  }

  async createDeployment(r: DeploymentRequest): Promise<Deployment> {
    const files = Object.entries(r.files).map(([file, data]) => ({
      file,
      data: Buffer.from(data).toString("base64"),
      encoding: "base64",
      sha: createHash("sha1").update(data).digest("hex"),
    }));
    const body = {
      name: r.projectSlug,
      files: files.map(({ file, data, encoding }) => ({ file, data, encoding })),
      target: r.target === "production" ? "production" : undefined,
      projectSettings: { framework: null },
    };
    return this.map(await this.req("/v13/deployments", { method: "POST", body: JSON.stringify(body) }), r.target);
  }

  async getDeployment(id: string) {
    return this.map(await this.req(`/v13/deployments/${encodeURIComponent(id)}`));
  }

  async getLogs(id: string) {
    const res = await this.req<{ events?: { text?: string }[] } | { text?: string }[]>(`/v3/deployments/${encodeURIComponent(id)}/events`);
    const events = Array.isArray(res) ? res : (res.events ?? []);
    return events.map((e) => e.text ?? "").filter(Boolean);
  }

  async rollback(slug: string, id: string) {
    await this.req(`/v9/projects/${encodeURIComponent(slug)}/promote/${encodeURIComponent(id)}`, { method: "POST" });
    return this.getDeployment(id);
  }

  async addDomain(slug: string, domain: string): Promise<DomainStatus> {
    await this.req(`/v10/projects/${encodeURIComponent(slug)}/domains`, { method: "POST", body: JSON.stringify({ name: domain }) });
    return this.verifyDomain(slug, domain);
  }

  async verifyDomain(slug: string, domain: string): Promise<DomainStatus> {
    const d = await this.req<{ verified?: boolean }>(`/v9/projects/${encodeURIComponent(slug)}/domains/${encodeURIComponent(domain)}`);
    const apex = domain.split(".").length <= 2;
    return {
      domain,
      verified: !!d.verified,
      dnsInstructions: d.verified
        ? []
        : [apex ? { type: "A", name: "@", value: "76.76.21.21" } : { type: "CNAME", name: domain.split(".")[0]!, value: "cname.vercel-dns.com" }],
    };
  }

  async removeDomain(slug: string, domain: string) {
    await this.req(`/v9/projects/${encodeURIComponent(slug)}/domains/${encodeURIComponent(domain)}`, { method: "DELETE" });
  }

  async setEnv(slug: string, env: Record<string, string>) {
    for (const [key, value] of Object.entries(env))
      await this.req(`/v10/projects/${encodeURIComponent(slug)}/env?upsert=true`, {
        method: "POST",
        body: JSON.stringify({ key, value, type: "encrypted", target: ["production", "preview"] }),
      });
  }

  async healthCheck(url: string) {
    try {
      const res = await this.f(url, { method: "HEAD" });
      return res.ok;
    } catch {
      return false;
    }
  }
}
