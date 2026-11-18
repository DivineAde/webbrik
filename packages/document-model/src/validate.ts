import { DocumentSchema, type Document } from "./schema";

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  document?: Document;
}

/** Schema + structural integrity validation. Run on load, before save, before build. */
export function validateDocument(input: unknown): ValidationResult {
  const parsed = DocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        severity: "error" as const,
        code: "schema",
        message: i.message,
        path: i.path.join("."),
      })),
    };
  }
  const doc = parsed.data;
  const issues: ValidationIssue[] = [];
  const err = (code: string, message: string, path?: string) => issues.push({ severity: "error", code, message, path });

  for (const n of Object.values(doc.nodes)) {
    if (n.parentId && !doc.nodes[n.parentId]) err("orphan", `Node ${n.id} has missing parent ${n.parentId}`, n.id);
    for (const c of n.children) {
      const child = doc.nodes[c];
      if (!child) err("missing-child", `Node ${n.id} references missing child ${c}`, n.id);
      else if (child.parentId !== n.id) err("parent-mismatch", `Child ${c} does not point back to ${n.id}`, c);
    }
    for (const cid of n.classIds) if (!doc.classes[cid]) err("unknown-class", `Node ${n.id} uses unknown class ${cid}`, n.id);
    for (const b of n.styles)
      if (b.breakpoint !== "base" && !doc.breakpoints.some((bp) => bp.id === b.breakpoint))
        err("unknown-breakpoint", `Node ${n.id} styles unknown breakpoint ${b.breakpoint}`, n.id);
    for (const i of n.interactions) {
      const aid = i.params?.["animationId"];
      if (typeof aid === "string" && !doc.animations[aid]) err("unknown-animation", `Node ${n.id} references unknown animation ${aid}`, n.id);
      if (i.targetId && !doc.nodes[i.targetId] && i.action !== "navigate") err("unknown-target", `Interaction ${i.id} targets missing node ${i.targetId}`, n.id);
    }
    if (n.type === "component-instance" && (!n.componentId || !doc.components[n.componentId]))
      err("unknown-component", `Node ${n.id} references unknown component`, n.id);
  }

  // Reachability + cycle detection from page roots.
  const reachable = new Set<string>();
  const roots = [...doc.pages.map((p) => p.rootId), ...Object.values(doc.components).map((c) => c.rootId)];
  for (const root of roots) {
    if (!doc.nodes[root]) {
      err("missing-root", `Root ${root} not found`, root);
      continue;
    }
    const stack = [root];
    while (stack.length) {
      const id = stack.pop()!;
      if (reachable.has(id)) {
        if (id !== root) err("cycle-or-shared", `Node ${id} reachable more than once`, id);
        continue;
      }
      reachable.add(id);
      for (const c of doc.nodes[id]?.children ?? []) stack.push(c);
    }
  }
  for (const id of Object.keys(doc.nodes)) if (!reachable.has(id)) issues.push({ severity: "warning", code: "unreachable", message: `Node ${id} is unreachable`, path: id });

  // Routes
  const seen = new Map<string, string>();
  for (const p of doc.pages) {
    const key = p.route.replace(/\/$/, "") || "/";
    if (seen.has(key)) err("duplicate-route", `Route ${p.route} used by pages ${seen.get(key)} and ${p.id}`, p.id);
    seen.set(key, p.id);
  }
  for (const p of doc.pages) {
    const dynamic = /:slug(\/|$)/.test(p.route);
    if (dynamic && !p.collectionId) issues.push({ severity: "warning", code: "dynamic-page-unbound", message: `Page ${p.name} has a dynamic route but no collection; it will not be generated`, path: p.id });
    if (p.collectionId && !dynamic) err("collection-needs-dynamic-route", `Page ${p.name} is bound to a collection but its route has no :slug`, p.id);
  }
  if (doc.pages.filter((p) => p.isHome).length !== 1) err("home-page", "Exactly one page must be marked as home");

  return { ok: !issues.some((i) => i.severity === "error"), issues, document: doc };
}
