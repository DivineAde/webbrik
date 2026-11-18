import { exportStatic, zipFiles } from "@webbrik/exporter";
import type { Document } from "@webbrik/document-model";

export { zipFiles };

export function downloadExport(doc: Document) {
  const { files } = exportStatic(doc);
  const bytes = zipFiles(files);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  a.download = "site-export.zip";
  a.click();
  URL.revokeObjectURL(a.href);
}
