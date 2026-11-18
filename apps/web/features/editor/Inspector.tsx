"use client";
import { inspectStyles } from "@webbrik/css-engine";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AlignCenter, AlignJustify, AlignLeft, AlignRight, Italic, Strikethrough, Underline, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useEditor } from "./store";
import { nudgeOps } from "./dnd";
import { ContentBinding } from "./ContentBinding";
import { FormSection } from "./FormSection";
import { PositionSection } from "./PositionSection";
import { ImageSource } from "./AssetPicker";
import { ColorField, Pair, PropLabel, Row, Section, Segmented, SelectField, Stack, TextField, UnitInput, type SegOption } from "./style-controls";

const DISPLAY: SegOption[] = [{ value: "block", title: "Block", label: "Block" }, { value: "flex", title: "Flex", label: "Flex" }, { value: "grid", title: "Grid", label: "Grid" }, { value: "inline", title: "Inline", label: "Inline" }, { value: "none", title: "None (hidden)", label: "None" }];
const DIRECTION: SegOption[] = [{ value: "row", title: "Row", label: <ArrowRight /> }, { value: "column", title: "Column", label: <ArrowDown /> }, { value: "row-reverse", title: "Row reverse", label: <ArrowLeft /> }, { value: "column-reverse", title: "Column reverse", label: <ArrowUp /> }];
const JUSTIFY: SegOption[] = [{ value: "flex-start", title: "Justify start", label: "Start" }, { value: "center", title: "Justify center", label: "Center" }, { value: "flex-end", title: "Justify end", label: "End" }, { value: "space-between", title: "Justify space between", label: "Between" }];
const ALIGN: SegOption[] = [{ value: "flex-start", title: "Align start", label: "Start" }, { value: "center", title: "Align center", label: "Center" }, { value: "flex-end", title: "Align end", label: "End" }, { value: "stretch", title: "Align stretch", label: "Stretch" }];
const OVERFLOW: SegOption[] = [{ value: "visible", title: "Show overflow", label: "Show" }, { value: "hidden", title: "Clip overflow", label: "Clip" }, { value: "scroll", title: "Scroll overflow", label: "Scroll" }, { value: "auto", title: "Auto overflow", label: "Auto" }];
const TEXT_ALIGN: SegOption[] = [{ value: "left", title: "Align text left", label: <AlignLeft /> }, { value: "center", title: "Align text center", label: <AlignCenter /> }, { value: "right", title: "Align text right", label: <AlignRight /> }, { value: "justify", title: "Justify text", label: <AlignJustify /> }];
const DECORATION: SegOption[] = [{ value: "underline", title: "Underline", label: <Underline /> }, { value: "line-through", title: "Strikethrough", label: <Strikethrough /> }];
const FONT_STYLE: SegOption[] = [{ value: "italic", title: "Italic", label: <Italic /> }];
const TRANSFORM: SegOption[] = [{ value: "uppercase", title: "AB uppercase", label: "AB" }, { value: "capitalize", title: "Aa capitalize", label: "Aa" }, { value: "lowercase", title: "ab lowercase", label: "ab" }];
const WEIGHTS = [["100", "Thin"], ["200", "Extra light"], ["300", "Light"], ["400", "Normal"], ["500", "Medium"], ["600", "Semibold"], ["700", "Bold"], ["800", "Extra bold"], ["900", "Black"]].map(([value, l]) => ({ value: value!, label: `${value} – ${l}` }));
const POSITIONS = ["static", "relative", "absolute", "fixed", "sticky"].map((v) => ({ value: v, label: v }));
const FITS = ["fill", "contain", "cover", "none", "scale-down"].map((v) => ({ value: v, label: v }));
const FAMILIES = [["Inter, system-ui, sans-serif", "Inter"], ["system-ui, sans-serif", "System UI"], ["Georgia, serif", "Georgia"], ["'Times New Roman', serif", "Times New Roman"], ["ui-monospace, Menlo, monospace", "Monospace"]].map(([value, label]) => ({ value: value!, label: label! }));

