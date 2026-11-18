"use client";
import { TEMPLATES } from "@webbrik/component-system";
import { useEditor } from "./store";
import { beginPointerDrag } from "./pointer-drag";

export function TemplatesPanel() {
  const insertSpec = useEditor((s) => s.insertSpec);
  const cats = [...new Set(TEMPLATES.map((t) => t.category))];
  return (
    <div className="h-full overflow-auto p-2">
      <p className="mb-2 text-xs text-muted-foreground">Inserted into the selected container, or the page. One undo step each.</p>
      {cats.map((c) => (
        <section key={c} className="mb-3">
          <h3 className="mb-1 text-xs font-medium">{c}</h3>
          {TEMPLATES.filter((t) => t.category === c).map((t) => (
            <button key={t.id} onPointerDown={(e) => beginPointerDrag(e, { kind: "template", id: t.id }, t.name)} onClick={() => insertSpec(t.spec, t.name)} className="mb-1 block w-full rounded-md border border-border p-2 text-left hover:bg-accent">
              <span className="block font-medium">{t.name}</span><span className="block text-xs text-muted-foreground">{t.description}</span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
