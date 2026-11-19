import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, FileText, GitBranch, Globe, Lock, MessageSquare, Sparkles } from "lucide-react";
import "./landing.css";
import "./lx.css";
import { BrickPattern } from "@/components/BrickPattern";
import { LogoMark } from "@/components/Logo";
import { Nav } from "@/components/landing/Nav";
import { InspectorFrame } from "@/components/landing/EditorFrame";
import { HeroBuilder } from "@/components/landing/HeroBuilder";
import { CodeTabs } from "@/components/landing/CodeTabs";
import { SITES, Snap } from "@/components/landing/Snap";

export const metadata: Metadata = {
  title: { absolute: "Webbrik — Visual website builder with full CSS control" },
  description: "Design on a canvas, edit every CSS property, then publish or export clean HTML, CSS or a React project. Free for up to 3 projects.",
};

/** Deterministic brick tones so the server and client agree. */
const tone = (i: number) => ((i * 37) % 10) / 10;

const PLANS = [
  { name: "Free", blurb: "For your first sites.", rows: [["Projects", "3"], ["Members", "1"], ["Storage", "500 MB"], ["Publishes a month", "20"], ["AI credits a month", "20"], ["Custom domains", "No"]] },
  { name: "Pro", blurb: "For a working studio.", hot: true, rows: [["Projects", "50"], ["Members", "10"], ["Storage", "20 GB"], ["Publishes a month", "1,000"], ["AI credits a month", "1,000"], ["Custom domains", "Yes"]] },
  { name: "Team", blurb: "For several people on one account.", rows: [["Projects", "500"], ["Members", "50"], ["Storage", "200 GB"], ["Publishes a month", "10,000"], ["AI credits a month", "10,000"], ["Custom domains", "Yes"]] },
];

const FAQ = [
  ["Do I own what I build?", "Yes. Export a static site as HTML and CSS, or a Next.js or Vite React project, and host it anywhere. There is nothing to unlock."],
  ["What does the free plan include?", "The full editor and source export, with up to 3 projects, 500 MB of storage and 20 publishes a month. Limits are what change on paid plans."],
  ["Can I use my own domain?", "Yes, on Pro and Team. Add a domain on the Publish tab, create the DNS record it shows, then verify."],
  ["How does the assistant work?", "You describe a change in words. It proposes edits to the page, and you review them before anything is applied."],
  ["Can my team edit together?", "Yes. You see who is in the page live, share a review link for comments, and restore any saved version."],
] as const;

