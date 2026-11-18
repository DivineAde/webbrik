# Monorepo architecture

pnpm workspaces + Turborepo. `tsconfig.base.json` is strict (`noUncheckedIndexedAccess`). Packages export TypeScript source via `main`/`types: src/index.ts` and are transpiled by consumers (`transpilePackages` in Next, tsx in Node apps).

| Package | Responsibility | Depends on |
|---|---|---|
| document-model | schema, operations, history, validation | zod |
| css-engine | compile styles, sanitise, precedence inspector | document-model |
| renderer | document → HTML, sanitising | document-model, css-engine |
| interactions | document → tiny JS runtime | document-model |
| exporter | static site export | renderer, css-engine, interactions |
| deployment | provider interface, Vercel, memory, retry | — |
| content-engine | CMS schema validation, visibility, query, routes | zod |
| quality | SEO/a11y/perf analysis | document-model |
| ai | proposal schema + dry-run gate | document-model |
| design-system | tokens, theme CSS | — |
| shared | roles, permissions, plans/quotas | — |

Blueprint packages not yet created (no meaningful code to own yet): `ui`, `editor`, `editor-core`, `component-system`, `code-engine`, `integrations`, `collaboration`, `schemas`, `config`, `testing`. They are created when their first real code lands (blueprint §4: "create packages when they represent meaningful boundaries").

Rules: no cycles (checked by the one-way graph above); each package's public API is its `src/index.ts`; each package is independently testable (`pnpm --filter @webbrik/x test`).
