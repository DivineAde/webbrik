"use client";
import { createId, type ElementNode } from "@webbrik/document-model";
import { Button } from "@/components/ui/button";
import { useEditor } from "./store";

type Inter = ElementNode["interactions"][number];
const TRIGGERS: Inter["trigger"][] = ["click", "hover", "focus", "visible", "load", "scroll", "keydown"];
const ACTIONS: { v: Inter["action"]; label: string }[] = [
  { v: "show", label: "Show element" }, { v: "hide", label: "Hide element" }, { v: "toggle", label: "Toggle element" },
  { v: "animate", label: "Play animation" }, { v: "scrollTo", label: "Scroll to element" }, { v: "navigate", label: "Go to link" },
];
const sel = "mt-1 h-8 w-full rounded-md border border-border bg-background px-1 text-foreground";

/** Builder for "when X happens to this element, do Y to that element". Stored on the document; runs in preview and exports. */
export function InteractionsPanel() {
  const doc = useEditor((s) => s.doc);
  const id = useEditor((s) => s.selectedId);
  const commit = useEditor((s) => s.commit);
  const node = id ? doc.nodes[id] : undefined;
  if (!id || !node) return <p className="p-4 text-xs text-muted-foreground">Select the element that should trigger something (a button, say), then add an interaction here.</p>;

  const targets = Object.values(doc.nodes).filter((n) => n.parentId !== undefined || n.id === id).filter((n) => doc.pages.every((p) => p.rootId !== n.id));
  const anims = Object.values(doc.animations);
  const save = (label: string, list: Inter[]) => commit(label, [{ type: "updateElement", id, patch: { interactions: list } }]);
  const patch = (i: number, p: Partial<Inter>) => save("Edit interaction", node.interactions.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const add = () => save("Add interaction", [...node.interactions, { id: createId("int"), trigger: "click", action: "toggle", targetId: id }]);
  const label = (n: ElementNode) => `${n.name ?? n.tag}${n.id === id ? " (this element)" : ""}`;

  return (
    <div className="space-y-3 p-3" data-testid="interactions">
      <p className="text-xs text-muted-foreground">Interactions on <b className="text-foreground">{node.name ?? node.tag}</b>. They run in Preview and in published sites.</p>
      {node.interactions.length === 0 && <p className="text-xs text-muted-foreground">No interactions yet.</p>}
      {node.interactions.map((it, i) => (
        <fieldset key={it.id} className="space-y-1.5 rounded-md border border-border p-2 text-xs text-muted-foreground">
          <legend className="px-1 text-foreground">Interaction {i + 1}</legend>
          <label className="block">When this element is…
            <select aria-label="Trigger" className={sel} value={it.trigger} onChange={(e) => patch(i, { trigger: e.target.value as Inter["trigger"] })}>{TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          <label className="block">Do
            <select aria-label="Action" className={sel} value={it.action} onChange={(e) => {
              const action = e.target.value as Inter["action"];
              const params = action === "animate" ? { animationId: anims[0]?.id } : action === "navigate" ? { href: "/" } : undefined;
              patch(i, { action, params, ...(action === "navigate" ? { targetId: undefined } : { targetId: it.targetId ?? id }) });
            }}>{ACTIONS.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}</select></label>
          {it.action !== "navigate" && (
            <label className="block">To
              <select aria-label="Target" className={sel} value={it.targetId ?? id} onChange={(e) => patch(i, { targetId: e.target.value })}>{targets.map((n) => <option key={n.id} value={n.id}>{label(n)}</option>)}</select></label>
          )}
          {it.action === "animate" && (anims.length === 0
            ? <p>Create an animation in the Animate tab first.</p>
            : <label className="block">Animation
                <select aria-label="Animation" className={sel} value={String(it.params?.["animationId"] ?? "")} onChange={(e) => patch(i, { params: { animationId: e.target.value } })}>{anims.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>)}
          {it.action === "navigate" && (
            <label className="block">Link (/path or https://…)
              <input aria-label="Link" className={sel + " px-2"} key={String(it.params?.["href"])} defaultValue={String(it.params?.["href"] ?? "")} onBlur={(e) => /^(\/|https?:\/\/)/.test(e.target.value) && patch(i, { params: { href: e.target.value } })} /></label>
          )}
          <Button size="sm" variant="ghost" onClick={() => save("Remove interaction", node.interactions.filter((_, j) => j !== i))}>Remove</Button>
        </fieldset>
      ))}
      <Button size="sm" variant="secondary" onClick={add}>+ Add interaction</Button>
    </div>
  );
}
