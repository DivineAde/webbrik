import type { Deployment, DeploymentProvider, DeploymentRequest, DomainStatus } from "./index";

/** In-memory provider for tests and local development. */
export class MemoryProvider implements DeploymentProvider {
  readonly name = "memory";
  private deployments = new Map<string, Deployment>();
  private logs = new Map<string, string[]>();
  private domains = new Set<string>();
  private n = 0;
  /** Uploaded artifacts per deployment, for tests and local inspection. */
  readonly files = new Map<string, Record<string, string>>();

  async createDeployment(req: DeploymentRequest): Promise<Deployment> {
    const id = `mem_${++this.n}`;
    const d: Deployment = {
      id,
      providerId: id,
      providerName: this.name,
      status: "ready",
      target: req.target,
      url: `https://${req.projectSlug}-${id}.example.test`,
      createdAt: new Date().toISOString(),
    };
    this.deployments.set(id, d);
    this.files.set(id, req.files);
    this.logs.set(id, [`Uploaded ${Object.keys(req.files).length} files`]);
    return d;
  }
  async getDeployment(id: string) {
    const d = this.deployments.get(id);
    if (!d) throw new Error("Deployment not found");
    return d;
  }
  async getLogs(id: string) {
    return this.logs.get(id) ?? [];
  }
  async rollback(_slug: string, id: string) {
    const d = await this.getDeployment(id);
    const promoted = { ...d, target: "production" as const };
    this.deployments.set(id, promoted);
    return promoted;
  }
  async addDomain(_slug: string, domain: string): Promise<DomainStatus> {
    this.domains.add(domain);
    return { domain, verified: false, dnsInstructions: [{ type: "CNAME", name: domain, value: "cname.example.test" }] };
  }
  async verifyDomain(_slug: string, domain: string): Promise<DomainStatus> {
    return { domain, verified: this.domains.has(domain), dnsInstructions: [] };
  }
  async removeDomain(_slug: string, domain: string) {
    this.domains.delete(domain);
  }
  async setEnv() {}
  async healthCheck() {
    return true;
  }
}
