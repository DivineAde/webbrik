# UI ENGINEERING

- **Business logic never lives in components.** Components dispatch document operations through the editor store (`commit(label, ops)`); the store owns validation errors and history.
- **State separation.** Persistent document → `History` (document-model). Transient/UI (selection, hover, breakpoint, zoom, palette, tabs) → Zustand slice in `features/editor/store.ts`. Server sync → planned TanStack Query + `DocumentsService` (revisioned saves). Collaboration → planned (ADR-0008).
- **Selectors, not whole-store reads.** Use `useEditor((s) => s.x)` so a hover change doesn't re-render the inspector. (`Toolbar`/`CommandPalette` read the whole store today; they are small, but convert them before the tree gets large.)
- **Canvas isolation.** The canvas is a sandboxed iframe (`sandbox="allow-scripts"`, no `allow-same-origin`) fed by the same renderer as publishing. Communication is `postMessage` with `event.source` checks.
- **Large documents.** Navigator rows are plain recursive components today; virtualise (e.g. TanStack Virtual) once trees exceed a few thousand nodes.
- **Accessibility.** Roles on tree/tab/listbox/dialog widgets, `aria-label` on icon buttons, visible focus ring, `role="status"` for save state, `role="alert"` for operation errors.
- **Errors.** Failed operations surface in the alert bar and leave the document untouched (atomic `applyOperations`).
- **Testing.** Pure logic is unit-tested in packages; browser behaviour is verified with Playwright (see docs/engineering/testing-strategy.md).
