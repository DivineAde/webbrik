import { describe, expect, it } from "vitest";
import { applyRepeaterQuery, resolveFieldPath, sanitizeItemData, sanitizeRichText } from "./index";

describe("sanitizeRichText", () => {
  it("keeps the allowlisted formatting", () => {
    expect(sanitizeRichText("<h2>Hi</h2><p>a <strong>b</strong> <em>c</em></p><ul><li>x</li><li>y</li></ul>")).toBe("<h2>Hi</h2><p>a <strong>b</strong> <em>c</em></p><ul><li>x</li><li>y</li></ul>");
    expect(sanitizeRichText("<b>bold</b><i>it</i>")).toBe("<strong>bold</strong><em>it</em>");
  });
  it("removes scripts with their content, event handlers, styles and unknown tags", () => {
    const out = sanitizeRichText('<p onclick="x()" style="color:red">a</p><script>alert(1)</script><img src=x onerror=alert(1)><iframe src="//evil"></iframe><style>p{}</style><div>keep</div>');
    expect(out).toBe("<p>a</p>keep");
    expect(out).not.toMatch(/alert|onerror|onclick|script|iframe|style/);
  });
  it("only allows safe link targets and adds rel", () => {
    expect(sanitizeRichText('<a href="https://x.com/a?b=1&c=2">x</a>')).toBe('<a href="https://x.com/a?b=1&amp;c=2" rel="noopener noreferrer">x</a>');
    for (const bad of ["javascript:alert(1)", " JaVa\tScRiPt:alert(1)", "data:text/html,<script>1</script>", "//evil.com", "vbscript:x"]) expect(sanitizeRichText(`<a href="${bad}">x</a>`)).toBe("<a>x</a>");
    expect(sanitizeRichText('<a href="/about">x</a><a href="#top">y</a><a href="mailto:a@b.co">z</a>')).toContain('href="/about"');
  });
  it("escapes stray markup in text and balances unclosed or misnested tags", () => {
    expect(sanitizeRichText("1 < 2 & 3 > 2")).toBe("1 &lt; 2 &amp; 3 &gt; 2");
    expect(sanitizeRichText("<p><strong>open")).toBe("<p><strong>open</strong></p>");
    expect(sanitizeRichText("</p></strong>x")).toBe("x");
    expect(sanitizeRichText('<a href="x" href2=\'><script>\'>t</a>')).not.toContain("<script");
  });
  it("is idempotent", () => {
    const once = sanitizeRichText('<p>a &amp; b <a href="https://x.co">l</a></p><ul><li>1</li></ul>');
    expect(sanitizeRichText(once)).toBe(once);
  });
  it("sanitises only richtext fields of an item", () => {
    const schema = { slug: "p", name: "P", fields: [{ name: "body", type: "richtext" as const }, { name: "t", type: "text" as const }] };
    expect(sanitizeItemData(schema, { body: "<script>x</script><p>ok</p>", t: "<script>kept as text</script>" })).toEqual({ body: "<p>ok</p>", t: "<script>kept as text</script>" });
  });
});

describe("repeater queries", () => {
  const items = [{ id: "1", data: { n: "a", cat: "x", pts: 5, on: true } }, { id: "2", data: { n: "b", cat: "y", pts: 9, on: false } }, { id: "3", data: { n: "c", cat: "x", pts: 1, on: true, tags: ["t1"] } }];
  it("filters, sorts and limits", () => {
    expect(applyRepeaterQuery(items, { where: [{ field: "cat", op: "eq", value: "x" }] }).map((i) => i.id)).toEqual(["1", "3"]);
    expect(applyRepeaterQuery(items, { where: [{ field: "on", op: "eq", value: "true" }], sort: "pts", order: "desc" }).map((i) => i.id)).toEqual(["1", "3"]);
    expect(applyRepeaterQuery(items, { where: [{ field: "pts", op: "gt", value: "2" }], sort: "pts" }).map((i) => i.id)).toEqual(["1", "2"]);
    expect(applyRepeaterQuery(items, { where: [{ field: "cat", op: "ne", value: "x" }] }).map((i) => i.id)).toEqual(["2"]);
    expect(applyRepeaterQuery(items, { where: [{ field: "tags", op: "contains", value: "t1" }] }).map((i) => i.id)).toEqual(["3"]);
    expect(applyRepeaterQuery(items, { limit: 2 })).toHaveLength(2);
  });
  it("never leaks items through an unknown operator", () => {
    expect(applyRepeaterQuery(items, { where: [{ field: "cat", op: "regex" as never, value: "." }] })).toEqual([]);
  });
});

describe("reference paths", () => {
  const authors = [{ id: "au1", data: { name: "Ada", team: "t1" } }];
  const teams = [{ id: "t1", data: { title: "Core" } }];
  const lookup = (id: string) => [...authors, ...teams].find((i) => i.id === id);
  it("follows references", () => {
    expect(resolveFieldPath({ author: "au1" }, "author.name", lookup)).toBe("Ada");
    expect(resolveFieldPath({ author: "au1" }, "author.team.title", lookup)).toBe("Core");
    expect(resolveFieldPath({ author: "missing" }, "author.name", lookup)).toBeUndefined();
    expect(resolveFieldPath({ title: "x" }, "title", lookup)).toBe("x");
    expect(resolveFieldPath({ author: 5 }, "author.name", lookup)).toBeUndefined();
  });
});
