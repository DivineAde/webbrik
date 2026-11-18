"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { renderPage } from "@webbrik/renderer";
import { useEditor } from "./store";
import { registerCanvasTarget } from "./pointer-drag";
import { registerSnapshot, takeFlip, type Rects } from "./canvas-motion";
import { CompareView } from "./CompareView";
import { ResizeOverlay, type Measure } from "./ResizeOverlay";
import { Rulers } from "./Rulers";
import { useAssetPreviews } from "./assetPreviews";

/** Bridge script injected into the sandboxed canvas iframe. The iframe has no same-origin access to the editor. */
const BRIDGE = `
(function(){
  var hover=null, sel=[], drop=null, editing=null;
  var VOID={area:1,base:1,br:1,col:1,embed:1,hr:1,img:1,input:1,link:1,meta:1,source:1,track:1,wbr:1};
  var MIME='application/x-webbrik-drag';
  function el(t){ return t&&t.closest? t.closest('[data-node-id]'):null; }
  function id(t){ var n=el(t); return n? n.getAttribute('data-node-id'):null; }
  function q(i){ return document.querySelector('[data-node-id="'+i+'"]'); }
  function outline(){
    document.querySelectorAll('[data-node-id]').forEach(function(n){ n.style.outline=''; n.style.outlineOffset='-1px'; n.style.boxShadow=''; });
    if(hover){ var h=q(hover); if(h) h.style.outline='1px dashed oklch(0.55 0.2 260)'; }
    sel.forEach(function(i){ var s=q(i); if(s) s.style.outline='2px solid oklch(0.55 0.2 260)'; });
    var rd=document.getElementById('__wb_root_drop'); if(drop&&drop.root){ if(!rd){ rd=document.createElement('div'); rd.id='__wb_root_drop'; rd.style.cssText='position:fixed;inset:0;pointer-events:none;box-shadow:inset 0 0 0 3px oklch(0.6 0.2 150);background:oklch(0.6 0.2 150 / 6%);z-index:2147483000'; document.body.appendChild(rd); } } else if(rd){ rd.remove(); }
    if(drop&&drop.id){ var d=q(drop.id); if(d){ if(drop.pos==='inside') d.style.outline='2px solid oklch(0.6 0.2 150)'; else d.style.boxShadow=(drop.pos==='before'?'0 -3px 0 0 ':'0 3px 0 0 ')+'oklch(0.6 0.2 150)'; } }
  }
  function isFree(){ var n=sel.length===1?q(sel[0]):null; return !!n&&getComputedStyle(n).position==='absolute'; }
  function post(m){ m.source='canvas'; parent.postMessage(m,'*'); }
  function R(n){ var r=n.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; }
  function measure(){
    var n=sel.length===1?q(sel[0]):null; if(!n){ post({type:'measure-result',id:null}); return; }
    var pe=n.parentElement||document.body, sibs=[];
    for(var i=0;i<pe.children.length&&sibs.length<60;i++){ var c=pe.children[i]; if(c!==n&&c.hasAttribute('data-node-id')) sibs.push(R(c)); }
    var cs=getComputedStyle(n),pcs=getComputedStyle(pe);
    post({type:'measure-result',id:sel[0],rect:R(n),parent:R(pe),siblings:sibs,pos:cs.position,ppos:pcs.position,pb:{l:pe.clientLeft,t:pe.clientTop}});
  }
  window.addEventListener('scroll',measure,true); window.addEventListener('resize',measure);
  document.addEventListener('click',function(e){ if(editing){ return; } e.preventDefault(); post({type:'select',id:id(e.target),additive:e.shiftKey||e.metaKey||e.ctrlKey}); });
  document.addEventListener('keydown',function(e){ if(editing) return; var m=e.metaKey||e.ctrlKey; if((m&&/^[kzd]$/i.test(e.key))||e.key==='Delete'||e.key==='Backspace'||e.key==='Escape'||(e.altKey&&/^Arrow(Up|Down|Left|Right)$/.test(e.key))||(!m&&!e.altKey&&/^Arrow(Up|Down|Left|Right)$/.test(e.key)&&isFree())){ e.preventDefault(); post({type:'key',key:e.key,metaKey:e.metaKey,ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,altKey:e.altKey}); } });
  document.addEventListener('mouseover',function(e){ post({type:'hover',id:id(e.target)}); });
  document.addEventListener('dblclick',function(e){
    var n=el(e.target); if(!n||editing) return;
    if(n.children.length>0||VOID[n.tagName.toLowerCase()]) return;
    editing=n; var before=n.textContent;
    n.contentEditable='plaintext-only'; n.focus();
    var r=document.createRange(); r.selectNodeContents(n); var s=getSelection(); s.removeAllRanges(); s.addRange(r);
    function done(commit){ if(editing!==n) return; editing=null; n.contentEditable='false'; n.removeAttribute('contenteditable'); n.removeEventListener('blur',onBlur); n.removeEventListener('keydown',onKey); if(commit&&n.textContent!==before) post({type:'text',id:n.getAttribute('data-node-id'),text:n.textContent}); else n.textContent=before; }
    function onBlur(){ done(true); }
    function onKey(k){ if(k.key==='Enter'&&!k.shiftKey){ k.preventDefault(); n.blur(); } else if(k.key==='Escape'){ k.preventDefault(); done(false); } k.stopPropagation(); }
    n.addEventListener('blur',onBlur); n.addEventListener('keydown',onKey);
  });
  function hit(x,y){
    var n=el(document.elementFromPoint(x,y)); var root=false;
    if(!n){
      /* The page itself is not an element: empty space means "add to the end of the page" (or next to the nearest top-level element). */
      var kids=document.querySelectorAll('body > [data-node-id]');
      if(kids.length){ var best=null; for(var i=0;i<kids.length;i++){ var kr=kids[i].getBoundingClientRect(); if(kr.top<=y) best=kids[i]; } n=best||kids[0]; var br=n.getBoundingClientRect(); drop={id:n.getAttribute('data-node-id'),pos:(best?'after':'before')}; void br; outline(); post({type:'hit-result',id:drop.id,pos:drop.pos}); return; }
      drop={id:null,root:true}; outline(); post({type:'hit-result',id:null,root:true}); return;
    }
    var r=n.getBoundingClientRect(); var fy=(y-r.top)/Math.max(r.height,1); var canHold=!VOID[n.tagName.toLowerCase()]; var pos=fy<0.25?'before':fy>0.75?'after':(canHold?'inside':(fy<0.5?'before':'after')); drop={id:n.getAttribute('data-node-id'),pos:pos}; outline(); post({type:'hit-result',id:drop.id,pos:pos});
  }
  window.addEventListener('message',function(e){ if(e.data&&e.data.source==='editor'&&e.data.type==='hit'){ hit(e.data.x,e.data.y); return; } if(e.data&&e.data.source==='editor'&&e.data.type==='hit-clear'){ drop=null; outline(); return; } var d=e.data; if(d&&d.source==='editor'&&d.type==='preview-size'){ var t=q(d.id); if(t){ if(d.width!=null) t.style.width=d.width+'px'; if(d.height!=null) t.style.height=d.height+'px'; } measure(); return; } if(d&&d.source==='editor'&&d.type==='preview-box'){ var tb=q(d.id); if(tb){ tb.style.left=d.left+'px'; tb.style.top=d.top+'px'; if(d.width!=null) tb.style.width=d.width+'px'; if(d.height!=null) tb.style.height=d.height+'px'; } measure(); return; } if(d&&d.source==='editor'&&d.type==='clear-box'){ var tc=q(d.id); if(tc){ tc.style.left=''; tc.style.top=''; tc.style.width=''; tc.style.height=''; } measure(); return; } if(d&&d.source==='editor'&&d.type==='clear-size'){ var t2=q(d.id); if(t2){ t2.style.width=''; t2.style.height=''; } measure(); return; } if(e.data&&e.data.source==='editor'){ hover=e.data.hover; sel=e.data.sel||[]; if(!editing) outline(); measure(); } });
  document.addEventListener('contextmenu',function(e){ if(editing) return; e.preventDefault(); post({type:'context',id:id(e.target),x:e.clientX,y:e.clientY}); });
  window.addEventListener('message',function(e){
    var d=e.data; if(!d||d.source!=='editor') return;
    if(d.type==='snap'){ var o={}; document.querySelectorAll('[data-node-id]').forEach(function(n){ var r=n.getBoundingClientRect(); o[n.getAttribute('data-node-id')]={x:r.left,y:r.top+window.scrollY}; }); post({type:'snap-result',rects:o,req:d.req}); }
    if(d.type==='flip'){
      var moved={}, nodes=document.querySelectorAll('[data-node-id]');
      nodes.forEach(function(n){ var k=n.getAttribute('data-node-id'), old=d.rects[k]; if(!old) return; var r=n.getBoundingClientRect(); moved[k]={dx:old.x-r.left,dy:old.y-(r.top+window.scrollY)}; });
      var anim=[];
      nodes.forEach(function(n){ var k=n.getAttribute('data-node-id'), m=moved[k]; if(!m||Math.abs(m.dx)+Math.abs(m.dy)<2) return; var pn=n.parentElement&&n.parentElement.closest('[data-node-id]'), pm=pn&&moved[pn.getAttribute('data-node-id')]; if(pm&&Math.abs(pm.dx-m.dx)<2&&Math.abs(pm.dy-m.dy)<2) return; n.style.transition='none'; n.style.transform='translate('+m.dx+'px,'+m.dy+'px)'; anim.push(n); });
      if(anim.length&&!matchMedia('(prefers-reduced-motion: reduce)').matches){ void document.body.offsetWidth; requestAnimationFrame(function(){ anim.forEach(function(n){ n.style.transition='transform 300ms cubic-bezier(.22,.8,.2,1)'; n.style.transform=''; setTimeout(function(){ n.style.transition=''; },340); }); }); } else anim.forEach(function(n){ n.style.transition=''; n.style.transform=''; });
      var s0=sel.length?q(sel[0]):null; if(s0){ var rr=s0.getBoundingClientRect(); if(rr.top<0||rr.bottom>innerHeight) s0.scrollIntoView({block:'nearest',behavior:'smooth'}); }
    }
  });
})();`;

