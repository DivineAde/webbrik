# ADR-0012: Component isolation and custom code execution

**Status:** Accepted

## Context
User HTML/JS is untrusted.

## Decision
Canvas iframe with `sandbox=allow-scripts` and no same-origin; published sites on a separate origin with CSP; sanitised renderer.

## Consequences
Safe by default; custom code can't read editor storage/cookies.
