import type { Document } from "@webbrik/document-model";

export interface RuntimeOptions {
  /** Where published forms post to: the API's public origin and this project's id. */
  forms?: { endpoint: string; projectId: string };
}

const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/** Does the document use forms or paginated repeaters (things the browser runtime must enhance)? */
export const usesForms = (doc: Document) => Object.values(doc.nodes).some((n) => n.tag === "form" && typeof n.props["formId"] === "string");
export const usesPagination = (doc: Document) => Object.values(doc.nodes).some((n) => Number(n.props["repeatPageSize"]) >= 1 && (n.props["repeat"] || n.props["repeatRef"]));

const FORMS_RUNTIME = (cfg: unknown) => `(function(){
var cfg=${json(cfg)};
function status(f){var s=f.querySelector("[data-wb-form-status]");if(!s){s=document.createElement("p");s.setAttribute("data-wb-form-status","");s.setAttribute("role","status");s.setAttribute("aria-live","polite");f.appendChild(s);}return s;}
function collect(f){var d={};Array.prototype.forEach.call(f.elements,function(e){if(!e.name||e.disabled||e.type==="submit"||e.type==="button")return;
 if(e.type==="checkbox")d[e.name]=e.checked;else if(e.type==="radio"){if(e.checked)d[e.name]=e.value;}else d[e.name]=e.value;});return d;}
function bind(f){if(f.__wb)return;f.__wb=1;f.addEventListener("submit",function(ev){ev.preventDefault();
 var s=status(f),id=f.getAttribute("data-wb-form"),btn=f.querySelector('[type="submit"],button:not([type])');
 if(!cfg||!cfg.endpoint&&!cfg.projectId){s.textContent="This form is not connected yet.";return;}
 if(f.checkValidity&&!f.checkValidity()){f.reportValidity&&f.reportValidity();return;}
 if(btn)btn.disabled=true;f.setAttribute("aria-busy","true");s.textContent="Sending…";
 fetch((cfg.endpoint||"")+"/v1/public/forms/"+encodeURIComponent(cfg.projectId)+"/"+encodeURIComponent(id),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(collect(f))})
 .then(function(r){return r.json().catch(function(){return{};}).then(function(b){return{ok:r.ok,status:r.status,body:b};});})
 .then(function(r){
  if(r.ok){var to=f.getAttribute("data-wb-redirect");s.textContent=f.getAttribute("data-wb-success")||"Thanks! Your message was sent.";f.reset();if(to)location.href=to;}
  else if(r.status===429)s.textContent="Too many submissions. Please try again in a minute.";
  else if(r.status===400&&r.body&&r.body.details&&r.body.details.length)s.textContent="Please check: "+r.body.details.join("; ");
  else s.textContent="Sorry, that could not be sent. Please try again.";})
 .catch(function(){s.textContent="Could not reach the server. Please try again.";})
 .then(function(){if(btn)btn.disabled=false;f.removeAttribute("aria-busy");});});}
function scan(){Array.prototype.forEach.call(document.querySelectorAll("form[data-wb-form]"),bind);}
window.__bindForms=scan;scan();
})();`;

const PAGINATION_RUNTIME = `(function(){
function paginate(box){if(box.__wbp)return;box.__wbp=1;var size=parseInt(box.getAttribute("data-wb-paginate"),10);if(!(size>=1))return;
 var els=Array.prototype.slice.call(box.querySelectorAll(":scope > [data-wb-item]"));var groups={};var order=[];
 els.forEach(function(e){var k=e.getAttribute("data-wb-item");if(!groups[k]){groups[k]=[];order.push(k);}groups[k].push(e);});
 var pages=Math.ceil(order.length/size);if(pages<=1)return;var page=1;
 var nav=document.createElement("nav");nav.className="wb-pager";nav.setAttribute("aria-label","Pagination");
 var prev=document.createElement("button");prev.type="button";prev.textContent="Previous";
 var info=document.createElement("span");info.setAttribute("aria-live","polite");
 var next=document.createElement("button");next.type="button";next.textContent="Next";
 nav.appendChild(prev);nav.appendChild(info);nav.appendChild(next);box.parentNode.insertBefore(nav,box.nextSibling);
 function show(){order.forEach(function(k,i){var on=i>=(page-1)*size&&i<page*size;groups[k].forEach(function(e){e.style.display=on?"":"none";});});
  info.textContent="Page "+page+" of "+pages;prev.disabled=page<=1;next.disabled=page>=pages;}
 prev.onclick=function(){if(page>1){page--;show();}};next.onclick=function(){if(page<pages){page++;show();}};show();}
if(!document.getElementById("wb-pager-style")){var st=document.createElement("style");st.id="wb-pager-style";st.textContent=".wb-pager{display:flex;gap:12px;align-items:center;justify-content:center;margin-top:16px}.wb-pager button{padding:6px 14px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer}.wb-pager button:disabled{opacity:.4;cursor:default}";document.head.appendChild(st);}
function scan(){Array.prototype.forEach.call(document.querySelectorAll("[data-wb-paginate]"),paginate);}
window.__bindPagination=scan;scan();
})();`;

/** Generates a tiny dependency-free runtime from the document's interactions, forms and paginated lists, for preview/publish/export. */
export function buildInteractionRuntime(doc: Document, options: RuntimeOptions = {}): string {
  const parts = [buildInteractions(doc)];
  if (usesForms(doc)) parts.push(FORMS_RUNTIME(options.forms ?? null));
  if (usesPagination(doc)) parts.push(PAGINATION_RUNTIME);
  return parts.filter(Boolean).join("\n");
}

function buildInteractions(doc: Document): string {
  const items = Object.values(doc.nodes).flatMap((n) => n.interactions.map((i) => ({ node: n.id, ...i })));
  if (!items.length) return "";
  const data = JSON.stringify(items).replace(/</g, "\\u003c");
  const anims = JSON.stringify(Object.fromEntries(Object.values(doc.animations ?? {}).map((a) => [a.id, a.name]))).replace(/</g, "\\u003c");
  return `(function(){
var items=${data};var anims=${anims};
var reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
function el(id){return document.querySelector('[data-node-id="'+id+'"]');}
function act(i){var t=el(i.targetId||i.node); if(!t&&i.action!=="navigate")return;
 if(i.action==="show")t.hidden=false; else if(i.action==="hide")t.hidden=true; else if(i.action==="toggle")t.hidden=!t.hidden;
 else if(i.action==="navigate"&&i.params&&typeof i.params.href==="string"&&/^(\\/|https?:)/.test(i.params.href))location.href=i.params.href;
 else if(i.action==="scrollTo")t.scrollIntoView({behavior:reduce?"auto":"smooth"});
 else if(i.action==="animate"&&i.params&&anims[i.params.animationId]){var c="anim-"+anims[i.params.animationId];t.classList.remove(c);void t.offsetWidth;t.classList.add(c);}
 else if(i.action==="animate"&&!reduce&&t.animate)t.animate([{opacity:0,transform:"translateY(8px)"},{opacity:1,transform:"none"}],{duration:300,easing:"ease-out"});}
function bind(){items.forEach(function(i){var n=el(i.node); if(!n)return; var k="__i_"+i.id; if(n[k])return; n[k]=1;
 if(i.trigger==="load")act(i);
 else if(i.trigger==="visible"){var o=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){act(i);o.disconnect();}});});o.observe(n);}
 else{var ev={click:"click",hover:"mouseenter",focus:"focus",keydown:"keydown",scroll:"scroll"}[i.trigger];
  if(ev)n.addEventListener(ev,function(){act(i);});}});}
window.__bindInteractions=bind; bind();
})();`;
}
