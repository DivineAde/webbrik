"use client";
import { useRouter } from "next/navigation";
import { ChevronDown, Command, Copy, Download, ExternalLink, FolderOpen, Keyboard, LifeBuoy, Redo2, Settings2, Trash2, Undo2 } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { downloadExport } from "./export";
import { useEditor } from "./store";

export const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

/** The Webbrik menu: everything that used to crowd the header (file, edit and view commands, help). */
export function EditorMenu() {
  const router = useRouter();
  const s = useEditor();
  const sel = s.selectedIds.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Main menu" className="flex h-9 items-center gap-1 rounded-md px-2 text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-accent">
        <LogoMark size={24} /><ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem onSelect={() => router.push(s.remote ? "/dashboard" : "/")}><FolderOpen />All projects</DropdownMenuItem>
        {s.remote && <DropdownMenuItem onSelect={() => router.push(`/projects/${s.remote!.projectId}`)}><Settings2 />Project settings</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => downloadExport(s.doc)}><Download />Export site</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Edit</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-60">
            <DropdownMenuItem disabled={!s.canUndo} onSelect={s.undo}><Undo2 />Undo<DropdownMenuShortcut>{MOD}Z</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem disabled={!s.canRedo} onSelect={s.redo}><Redo2 />Redo<DropdownMenuShortcut>⇧{MOD}Z</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!sel} onSelect={s.duplicateSelected}><Copy />Duplicate<DropdownMenuShortcut>{MOD}D</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem disabled={!sel} destructive onSelect={s.deleteSelected}><Trash2 />Delete<DropdownMenuShortcut>⌫</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => s.setPalette(true)}><Command />Command palette<DropdownMenuShortcut>{MOD}K</DropdownMenuShortcut></DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>View</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-60">
            <DropdownMenuCheckboxItem checked={s.showRulers} onCheckedChange={(v) => s.setRulers(!!v)}>Rulers and guides</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={s.compare} onCheckedChange={(v) => s.setCompare(!!v)}>Compare breakpoints</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={s.preview} onCheckedChange={(v) => s.setPreview(!!v)}>Preview</DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => s.setZoom(s.zoom + 0.1)}>Zoom in</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => s.setZoom(s.zoom - 0.1)}>Zoom out</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => s.setZoom(1)}>Actual size (100%)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => s.setZoom(1, false)}>Fit to window</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => s.setRightTab("help")}><Keyboard />Keyboard shortcuts</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.open("/help", "_blank", "noopener")}><LifeBuoy />Help center<ExternalLink className="ml-auto" /></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