export function Inspector() {
  const doc = useEditor((s) => s.doc);
  const id = useEditor((s) => s.selectedId);
  const bp = useEditor((s) => s.breakpoint);
  const commit = useEditor((s) => s.commit);
  const ids = useEditor((s) => s.selectedIds);
  const node = id ? doc.nodes[id] : undefined;

  if (!id || !node) return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <span aria-hidden className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Type className="size-5" /></span>
      <p className="text-sm font-medium">Nothing selected</p>
      <p className="max-w-52 text-muted-foreground">Select an element on the canvas or in the layers panel to edit its styles.</p>
    </div>
  );

  const sources = inspectStyles(doc, id, bp);
  const current = (p: string) => sources.filter((s) => s.property === p).at(-1);
  const val = (p: string) => current(p)?.value ?? "";
  const isSet = (p: string) => current(p)?.origin === "element";
  const setStyle = (property: string, value: string) => commit(`Set ${property}`, (ids.length > 1 ? ids : [id]).map((x) => ({ type: "setStyle" as const, id: x, breakpoint: bp, declarations: { [property]: value.trim() === "" ? null : value } })));
  const label = (p: string, text?: string) => { const src = current(p); return <PropLabel prop={p} label={text} set={isSet(p)} from={src ? `${src.origin}${src.className ? " ." + src.className : ""}` : undefined} onReset={() => setStyle(p, "")} />; };
  const count = (props: string[]) => props.filter(isSet).length;
  const unit = (p: string, text?: string, keywords: string[] = []) => <Stack>{label(p, text)}<UnitInput key={id + bp + p} prop={p} value={val(p)} keywords={keywords} onCommit={(v) => setStyle(p, v)} /></Stack>;
  const text = (p: string, text?: string) => <Stack>{label(p, text)}<TextField key={id + bp + p} prop={p} value={val(p)} onCommit={(v) => setStyle(p, v)} /></Stack>;

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="space-y-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">&lt;{node.tag}&gt;</span>
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{bp === "base" ? "Desktop" : bp} styles{ids.length > 1 ? ` · applying to ${ids.length} selected` : ""}</p>
          {ids.length === 1 && (
            <div className="flex shrink-0 items-center gap-0.5">
              <button type="button" aria-label="Move up" title="Move up (Alt+↑)" disabled={!nudgeOps(doc, id, -1).length} onClick={() => useEditor.getState().nudgeSelected(-1)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"><ArrowUp className="size-4" /></button>
              <button type="button" aria-label="Move down" title="Move down (Alt+↓)" disabled={!nudgeOps(doc, id, 1).length} onClick={() => useEditor.getState().nudgeSelected(1)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"><ArrowDown className="size-4" /></button>
            </div>
          )}
        </div>
        <Input className="h-8 border-transparent bg-muted font-medium hover:bg-accent focus-visible:bg-background" defaultValue={node.name ?? node.tag} key={id + "name"} onBlur={(e) => e.target.value !== (node.name ?? node.tag) && commit("Rename", [{ type: "updateElement", id, patch: { name: e.target.value } }])} aria-label="Element name" />
        {node.text !== undefined && (
          <Input className="h-8 border-transparent bg-muted hover:bg-accent focus-visible:bg-background" defaultValue={node.text} key={id + "text"} onBlur={(e) => e.target.value !== node.text && commit("Edit text", [{ type: "updateElement", id, patch: { text: e.target.value } }])} aria-label="Text content" />
        )}
      </header>
      <ImageSource id={id} />
      <ContentBinding id={id} />
      <FormSection id={id} />

      <Section title="Layout" count={count(["display", "flex-direction", "justify-content", "align-items", "gap"])}>
        <Stack>{label("display", "Display")}<Segmented prop="display" value={val("display")} options={DISPLAY} onCommit={(v) => setStyle("display", v)} /></Stack>
        <Stack>{label("flex-direction", "Direction")}<Segmented prop="flex-direction" value={val("flex-direction")} options={DIRECTION} onCommit={(v) => setStyle("flex-direction", v)} /></Stack>
        <Stack>{label("justify-content", "Justify")}<Segmented prop="justify-content" value={val("justify-content")} options={JUSTIFY} onCommit={(v) => setStyle("justify-content", v)} /></Stack>
        <Stack>{label("align-items", "Align")}<Segmented prop="align-items" value={val("align-items")} options={ALIGN} onCommit={(v) => setStyle("align-items", v)} /></Stack>
        <Pair>{unit("gap", "Gap")}</Pair>
      </Section>

      <Section title="Size" count={count(["width", "height", "min-width", "min-height", "max-width", "max-height", "aspect-ratio", "overflow"])}>
        <Pair>{unit("width", "Width", ["auto", "100%", "fit-content"])}{unit("height", "Height", ["auto", "100%", "fit-content"])}</Pair>
        <Pair>{unit("min-width", "Min width", ["auto", "0"])}{unit("min-height", "Min height", ["auto", "0"])}</Pair>
        <Pair>{unit("max-width", "Max width", ["none", "100%"])}{unit("max-height", "Max height", ["none", "100%"])}</Pair>
        <Pair>{text("aspect-ratio", "Aspect ratio")}</Pair>
        <Stack>{label("overflow", "Overflow")}<Segmented prop="overflow" value={val("overflow")} options={OVERFLOW} onCommit={(v) => setStyle("overflow", v)} /></Stack>
        <Stack>{label("object-fit", "Object fit")}<SelectField key={id + bp + "of"} prop="object-fit" value={val("object-fit")} options={FITS} onCommit={(v) => setStyle("object-fit", v)} /></Stack>
      </Section>

      <Section title="Spacing" count={count(["margin", "padding"])}>
        <Pair>{unit("margin", "Margin", ["auto", "0"])}{unit("padding", "Padding", ["0"])}</Pair>
      </Section>

      <PositionSection id={id} />
      <Section title="Position (CSS)" id="css-position" defaultOpen={false} count={count(["position", "z-index"])}>
        <Row label={label("position")}><SelectField key={id + bp + "pos"} prop="position" value={val("position")} options={POSITIONS} onCommit={(v) => setStyle("position", v)} /></Row>
        <Row label={label("z-index", "Z index")}><UnitInput key={id + bp + "z"} prop="z-index" value={val("z-index")} keywords={["auto"]} onCommit={(v) => setStyle("z-index", v)} /></Row>
      </Section>

      <Section title="Typography" count={count(["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "color", "text-decoration", "font-style", "text-transform"])}>
        <Row label={label("font-family", "Family")}><SelectField key={id + bp + "ff"} prop="font-family" value={val("font-family")} options={FAMILIES} onCommit={(v) => setStyle("font-family", v)} /></Row>
        <Row label={label("font-weight", "Weight")}><SelectField key={id + bp + "fw"} prop="font-weight" value={val("font-weight")} options={WEIGHTS} onCommit={(v) => setStyle("font-weight", v)} /></Row>
        <Row label={label("color", "Color")}><ColorField key={id + bp + "c"} prop="color" value={val("color")} onCommit={(v) => setStyle("color", v)} /></Row>
        <Pair>{unit("font-size", "Size")}{unit("line-height", "Height", ["normal"])}</Pair>
        <Pair>{unit("letter-spacing", "Spacing", ["normal"])}</Pair>
        <Pair>
          <Segmented prop="text-align" value={val("text-align")} options={TEXT_ALIGN.slice(0, 4)} onCommit={(v) => setStyle("text-align", v)} className="col-span-2" />
          <Segmented prop="text-decoration" value={val("text-decoration")} options={DECORATION} onCommit={(v) => setStyle("text-decoration", v)} />
          <Segmented prop="font-style" value={val("font-style")} options={FONT_STYLE} onCommit={(v) => setStyle("font-style", v)} />
          <Segmented prop="text-transform" value={val("text-transform")} options={TRANSFORM} onCommit={(v) => setStyle("text-transform", v)} className="col-span-2" />
        </Pair>
      </Section>

      <Section title="Backgrounds" count={count(["background"])}>
        <Row label={label("background", "Color")}><ColorField key={id + bp + "bg"} prop="background" value={val("background")} onCommit={(v) => setStyle("background", v)} /></Row>
      </Section>

      <Section title="Borders" count={count(["border", "border-radius", "outline"])}>
        <Pair>{text("border", "Border")}{unit("border-radius", "Radius")}</Pair>
        <Pair>{text("outline", "Outline")}</Pair>
      </Section>

      <Section title="Effects" count={count(["opacity", "box-shadow", "transform", "transition", "filter"])} defaultOpen={false}>
        <Pair>{unit("opacity", "Opacity")}{text("filter", "Filter")}</Pair>
        {text("box-shadow", "Shadow")}
        {text("transform", "Transform")}
        {text("transition", "Transition")}
      </Section>

      <Section title="Style sources" id="sources" defaultOpen={false}>
        {sources.length === 0 ? <p className="text-muted-foreground">No styles at this breakpoint.</p> : (
          <ul className="space-y-1 text-xs">
            {sources.map((s, i) => (
              <li key={i} className={cn("flex justify-between gap-2", !s.active && "text-muted-foreground line-through")}>
                <span className="min-w-0 truncate">{s.property}: {s.value}</span>
                <span className="shrink-0 text-muted-foreground">{s.origin === "class" ? `.${s.className}` : s.origin}</span>
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" size="sm" onClick={() => commit("Reset styles", [...node.styles.filter((b) => b.breakpoint === bp && !b.state).map((b) => ({ type: "setStyle" as const, id, breakpoint: bp, declarations: Object.fromEntries(Object.keys(b.declarations).map((k) => [k, null])) }))])}>
          Reset element styles
        </Button>
      </Section>
    </div>
  );
}
