"use client";
import Link from "next/link";
import { ArrowRight, ChevronDown, Globe, Menu, MousePointerClick, SlidersHorizontal, Sparkles, TextCursorInput, Database, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import { LogoMark } from "@/components/Logo";
import { api } from "@/lib/api";

const PRODUCT = [
  { icon: MousePointerClick, title: "Visual editor", text: "Drag components onto the page and move them with a right-click.", href: "#main" },
  { icon: SlidersHorizontal, title: "Design panel", text: "Every CSS property in sections, with units and breakpoints.", href: "#product" },
  { icon: Globe, title: "Publishing", text: "Publish to a live address or export clean source files.", href: "#more" },
  { icon: Database, title: "Content collections", text: "Define fields once and bind items to your page.", href: "#more" },
  { icon: TextCursorInput, title: "Forms", text: "Build forms on the canvas with errors under each field.", href: "#more" },
  { icon: Sparkles, title: "AI assistant", text: "Describe a change in words and review it first.", href: "#more" },
] as const;
const LINKS = [["How it works", "#source"], ["Plans", "#plans"]] as const;

type Me = { user: { name: string; email: string } };

/** Sticky header. The right-hand side asks the API who is signed in, so a signed-in visitor sees the dashboard, not "Sign in". */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [user, setUser] = useState<Me["user"] | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { api<Me>("/auth/me").then((r) => setUser(r.user)).catch(() => undefined); }, []);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    if (!mobile) return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMobile(false); };
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", key); };
  }, [mobile]);

  const hold = () => { clearTimeout(timer.current); setOpen(true); };
  const release = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 120); };

  return (
    <>
      <header className={`lp-nav ${scrolled ? "is-scrolled" : ""}`}>
        <div className="lp-wrap lp-nav-in">
          <Brand href="/" className="text-[17px]" />
          <nav aria-label="Main" className="lp-nav-links">
            <div
              ref={wrap} className="lp-prod"
              onMouseEnter={hold} onMouseLeave={release}
              onKeyDown={(e) => { if (e.key === "Escape" && open) { setOpen(false); btn.current?.focus(); } }}
              onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
            >
              <button ref={btn} type="button" className="lp-link lp-prod-btn" aria-expanded={open} aria-controls="lp-product-menu" onClick={() => setOpen((v) => !v)}>
                Product <ChevronDown aria-hidden className={open ? "up" : ""} />
              </button>
              {open && (
                <div id="lp-product-menu" className="lp-prod-panel">
                  <ul>
                    {PRODUCT.map(({ icon: I, title, text, href }) => (
                      <li key={title}>
                        <a href={href} onClick={() => setOpen(false)}>
                          <span className="ic"><I aria-hidden /></span>
                          <span><b>{title}</b><small>{text}</small></span>
                        </a>
                      </li>
                    ))}
                  </ul>
                  <Link href="/editor" className="lp-prod-foot" onClick={() => setOpen(false)}>Try the editor without an account <ArrowRight aria-hidden /></Link>
                </div>
              )}
            </div>
            {LINKS.map(([l, h]) => <a key={h} href={h} className="lp-link">{l}</a>)}
            <Link href="/help" className="lp-link">Help</Link>
          </nav>
          <div className="lp-nav-right">
            {user ? (
              <Link href="/dashboard" className="lp-btn lp-btn-primary">Dashboard <ArrowRight aria-hidden /></Link>
            ) : (
              <>
                <Link href="/login" className="lp-signin lp-link">Sign in</Link>
                <Link href="/login" className="lp-btn lp-btn-primary">Start building <ArrowRight aria-hidden /></Link>
              </>
            )}
            <button type="button" className="lp-burger" aria-label="Open menu" aria-expanded={mobile} aria-controls="lp-mobile" onClick={() => setMobile(true)}><Menu size={18} aria-hidden /></button>
          </div>
        </div>
      </header>
      {mobile && (
        <div id="lp-mobile" className="lp-mobile" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="lp-mobile-top">
            <span className="flex items-center gap-2 font-semibold"><LogoMark size={24} />Webbrik</span>
            <button type="button" className="lp-burger" aria-label="Close menu" onClick={() => setMobile(false)} autoFocus><X size={18} aria-hidden /></button>
          </div>
          <nav aria-label="Menu" className="lp-mobile-nav">
            <p>Product</p>
            {PRODUCT.map(({ icon: I, title, href }) => <a key={title} href={href} onClick={() => setMobile(false)}><I aria-hidden />{title}</a>)}
            <p>More</p>
            {LINKS.map(([l, h]) => <a key={h} href={h} onClick={() => setMobile(false)}>{l}</a>)}
            <Link href="/help">Help</Link>
          </nav>
          <div className="lp-mobile-cta">
            {user ? <Link href="/dashboard" className="lp-btn lp-btn-primary">Dashboard <ArrowRight aria-hidden /></Link> : (
              <>
                <Link href="/login" className="lp-btn lp-btn-primary">Start building <ArrowRight aria-hidden /></Link>
                <Link href="/login" className="lp-btn lp-btn-line">Sign in</Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