export function Canvas() {
  const doc = useEditor((s) => s.doc);
  const pageId = useEditor((s) => s.pageId);
  const breakpoint = useEditor((s) => s.breakpoint);
  const zoom = useEditor((s) => s.zoom);
  const zoomManual = useEditor((s) => s.zoomManual);
  // Until a zoom is picked by hand, the page is scaled down to fit the space between the side panels.
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => { if (!boxEl) return; const ro = new ResizeObserver(() => setAvail(boxEl.clientWidth)); ro.observe(boxEl); setAvail(boxEl.clientWidth); return () => ro.disconnect(); }, [boxEl]);
  const showRulers = useEditor((s) => s.showRulers);
  const preview = useEditor((s) => s.preview);
  const selectedIds = useEditor((s) => s.selectedIds);
  const content = useEditor((s) => s.content);
  const hoveredId = useEditor((s) => s.hoveredId);
  const select = useEditor((s) => s.select);
  const hover = useEditor((s) => s.hover);
  const compare = useEditor((s) => s.compare);
  const projectId = useEditor((s) => s.remote?.projectId);
  const assetUrls = useAssetPreviews(doc, projectId);
  const [measure, setMeasure] = useState<Measure | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const hit = useRef<{ id: string; pos: "before" | "inside" | "after" } | null>(null);
  const pending = useRef<((h: { id: string; pos: "before" | "inside" | "after" } | null) => void) | null>(null);
  const snapWait = useRef<((r: Rects | null) => void) | null>(null);
  const rootId = (doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]!).rootId;

  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]!;
  const width = doc.breakpoints.find((b) => b.id === breakpoint)?.maxWidth ?? 1280;
  useEffect(() => {
    if (!avail || zoomManual) return;
    const target = Math.round(Math.min(1, Math.max(0.25, (avail - 64) / width)) * 100) / 100;
    if (Math.abs(target - useEditor.getState().zoom) > 0.004) useEditor.getState().setZoom(target, false);
  }, [avail, width, zoomManual]);

  // Same renderer as publishing; editor mode only adds data-node-id attributes.
  const srcDoc = useMemo(() => {
    // Dynamic pages preview with the collection's first item so bindings show real data while designing.
    const first = page.collectionId ? content[page.collectionId]?.[0] : undefined;
    const { html } = renderPage(doc, page, { editor: !preview, content, resolveAsset: (src) => (src.startsWith("asset:") ? assetUrls[src.slice(6)] ?? "" : src), item: page.collectionId && first ? { collectionId: page.collectionId, item: first } : undefined });
    const bridge = preview ? "" : `<script>${BRIDGE}</script>`;
    return html.replace("</body>", `${bridge}</body>`);
  }, [doc, page, preview, content, assetUrls]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.source !== "canvas") return;
      if (e.data.type === "select") select(e.data.id ?? null, !!e.data.additive);
      if (e.data.type === "context") {
        const r = frame.current?.getBoundingClientRect(); if (!r) return;
        const st = useEditor.getState(), cid = typeof e.data.id === "string" ? e.data.id : null;
        if (cid && !st.selectedIds.includes(cid)) st.select(cid);
        st.openMenu({ id: cid, x: r.left + e.data.x * zoomRef.current, y: r.top + e.data.y * zoomRef.current });
      }
      if (e.data.type === "snap-result") { snapWait.current?.(e.data.rects as Rects); snapWait.current = null; }
      if (e.data.type === "text" && typeof e.data.id === "string" && typeof e.data.text === "string") useEditor.getState().setText(e.data.id, e.data.text);
      if (e.data.type === "measure-result") setMeasure(e.data.id ? { id: e.data.id, rect: e.data.rect, parent: e.data.parent, siblings: e.data.siblings, pos: e.data.pos ?? "static", ppos: e.data.ppos ?? "static", pb: e.data.pb ?? { l: 0, t: 0 } } : null);
      if (e.data.type === "hit-result") { hit.current = e.data.id ? { id: e.data.id, pos: e.data.pos } : e.data.root ? { id: rootIdRef.current, pos: "inside" } : null; pending.current?.(hit.current); pending.current = null; }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [select, hover]);

  const syncFrame = () => frame.current?.contentWindow?.postMessage({ source: "editor", sel: selectedIds, hover: hoveredId }, "*");
  useEffect(() => { syncFrame(); }, [selectedIds, hoveredId, srcDoc]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedIds.length !== 1) setMeasure(null); }, [selectedIds]);
  useEffect(() => { useEditor.getState().setMeasured(measure && selectedIds.length === 1 && measure.id === selectedIds[0] ? measure : null); }, [measure, selectedIds]);
  const postToFrame = (m: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ source: "editor", ...m }, "*");
  const rootIdRef = useRef(rootId); rootIdRef.current = rootId;
  useEffect(() => registerSnapshot(() => new Promise<Rects | null>((resolve) => {
    snapWait.current = resolve; frame.current?.contentWindow?.postMessage({ source: "editor", type: "snap" }, "*");
    setTimeout(() => { if (snapWait.current === resolve) { snapWait.current = null; resolve(null); } }, 150);
  })), []);
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  // The pointer-based drag (see pointer-drag.ts) asks the canvas what is under the pointer through this.
  useEffect(() => registerCanvasTarget({
    rect: () => frame.current?.getBoundingClientRect() ?? null,
    hover: (x, y) => { const r = frame.current?.getBoundingClientRect(); if (r) postToFrame({ type: "hit", x: (x - r.left) / zoomRef.current, y: (y - r.top) / zoomRef.current }); },
    clear: () => { postToFrame({ type: "hit-clear" }); },
    drop: (x, y) => {
      const last = hit.current, r = frame.current?.getBoundingClientRect();
      if (!r) return Promise.resolve(null);
      // Re-hit-test at the exact drop point (the last reply may be a frame behind), falling back to it.
      return new Promise<typeof last>((resolve) => {
        pending.current = resolve;
        postToFrame({ type: "hit", x: (x - r.left) / zoomRef.current, y: (y - r.top) / zoomRef.current });
        setTimeout(() => resolve(last), 300);
      }).then((h) => { pending.current = null; hit.current = null; postToFrame({ type: "hit-clear" }); return h; });
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (compare && !preview) return <CompareView />;

  const empty = (doc.nodes[page.rootId]?.children.length ?? 0) === 0;

  return (
    <div ref={setBoxEl} role="region" aria-label="Canvas" tabIndex={0} className="relative h-full overflow-auto bg-canvas p-8 focus-visible:outline-2 focus-visible:outline-ring">
     <div className="mx-auto" style={{ width: width * zoom, height: "100%", minHeight: 480 * zoom }}>
      <div style={{ width, height: `${100 / zoom}%`, minHeight: 480, transform: `scale(${zoom})`, transformOrigin: "top left" }} className="relative rounded-md border border-border bg-white shadow-[var(--shadow-md)]">
        <iframe
          ref={frame}
          title="Canvas"
          // No allow-same-origin: user content cannot touch the editor's origin, storage or cookies.
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          onLoad={() => { syncFrame(); const f = takeFlip(); if (f) postToFrame({ type: "flip", rects: f }); }}
          className="h-full w-full rounded-md"
        />
        {!preview && showRulers && <Rulers width={width} height={frame.current?.clientHeight ?? 800} zoom={zoom} />}
        {!preview && measure && selectedIds.length === 1 && measure.id === selectedIds[0] && <ResizeOverlay m={measure} zoom={zoom} post={postToFrame} parentId={doc.nodes[measure.id]?.parentId ?? ""} />}
      </div>
     </div>
      {empty && !preview && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-md bg-background/90 px-4 py-2 text-muted-foreground shadow-[var(--shadow-sm)]">Empty page — add an element from the left panel or press ⌘K.</p>
        </div>
      )}
    </div>
  );
}
