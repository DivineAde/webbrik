# ADR-0004: CSS compilation strategy

**Status:** Accepted

## Context
Avoid conflicting inline styles; need breakpoints, states and an explainable cascade.

## Decision
Compile to generated classes (`e-<id>`) and named classes; desktop-first `max-width` media queries; sanitise every declaration.

## Consequences
Predictable output identical across editor/publish/export. Tailwind-style utilities and container queries are future work.
