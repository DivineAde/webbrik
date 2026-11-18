"use client";
import { useEffect, useRef, useState } from "react";
import type { Document } from "@webbrik/document-model";

const MAX_BYTES = 6 * 1024 * 1024;

/**
 * The canvas is a sandboxed iframe with no cookies, so it cannot load private asset URLs itself. The editor fetches each
 * `asset:<id>` used by the document and hands the canvas a data URL instead. Oversized files are skipped.
 */
export function useAssetPreviews(doc: Document, projectId: string | undefined): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());
  useEffect(() => { requested.current = new Set(); setUrls({}); }, [projectId]);
  useEffect(() => {
    if (!projectId) return;
    const ids = new Set<string>();
    for (const n of Object.values(doc.nodes)) for (const v of Object.values(n.attributes)) if (typeof v === "string" && v.startsWith("asset:")) ids.add(v.slice(6));
    for (const id of ids) {
      if (requested.current.has(id) || !/^[\w-]+$/.test(id)) continue;
      requested.current.add(id);
      void (async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/assets/${id}/raw`, { credentials: "same-origin" });
          if (!res.ok) return;
          const blob = await res.blob();
          if (blob.size > MAX_BYTES) return;
          const url = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
          setUrls((cur) => ({ ...cur, [id]: url }));
        } catch { /* leave the image blank in the canvas; published output is unaffected */ }
      })();
    }
  }, [doc, projectId]);
  return urls;
}
