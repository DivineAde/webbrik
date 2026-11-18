# ADR-0005: Rendering strategy

**Status:** Accepted

## Context
Preview and production must match.

## Decision
One framework-independent string renderer (`renderPage`) used by canvas, publish and export; editor mode only adds `data-node-id`.

## Consequences
Perfect parity and easy sandboxing. Component-level hydration/React export need a second target later.