export default function Home() {
  return (
    <div className="lp">
      <a href="#main" className="lp-skip">Skip to content</a>
      <Nav />
      <main id="main">
        {/* 1. Hero: the product, working */}
        <section className="lx-hero" aria-labelledby="hero-h">
          <div className="lx-bond" aria-hidden="true" />
          <div className="lp-wrap">
            <div className="lx-hero-copy" data-enter>
              <h1 id="hero-h" className="lx-h1">Design the site.<br />Keep the code.</h1>
              <div className="lx-hero-side">
                <p className="lp-lead">Webbrik is a visual builder with full CSS control. Lay pages out on a canvas, then publish them or export clean HTML, CSS and React.</p>
                <div className="lp-actions">
                  <Link href="/login" className="lp-btn lp-btn-primary">Start building <ArrowRight aria-hidden /></Link>
                  <Link href="/editor" className="lp-btn lp-btn-line">Open the editor</Link>
                </div>
                <p className="lx-note">Free for up to 3 projects. No card needed.</p>
              </div>
            </div>
            <HeroBuilder />
          </div>
        </section>

        {/* 2. Layouts */}
        <section className="lx-gallery" aria-labelledby="gal-h">
          <div className="lp-wrap lx-gal-head">
            <h2 id="gal-h" className="lp-h2">Start from a layout, not a blank page.</h2>
            <p className="lp-body">Illustrations of the kinds of sites you can build: shops, studios, apps and publishers.</p>
          </div>
          <div className="lx-marquee">
            <ul className="lx-track">
              {[...SITES, ...SITES].map((s, i) => (
                <li key={i} aria-hidden={i >= SITES.length || undefined}>
                  <div className="lx-chrome"><span className="lx-dots"><i /><i /><i /></span><span className="lx-url">{s.brand.toLowerCase().replace(/[^a-z]/g, "")}.example</span></div>
                  <Snap s={s} />
                  <p><b>{s.brand}</b>{s.kind}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 3. The design panel */}
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

        {/* 4. Responsive */}
        <section className="lp-sec-pad lp-rule" aria-labelledby="resp-h">
          <div className="lp-wrap" style={{ display: "grid", gap: 48 }}>
            <div className="lp-copy" style={{ maxWidth: 760 }}>
              <h2 id="resp-h" className="lp-h2">One page, every screen width.</h2>
              <p className="lp-lead">Switch breakpoints in the toolbar and restyle just that size. Larger screens inherit down, so you only write what changes.</p>
            </div>
            <div className="lx-devices" aria-label="The same page at desktop, tablet and phone widths">
              <figure className="d-desk"><div className="lx-chrome"><span className="lx-dots"><i /><i /><i /></span><span className="lx-url">loafandco.example</span></div><Snap s={SITES[0]!} /><figcaption>Desktop <em>1280</em></figcaption></figure>
              <figure className="d-tab"><div className="lx-bezel"><Snap s={SITES[0]!} stack /></div><figcaption>Tablet <em>768</em></figcaption></figure>
              <figure className="d-phone"><div className="lx-bezel"><Snap s={SITES[0]!} stack /></div><figcaption>Phone <em>390</em></figcaption></figure>
            </div>
          </div>
        </section>

        {/* 5. Source of truth: export */}
        <section id="source" className="lx-dark lp-sec-pad" aria-labelledby="doc-h">
          <div className="lp-wrap lx-export">
            <div className="lp-copy">
              <h2 id="doc-h" className="lp-h2">A page is a document. Export it as code.</h2>
              <p className="lp-lead">Every element is a typed node with its own styles. The editor, the preview and the export all read the same document, so what you see is what ships.</p>
              <ul className="lp-targets" role="list">
                {[["Static site", "HTML + CSS"], ["Next.js project", "React + TSX"], ["Vite project", "React + TSX"]].map(([a, b]) => <li className="lp-target" key={a}>{a}<span>{b}</span></li>)}
              </ul>
            </div>
            <CodeTabs />
          </div>
        </section>

        {/* 6. Around the canvas */}
        <section id="more" className="lp-sec-pad" aria-labelledby="more-h">
          <div className="lp-wrap" style={{ display: "grid", gap: 48 }}>
            <div className="lp-copy" style={{ maxWidth: 760 }}>
              <h2 id="more-h" className="lp-h2">Publishing, content, forms and teamwork are built in.</h2>
            </div>
            <div className="lx-bento">
              <article className="lx-cell w7">
                <div className="lx-scene lx-collab" aria-hidden="true">
                  <Snap s={SITES[0]!} />
                  <span className="lx-cur c1"><svg width="16" height="16" viewBox="0 0 18 18"><path d="M2 1.5 15.5 8l-5.6 1.7L7.3 15 2 1.5Z" fill="currentColor" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" /></svg><i>Ada</i></span>
                  <span className="lx-cur c2"><svg width="16" height="16" viewBox="0 0 18 18"><path d="M2 1.5 15.5 8l-5.6 1.7L7.3 15 2 1.5Z" fill="currentColor" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" /></svg><i>Tunde</i></span>
                  <span className="lx-pin"><MessageSquare aria-hidden />Can the button be bigger?</span>
                </div>
                <div className="lx-cap"><h3 className="lp-h3">Work together, in the same page</h3><p>See who is editing live, leave comments through a review link, and restore any saved version.</p></div>
              </article>
              <article className="lx-cell w5">
                <div className="lx-scene lx-deploy" aria-hidden="true">
                  <div className="lp-urlbar"><Lock aria-hidden /><b>loafandco.example</b><em>Live</em></div>
                  <ol>
                    <li><i className="ok" />Production<span>Revision 14</span><em>2 min ago</em></li>
                    <li><i className="ok" />Preview<span>Revision 13</span><em>1 h ago</em></li>
                    <li><i className="ok" />Production<span>Revision 11</span><em>Yesterday</em></li>
                  </ol>
                </div>
                <div className="lx-cap"><h3 className="lp-h3"><Globe size={18} aria-hidden />Publish to a live address</h3><p>One click publishes the page. Add your own domain on Pro and Team, and roll back any time.</p></div>
              </article>
              <article className="lx-cell w5">
                <div className="lx-scene lx-cms" aria-hidden="true">
                  <div className="lp-mini">
                    <div className="r h"><span>title</span><span>views</span><span>status</span></div>
                    <div className="r"><span>Spring menu</span><span>1,204</span><span>Published</span></div>
                    <div className="r"><span>Hiring a baker</span><span>386</span><span>Draft</span></div>
                    <div className="r"><span>Market stall</span><span>92</span><span>Published</span></div>
                  </div>
                  <span className="lx-bind"><FileText aria-hidden />Heading bound to <b>title</b></span>
                </div>
                <div className="lx-cap"><h3 className="lp-h3">Content collections</h3><p>Define fields once, add items, then bind them to headings, lists and dynamic pages.</p></div>
              </article>
              <article className="lx-cell w7">
                <div className="lx-scene lx-ai" aria-hidden="true">
                  <div className="q"><Sparkles aria-hidden />Add a three column feature row under the hero</div>
                  <div className="a"><p>Proposed changes</p><span><GitBranch aria-hidden />Add Columns <em>3 items</em></span><span><GitBranch aria-hidden />Add Heading ×3 <em>sentence case</em></span><div className="btns"><u>Apply</u><s>Dismiss</s></div></div>
                </div>
                <div className="lx-cap"><h3 className="lp-h3">An assistant that asks first</h3><p>Describe a change in words and review the proposed edits before anything touches your page.</p></div>
              </article>
            </div>
          </div>
        </section>

        {/* 7. Questions */}
        <section className="lp-sec-pad lp-rule" aria-labelledby="faq-h">
          <div className="lp-wrap lx-faq">
            <h2 id="faq-h" className="lp-h2">Questions, answered.</h2>
            <div>
              {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
            </div>
          </div>
        </section>

        {/* 8. Plans */}
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
