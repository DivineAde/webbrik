# ADR-0007: Undo/redo architecture

**Status:** Accepted

## Context
Collaboration and AI need reversible changes.

## Decision
Every operation returns inverse operations; transactions group ops; failures are atomic.

## Consequences
Undo is just another operation batch, compatible with server-ordered collaboration.
