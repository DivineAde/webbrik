# Document model specification (schema version 1)

`Document { version, id, name, nodes: Record<id, ElementNode>, pages[], classes, components, breakpoints[], tokens, customCode }`

- **Flat node map + child id arrays** (not nested objects): O(1) lookup, cheap structural sharing, simple operations, collaboration-friendly.
- **ElementNode:** `type` (element | text | component-instance | slot), `tag`, `parentId`, `children`, `attributes`, `text`, `classIds`, `styles[]` (per breakpoint + optional pseudo-state), `hidden`, `locked`, `componentId`, `props`, `binding` (CMS), `interactions[]`.
- **Pages:** `route` (validated pattern incl. `:param`), `rootId`, `meta`, `isHome`.
- **Breakpoints:** desktop-first; `base` has no query, others use `max-width`.
- **Invariants** (checked by `validateDocument`): parent/child links agree, no orphans/cycles/shared nodes, classes/components/breakpoints exist, unique routes, exactly one home page.

## Operations
`insertSubtree, deleteElement, moveElement, updateElement, setStyle, addClass, removeClass, upsertClass, removeClassDef, duplicateElement, setToken`. Each is serialisable, validated, returns an **inverse**, and batches are atomic. Locked nodes and page roots are protected; moving into a descendant is rejected.

## History
`History.commit(label, ops)` groups ops into one undo step; undo/redo apply inverses; failed commits leave state untouched.

## Not yet modelled as operations
Create component from selection, detach instance, slot content, component variants editing, page add/remove/rename, breakpoint editing, data-binding edits, interaction edits. The schema supports them; operations still need writing (see status.md).
