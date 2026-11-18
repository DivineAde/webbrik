"use client";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, BoxSelect, CornerLeftUp, CornerRightDown, Copy, Eye, EyeOff, Lock, Package, Plus, Trash2, Unlock } from "lucide-react";
import { createId } from "@webbrik/document-model";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CATALOG } from "./catalog";
import { indentOps, isPageRoot, nudgeOps, outdentOps, reorderOps } from "./dnd";
import { useEditor } from "./store";

const QUICK = ["Section", "Container", "Flex row", "Grid", "Heading 2", "Paragraph", "Button", "Image", "Link", "Divider"];
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

/** The menu that replaces the browser's own right-click menu: on the canvas and in the layers panel. */
export function ContextMenu() {
  const menu = useEditor((s) => s.menu);
  const s = useEditor();
  if (!menu) return null;
  const { doc } = s;
  const id = menu.id && doc.nodes[menu.id] ? menu.id : null;
  const node = id ? doc.nodes[id] : null;
  const isRoot = !!id && isPageRoot(doc, id);
  const single = s.selectedIds.length === 1 && s.selectedIds[0] === id;
  const can = (ops: unknown[]) => single && ops.length > 0;
  const up = id ? nudgeOps(doc, id, -1) : [], down = id ? nudgeOps(doc, id, 1) : [];
  const first = id ? reorderOps(doc, id, "first") : [], last = id ? reorderOps(doc, id, "last") : [];
  const outOps = id ? outdentOps(doc, id) : [], inOps = id ? indentOps(doc, id) : [];
  const add = CATALOG.filter((c) => QUICK.includes(c.label));
  const label = node ? (node.name ?? node.tag) : "Page";
  const addMenu = (
    <>
      {add.map((c) => <DropdownMenuItem key={c.label} onSelect={() => s.insertElement(c.tag, { text: c.text, styles: c.styles })}>{c.label}</DropdownMenuItem>)}
    </>
  );
  return (
    <DropdownMenu open onOpenChange={(o) => { if (!o) s.closeMenu(); }}>
      <DropdownMenuTrigger asChild><span aria-hidden style={{ position: "fixed", left: menu.x, top: menu.y, width: 1, height: 1, pointerEvents: "none" }} /></DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" sideOffset={2} className="w-64" aria-label={`Actions for ${label}`} onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel className="truncate">{label}{node && <span className="ml-1.5 font-mono text-[11px] font-normal opacity-70">&lt;{node.tag}&gt;</span>}</DropdownMenuLabel>
        {node && !isRoot && (
          <>
            <DropdownMenuItem disabled={!can(up)} onSelect={() => s.nudgeSelected(-1)}><ArrowUp />Move up<DropdownMenuShortcut>Alt+↑</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem disabled={!can(down)} onSelect={() => s.nudgeSelected(1)}><ArrowDown />Move down<DropdownMenuShortcut>Alt+↓</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem disabled={!can(first)} onSelect={() => s.reorderSelected("first")}><ArrowUpToLine />Move to start</DropdownMenuItem>
            <DropdownMenuItem disabled={!can(last)} onSelect={() => s.reorderSelected("last")}><ArrowDownToLine />Move to end</DropdownMenuItem>
            <DropdownMenuItem disabled={!can(outOps)} onSelect={s.outdentSelected}><CornerLeftUp />Move out<DropdownMenuShortcut>Alt+←</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem disabled={!can(inOps)} onSelect={s.indentSelected}><CornerRightDown />Move in<DropdownMenuShortcut>Alt+→</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Plus />{node ? "Add inside" : "Add to page"}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">{addMenu}</DropdownMenuSubContent>
        </DropdownMenuSub>
        {node && !isRoot && (
          <>
            <DropdownMenuItem onSelect={s.duplicateSelected}><Copy />Duplicate<DropdownMenuShortcut>{MOD}D</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem disabled={!single} onSelect={s.wrapSelected}><BoxSelect />Wrap in container</DropdownMenuItem>
            <DropdownMenuItem disabled={!single || node.type === "component-instance"} onSelect={() => { const instanceId = createId("i"); if (s.commit("Create component", [{ type: "createComponent", elementId: id!, componentId: createId("c"), name: node.name ?? node.tag, instanceId }])) s.select(instanceId); }}><Package />Create component</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => s.commit(node.hidden ? "Show" : "Hide", [{ type: "updateElement", id: id!, patch: { hidden: !node.hidden } }])}>{node.hidden ? <Eye /> : <EyeOff />}{node.hidden ? "Show" : "Hide"}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => s.commit(node.locked ? "Unlock" : "Lock", [{ type: "updateElement", id: id!, patch: { locked: !node.locked } }])}>{node.locked ? <Unlock /> : <Lock />}{node.locked ? "Unlock" : "Lock"}</DropdownMenuItem>
            {node.parentId && !isPageRoot(doc, node.parentId) && <DropdownMenuItem onSelect={() => s.select(node.parentId!)}>Select parent</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={s.deleteSelected}><Trash2 />Delete<DropdownMenuShortcut>⌫</DropdownMenuShortcut></DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
