# ADR-0006: Editor state management

**Status:** Accepted

## Context
Document, UI and server state have different lifecycles.

## Decision
Document in `History` (document-model); transient/UI state in Zustand; server state via TanStack Query (planned).

## Consequences
Clear boundaries; inspector never mutates state directly.
