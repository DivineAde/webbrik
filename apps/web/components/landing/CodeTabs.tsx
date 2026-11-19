"use client";
import { useId, useState } from "react";

const FILES = {
  "index.html": { lang: "html", code: `<section class="hero">
  <div class="hero__copy">
    <h1 class="heading-1">Bread, baked before you wake.</h1>
    <p class="lead">Small-batch sourdough and pastries,
       delivered across the city by 7am.</p>
    <a class="button" href="/order">Order for tomorrow</a>
  </div>
</section>` },
  "styles.css": { lang: "css", code: `/* Generated from the document, one rule per class */
.hero {
  padding: 44px 40px;
  background: #f6efe0;
  border-radius: 0;
}
.heading-1 {
  font-size: 56px;
  line-height: 1.02;
  letter-spacing: -0.04em;
  color: #26301f;
}
.button {
  padding: 12px 20px;
  border-radius: 999px;
  background: #2f5d3a;
}` },
  "Hero.tsx": { lang: "tsx", code: `import "./styles.css";

export function Hero() {
  return (
    <section className="hero">
      <div className="hero__copy">
        <h1 className="heading-1">Bread, baked before you wake.</h1>
        <p className="lead">
          Small-batch sourdough and pastries,
          delivered across the city by 7am.
        </p>
        <a className="button" href="/order">Order for tomorrow</a>
      </div>
    </section>
  );
}` },
} as const;
type Name = keyof typeof FILES;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** A tiny single-pass highlighter (so inserted markup is never re-scanned). Static input only. */
const TOKEN = /(\/\*[\s\S]*?\*\/)|("[^"\n]*")|(&lt;\/?)([\w-]+)|\b(class|className|href)(?==)|\b(import|export|function|return|from|const)\b|^(\s*\.[\w-]+)|^(\s+)([\w-]+)(?=:)/gm;
function paint(code: string) {
  return esc(code).replace(TOKEN, (m, com, str, lt, tag, attr, kw, sel, ws, prop) => {
    if (com) return `<i class="c">${com}</i>`;
    if (str) return `<i class="s">${str}</i>`;
    if (tag) return `${lt}<i class="k">${tag}</i>`;
    if (attr) return `<i class="p">${attr}</i>`;
    if (kw) return `<i class="k">${kw}</i>`;
    if (sel) return `<i class="k">${sel}</i>`;
    if (prop) return `${ws}<i class="p">${prop}</i>`;
    return m;
  });
}

export function CodeTabs() {
  const [name, setName] = useState<Name>("index.html");
  const id = useId();
  const f = FILES[name];
  return (
    <div className="lx-code">
      <div role="tablist" aria-label="Exported files" className="lx-code-tabs">
        {(Object.keys(FILES) as Name[]).map((n) => <button key={n} role="tab" id={`${id}-${n}`} aria-selected={n === name} aria-controls={`${id}-p`} onClick={() => setName(n)}>{n}</button>)}
      </div>
      <pre id={`${id}-p`} role="tabpanel" aria-labelledby={`${id}-${name}`} tabIndex={0} dangerouslySetInnerHTML={{ __html: paint(f.code) }} />
    </div>
  );
}
