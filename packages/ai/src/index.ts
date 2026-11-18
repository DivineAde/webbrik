import { z } from "zod";
import { applyOperations, ElementNodeSchema, StyleClassSchema, validateDocument, type Document, type Operation } from "@webbrik/document-model";

/** The only shapes an AI is allowed to propose. Anything else is rejected before it reaches the document. */
const OperationSchema: z.ZodType<Operation> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("insertSubtree"), rootId: z.string(), nodes: z.array(ElementNodeSchema), parentId: z.string(), index: z.number().int() }),
  z.object({ type: z.literal("deleteElement"), id: z.string() }),
  z.object({ type: z.literal("moveElement"), id: z.string(), parentId: z.string(), index: z.number().int() }),
  z.object({ type: z.literal("updateElement"), id: z.string(), patch: z.object({ tag: z.string(), name: z.string(), text: z.string(), hidden: z.boolean(), locked: z.boolean(), attributes: z.record(z.string(), z.string()), props: z.record(z.string(), z.unknown()) }).partial() }),
  z.object({ type: z.literal("setStyle"), id: z.string(), breakpoint: z.string(), state: z.string().optional(), declarations: z.record(z.string(), z.string().nullable()) }),
  z.object({ type: z.literal("addClass"), id: z.string(), classId: z.string() }),
  z.object({ type: z.literal("removeClass"), id: z.string(), classId: z.string() }),
  z.object({ type: z.literal("upsertClass"), cls: StyleClassSchema }),
  z.object({ type: z.literal("removeClassDef"), classId: z.string() }),
  z.object({ type: z.literal("duplicateElement"), id: z.string(), newRootId: z.string() }),
  z.object({ type: z.literal("setToken"), name: z.string(), value: z.string().nullable() }),
]) as unknown as z.ZodType<Operation>;

export const ProposalSchema = z.object({ summary: z.string().max(500), operations: z.array(OperationSchema).max(200) });

export interface ProposalResult {
  ok: boolean;
  summary?: string;
  operations?: Operation[];
  errors: string[];
  /** Document after applying, for the change preview. Never persisted until the user accepts. */
  preview?: Document;
  /** Operations that revert the proposal. */
  inverse?: Operation[];
}

/** Parse -> schema-check -> dry-run against the document -> validate the result. Pure; no side effects. */
export function reviewProposal(doc: Document, raw: unknown): ProposalResult {
  const parsed = ProposalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  try {
    const { doc: next, inverse } = applyOperations(doc, parsed.data.operations);
    const v = validateDocument(next);
    if (!v.ok) return { ok: false, errors: v.issues.filter((i) => i.severity === "error").map((i) => i.message) };
    return { ok: true, summary: parsed.data.summary, operations: parsed.data.operations, preview: next, inverse, errors: [] };
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : "Proposal could not be applied"] };
  }
}

/** Build the structured-output prompt context: a trimmed view of the selection, never raw DB access. */
export function buildContext(doc: Document, selectedId: string | null) {
  const sel = selectedId ? doc.nodes[selectedId] : undefined;
  return { schemaVersion: doc.version, breakpoints: doc.breakpoints.map((b) => b.id), tokens: Object.keys(doc.tokens), classes: Object.values(doc.classes).map((c) => c.name), selection: sel ? { id: sel.id, tag: sel.tag, text: sel.text, children: sel.children.length } : null };
}
