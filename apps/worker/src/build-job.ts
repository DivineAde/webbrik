import { validateDocument, type Document } from "@webbrik/document-model";
import { exportStatic } from "@webbrik/exporter";
import type { ContentData } from "@webbrik/renderer";

/** Jobs carry only identifiers: the worker pulls the current inputs from the API, so a queued job can never build stale or forged data. */
export interface BuildJob {
  projectId: string;
  workspaceId: string; // jobs always carry tenant ownership; it must match what the API says owns the project
  /** Build this revision instead of the current head. */
  revision?: number;
}

export interface BuildInput { projectId: string; workspaceId: string; projectSlug: string; revision: number; document: unknown; content: ContentData; injectHead?: string }
export interface BuildOutcome { ok: boolean; revision: number; files: Record<string, string | Uint8Array>; logs: string[] }

/** Pure pipeline: validate -> render/compile -> artifacts. */
export function runBuild(input: Pick<BuildInput, "document" | "content" | "injectHead">): { ok: false; logs: string[] } | { ok: true; files: Record<string, string | Uint8Array>; logs: string[] } {
  const v = validateDocument(input.document);
  if (!v.ok) return { ok: false, logs: v.issues.map((i) => `[${i.severity}] ${i.code}: ${i.message}`) };
  const { files, warnings } = exportStatic(v.document as Document, { content: input.content, injectHead: input.injectHead });
  return { ok: true, files, logs: [`Built ${Object.keys(files).length} files`, ...warnings.map((w) => `[warn] ${w.message}`)] };
}

export interface ApiClient { baseUrl: string; token: string; fetch?: typeof fetch }

async function call<T>(c: ApiClient, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await (c.fetch ?? fetch)(`${c.baseUrl.replace(/\/+$/, "")}/v1${path}`, { method, headers: { authorization: `Bearer ${c.token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`API ${method} ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

/** Full job: ask the API what to build, build it, report the result back. Throws on transport errors so the queue retries. */
export async function processBuildJob(job: BuildJob, api: ApiClient): Promise<BuildOutcome> {
  const input = await call<BuildInput>(api, "GET", `/internal/projects/${encodeURIComponent(job.projectId)}/build-input${job.revision ? `?revision=${job.revision}` : ""}`);
  if (input.workspaceId !== job.workspaceId) throw new Error("Job workspace does not match the project's owner; refusing to build"); // never cross tenants
  const r = runBuild(input);
  const files = r.ok ? r.files : {};
  const bytes = Object.values(files).reduce((n, f) => n + (typeof f === "string" ? Buffer.byteLength(f) : f.byteLength), 0);
  await call(api, "POST", `/internal/projects/${encodeURIComponent(job.projectId)}/build-result`, { revision: input.revision, ok: r.ok, files: Object.keys(files).length, bytes, logs: r.logs.slice(0, 200).map((l) => l.slice(0, 500)) });
  return { ok: r.ok, revision: input.revision, files, logs: r.logs };
}
