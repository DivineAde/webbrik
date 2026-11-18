import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, Check, FileText, Globe, History, KeyRound, Lock, Sparkles, Users } from "lucide-react";
import "./landing.css";
import { BrickPattern } from "@/components/BrickPattern";
import { LogoMark } from "@/components/Logo";
import { Nav } from "@/components/landing/Nav";
import { EditorFrame, InspectorFrame } from "@/components/landing/EditorFrame";

export const metadata: Metadata = {
  title: { absolute: "Webbrik — Visual website builder with full CSS control" },
  description: "Design on a canvas, edit every CSS property, then publish or export clean HTML, CSS or a React project. Free for up to 3 projects.",
};

/** Deterministic brick tones so the server and client agree. */
const tone = (i: number) => ((i * 37) % 10) / 10;
const WALL_ROWS = 7, WALL_COLS = 5, SELECTED = 3 * WALL_COLS + 2;

function Wall() {
  return (
    <div className="lp-wall" aria-hidden="true">
      {Array.from({ length: WALL_ROWS }, (_, r) => (
        <div className="lp-wall-row" key={r}>
          {Array.from({ length: WALL_COLS }, (_, c) => {
            const i = r * WALL_COLS + c;
            const sel = i === SELECTED;
            return (
              <div key={c} className={`lp-brick ${sel ? "lp-brick-sel" : ""}`} style={{ "--i": i, "--t": tone(i) } as React.CSSProperties}>
                {sel && <><i /><i /><i /><i /><b>div.brick</b><span className="lp-chip" role="presentation"><em>width</em>168px<em>radius</em>4px<em>background</em>#e4e4e7</span></>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const TREE: [number, string, boolean?][] = [[0, "body"], [1, "Section"], [2, "Container"], [3, "Heading 1", true], [3, "Paragraph"], [3, "Button"], [1, "Section"], [2, "Columns"]];

const PLANS = [
  { name: "Free", blurb: "For your first sites.", rows: [["Projects", "3"], ["Members", "1"], ["Storage", "500 MB"], ["Publishes a month", "20"], ["AI credits a month", "20"], ["Custom domains", "No"]] },
  { name: "Pro", blurb: "For a working studio.", hot: true, rows: [["Projects", "50"], ["Members", "10"], ["Storage", "20 GB"], ["Publishes a month", "1,000"], ["AI credits a month", "1,000"], ["Custom domains", "Yes"]] },
  { name: "Team", blurb: "For several people on one account.", rows: [["Projects", "500"], ["Members", "50"], ["Storage", "200 GB"], ["Publishes a month", "10,000"], ["AI credits a month", "10,000"], ["Custom domains", "Yes"]] },
];

export default function Home() {
  return (
    <div className="lp">
      <a href="#main" className="lp-skip">Skip to content</a>
      <Nav />
      <main id="main">
        {/* 1. Hero: alone on the first screen */}
        <section className="lp-hero" aria-labelledby="hero-h">
          <div className="lp-wrap" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <div className="lp-hero-top">
              <div className="lp-hero-copy" data-enter>
                <h1 id="hero-h" className="lp-h1">The visual website builder with full CSS control.</h1>
                <p className="lp-lead">Design on a canvas, edit every CSS property, then publish or export the source. Free for up to 3 projects.</p>
                <div className="lp-actions">
                  <Link href="/login" className="lp-btn lp-btn-primary">Start building <ArrowRight aria-hidden /></Link>
                  <Link href="/editor" className="lp-btn lp-btn-line">Open the editor</Link>
                </div>
                <ul className="lp-facts" aria-label="At a glance">
                  <li><Check aria-hidden />Free for up to 3 projects</li>
                  <li><Check aria-hidden />Clean HTML, CSS or React export</li>
                  <li><Check aria-hidden />Edit together in real time</li>
                </ul>
              </div>
              <Wall />
            </div>
            <EditorFrame demo />
          </div>
        </section>

        {/* 2. The editor */}
        <section id="product" className="lp-sec-pad lp-rule" aria-labelledby="edit-h">
          <div className="lp-wrap lp-split lp-split-flip">
            <div style={{ position: "relative" }}>
              <div className="lp-frame lp-frame-solo" style={{ height: "auto", maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
                <InspectorFrame className="lp-insp-show" />
              </div>
            </div>
            <div className="lp-copy">
              <h2 id="edit-h" className="lp-h2">Every CSS property, in sections you can scan.</h2>
              <p className="lp-lead">Size, position, typography, backgrounds and borders sit in their own groups with compact fields, units and segmented controls. Set a style for a breakpoint or a state, and see which rule wins.</p>
              <p className="lp-body">Drag components from the panel onto the page or into the layers list. Right-click any element for what you can do with it.</p>
              <Link href="/editor" className="lp-link text-[15px] font-medium">Try it without an account</Link>
            </div>
          </div>
        </section>

        {/* 3. Source of truth */}
        <section id="source" className="lp-sec-pad lp-rule" aria-labelledby="doc-h">
          <div className="lp-wrap" style={{ display: "grid", gap: 56 }}>
            <div className="lp-copy" style={{ maxWidth: 760 }}>
              <h2 id="doc-h" className="lp-h2">A page is a document, not a pile of pixels.</h2>
              <p className="lp-lead">Every element is a typed node with its own styles. The editor, the preview and the export all read the same document, so what you see is what ships.</p>
            </div>
            <div className="lp-doc">
              <div className="lp-tree" aria-label="Layers">
                <div className="lp-tree-h">Layers</div>
                {TREE.map(([d, n, on], i) => <div key={i} className={`lp-node ${on ? "on" : ""}`} style={{ "--d": d } as React.CSSProperties}><Boxes aria-hidden />{n}</div>)}
              </div>
              <div className="lp-code" role="img" aria-label="Exported HTML and CSS for a heading inside a section">
                <div className="lp-code-tabs"><span className="on">index.html</span><span>styles.css</span></div>
{`<`}<span className="k">section</span> <span className="p">class</span>=<span className="s">&quot;section&quot;</span>{`>`}{"\n"}
{`  <`}<span className="k">div</span> <span className="p">class</span>=<span className="s">&quot;container&quot;</span>{`>`}{"\n"}
{`    <`}<span className="k">h1</span> <span className="p">class</span>=<span className="s">&quot;heading-1&quot;</span>{`>`}Design that ships.{`</`}<span className="k">h1</span>{`>`}{"\n"}
{`    <`}<span className="k">p</span>{`>`}Every element is a typed node.{`</`}<span className="k">p</span>{`>`}{"\n"}
{`  </`}<span className="k">div</span>{`>`}{"\n"}
{`</`}<span className="k">section</span>{`>`}{"\n\n"}
<span className="c">/* styles.css */</span>{"\n"}
<span className="k">.heading-1</span> {`{`}{"\n"}
{`  `}<span className="p">font-size</span>: <span className="s">22px</span>;{"\n"}
{`  `}<span className="p">letter-spacing</span>: <span className="s">-0.03em</span>;{"\n"}
{`}`}
              </div>
            </div>
          </div>
        </section>

        {/* 4. Type moment */}
        <section className="lp-dark lp-sec-pad" aria-labelledby="lock-h">
          <div className="lp-wrap">
            <h2 id="lock-h" className="lp-lock"><span>No</span><span className="o">lock-in.</span></h2>
            <div className="lp-lock-grid">
              <p className="lp-lead" style={{ color: "oklch(0.78 0 0)" }}>Export a static site as plain HTML and CSS, or a Next.js or Vite React project. The files are yours to host and edit anywhere.</p>
              <div className="lp-targets" role="list">
                {[["Static site", "HTML + CSS"], ["Next.js project", "React + TSX"], ["Vite project", "React + TSX"]].map(([a, b]) => <div role="listitem" className="lp-target" key={a}>{a}<span>{b}</span></div>)}
              </div>
            </div>
          </div>
        </section>

        {/* 5. Everything around the canvas */}
        <section id="more" className="lp-sec-pad" aria-labelledby="more-h">
          <div className="lp-wrap" style={{ display: "grid", gap: 48 }}>
            <div className="lp-copy" style={{ maxWidth: 760 }}>
              <h2 id="more-h" className="lp-h2">Publishing, content, forms and teamwork are built in.</h2>
            </div>
            <div className="lp-bento">
              <article className="lp-cell c-5">
                <div><Globe size={20} aria-hidden /><h3 className="lp-h3" style={{ marginTop: 14 }}>Publish to a live address</h3><p>One click publishes the page. Add your own domain on Pro and Team.</p></div>
                <div className="lp-urlbar" aria-hidden="true"><Lock aria-hidden /><b>studio-site.example</b><em>Live</em></div>
              </article>
              <article className="lp-cell c-7">
                <div><FileText size={20} aria-hidden /><h3 className="lp-h3" style={{ marginTop: 14 }}>Content collections</h3><p>Define fields once, add items, then bind them to headings, lists and dynamic pages.</p></div>
                <div className="lp-mini" aria-hidden="true">
                  <div className="r h"><span>title</span><span>views</span><span>status</span></div>
                  <div className="r"><span>Launch notes</span><span>1,204</span><span>Published</span></div>
                  <div className="r"><span>Pricing update</span><span>386</span><span>Draft</span></div>
                </div>
              </article>
              <article className="lp-cell c-4">
                <div><KeyRound size={20} aria-hidden /><h3 className="lp-h3" style={{ marginTop: 14 }}>Forms that validate</h3><p>Build a form on the canvas; errors appear under the field that caused them.</p></div>
                <div className="lp-field" aria-hidden="true"><label>Email</label><div className="i bad">name@</div><small>Enter a full email address.</small></div>
              </article>
              <article className="lp-cell c-4">
                <div><Sparkles size={20} aria-hidden /><h3 className="lp-h3" style={{ marginTop: 14 }}>An assistant for edits</h3><p>Describe a change in words and review it before it touches your page.</p></div>
                <div className="lp-ai" aria-hidden="true"><div className="q">Add a three column feature row</div><div className="a"><span>Columns</span><span>3 headings</span><span>3 texts</span></div></div>
              </article>
              <article className="lp-cell c-4">
                <div><Users size={20} aria-hidden /><h3 className="lp-h3" style={{ marginTop: 14 }}>Work together, roll back</h3><p>See who is editing live, share a review link, restore any saved version.</p></div>
                <div style={{ display: "grid", gap: 12 }} aria-hidden="true">
                  <div className="lp-people"><i style={{ background: "oklch(0.2 0 0)" }}>Y</i><i style={{ background: "oklch(0.55 0.12 200)" }}>C</i><i style={{ background: "oklch(0.6 0.12 150)" }}>R</i></div>
                  <div className="lp-vers"><div>Version 12<span><History size={12} style={{ display: "inline", verticalAlign: "-1px" }} /> Restore</span></div></div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* 6. Plans */}
        <section id="plans" className="lp-sec-pad lp-rule" aria-labelledby="plans-h">
          <div className="lp-wrap" style={{ display: "grid", gap: 48 }}>
            <div className="lp-copy" style={{ maxWidth: 760 }}>
              <h2 id="plans-h" className="lp-h2">Start free. Upgrade when you outgrow it.</h2>
              <p className="lp-lead">Every plan includes the full editor and source export. Plans differ in limits.</p>
            </div>
            <div className="lp-plans">
              {PLANS.map((p) => (
                <article key={p.name} className={`lp-plan ${p.hot ? "hot" : ""}`}>
                  <div><h3 className="lp-h2" style={{ fontSize: "2rem" }}>{p.name}</h3><p className="lp-body" style={{ color: p.hot ? "oklch(0.8 0 0)" : undefined, marginTop: 8 }}>{p.blurb}</p></div>
                  <ul>{p.rows.map(([k, v]) => <li key={k}>{k}<span>{v === "Yes" ? <Check size={16} aria-label="Yes" /> : v}</span></li>)}</ul>
                  <Link href="/login" className={`lp-btn ${p.hot ? "lp-btn-light" : "lp-btn-line"}`}>{p.name === "Free" ? "Start building" : `Choose ${p.name}`}</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 7. Close */}
        <section className="lp-close" aria-labelledby="close-h">
          <div className="lp-close-wall" aria-hidden="true"><BrickPattern seed="webbrik-landing" bold neutral className="" /></div>
          <div className="lp-wrap lp-close-in">
            <div className="lp-close-card">
              <LogoMark size={36} />
              <h2 id="close-h" className="lp-h2" style={{ maxWidth: "14em" }}>Lay the first brick today.</h2>
              <p className="lp-lead">Create an account and your first project is one click away. Or open the editor and start without one.</p>
              <div className="lp-actions">
                <Link href="/login" className="lp-btn lp-btn-primary">Start building <ArrowRight aria-hidden /></Link>
                <Link href="/editor" className="lp-btn lp-btn-line">Open the editor</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot-top">
            <div className="lp-foot-brand">
              <div className="lp-foot-logo"><LogoMark size={28} /> Webbrik</div>
              <p>A visual website builder for people who care about the CSS. Design on a canvas, then publish or take the source with you.</p>
              <Link href="/login" className="lp-btn lp-btn-light">Start building <ArrowRight aria-hidden /></Link>
            </div>
            <nav aria-label="Footer" className="lp-foot-cols">
              <div><h2>Product</h2><a href="#main">Visual editor</a><a href="#product">Design panel</a><a href="#more">Publishing</a><a href="#more">Content collections</a><a href="#more">Forms</a><a href="#more">AI assistant</a></div>
              <div><h2>Resources</h2><Link href="/help">Help center</Link><a href="#plans">Plans</a><a href="#source">How it works</a><Link href="/editor">Open the editor</Link></div>
              <div><h2>Account</h2><Link href="/login">Sign in</Link><Link href="/login">Create an account</Link><Link href="/dashboard">Dashboard</Link><Link href="/settings">Account settings</Link></div>
            </nav>
          </div>
          <div className="lp-foot-wall" aria-hidden="true">{Array.from({ length: 2 }, (_, r) => <div key={r} className="lp-foot-row">{Array.from({ length: 28 }, (_, c) => <i key={c} style={{ "--t": tone(r * 28 + c) } as React.CSSProperties} />)}</div>)}</div>
          <div className="lp-foot-bottom"><p>© {new Date().getFullYear()} Webbrik. Free for up to 3 projects.</p><p><Link href="/help">Help</Link><Link href="/login">Sign in</Link></p></div>
        </div>
      </footer>
    </div>
  );
}
