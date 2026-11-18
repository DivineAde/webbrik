import { compileCss } from "@webbrik/css-engine";
import { validateDocument, type Document } from "@webbrik/document-model";
import { buildInteractionRuntime, usesForms } from "@webbrik/interactions";
import { renderPage, type ContentData } from "@webbrik/renderer";
import { SAFE_SLUG, fill } from "./cms";

export interface ExportWarning {
  code: string;
  message: string;
}

export interface ExportResult {
  /** path -> file contents */
  files: Record<string, string>;
  warnings: ExportWarning[];
}

function routeToPath(route: string, isHome: boolean): string {
  if (isHome || route === "/") return "index.html";
  return route.replace(/^\//, "").replace(/\/$/, "") + "/index.html";
}

function depthPrefix(path: string): string {
  const depth = path.split("/").length - 1;
  return depth === 0 ? "" : "../".repeat(depth);
}

/** Static HTML/CSS export. Uses the same renderer + CSS compiler as preview and publishing. */
export interface StaticExportOptions {
  /** Extra HTML appended to <head> on every page (e.g. analytics snippets from @webbrik/integrations). */
  injectHead?: string;
  /** Visible (published) CMS items per collection id. Enables repeaters, bindings and dynamic pages. */
  content?: ContentData;
  /** Where published forms post to (API origin + project id). Without it forms show "not connected". */
  forms?: { endpoint: string; projectId: string };
}

export function exportStatic(input: Document, options: StaticExportOptions = {}): ExportResult {
  const doc = options.injectHead ? { ...input, customCode: { ...input.customCode, headHtml: input.customCode.headHtml + "\n" + options.injectHead } } : input;
  const validation = validateDocument(doc);
  if (!validation.ok) {
    throw new Error("Cannot export invalid document: " + validation.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; "));
  }
  const warnings: ExportWarning[] = [];
  const files: Record<string, string> = {};

  files["assets/styles.css"] = compileCss(doc);
  const runtime = buildInteractionRuntime(doc, { forms: options.forms });
  if (usesForms(doc) && !options.forms) warnings.push({ code: "forms", message: "The page has forms but no form endpoint was provided, so they will say they are not connected." });
  if (runtime) files["assets/interactions.js"] = runtime;

  const content = options.content;
  for (const page of doc.pages) {
    const dynamic = /:slug(\/|$)/.test(page.route);
    if (!dynamic && /[:\[\]]/.test(page.route)) {
      warnings.push({ code: "dynamic-route", message: `Route ${page.route} is not supported in static export and was skipped.` });
      continue;
    }
    if (dynamic) {
      if (!page.collectionId || !content?.[page.collectionId]) {
        warnings.push({ code: "dynamic-route", message: `Dynamic page ${page.route} has no ${page.collectionId ? "content" : "collection"} and was skipped.` });
        continue;
      }
      const seen = new Set<string>();
      for (const item of content[page.collectionId]!) {
        if (!SAFE_SLUG.test(item.slug) || seen.has(item.slug)) { warnings.push({ code: "bad-slug", message: `Item "${item.slug}" skipped: slugs must be lowercase letters, numbers and hyphens, and unique.` }); continue; }
        seen.add(item.slug);
        const route = page.route.replace(/:slug(?=\/|$)/, item.slug);
        const path = routeToPath(route, false);
        const prefix = depthPrefix(path);
        const itemPage = { ...page, route, meta: { ...page.meta, title: fill(page.meta.title, item) ?? page.name, description: fill(page.meta.description, item) } };
        files[path] = renderPage(doc, itemPage, { content, item: { collectionId: page.collectionId, item }, nodeIds: !!runtime }, `${prefix}assets/styles.css`, runtime ? `${prefix}assets/interactions.js` : undefined).html;
      }
      continue;
    }
    const path = routeToPath(page.route, page.isHome);
    const prefix = depthPrefix(path);
    files[path] = renderPage(doc, page, { content, nodeIds: !!runtime }, `${prefix}assets/styles.css`, runtime ? `${prefix}assets/interactions.js` : undefined).html;
  }

  if (!content && Object.values(doc.nodes).some((n) => n.binding || n.props["repeat"])) warnings.push({ code: "bindings", message: "No CMS content was provided: bindings and repeaters export their static fallback only." });

  files["README.md"] = `# ${doc.name}\n\nExported static site. Open index.html or deploy this folder to any static host.\n`;
  files["package.json"] = JSON.stringify({ name: slug(doc.name), private: true, scripts: { start: "npx serve ." } }, null, 2) + "\n";
  return { files, warnings };
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
}

export { exportReact, type ReactExportOptions, type ReactTarget } from "./react";
export { zipFiles } from "./zip";
