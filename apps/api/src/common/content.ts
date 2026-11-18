import { visibleItems } from "@webbrik/content-engine";
import type { ContentData } from "@webbrik/renderer";
import type { Db } from "./db";

/** Items visible in production right now, keyed by collection id. Drafts and future-scheduled items never ship. */
export function publishedContent(db: Db, projectId: string): ContentData {
  const out: ContentData = {};
  for (const c of db.collections.filter((x) => x.projectId === projectId)) {
    const rows = db.items.filter((i) => i.collectionId === c.id).map((r) => ({ id: r.id, slug: r.slug, data: r.data, status: r.status, publishAt: r.publishAt }));
    out[c.id] = visibleItems(rows).map(({ id, slug, data }) => ({ id, slug, data }));
  }
  return out;
}
