"use client";
import { create } from "zustand";
import { insertSpecOp, type Spec } from "@webbrik/component-system";
import type { UserGuide } from "./snap";
import { freeOffsets } from "./position";
import { dropOps, indentOps, nudgeOps, outdentOps, reorderOps, type DragPayload, type DropPosition } from "./dnd";
import type { ContentData } from "@webbrik/renderer";
import { api } from "@/lib/api";
import { RemoteDoc, type KV } from "@webbrik/editor-core";
import { connectRealtime } from "./realtime";
import { httpTransport } from "./http-transport";
import { withFlip } from "./canvas-motion";
import { History, createDocument, createId, createNode, validateDocument, type Document, type Operation } from "@webbrik/document-model";

const STORAGE_KEY = "webbrik:editor:recovery:v1";

export type LeftTab = "elements" | "navigator" | "pages" | "templates" | "components" | "tokens";
export type RightTab = "design" | "interact" | "animate" | "quality" | "code" | "ai" | "history" | "help";
export interface CollectionInfo { id: string; slug: string; name: string; fields: { name: string; type: string; to?: string }[] }
export type SaveStatus = "saved" | "saving" | "unsaved" | "error" | "offline" | "conflict";

function loadRecovery(): Document | null {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const v = validateDocument(JSON.parse(raw));
      if (v.ok && v.document) return v.document;
    }
  } catch {
    /* ignore corrupt or unavailable storage */
  }
  return null;
}

/** Persistent document state lives in `history`; everything else here is transient/UI state. */
interface EditorState {
  history: History;
  remote: RemoteDoc | null;
  collections: CollectionInfo[];
  content: ContentData;
  loadContent: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | undefined;
  statusMessage: string | null;
  attachRemote: (projectId: string) => Promise<void>;
  doc: Document;
  pageId: string;
  selectedId: string | null;
  selectedIds: string[];
  dropTarget: { id: string; pos: DropPosition } | null;
  setDropTarget: (t: { id: string; pos: DropPosition } | null) => void;
  performDrop: (payload: DragPayload, targetId: string, pos: DropPosition) => void;
  nudgeSelected: (dir: -1 | 1) => void;
  /** Send the selection to the front (first) or back (last) of its siblings. */
  reorderSelected: (where: "first" | "last") => void;
  /** Put the selection inside a new container, in the same place. */
  wrapSelected: () => void;
  /** Right-click menu position and the element it is for (null = closed). */
  menu: { id: string | null; x: number; y: number } | null;
  openMenu: (m: { id: string | null; x: number; y: number }) => void;
  closeMenu: () => void;
  /** Alt+→: make the selection the last child of its previous sibling. Alt+←: move it out, just after its parent. */
  /** Arrow keys on a free-positioned element: move it by (dx, dy) px. Returns false when the selection isn't free-positioned. */
  nudgeFree: (dx: number, dy: number) => boolean;
  indentSelected: () => void;
  outdentSelected: () => void;
  showRulers: boolean;
  setRulers: (v: boolean) => void;
  /** User guides, per breakpoint (positions are page pixels at that breakpoint's width). Editor-only: never published. */
  /** Last canvas measurement of the single selected element (page coordinates). Editor-only. */
  /** True while the push channel (WebSocket) is connected. */
  live: boolean;
  measured: { id: string; rect: { x: number; y: number; w: number; h: number }; parent: { x: number; y: number; w: number; h: number }; pos: string; ppos: string; pb: { l: number; t: number } } | null;
  setMeasured: (m: EditorState["measured"]) => void;
  guides: Record<string, UserGuide[]>;
  setGuides: (g: Record<string, UserGuide[]>) => void;
  addGuide: (axis: "x" | "y", pos: number) => string;
  moveGuide: (id: string, pos: number) => void;
  removeGuide: (id: string) => void;
  setText: (id: string, text: string) => void;
  hoveredId: string | null;
  breakpoint: string;
  zoom: number;
  /** True once the person has picked a zoom; until then the canvas fits the page to the available width. */
  zoomManual: boolean;
  preview: boolean;
  compare: boolean;
  setCompare: (v: boolean) => void;
  paletteOpen: boolean;
  leftTab: LeftTab;
  rightTab: RightTab;
  saveStatus: SaveStatus;
  lastError: string | null;
  commit: (label: string, ops: Operation[]) => boolean;
  undo: () => void;
  redo: () => void;
  select: (id: string | null, additive?: boolean) => void;
  hover: (id: string | null) => void;
  setBreakpoint: (id: string) => void;
  setZoom: (z: number, manual?: boolean) => void;
  setPreview: (v: boolean) => void;
  setPalette: (v: boolean) => void;
  setLeftTab: (t: LeftTab) => void;
  setRightTab: (t: RightTab) => void;
  insertSpec: (spec: Spec, label: string) => void;
  setPage: (id: string) => void;
  insertElement: (tag: string, opts?: { text?: string; styles?: Record<string, string> }) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  persist: () => void;
  hydrate: () => void;
}

