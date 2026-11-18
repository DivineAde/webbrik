"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { renderPage } from "@webbrik/renderer";
import { useAssetPreviews } from "./assetPreviews";
import { useEditor } from "./store";

const GAP = 16;

const LITE = `(function(){
  var sel=[]; var st=document.createElement('style'); st.textContent='[data-node-id]{cursor:default}.__wb_sel{outline:2px solid oklch(0.55 0.2 260)!important;outline-offset:-2px}'; document.head.appendChild(st);
  function el(t){ while(t&&t.nodeType===1&&!t.getAttribute('data-node-id')) t=t.parentElement; return t&&t.nodeType===1?t:null; }
  function paint(){ document.querySelectorAll('.__wb_sel').forEach(function(n){n.classList.remove('__wb_sel')}); sel.forEach(function(id){ var n=document.querySelector('[data-node-id="'+id+'"]'); if(n) n.classList.add('__wb_sel'); }); }
  document.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); var n=el(e.target); parent.postMessage({source:'compare',type:'select',id:n?n.getAttribute('data-node-id'):null,additive:e.shiftKey||e.metaKey||e.ctrlKey},'*'); },true);
  document.addEventListener('submit',function(e){e.preventDefault()},true);
  window.addEventListener('message',function(e){ if(e.data&&e.data.source==='editor'){ sel=e.data.sel||[]; paint(); } });
  parent.postMessage({source:'compare',type:'ready'},'*');
})();`;

/** Every breakpoint side by side, rendered by the same renderer as publishing. Click an element in any frame to select it and edit it at that frame's breakpoint. */
export function CompareView() {
  const doc = useEditor((s) => s.doc);
  const pageId = useEditor((s) => s.pageId);
  const content = useEditor((s) => s.content);
  const setBreakpoint = useEditor((s) => s.setBreakpoint);
  const setCompare = useEditor((s) => s.setCompare);
  const select = useEditor((s) => s.select);
  const selectedIds = useEditor((s) => s.selectedIds);
  const active = useEditor((s) => s.breakpoint);
  const refs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const assetUrls = useAssetPreviews(doc, useEditor((s) => s.remote?.projectId));
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(1200);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el); setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]!;
  const frames = useMemo(() => {
    const first = page.collectionId ? content[page.collectionId]?.[0] : undefined;
    const html = renderPage(doc, page, { editor: true, content, resolveAsset: (src) => (src.startsWith("asset:") ? assetUrls[src.slice(6)] ?? "" : src), item: page.collectionId && first ? { collectionId: page.collectionId, item: first } : undefined }).html;
    return [...doc.breakpoints].map((b) => ({ id: b.id, label: b.label, width: b.maxWidth ?? 1280 })).sort((a, b) => b.width - a.width).map((f) => ({ ...f, html: html.replace("</body>", `<script>${LITE}</script></body>`) }));
  }, [doc, page, content, assetUrls]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.source !== "compare") return;
      const frame = Object.entries(refs.current).find(([, el]) => el?.contentWindow === e.source);
      if (!frame) return;
      if (e.data.type === "select") { setBreakpoint(frame[0]); select(e.data.id ?? null, !!e.data.additive); }
      if (e.data.type === "ready") (e.source as Window).postMessage({ source: "editor", sel: useEditor.getState().selectedIds }, "*");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [select, setBreakpoint]);
  useEffect(() => { for (const el of Object.values(refs.current)) el?.contentWindow?.postMessage({ source: "editor", sel: selectedIds }, "*"); }, [selectedIds, frames]);
  const total = frames.reduce((n, f) => n + f.width, 0) + GAP * (frames.length - 1);
  const scale = Math.min(1, (avail - 32) / total);

  return (
    <div ref={box} role="region" aria-label="Breakpoint comparison" tabIndex={0} className="h-full overflow-auto bg-canvas p-4" data-testid="compare">
      <div className="mx-auto flex items-start gap-4" style={{ width: total * scale }}>
        {frames.map((f) => (
          <figure key={f.id} className="shrink-0" style={{ width: f.width * scale }}>
            <figcaption className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium">{f.label}<span className="ml-1 text-muted-foreground">{f.width}px</span>{active === f.id && <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">editing</span>}</span>
              <button type="button" className="rounded px-1.5 py-0.5 text-muted-foreground underline hover:text-foreground" onClick={() => { setBreakpoint(f.id); setCompare(false); }}>Full view</button>
            </figcaption>
            <div className="overflow-hidden rounded-md border border-border bg-white shadow-[var(--shadow-md)]" style={{ width: f.width * scale, height: 720 * scale }}>
              {/* Scripts only for the tiny selection bridge; no same-origin, so page content can't reach the editor. */}
              <iframe ref={(el) => { refs.current[f.id] = el; }} title={`${f.label} preview`} sandbox="allow-scripts" srcDoc={f.html} className="border-0" style={{ width: f.width, height: 720, transform: `scale(${scale})`, transformOrigin: "top left" }} />
            </div>
          </figure>
        ))}
      </div>
    </div>
  );
}
