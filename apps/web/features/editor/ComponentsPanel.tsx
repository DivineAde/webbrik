"use client";
import { componentUsage, wouldCreateComponentCycle } from "@webbrik/component-system";
import { createId, createNode } from "@webbrik/document-model";
import { Button } from "@/components/ui/button";
import { useEditor } from "./store";

export function ComponentsPanel() {
  const doc = useEditor((s) => s.doc);
  const sel = useEditor((s) => s.selectedId);
  const pageId = useEditor((s) => s.pageId);
  const commit = useEditor((s) => s.commit);
  const select = useEditor((s) => s.select);
  const comps = Object.values(doc.components);
  const selNode = sel ? doc.nodes[sel] : undefined;
  const page = doc.pages.find((p) => p.id === pageId)!;

  const create = () => {
    if (!sel) return;
    const name = selNode?.name ?? selNode?.tag ?? "Component";
    const instanceId = createId("i");
    if (commit("Create component", [{ type: "createComponent", elementId: sel, componentId: createId("c"), name, instanceId }])) select(instanceId);
  };
  const place = (componentId: string) => {
    const target = selNode?.type === "element" ? selNode.id : page.rootId;
    // Which component (if any) contains the target? Prevents A → B → A.
    let cur: string | null = target, last = target;
    while (cur) { last = cur; cur = doc.nodes[cur]?.parentId ?? null; }
    const owner = Object.values(doc.components).find((c) => c.rootId === last);
    if (owner && wouldCreateComponentCycle(doc, owner.id, componentId)) return useEditor.setState({ lastError: "That would make the component contain itself." });
    const id = createId("i");
    const node = createNode({ id, parentId: target, type: "component-instance", componentId, name: doc.components[componentId]!.name });
    if (commit("Insert component", [{ type: "insertSubtree", rootId: id, nodes: [node], parentId: target, index: doc.nodes[target]!.children.length }])) select(id);
  };

  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-2">
      <Button size="sm" variant="secondary" disabled={!sel || selNode?.type === "component-instance"} onClick={create}>Create from selection</Button>
      {comps.length === 0 && <p className="text-xs text-muted-foreground">No components yet. Select an element and create one; edits to the component update every instance.</p>}
      {comps.map((c) => {
        const usage = componentUsage(doc, c.id);
        return (
          <div key={c.id} className="rounded-md border border-border p-2">
            <div className="flex items-center justify-between"><span className="font-medium">{c.name}</span><span className="text-xs text-muted-foreground">{usage.length} use{usage.length === 1 ? "" : "s"}</span></div>
            <div className="mt-2 flex flex-wrap gap-1">
              <Button size="sm" variant="secondary" onClick={() => place(c.id)}>Insert</Button>
              <Button size="sm" variant="secondary" disabled={usage.length === 0} onClick={() => select(usage[0]!.nodeId)}>Find</Button>
              <Button size="sm" variant="secondary" disabled={usage.length > 0} title={usage.length ? "Detach or remove all instances first" : undefined} onClick={() => commit("Delete component", [{ type: "deleteComponent", componentId: c.id }])}>Delete</Button>
            </div>
          </div>
        );
      })}
      {selNode?.type === "component-instance" && <Button size="sm" variant="secondary" onClick={() => commit("Detach instance", [{ type: "detachInstance", id: selNode.id, idSeed: createId("d") }])}>Detach selected instance</Button>}
    </div>
  );
}
