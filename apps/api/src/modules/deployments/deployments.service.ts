import type { DeploymentProvider, DeploymentTarget } from "@webbrik/deployment";
import { exportStatic } from "@webbrik/exporter";
import type { Document } from "@webbrik/document-model";
import type { ContentData } from "@webbrik/renderer";

export const DEPLOY_PROVIDER = Symbol("DEPLOY_PROVIDER");

/** Depends on the DeploymentProvider interface only; the concrete provider is injected. */
export class DeploymentsService {
  constructor(private provider: DeploymentProvider) {}

  async publish(projectId: string, projectSlug: string, doc: Document, target: DeploymentTarget, injectHead?: string, content?: ContentData, forms?: { endpoint: string; projectId: string }) {
    const { files, warnings } = exportStatic(doc, { injectHead, content, forms });
    const deployment = await this.provider.createDeployment({ projectId, projectSlug, target, files });
    return { deployment, warnings };
  }
}
