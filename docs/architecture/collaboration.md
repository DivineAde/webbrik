# Collaboration strategy

The operation log + inverses already give a transaction model. Two viable approaches:
1. **Server-ordered operations (OT-lite)** — client sends ops with `baseRevision`; server transforms/rejects, broadcasts. Simple, fits our tree ops (insert/move/delete conflicts resolved by tombstones and parent checks), keeps undo as inverse ops.
2. **CRDT (Yjs)** — map nodes into `Y.Map`, children as `Y.Array`. Strong offline story; undo requires Yjs UndoManager and tree-move semantics need care (move = delete+insert causes duplicates under concurrency).

**Recommendation:** start with (1), because the document has strict invariants (single parent, no cycles) that CRDT tree moves handle poorly. Revisit Yjs for rich text only. Presence/selection via WebSocket channel per project. See ADR-0008. Not implemented.
