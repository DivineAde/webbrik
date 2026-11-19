import type { CSSProperties } from "react";

/**
 * Generated site snapshots: small, believable pages drawn in HTML and CSS from a config, so the homepage can show
 * what people build without screenshots. Everything is sized in container units, so a snapshot scales to any card.
 */
export interface SnapSite {
  id: string; brand: string; kind: string;
  layout: "split" | "center" | "grid" | "type" | "dash";
  links: string[]; h: string; p: string; cta: string;
  bg: string; ink: string; accent: string; accent2: string; soft: string; serif?: boolean;
  tiles?: string[]; items?: [string, string][];
}

export const SITES: SnapSite[] = [
  { id: "loaf", brand: "Loaf & Co.", kind: "Bakery", layout: "split", links: ["Menu", "Story", "Visit"], h: "Bread, baked before you wake.", p: "Small-batch sourdough and pastries, delivered across the city by 7am.", cta: "Order for tomorrow", bg: "#f6efe0", ink: "#26301f", accent: "#2f5d3a", accent2: "#e9b949", soft: "#e8dcc3" },
  { id: "atlas", brand: "Atlas", kind: "Finance", layout: "dash", links: ["Product", "Pricing", "Docs"], h: "Money moves, minus the friction.", p: "Pay suppliers in 40 currencies from one balance.", cta: "Open an account", bg: "#f4f6f8", ink: "#0f1b2d", accent: "#1d5fe8", accent2: "#0f1b2d", soft: "#e4e9f0" },
  { id: "fern", brand: "Fernhill", kind: "Architecture", layout: "type", links: ["Work", "Studio", "Journal"], h: "Quiet buildings, made to last.", p: "", cta: "See the work", bg: "#efeeea", ink: "#171717", accent: "#171717", accent2: "#8d9b87", soft: "#dcdad2", items: [["Orchard House", "2024"], ["Canal Studios", "2023"], ["St Aidan's Library", "2022"], ["Hollow Lane", "2021"]] },
  { id: "kite", brand: "Kite", kind: "Outdoor", layout: "grid", links: ["Shop", "Journal", "Stores"], h: "Gear for long days outside.", p: "", cta: "Shop the spring range", bg: "#ffffff", ink: "#111111", accent: "#ff5a36", accent2: "#111111", soft: "#f1f1ef", tiles: ["#ff5a36", "#2b5f8a", "#e9e3d3", "#1f2a1f"] },
  { id: "moss", brand: "Moss", kind: "Plant shop", layout: "center", links: ["Plants", "Care", "Gifts"], h: "Houseplants that survive you.", p: "Hardy, honest picks with care notes in the box.", cta: "Find your plant", bg: "#e7efe3", ink: "#14301f", accent: "#14301f", accent2: "#c9dcc0", soft: "#d5e3cf", tiles: ["#a9c9a0", "#d5e3cf", "#7fa876"] },
  { id: "pulse", brand: "Pulse", kind: "Fitness app", layout: "dash", links: ["Features", "Coaches", "Plans"], h: "Train smarter, rest properly.", p: "Plans that adapt to how you slept.", cta: "Start 14-day trial", bg: "#15161a", ink: "#f2f2f4", accent: "#ff4d8d", accent2: "#f2f2f4", soft: "#23252b" },
  { id: "orchard", brand: "Orchard Press", kind: "Publisher", layout: "type", links: ["Books", "Authors", "Events"], h: "Books worth the shelf space.", p: "", cta: "Browse the list", bg: "#fbf8f2", ink: "#2a1b17", accent: "#7a1f2b", accent2: "#2a1b17", soft: "#ece4d6", serif: true, items: [["The Salt Road", "Fiction"], ["Small Gardens", "Nature"], ["A Field Guide to Rain", "Essays"], ["Night Ferry", "Fiction"]] },
  { id: "nimbus", brand: "Nimbus", kind: "Software", layout: "center", links: ["Product", "Changelog", "Pricing"], h: "Ship support that feels human.", p: "One inbox for chat, email and tickets.", cta: "Try it free", bg: "#eef4fb", ink: "#0b2239", accent: "#0a84ff", accent2: "#0b2239", soft: "#d8e6f7", tiles: ["#ffffff", "#ffffff", "#ffffff"] },
];

const Spark = ({ color, bg }: { color: string; bg: string }) => (
  <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden><rect width="100" height="40" fill={bg} /><polyline points="0,32 12,28 24,30 36,20 48,24 60,12 72,16 84,6 100,9" fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" /></svg>
);

export function Snap({ s, stack = false, className = "" }: { s: SnapSite; stack?: boolean; className?: string }) {
  const style = { "--bg": s.bg, "--ink": s.ink, "--ac": s.accent, "--ac2": s.accent2, "--soft": s.soft } as CSSProperties;
  const dark = s.id === "pulse";
  return (
    <div data-id={s.id} className={`snap ${s.serif ? "serif" : ""} ${stack ? "stack" : ""} ${className}`} data-l={s.layout} style={style} aria-hidden="true">
      <div className="sn-nav"><b>{s.brand}</b><span>{s.links.map((l) => <i key={l}>{l}</i>)}</span><em>{s.cta.split(" ").slice(0, 2).join(" ")}</em></div>
      {s.layout === "split" && (
        <div className="sn-body">
          <div className="sn-copy"><h4>{s.h}</h4><p>{s.p}</p><u>{s.cta}</u></div>
          <div className="sn-art"><i className="a" /><i className="b" /><i className="c" /></div>
        </div>
      )}
      {s.layout === "center" && (
        <div className="sn-body">
          <div className="sn-copy"><h4>{s.h}</h4><p>{s.p}</p><u>{s.cta}</u></div>
          <div className="sn-cards">{(s.tiles ?? []).map((t, i) => <div key={i} style={{ background: t }}><i /><i /></div>)}</div>
        </div>
      )}
      {s.layout === "grid" && (
        <div className="sn-body">
          <div className="sn-copy"><h4>{s.h}</h4><u>{s.cta}</u></div>
          <div className="sn-tiles">{(s.tiles ?? []).map((t, i) => <div key={i}><span style={{ background: t }} /><i /><i /></div>)}</div>
        </div>
      )}
      {s.layout === "type" && (
        <div className="sn-body">
          <h4>{s.h}</h4>
          <ol>{(s.items ?? []).map(([a, b]) => <li key={a}><span>{a}</span><em>{b}</em></li>)}</ol>
        </div>
      )}
      {s.layout === "dash" && (
        <div className="sn-body">
          <div className="sn-copy"><h4>{s.h}</h4><p>{s.p}</p><u>{s.cta}</u></div>
          <div className="sn-ui">
            <div className="sn-stat"><small>Balance</small><b>$48,210</b><Spark color={s.accent} bg={dark ? "#23252b" : "#fff"} /></div>
            <div className="sn-rows"><span><i />Payroll<em>-$6,400</em></span><span><i />Supplier<em>-$1,180</em></span><span><i />Refund<em>+$240</em></span></div>
          </div>
        </div>
      )}
    </div>
  );
}
