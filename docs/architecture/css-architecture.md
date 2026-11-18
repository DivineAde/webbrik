# CSS architecture

- No inline styles. Each element with styles gets a generated class `e-<id>`; reusable styles are named classes. Output order per breakpoint: classes, then element styles (so element overrides class).
- Breakpoints compile to `@media (max-width: N px)`, widest first (desktop-first cascade).
- States compile as pseudo-classes on the same selector (`:hover`, `:focus`…).
- Tokens compile to `:root{--name:value}`; values may reference `var(--name)`.
- **Sanitisation:** declarations containing `{ } ; < >`, comments, `expression()` or `javascript:` URLs are dropped; property names are validated.
- **Style source inspector** (`inspectStyles`): for a node + breakpoint, lists each declaration with its origin (class/element), class name, and whether it is the active (winning) value — surfaced in the inspector panel.
- Not yet: inheritance display, token-origin display, container queries, pseudo-elements, custom selectors, CSS import, unused-style detection.
