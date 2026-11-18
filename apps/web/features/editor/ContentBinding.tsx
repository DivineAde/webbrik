"use client";
import { Button } from "@/components/ui/button";
import { useEditor } from "./store";
import { Section } from "./style-controls";

const TARGETS = [["text", "Text"], ["html", "Rich text"], ["src", "Image source"], ["href", "Link URL"], ["alt", "Alt text"]] as const;
type Target = (typeof TARGETS)[number][0];
const OPS = [["eq", "is"], ["ne", "is not"], ["contains", "contains"], ["gt", ">"], ["lt", "<"]] as const;
interface Where { field: string; op: string; value: string }

/** Own fields plus one level of reference fields ("author.name"). */
function fieldPaths(col: { fields: { name: string; type: string; to?: string }[] }, all: { slug: string; fields: { name: string }[] }[]) {
  return col.fields.flatMap((f) => [f.name, ...(f.type === "reference" || f.type === "multireference" ? (all.find((c) => c.slug === f.to)?.fields.map((t) => `${f.name}.${t.name}`) ?? []) : [])]);
}

/** Inspector section: bind an element to a CMS field, or repeat its children for each item of a collection. */
export function ContentBinding({ id }: { id: string }) {
  const node = useEditor((s) => s.doc.nodes[id]);
  const collections = useEditor((s) => s.collections);
  const connected = useEditor((s) => !!s.remote);
  const commit = useEditor((s) => s.commit);
  if (!node) return null;
  const b = node.binding;
  const col = collections.find((c) => c.id === b?.collectionId);
  const setBinding = (next: { collectionId: string; field: string; target: Target } | undefined) => commit(next ? "Bind to content" : "Remove binding", [{ type: "updateElement", id, patch: { binding: next } }]);
  const repeat = typeof node.props["repeat"] === "string" ? (node.props["repeat"] as string) : "";
  const repeatRef = typeof node.props["repeatRef"] === "string" ? (node.props["repeatRef"] as string) : "";
  const repeatRefTo = typeof node.props["repeatRefTo"] === "string" ? (node.props["repeatRefTo"] as string) : "";
  /** Collection whose fields the filter/sort options refer to. */
  const source = repeat || repeatRefTo;
  /** Every reference / multi-reference field in the project, as "Collection → field". */
  const refOptions = collections.flatMap((c) => c.fields.filter((f) => (f.type === "reference" || f.type === "multireference") && collections.some((t) => t.slug === f.to)).map((f) => ({ key: `${c.id}:${f.name}`, label: `${c.name} → ${f.name}`, field: f.name, to: collections.find((t) => t.slug === f.to)!.id })));
  const setProps = (patch: Record<string, unknown>) => {
    const props = { ...node.props };
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === "") delete props[k]; else props[k] = v; }
    return commit("Edit repeater", [{ type: "updateElement", id, patch: { props } }]);
  };
  return (
    <Section title="Content (CMS)" id="cms">
      {!connected ? <p className="text-xs text-muted-foreground">Open a saved project to bind elements to your collections.</p>
        : collections.length === 0 ? <p className="text-xs text-muted-foreground">No collections yet. Create one in Project settings → Content.</p> : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-xs">Bind to field
              <select aria-label="Binding collection" className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs" value={b?.collectionId ?? ""} onChange={(e) => { const c = collections.find((x) => x.id === e.target.value); setBinding(c ? { collectionId: c.id, field: c.fields[0]?.name ?? "", target: "text" } : undefined); }}>
                <option value="">None</option>{collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {b && col && (
              <div className="grid grid-cols-2 gap-1.5">
                <select aria-label="Binding field" className="h-8 rounded-md border border-border bg-background px-2 text-xs" value={b.field} onChange={(e) => setBinding({ ...b, target: b.target ?? "text", field: e.target.value })}>{fieldPaths(col, collections).map((p) => <option key={p} value={p}>{p}</option>)}</select>
                <select aria-label="Binding target" className="h-8 rounded-md border border-border bg-background px-2 text-xs" value={b.target ?? "text"} onChange={(e) => setBinding({ ...b, target: e.target.value as Target })}>{TARGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </div>
            )}
            {b && <p className="text-xs text-muted-foreground">Needs a repeater or dynamic page above it to know which item to show. Static text stays as the fallback.</p>}
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs">Repeat children for each item of
              <select aria-label="Repeat collection" className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs" value={repeat} onChange={(e) => setProps({ repeat: e.target.value, repeatRef: undefined, repeatRefTo: undefined })}>
                <option value="">Don’t repeat</option>{collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {refOptions.length > 0 && (
              <label className="block text-xs">…or for each item a reference field points to
                <select aria-label="Repeat reference field" className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs" value={refOptions.find((o) => o.field === repeatRef && o.to === repeatRefTo)?.key ?? ""} onChange={(e) => { const o = refOptions.find((x) => x.key === e.target.value); setProps({ repeat: undefined, repeatRef: o?.field, repeatRefTo: o?.to }); }}>
                  <option value="">None</option>{refOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
                <span className="mt-0.5 block text-xs text-muted-foreground">Use inside a repeater or dynamic page of that collection, e.g. a post’s tags.</span>
              </label>
            )}
            {source && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Only show items where</p>
                {(Array.isArray(node.props["repeatWhere"]) ? (node.props["repeatWhere"] as Where[]) : []).map((w, i) => {
                  const set = (next: Where | null) => { const list = [...(node.props["repeatWhere"] as Where[])]; if (next) list[i] = next; else list.splice(i, 1); return setProps({ repeatWhere: list.length ? list : undefined }); };
                  return (
                    <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1">
                      <select aria-label={`Filter ${i + 1} field`} className="h-8 rounded-md border border-border bg-background px-1 text-xs" value={w.field} onChange={(e) => void set({ ...w, field: e.target.value })}>{collections.find((c) => c.id === source)?.fields.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}</select>
                      <select aria-label={`Filter ${i + 1} operator`} className="h-8 rounded-md border border-border bg-background px-1 text-xs" value={w.op} onChange={(e) => void set({ ...w, op: e.target.value })}>{OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                      <input aria-label={`Filter ${i + 1} value`} className="h-8 min-w-0 rounded-md border border-border bg-background px-2 text-xs" key={w.value} defaultValue={w.value} onBlur={(e) => void set({ ...w, value: e.target.value })} />
                      <Button size="sm" variant="ghost" aria-label={`Remove filter ${i + 1}`} onClick={() => void set(null)}>×</Button>
                    </div>
                  );
                })}
                <Button size="sm" variant="secondary" onClick={() => { const first = collections.find((c) => c.id === source)?.fields[0]?.name; if (first) void setProps({ repeatWhere: [...(Array.isArray(node.props["repeatWhere"]) ? (node.props["repeatWhere"] as Where[]) : []), { field: first, op: "eq", value: "" }] }); }}>Add filter</Button>
              </div>
            )}
            {source && (
              <div className="grid grid-cols-3 gap-1.5">
                <label className="text-xs text-muted-foreground">Limit<input aria-label="Repeat limit" type="number" min={1} className="mt-0.5 h-8 w-full rounded-md border border-border bg-background px-2 text-xs" key={String(node.props["repeatLimit"])} defaultValue={String(node.props["repeatLimit"] ?? "")} onBlur={(e) => setProps({ repeatLimit: e.target.value ? Number(e.target.value) : undefined })} /></label>
                <label className="text-xs text-muted-foreground">Sort by<select aria-label="Repeat sort" className="mt-0.5 h-8 w-full rounded-md border border-border bg-background px-1 text-xs" value={String(node.props["repeatSort"] ?? "")} onChange={(e) => setProps({ repeatSort: e.target.value })}><option value="">Created</option>{collections.find((c) => c.id === source)?.fields.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}</select></label>
                <label className="text-xs text-muted-foreground">Order<select aria-label="Repeat order" className="mt-0.5 h-8 w-full rounded-md border border-border bg-background px-1 text-xs" value={String(node.props["repeatOrder"] ?? "asc")} onChange={(e) => setProps({ repeatOrder: e.target.value })}><option value="asc">Asc</option><option value="desc">Desc</option></select></label>
                <label className="col-span-3 text-xs text-muted-foreground">Items per page (adds Previous / Next)<input aria-label="Items per page" type="number" min={1} max={100} className="mt-0.5 h-8 w-full rounded-md border border-border bg-background px-2 text-xs" key={String(node.props["repeatPageSize"])} defaultValue={String(node.props["repeatPageSize"] ?? "")} onBlur={(e) => setProps({ repeatPageSize: e.target.value ? Number(e.target.value) : undefined })} /></label>
              </div>
            )}
          </div>
          {(b || repeat || repeatRef) && <Button size="sm" variant="ghost" onClick={() => commit("Clear content settings", [{ type: "updateElement", id, patch: { binding: undefined, props: Object.fromEntries(Object.entries(node.props).filter(([k]) => !k.startsWith("repeat"))) } }])}>Clear</Button>}
        </div>
      )}
    </Section>
  );
}
