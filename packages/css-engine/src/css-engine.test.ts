import { describe, expect, it } from "vitest";
import { applyOperations, createDocument, createNode } from "@webbrik/document-model";
import { compileCss, elementClass, inspectStyles, isValidState, sanitizeDeclaration } from "./index";

function docWithNode() {
  let doc = createDocument("t");
  const root = doc.pages[0]!.rootId;
  doc = applyOperations(doc, [
    { type: "insertSubtree", rootId: "a", nodes: [createNode({ id: "a", parentId: root })], parentId: root, index: 0 },
    { type: "upsertClass", cls: { id: "c1", name: "card", blocks: [{ breakpoint: "base", declarations: { color: "red", padding: "8px" } }] } },
    { type: "addClass", id: "a", classId: "c1" },
    { type: "setStyle", id: "a", breakpoint: "base", declarations: { color: "blue" } },
    { type: "setStyle", id: "a", breakpoint: "mobile", declarations: { padding: "4px" } },
    { type: "setStyle", id: "a", breakpoint: "base", state: ":hover", declarations: { opacity: "0.5" } },
    { type: "setToken", name: "--brand", value: "oklch(0.2 0 0)" },
  ]).doc;
  return doc;
}

describe("css-engine", () => {
  it("compiles classes, element styles, states and media queries in order", () => {
    const css = compileCss(docWithNode());
    expect(css).toContain(":root{--brand:oklch(0.2 0 0)}");
    expect(css).toContain(".card{color:red;padding:8px}");
    expect(css.indexOf(".card{")).toBeLessThan(css.indexOf(`.${elementClass("a")}{color:blue}`));
    expect(css).toContain(`.${elementClass("a")}:hover{opacity:0.5}`);
    expect(css).toMatch(/@media \(max-width:479px\)\{[\s\S]*padding:4px/);
  });

  it("appends project custom CSS last", () => {
    const doc = docWithNode();
    const css = compileCss({ ...doc, customCode: { headHtml: "", customCss: ".x{top:0}" } });
    expect(css.trimEnd().endsWith(".x{top:0}")).toBe(true);
  });

  it("validates state selectors so they cannot inject rules", () => {
    expect(isValidState(":hover")).toBe(true);
    expect(isValidState("::before")).toBe(true);
    expect(isValidState(":nth-child(2n+1)")).toBe(true);
    expect(isValidState('[data-variant="primary"]')).toBe(true);
    expect(isValidState("{}body{display:none}")).toBe(false);
    expect(isValidState(":hover,body")).toBe(false);
    expect(isValidState(" > *")).toBe(false);
    const doc = docWithNode();
    const evil = applyOperations(doc, [{ type: "setStyle", id: "a", breakpoint: "base", state: "{}body{display:none}", declarations: { color: "red" } }]).doc;
    expect(compileCss(evil)).not.toContain("display:none");
  });

  it("drops dangerous declarations", () => {
    expect(sanitizeDeclaration("color", "red;} body{display:none")).toBeNull();
    expect(sanitizeDeclaration("background", "url(javascript:alert(1))")).toBeNull();
    expect(sanitizeDeclaration("bad prop", "x")).toBeNull();
    expect(sanitizeDeclaration("--x", "1px")).toBe("--x:1px");
  });

  it("explains precedence", () => {
    const src = inspectStyles(docWithNode(), "a");
    const color = src.filter((s) => s.property === "color");
    expect(color.map((s) => [s.origin, s.active])).toEqual([["class", false], ["element", true]]);
  });

  it("compiles animations to keyframes with reduced-motion fallbacks and sanitised values", () => {
    const doc = applyOperations(docWithNode(), [{ type: "upsertAnimation", animation: { id: "a", name: "slide-up", keyframes: [{ offset: 1, declarations: { opacity: "1" } }, { offset: 0, declarations: { opacity: "0", transform: "translateY(8px)", "background": "red;}body{x:y" } }], duration: 250, delay: 50, easing: "cubic-bezier(0.22, 1, 0.36, 1)", iterations: "infinite", direction: "alternate", fill: "both" } }]).doc;
    const css = compileCss(doc);
    expect(css).toContain("@keyframes a-slide-up{0%{opacity:0;transform:translateY(8px)}100%{opacity:1}}");
    expect(css).toContain(".anim-slide-up{animation:a-slide-up 250ms cubic-bezier(0.22, 1, 0.36, 1) 50ms infinite alternate both}");
    expect(css).toContain("@media (prefers-reduced-motion:reduce){.anim-slide-up{animation:none}}");
    expect(css).not.toContain("body{x:y");
  });
});

describe("free positioning", () => {
  it("makes <body> the positioning context only when something is absolutely positioned", () => {
    let doc = docWithNode();
    expect(compileCss(doc)).not.toContain("body{position:relative}");
    doc = applyOperations(doc, [{ type: "setStyle", id: "a", breakpoint: "base", declarations: { position: "absolute", left: "10px" } }]).doc;
    expect(compileCss(doc)).toContain("body{position:relative}");
  });
});
