import { describe, expect, it } from "vitest";
import { matchDynamicRoute, queryItems, validateItem, visibleItems, type ContentItem } from "./index";

const schema = { slug: "posts", name: "Posts", fields: [{ name: "title", type: "text" as const, required: true }, { name: "slug", type: "slug" as const, required: true }, { name: "views", type: "number" as const }] };
const item = (id: string, data: Record<string, unknown>, status: ContentItem["status"] = "published", publishAt?: string): ContentItem => ({ id, slug: id, data, status, publishAt });

describe("content-engine", () => {
  it("validates items against the schema", () => {
    expect(validateItem(schema, { title: "A", slug: "a-b" }).ok).toBe(true);
    const bad = validateItem(schema, { title: 1, slug: "Bad Slug", extra: true });
    expect(bad.ok).toBe(false);
  });
  it("applies draft/scheduled visibility", () => {
    const now = new Date("2026-01-02");
    const items = [item("a", {}), item("b", {}, "draft"), item("c", {}, "scheduled", "2026-01-01"), item("d", {}, "scheduled", "2026-02-01")];
    expect(visibleItems(items, now).map((i) => i.id)).toEqual(["a", "c"]);
  });
  it("filters, sorts, paginates", () => {
    const items = [item("a", { v: 2, t: "x" }), item("b", { v: 1, t: "x" }), item("c", { v: 3, t: "y" })];
    const r = queryItems(items, { filter: { t: "x" }, sortBy: "v", pageSize: 1, page: 2 });
    expect(r).toMatchObject({ total: 2, pages: 2 });
    expect(r.items[0]!.id).toBe("a");
  });
  it("matches dynamic routes", () => {
    expect(matchDynamicRoute("/blog/:slug", "/blog/hello%20x")).toEqual({ slug: "hello x" });
    expect(matchDynamicRoute("/blog/:slug", "/news/x")).toBeNull();
  });
});
