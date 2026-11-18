"use client";
import { useEffect, useRef } from "react";
import { sanitizeRichText } from "@webbrik/content-engine";
import { Button } from "@/components/ui/button";

const TOOLS: [label: string, title: string, run: (exec: (c: string, v?: string) => void) => void][] = [
  ["B", "Bold", (x) => x("bold")],
  ["I", "Italic", (x) => x("italic")],
  ["H2", "Heading", (x) => x("formatBlock", "h2")],
  ["¶", "Paragraph", (x) => x("formatBlock", "p")],
  ["•", "Bulleted list", (x) => x("insertUnorderedList")],
  ["1.", "Numbered list", (x) => x("insertOrderedList")],
  ["❝", "Quote", (x) => x("formatBlock", "blockquote")],
];

/** Small rich-text editor. Output is reduced to a safe allowlist here and again on the server before it is stored. */
export function RichTextField({ label, value, onChange }: { label: string; value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);
  useEffect(() => {
    // Only reset the DOM when the value changed from outside (switching items), so the caret never jumps while typing.
    if (ref.current && value !== last.current) { ref.current.innerHTML = sanitizeRichText(value); last.current = value; }
  }, [value]);
  const emit = () => { const html = sanitizeRichText(ref.current?.innerHTML ?? ""); last.current = html; onChange(html); };
  const exec = (cmd: string, v?: string) => { ref.current?.focus(); document.execCommand(cmd, false, v); emit(); };
  return (
    <div className="mt-1 rounded-md border border-border">
      <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap gap-1 border-b border-border p-1">
        {TOOLS.map(([l, t, run]) => <Button key={t} type="button" size="sm" variant="ghost" title={t} aria-label={t} className="h-7 min-w-7 px-1.5" onMouseDown={(e) => e.preventDefault()} onClick={() => run(exec)}>{l}</Button>)}
        <Button type="button" size="sm" variant="ghost" title="Link" aria-label="Link" className="h-7 px-1.5" onMouseDown={(e) => e.preventDefault()} onClick={() => { const u = window.prompt("Link address (https://…)"); if (u) exec("createLink", u); }}>Link</Button>
      </div>
      <div ref={ref} role="textbox" aria-multiline="true" aria-label={label} contentEditable suppressContentEditableWarning className="prose-sm min-h-24 p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_h2]:text-base [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:underline" onInput={emit} onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }} />
    </div>
  );
}