export const useEditor = create<EditorState>((set, get) => {
  // Start from a fresh document so server and client render identically; recovery happens in hydrate() after mount.
  const history = new History(createDocument("Untitled project"));
  const sync = () => { if (!get().remote) set({ doc: history.doc, saveStatus: "unsaved", canUndo: history.canUndo, canRedo: history.canRedo, undoLabel: history.undoLabel }); };
  history.subscribe(sync);
  const syncRemote = (r: RemoteDoc) => set((st) => ({
    doc: r.doc, canUndo: r.canUndo, canRedo: r.canRedo, undoLabel: undefined,
    saveStatus: r.status, statusMessage: r.statusMessage,
    pageId: r.doc.pages.some((p) => p.id === st.pageId) ? st.pageId : r.doc.pages[0]!.id,
    selectedIds: st.selectedIds.filter((x) => r.doc.nodes[x]),
    selectedId: st.selectedId && r.doc.nodes[st.selectedId] ? st.selectedId : null,
  }));

  return {
    history,
    remote: null,
    collections: [],
    content: {},
    async loadContent() {
      const pid = get().remote?.projectId;
      if (!pid) return;
      try {
        const { collections } = await api<{ collections: { id: string; slug: string; schema: { name: string; fields: { name: string; type: string }[] } }[] }>(`/projects/${pid}/collections`);
        const content: ContentData = {};
        await Promise.all(collections.map(async (c) => { content[c.id] = (await api<{ items: { id: string; slug: string; data: Record<string, unknown> }[] }>(`/projects/${pid}/collections/${c.id}/items`)).items.map(({ id, slug, data }) => ({ id, slug, data })); }));
        set({ collections: collections.map((c) => ({ id: c.id, slug: c.slug, name: c.schema.name, fields: c.schema.fields })), content });
      } catch { /* content is optional for editing; bindings simply show fallbacks */ }
    },
    canUndo: false,
    canRedo: false,
    undoLabel: undefined,
    statusMessage: null,
    doc: history.doc,
    pageId: history.doc.pages[0]!.id,
    selectedId: null,
    selectedIds: [],
    dropTarget: null,
    hoveredId: null,
    breakpoint: "base",
    zoom: 1,
    zoomManual: false,
    preview: false,
    compare: false,
    setCompare: (compare) => set({ compare, ...(compare ? { selectedId: null, selectedIds: [] } : {}) }),
    paletteOpen: false,
    leftTab: "elements",
    rightTab: "design",
    saveStatus: "saved",
    lastError: null,

    commit(label, ops) {
      try {
        const r = get().remote;
        if (r) r.commit(label, ops); else history.commit(label, ops);
        set({ lastError: null });
        return true;
      } catch (e) {
        set({ lastError: e instanceof Error ? e.message : "Operation failed" });
        return false;
      }
    },
    undo: () => void (get().remote ? get().remote!.undo() : history.undo()),
    redo: () => void (get().remote ? get().remote!.redo() : history.redo()),
    async attachRemote(projectId) {
      const kv: KV = { get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v), remove: (k) => localStorage.removeItem(k) };
      const r = await RemoteDoc.open({ projectId, transport: httpTransport(projectId), storage: kv, storageKey: `webbrik:pending:${projectId}`, pollMs: 3000 });
      r.subscribe(() => syncRemote(r));
      // Push hints make collaboration near-instant; while connected, polling backs off to a slow safety net.
      const ch = connectRealtime(projectId, { onHint: () => void r.poll(), onState: (c) => { r.setPolling(c ? 20_000 : 3000); set({ live: c }); } });
      window.addEventListener("pagehide", () => ch.close(), { once: true });
      set({ remote: r });
      syncRemote(r);
      void get().loadContent();
      set({ pageId: r.doc.pages[0]!.id });
    },
    select: (id, additive) => {
      if (!id) return set({ selectedId: null, selectedIds: [] });
      if (!additive) return set({ selectedId: id, selectedIds: [id] });
      const cur = get().selectedIds;
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      set({ selectedIds: next, selectedId: next.at(-1) ?? null });
    },
    setDropTarget: (dropTarget) => set({ dropTarget }),
    performDrop(payload, targetId, pos) {
      const { doc, commit } = get();
      set({ dropTarget: null });
      const r = dropOps(doc, payload, targetId, pos);
      if ("error" in r) return void set({ lastError: r.error });
      if (commit(r.label, r.ops)) set({ selectedIds: r.select, selectedId: r.select.at(-1) ?? null });
    },
    showRulers: false,
    setRulers: (showRulers) => set({ showRulers }),
    live: false,
    measured: null,
    setMeasured: (measured) => set({ measured }),
    guides: {},
    setGuides: (guides) => set({ guides }),
    addGuide(axis, pos) {
      const id = createId("g"); const bp = get().breakpoint;
      set((s) => ({ guides: { ...s.guides, [bp]: [...(s.guides[bp] ?? []), { id, axis, pos: Math.round(pos) }] } }));
      return id;
    },
    moveGuide(id, pos) { const bp = get().breakpoint; set((s) => ({ guides: { ...s.guides, [bp]: (s.guides[bp] ?? []).map((g) => (g.id === id ? { ...g, pos: Math.round(pos) } : g)) } })); },
    removeGuide(id) { const bp = get().breakpoint; set((s) => ({ guides: { ...s.guides, [bp]: (s.guides[bp] ?? []).filter((g) => g.id !== id) } })); },
    nudgeFree(dx, dy) {
      const { selectedIds, doc, breakpoint, commit } = get();
      const id = selectedIds.length === 1 ? selectedIds[0]! : null; const n = id ? doc.nodes[id] : undefined;
      const o = n ? freeOffsets(n, doc.breakpoints.map((b) => b.id), breakpoint) : null;
      if (!id || !o) return false;
      commit("Move", [{ type: "setStyle", id, breakpoint, declarations: { left: `${o.left + dx}px`, top: `${o.top + dy}px` } }]);
      return true;
    },
    indentSelected() {
      const { selectedIds, doc, commit } = get();
      const ops = selectedIds.length === 1 ? indentOps(doc, selectedIds[0]!) : [];
      if (ops.length) commit("Move into previous sibling", ops);
    },
    outdentSelected() {
      const { selectedIds, doc, commit } = get();
      const ops = selectedIds.length === 1 ? outdentOps(doc, selectedIds[0]!) : [];
      if (ops.length) commit("Move out of parent", ops);
    },
    nudgeSelected(dir) {
      const { selectedIds, doc, commit } = get();
      const ops = selectedIds.length === 1 ? nudgeOps(doc, selectedIds[0]!, dir) : [];
      if (ops.length) withFlip(() => commit(dir < 0 ? "Move up" : "Move down", ops));
    },
    reorderSelected(where) {
      const { selectedIds, doc, commit } = get();
      const ops = selectedIds.length === 1 ? reorderOps(doc, selectedIds[0]!, where) : [];
      if (ops.length) withFlip(() => commit(where === "first" ? "Move to start" : "Move to end", ops));
    },
    wrapSelected() {
      const { selectedIds, doc, commit } = get();
      const id = selectedIds.length === 1 ? selectedIds[0]! : null;
      const n = id ? doc.nodes[id] : undefined;
      if (!id || !n?.parentId || doc.pages.some((p) => p.rootId === id)) return;
      const wrap = createId();
      const parent = doc.nodes[n.parentId]!;
      const index = parent.children.indexOf(id);
      const node = createNode({ id: wrap, parentId: n.parentId, tag: "div", name: "Container" });
      if (commit("Wrap in container", [{ type: "insertSubtree", rootId: wrap, nodes: [node], parentId: n.parentId, index }, { type: "moveElement", id, parentId: wrap, index: 0 }])) set({ selectedId: wrap, selectedIds: [wrap] });
    },
    menu: null,
    openMenu: (menu) => set({ menu }),
    closeMenu: () => set({ menu: null }),
    setText(id, text) {
      const n = get().doc.nodes[id];
      if (n && n.text !== text) get().commit("Edit text", [{ type: "updateElement", id, patch: { text } }]);
    },
    hover: (id) => set({ hoveredId: id }),
    setBreakpoint: (breakpoint) => set({ breakpoint }),
    setZoom: (zoom, manual = true) => set({ zoom: Math.min(2, Math.max(0.25, zoom)), zoomManual: manual }),
    setPreview: (preview) => set({ preview, ...(preview ? { selectedId: null, selectedIds: [] } : {}) }),
    setPalette: (paletteOpen) => set({ paletteOpen }),
    setLeftTab: (leftTab) => set({ leftTab }),
    setRightTab: (rightTab) => set({ rightTab }),
    insertSpec(spec, label) {
      const { doc, pageId, selectedId, commit } = get();
      const page = doc.pages.find((p) => p.id === pageId);
      if (!page) return;
      const sel = selectedId ? doc.nodes[selectedId] : undefined;
      const target = sel && sel.type === "element" && sel.tag !== "img" ? sel.id : page.rootId;
      const seed = createId("t");
      if (commit(`Insert ${label}`, [insertSpecOp(doc, spec, target, doc.nodes[target]!.children.length, seed)])) set({ selectedId: seed, selectedIds: [seed] });
    },
    setPage: (pageId) => set({ pageId, selectedId: null, selectedIds: [] }),

    insertElement(tag, opts = {}) {
      const { doc, pageId, selectedId, commit } = get();
      const page = doc.pages.find((p) => p.id === pageId);
      if (!page) return;
      // Insert into the selected container, else the page root.
      const target = selectedId && doc.nodes[selectedId] && doc.nodes[selectedId]!.type === "element" ? selectedId : page.rootId;
      const id = createId();
      const node = createNode({ id, parentId: target, tag, name: tag, text: opts.text });
      const ops: Operation[] = [{ type: "insertSubtree", rootId: id, nodes: [node], parentId: target, index: doc.nodes[target]!.children.length }];
      if (opts.styles) ops.push({ type: "setStyle", id, breakpoint: "base", declarations: opts.styles });
      if (commit(`Insert ${tag}`, ops)) set({ selectedId: id, selectedIds: [id] });
    },

    deleteSelected() {
      const { selectedIds, doc, commit } = get();
      // Skip descendants of other selected nodes (they go with their ancestor) and page roots.
      const ids = selectedIds.filter((id) => doc.nodes[id] && !doc.pages.some((p) => p.rootId === id) && !selectedIds.some((o) => { for (let c = doc.nodes[id]?.parentId; c; c = doc.nodes[c]?.parentId) if (c === o) return true; return false; }));
      if (ids.length && commit(ids.length > 1 ? `Delete ${ids.length} elements` : "Delete element", ids.map((id) => ({ type: "deleteElement" as const, id })))) set({ selectedId: null, selectedIds: [] });
    },

    duplicateSelected() {
      const { selectedIds, commit } = get();
      if (!selectedIds.length) return;
      const pairs = selectedIds.map((id) => ({ id, newRootId: createId() }));
      if (commit("Duplicate", pairs.map((p) => ({ type: "duplicateElement" as const, ...p })))) set({ selectedIds: pairs.map((p) => p.newRootId), selectedId: pairs.at(-1)!.newRootId });
    },

    hydrate() {
      const recovered = loadRecovery();
      if (!recovered) return;
      history.reset(recovered);
      set({ doc: history.doc, pageId: history.doc.pages[0]!.id, selectedId: null, selectedIds: [], saveStatus: "saved", canUndo: false, canRedo: false });
    },

    persist() {
      if (get().remote) return;
      try {
        set({ saveStatus: "saving" });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history.doc));
        set({ saveStatus: "saved" });
      } catch {
        set({ saveStatus: "error" });
      }
    },
  };
});
