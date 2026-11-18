# ADR-0011: Source export strategy

**Status:** Accepted

## Context
Portability is a product pillar.

## Decision
Export from the same renderer/CSS compiler; static HTML/CSS first, React/Next targets next with warnings for unsupported features.

## Consequences
No lock-in; export parity is testable.
