import { z } from "zod";
import type { Document, Operation } from "@webbrik/document-model";

export const PERMISSIONS = ["document:read", "document:write", "network:fetch", "ui:inspector", "ui:elements", "data:source", "workflow:action"] as const;
export type PluginPermission = (typeof PERMISSIONS)[number];

export const ManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$/, "invalid plugin id"),
  name: z.string().min(1).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  /** Webbrik versions this plugin supports, e.g. "^0.1.0" */
  webbrik: z.string(),
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
  description: z.string().max(500).optional(),
});
export type PluginManifest = z.infer<typeof ManifestSchema>;

export interface ElementContribution { tag: string; label: string; category: string; text?: string; styles?: Record<string, string> }
export interface InspectorControl { id: string; label: string; property: string; kind: "text" | "number" | "select" | "color"; options?: string[]; appliesTo?: string[] }
export interface DataSourceContribution { id: string; label: string; fetch: (query: Record<string, unknown>) => Promise<Record<string, unknown>[]> }
export interface WorkflowAction { id: string; label: string; run: (input: Record<string, unknown>) => Promise<unknown> }

export interface Contributions {
  elements: ElementContribution[];
  inspectorControls: InspectorControl[];
  dataSources: DataSourceContribution[];
  workflowActions: WorkflowAction[];
}

/** The only surface a plugin sees. Each method exists only if the manifest declared the permission. */
export interface PluginContext {
  readonly manifest: PluginManifest;
  document: { read(): Document };
  propose: (summary: string, ops: Operation[]) => void;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  contribute: {
    element(c: ElementContribution): void;
    inspectorControl(c: InspectorControl): void;
    dataSource(c: DataSourceContribution): void;
    workflowAction(c: WorkflowAction): void;
  };
}

export interface Plugin {
  manifest: unknown;
  activate(ctx: PluginContext): void | Promise<void>;
}
export const definePlugin = (p: Plugin): Plugin => p;

export class PluginError extends Error {}

/** Minimal range check: exact, ^x.y.z, ~x.y.z, >=x.y.z. */
export function satisfies(version: string, range: string): boolean {
  const parse = (v: string) => v.split(".").map(Number) as [number, number, number];
  const cmp = (a: number[], b: number[]) => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;
  const m = /^(\^|~|>=)?(\d+\.\d+\.\d+)$/.exec(range.trim());
  if (!m) return false;
  const v = parse(version), r = parse(m[2]!);
  switch (m[1]) {
    case ">=": return cmp(v, r) >= 0;
    case "^": return cmp(v, r) >= 0 && (r[0] > 0 ? v[0] === r[0] : v[1] === r[1]);
    case "~": return cmp(v, r) >= 0 && v[0] === r[0] && v[1] === r[1];
    default: return cmp(v, r) === 0;
  }
}

export interface HostOptions {
  webbrikVersion: string;
  getDocument: () => Document;
  /** Host decides what happens to proposals (review UI → transaction). Plugins never commit directly. */
  onProposal: (pluginId: string, summary: string, ops: Operation[]) => void;
  fetchImpl?: typeof fetch;
  /** Hosts allowed for network:fetch. Empty = no network. */
  allowedHosts?: string[];
}

export class PluginHost {
  private loaded = new Map<string, { manifest: PluginManifest; contributions: Contributions }>();
  constructor(private opts: HostOptions) {}

  async load(plugin: Plugin): Promise<PluginManifest> {
    const parsed = ManifestSchema.safeParse(plugin.manifest);
    if (!parsed.success) throw new PluginError(`Invalid manifest: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    const manifest = parsed.data;
    if (this.loaded.has(manifest.id)) throw new PluginError(`Plugin already loaded: ${manifest.id}`);
    if (!satisfies(this.opts.webbrikVersion, manifest.webbrik)) throw new PluginError(`Plugin ${manifest.id} requires Webbrik ${manifest.webbrik}, running ${this.opts.webbrikVersion}`);

    const perms = new Set(manifest.permissions);
    const need = (p: PluginPermission) => {
      if (!perms.has(p)) throw new PluginError(`Plugin ${manifest.id} lacks permission ${p}`);
    };
    const contributions: Contributions = { elements: [], inspectorControls: [], dataSources: [], workflowActions: [] };
    const f = this.opts.fetchImpl ?? fetch;
    const ctx: PluginContext = {
      manifest,
      document: { read: () => (need("document:read"), structuredClone(this.opts.getDocument())) },
      propose: (summary, ops) => (need("document:write"), this.opts.onProposal(manifest.id, summary, ops)),
      fetch: async (url, init) => {
        need("network:fetch");
        const host = new URL(url).hostname;
        if (!(this.opts.allowedHosts ?? []).includes(host)) throw new PluginError(`Network access to ${host} is not allowed`);
        return f(url, init);
      },
      contribute: {
        element: (c) => (need("ui:elements"), void contributions.elements.push(c)),
        inspectorControl: (c) => (need("ui:inspector"), void contributions.inspectorControls.push(c)),
        dataSource: (c) => (need("data:source"), void contributions.dataSources.push(c)),
        workflowAction: (c) => (need("workflow:action"), void contributions.workflowActions.push(c)),
      },
    };
    await plugin.activate(ctx);
    this.loaded.set(manifest.id, { manifest, contributions });
    return manifest;
  }

  unload(id: string) { return this.loaded.delete(id); }
  list() { return [...this.loaded.values()].map((l) => l.manifest); }
  contributions(): Contributions {
    const all: Contributions = { elements: [], inspectorControls: [], dataSources: [], workflowActions: [] };
    for (const l of this.loaded.values()) for (const k of Object.keys(all) as (keyof Contributions)[]) (all[k] as unknown[]).push(...l.contributions[k]);
    return all;
  }
}
