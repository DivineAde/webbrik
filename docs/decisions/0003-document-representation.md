# ADR-0003: Document representation

**Status:** Accepted

## Context
Editor, renderer, exporter and collaboration need one source of truth.

## Decision
Flat node map keyed by id with child id arrays, versioned schema (`version: 1`), Zod-validated.

## Consequences
O(1) lookups, structural sharing, simple ops. Needs invariant validation (done in validateDocument).
