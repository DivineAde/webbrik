import { analyze } from "@webbrik/quality";
import type { Document } from "@webbrik/document-model";

/** Templates must not ship accessibility errors (placeholder titles are warnings, not errors). */
export function analyzeTemplate(doc: Document) {
  const errors = analyze(doc).filter((f) => f.severity === "error" && f.category === "accessibility");
  return { errors };
}
