"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";

/** A small working editor for the hero. Click a section, restyle it, move it. A cursor loops a demo; the visitor can take over at any time. */

type Id = "hero" | "menu" | "story" | "join";
interface Look { bg: string; pad: number; radius: number; align: "left" | "center" }
const NAMES: Record<Id, string> = { hero: "Hero", menu: "Menu", story: "Story", join: "Newsletter" };
const SWATCHES = [["#ffffff", "White"], ["#f6efe0", "Flour"], ["#1d2a1f", "Crust"], ["#dfead9", "Sage"], ["#f3d98b", "Butter"]] as const;
const START: Record<Id, Look> = {
  hero: { bg: "#f6efe0", pad: 5.5, radius: 0, align: "left" },
  menu: { bg: "#ffffff", pad: 4.5, radius: 0, align: "left" },
  story: { bg: "#dfead9", pad: 4.5, radius: 0, align: "left" },
  join: { bg: "#1d2a1f", pad: 4, radius: 0, align: "left" },
};
const isDark = (hex: string) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 128; };
const px = (cqw: number) => Math.round(cqw * 8);

export function HeroBuilder() {
  const [order, setOrder] = useState<Id[]>(["hero", "menu", "story", "join"]);
  const [look, setLook] = useState(START);
  const [sel, setSel] = useState<Id>("hero");
  const [touched, setTouched] = useState(false);
  const frame = useRef<HTMLDivElement>(null), cursor = useRef<HTMLDivElement>(null), page = useRef<HTMLDivElement>(null);
  const tops = useRef(new Map<string, number>());
  const pausedUntil = useRef(0);
  const zoomEl = useRef<HTMLDivElement>(null);
  const [pub, setPub] = useState(false);

  const patch = useCallback((id: Id, p: Partial<Look>) => setLook((l) => ({ ...l, [id]: { ...l[id], ...p } })), []);
  const move = useCallback((id: Id, d: -1 | 1) => setOrder((o) => { const i = o.indexOf(id), j = i + d; if (j < 0 || j >= o.length) return o; const n = [...o]; [n[i], n[j]] = [n[j]!, n[i]!]; return n; }), []);

  // Slide sections to their new place when the order changes.
  useLayoutEffect(() => {
    const el = page.current; if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.querySelectorAll<HTMLElement>("[data-sec]").forEach((s) => {
      const top = s.offsetTop, prev = tops.current.get(s.dataset.sec!);
      if (!reduce && prev !== undefined && prev !== top) s.animate([{ transform: `translateY(${prev - top}px)` }, { transform: "none" }], { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" });
      tops.current.set(s.dataset.sec!, top);
    });
  }, [order]);

  // An endless demo: a cursor edits the page, the view zooms in and out, then the page resets and it starts again.
  // A visitor's own click or key press pauses it, and it resumes after a few idle seconds.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const f = frame.current, c = cursor.current, z = zoomEl.current; if (!f || !c || !z) return;
    let dead = false, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; }, { threshold: 0.2 });
    io.observe(f);
    const wide = () => innerWidth > 720;
    const wait = async (ms: number) => {
      let left = ms;
      while (left > 0 && !dead) {
        const idle = Date.now() < pausedUntil.current || !visible || document.hidden;
        await new Promise<void>((r) => setTimeout(r, 100));
        if (!idle) left -= 100;
      }
    };
    const zoom = async (to: "out" | "insp" | "page") => {
      if (!wide()) return;
      const [scale, origin] = to === "insp" ? [1.32, "100% 35%"] : to === "page" ? [1.22, "50% 18%"] : [1, "50% 50%"];
      z.style.transformOrigin = origin; z.style.transform = `scale(${scale})`;
      await wait(1100);
    };
    const click = async (q: string, run: () => void) => {
      const t = f.querySelector<HTMLElement>(q);
      if (t && t.offsetParent !== null) {
        const a = f.getBoundingClientRect(), b = t.getBoundingClientRect();
        c.style.transform = `translate(${b.left - a.left + Math.min(b.width * 0.55, 60)}px, ${b.top - a.top + b.height * 0.55}px)`; c.dataset.on = "1";
        await wait(1000);
      }
      if (dead) return; run(); await wait(700);
    };
    const reset = () => { setOrder(["hero", "menu", "story", "join"]); setLook(START); setSel("hero"); setPub(false); };
    (async () => {
      await wait(1500);
      while (!dead) {
        await click('[data-layer="menu"]', () => setSel("menu"));
        await zoom("insp");
        await click('[data-sw="2"]', () => patch("menu", { bg: SWATCHES[2][0] }));
        await click('[data-ctl="radius"]', () => patch("menu", { radius: 2.5 }));
        await zoom("out");
        await click('[data-layer="story"]', () => setSel("story"));
        await click('[data-up="story"]', () => move("story", -1));
        await click('[data-sw="4"]', () => patch("story", { bg: SWATCHES[4][0] }));
        await click('[data-layer="hero"]', () => setSel("hero"));
        await click('[data-al="center"]', () => patch("hero", { align: "center" }));
        await zoom("page");
        await wait(1400);
        await zoom("out");
        await click("[data-pub]", () => setPub(true));
        await wait(1800);
        c.dataset.on = "0"; reset();
        await wait(1600);
      }
    })();
    return () => { dead = true; io.disconnect(); c.dataset.on = "0"; z.style.transform = ""; };
  }, [patch, move]);

  const touch = () => { pausedUntil.current = Date.now() + 7000; setTouched(true); if (cursor.current) cursor.current.dataset.on = "0"; };
  const cur = look[sel];

  return (
    <div className="lx-app" ref={frame} onPointerDownCapture={touch} onKeyDownCapture={touch}>
      <div className="lx-bar">
        <span className="lx-dots"><i /><i /><i /></span>
        <b>Loaf &amp; Co.</b><span className="lx-saved">{pub ? "Live" : "Saved"}</span>
        <span className="lx-bar-end"><span>Desktop</span><span>100%</span><span className="lx-pub" data-pub>{pub ? "Published" : "Publish"}</span></span>
      </div>
      <div className="lx-zoom" ref={zoomEl}>
      <div className="lx-body">
        <aside className="lx-layers" aria-label="Layers">
          <p className="lx-h">Layers</p>
          <ul>
            {order.map((id, i) => (
              <li key={id} className={sel === id ? "on" : ""}>
                <GripVertical aria-hidden className="grip" />
                <button type="button" data-layer={id} onClick={() => setSel(id)} aria-pressed={sel === id}>{NAMES[id]}</button>
                <span className="mv">
                  <button type="button" data-up={id} disabled={i === 0} aria-label={`Move ${NAMES[id]} up`} onClick={() => move(id, -1)}><ArrowUp aria-hidden /></button>
                  <button type="button" data-down={id} disabled={i === order.length - 1} aria-label={`Move ${NAMES[id]} down`} onClick={() => move(id, 1)}><ArrowDown aria-hidden /></button>
                </span>
              </li>
            ))}
          </ul>
        </aside>
        <div className="lx-stage">
          <div className="lx-page" ref={page}>
            <div className="lx-site-nav"><b>Loaf &amp; Co.</b><span><i>Menu</i><i>Story</i><i>Visit</i></span><em>Order</em></div>
            {order.map((id) => {
              const l = look[id], dark = isDark(l.bg);
              return (
                <section key={id} data-sec={id} tabIndex={0} aria-label={`${NAMES[id]} section. Select to edit.`} className={`lx-sec ${sel === id ? "sel" : ""} ${dark ? "dark" : ""}`}
                  style={{ background: l.bg, padding: `${l.pad}cqw 5cqw`, borderRadius: `${l.radius}cqw`, textAlign: l.align, margin: l.radius ? "0 2cqw" : 0 }}
                  onClick={() => setSel(id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(id); } }}>
                  {sel === id && <span className="lx-tag">{NAMES[id]}</span>}
                  {id === "hero" && <><h3>Bread, baked before you wake.</h3><p>Small-batch sourdough and pastries, delivered across the city by 7am.</p><u>Order for tomorrow</u></>}
                  {id === "menu" && <><h5>This week</h5><div className="lx-cards">{[["Country loaf", "£6.50", "#e9b949"], ["Cardamom bun", "£3.20", "#c98a4b"], ["Seeded rye", "£5.80", "#7a8b5a"]].map(([n, p, c]) => <div key={n}><span style={{ background: c }} /><b>{n}</b><em>{p}</em></div>)}</div></>}
                  {id === "story" && <><h5>Our story</h5><p>Two bakers, one oven and a starter that is older than the shop. We mill our own flour on Fridays.</p></>}
                  {id === "join" && <><h5>Saturday emails</h5><div className="lx-form"><span>name@email.com</span><u>Join</u></div></>}
                </section>
              );
            })}
          </div>
        </div>
        <aside className="lx-insp" aria-label="Style">
          <div className="lx-tabs"><b>Style</b><span>Settings</span></div>
          <p className="lx-h">{NAMES[sel]} section</p>
          <div className="lx-f"><label id="lx-bg">Background</label>
            <div role="radiogroup" aria-labelledby="lx-bg" className="lx-sw">
              {SWATCHES.map(([hex, name], i) => <button key={hex} type="button" role="radio" aria-checked={cur.bg === hex} aria-label={name} data-sw={i} style={{ background: hex }} onClick={() => patch(sel, { bg: hex })} />)}
            </div></div>
          <div className="lx-f"><label htmlFor="lx-pad">Padding <em>{px(cur.pad)}px</em></label><input id="lx-pad" data-ctl="pad" type="range" min={1} max={9} step={0.5} value={cur.pad} onChange={(e) => patch(sel, { pad: +e.target.value })} /></div>
          <div className="lx-f"><label htmlFor="lx-rad">Radius <em>{px(cur.radius)}px</em></label><input id="lx-rad" data-ctl="radius" type="range" min={0} max={5} step={0.5} value={cur.radius} onChange={(e) => patch(sel, { radius: +e.target.value })} /></div>
          <div className="lx-f"><label id="lx-al">Text align</label>
            <div role="group" aria-labelledby="lx-al" className="lx-seg">
              {(["left", "center"] as const).map((a) => <button key={a} type="button" data-al={a} aria-pressed={cur.align === a} onClick={() => patch(sel, { align: a })}>{a === "left" ? "Left" : "Center"}</button>)}
            </div></div>
          <pre className="lx-css" aria-label="Generated CSS"><span>.{sel}</span> {"{"}{"\n"}  padding: {px(cur.pad)}px 40px;{"\n"}  border-radius: {px(cur.radius)}px;{"\n"}  background: {cur.bg};{"\n"}{"}"}</pre>
        </aside>
      </div>
      </div>
      <div className="lx-cursor" ref={cursor} data-on="0" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 18 18"><path d="M2 1.5 15.5 8l-5.6 1.7L7.3 15 2 1.5Z" fill="oklch(0.55 0.2 260)" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" /></svg><span>Ada</span>
      </div>
      {!touched && <p className="lx-hint" aria-hidden>Click anything to take over.</p>}
    </div>
  );
}
