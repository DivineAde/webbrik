import { exportReact, exportStatic, zipFiles } from "@webbrik/exporter";
import type { Document } from "@webbrik/document-model";

export { zipFiles };

export type ExportTarget = "static" | "next" | "vite";
export const EXPORT_TARGETS: { id: ExportTarget; label: string; note: string }[] = [
  { id: "static", label: "Static site", note: "HTML and CSS" },
  { id: "next", label: "Next.js project", note: "React and TypeScript" },
  { id: "vite", label: "Vite project", note: "React and TypeScript" },
];

function save(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** A saved project is exported by the API, so published content (CMS) and form endpoints are included. */
export async function downloadProjectExport(projectId: string, target: ExportTarget): Promise<void> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/export?target=${target}`, { credentials: "same-origin", headers: { "x-requested-with": "webbrik" } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message ?? data?.message ?? `Export failed (${res.status})`);
  }
  save(await res.blob(), `site-${target}.zip`);
}

/** Download the open document as a zip: through the API for a saved project, in the browser for the local editor. */
export async function downloadExport(doc: Document, target: ExportTarget = "static", projectId?: string): Promise<void> {
  if (projectId) return downloadProjectExport(projectId, target);
  const { files } = target === "static" ? exportStatic(doc) : exportReact(doc, target);
  save(new Blob([zipFiles(files) as BlobPart], { type: "application/zip" }), `site-${target}.zip`);
}
