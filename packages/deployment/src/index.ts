export type DeploymentStatus = "queued" | "building" | "ready" | "error" | "canceled";
export type DeploymentTarget = "production" | "preview";

export interface DeploymentRequest {
  projectId: string;
  projectSlug: string;
  target: DeploymentTarget;
  /** path -> contents (static artifacts from @webbrik/exporter or the build pipeline) */
  files: Record<string, string>;
  env?: Record<string, string>;
}

export interface Deployment {
  id: string;
  providerId: string;
  providerName: string;
  status: DeploymentStatus;
  target: DeploymentTarget;
  url?: string;
  createdAt: string;
  error?: string;
}

export interface DomainStatus {
  domain: string;
  verified: boolean;
  /** DNS records the user must create, when unverified. */
  dnsInstructions: { type: "A" | "CNAME" | "TXT"; name: string; value: string }[];
}

/**
 * Webbrik depends on this interface only. Vercel, Cloudflare Pages, S3+CDN etc. implement it.
 */
export interface DeploymentProvider {
  readonly name: string;
  createDeployment(req: DeploymentRequest): Promise<Deployment>;
  getDeployment(providerId: string): Promise<Deployment>;
  getLogs(providerId: string): Promise<string[]>;
  /** Promote a previous deployment to production. */
  rollback(projectSlug: string, providerId: string): Promise<Deployment>;
  addDomain(projectSlug: string, domain: string): Promise<DomainStatus>;
  verifyDomain(projectSlug: string, domain: string): Promise<DomainStatus>;
  removeDomain(projectSlug: string, domain: string): Promise<void>;
  setEnv(projectSlug: string, env: Record<string, string>): Promise<void>;
  healthCheck(url: string): Promise<boolean>;
}

export { VercelProvider } from "./vercel";
export { MemoryProvider } from "./memory";
export { withRetry, type RetryOptions } from "./retry";
