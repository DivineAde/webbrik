"use client";
import { useEffect, useState } from "react";
import { createId, createNode, type Operation } from "@webbrik/document-model";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useEditor } from "./store";
import { Section } from "./style-controls";

interface FormDef { id: string; fields: { name: string; type: string; required?: boolean; maxLength?: number }[]; settings: { successMessage?: string; redirectUrl?: string } }
const human = (n: string) => n.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/** Operations that fill a <form> with one labelled control per defined field, plus a submit button. */
export function buildFormOps(doc: { nodes: Record<string, { children: string[] }> }, formNodeId: string, def: FormDef): Operation[] {
  const ops: Operation[] = (doc.nodes[formNodeId]?.children ?? []).map((id) => ({ type: "deleteElement", id }) as Operation);
  let index = 0;
  const style = (id: string, declarations: Record<string, string>) => ops.push({ type: "setStyle", id, breakpoint: "base", declarations });
  for (const f of def.fields) {
    const wrap = createId(), label = createId(), input = createId(), inputId = `f-${def.id}-${f.name}`;
    const nodes = [createNode({ id: wrap, parentId: formNodeId, tag: "div", name: human(f.name) })];
    const control = f.type === "textarea"
      ? createNode({ id: input, parentId: wrap, tag: "textarea", name: `${human(f.name)} field`, attributes: { id: inputId, name: f.name, rows: "5", ...(f.required ? { required: "" } : {}), ...(f.maxLength ? { maxlength: String(f.maxLength) } : {}) } })
      : createNode({ id: input, parentId: wrap, tag: "input", name: `${human(f.name)} field`, attributes: { id: inputId, name: f.name, type: f.type === "checkbox" ? "checkbox" : f.type === "number" ? "number" : f.type === "email" ? "email" : "text", ...(f.required ? { required: "" } : {}), ...(f.maxLength ? { maxlength: String(f.maxLength) } : {}) } });
    const lab = createNode({ id: label, parentId: wrap, tag: "label", name: `${human(f.name)} label`, text: human(f.name) + (f.required ? " *" : ""), attributes: { for: inputId } });
    const kids = f.type === "checkbox" ? [control, lab] : [lab, control];
    nodes.push(...kids);
    wrap && nodes[0]!.children.push(...kids.map((k) => k.id));
    ops.push({ type: "insertSubtree", rootId: wrap, nodes, parentId: formNodeId, index: index++ });
    style(wrap, { display: "grid", gap: "6px" });
    if (f.type !== "checkbox") style(input, { padding: "10px 12px", border: "1px solid #d4d4d4", "border-radius": "8px", font: "inherit", width: "100%", "box-sizing": "border-box" });
  }
  const btn = createId();
  ops.push({ type: "insertSubtree", rootId: btn, nodes: [createNode({ id: btn, parentId: formNodeId, tag: "button", name: "Submit", text: "Send", attributes: { type: "submit" } })], parentId: formNodeId, index });
  style(btn, { padding: "10px 18px", background: "#111", color: "#fff", border: "0", "border-radius": "8px", font: "inherit", cursor: "pointer", "justify-self": "start" });
  style(formNodeId, { display: "grid", gap: "16px", "max-width": "480px" });
  return ops;
}

/** Inspector section for <form> elements: connect to a form defined in Manage → Forms and generate its fields. */
export function FormSection({ id }: { id: string }) {
  const node = useEditor((s) => s.doc.nodes[id]);
  const doc = useEditor((s) => s.doc);
  const pid = useEditor((s) => s.remote?.projectId);
  const commit = useEditor((s) => s.commit);
  const [forms, setForms] = useState<FormDef[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!pid) return; api<{ forms: FormDef[] }>(`/projects/${pid}/forms`).then((r) => setForms(r.forms)).catch((e: Error) => setErr(e.message)); }, [pid]);
  if (!node || node.tag !== "form") return null;
  const formId = typeof node.props["formId"] === "string" ? (node.props["formId"] as string) : "";
  const def = forms?.find((f) => f.id === formId);
  const connect = (next: string) => {
    const props = { ...node.props }; delete props["formId"];
    if (next) props["formId"] = next;
    commit(next ? "Connect form" : "Disconnect form", [{ type: "updateElement", id, patch: { props } }]);
  };
  return (
    <Section title="Form submissions" id="forms">
      {!pid ? <p className="text-xs text-muted-foreground">Open a saved project to connect this form.</p>
        : forms === null ? <p className="text-xs text-muted-foreground">{err ?? "Loading forms…"}</p>
        : forms.length === 0 ? <p className="text-xs text-muted-foreground">No forms yet. Create one in Project settings → Forms, then come back to connect it.</p> : (
        <div className="space-y-2">
          <label className="block text-xs">Send submissions to
            <select aria-label="Connected form" className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs" value={formId} onChange={(e) => connect(e.target.value)}>
              <option value="">Not connected</option>{forms.map((f) => <option key={f.id} value={f.id}>{f.id}</option>)}
            </select>
          </label>
          {def && (
            <>
              <Button size="sm" variant="secondary" onClick={() => commit("Generate form fields", [...buildFormOps(doc, id, def), { type: "updateElement", id, patch: { props: { ...node.props, ...(def.settings.successMessage ? { successMessage: def.settings.successMessage } : {}), ...(def.settings.redirectUrl ? { redirectUrl: def.settings.redirectUrl } : {}) } } }])}>Generate fields</Button>
              <p className="text-xs text-muted-foreground">Replaces this form’s contents with one labelled field per defined field and a Send button. Success message and redirect come from the form’s settings.</p>
            </>
          )}
        </div>
      )}
    </Section>
  );
}
