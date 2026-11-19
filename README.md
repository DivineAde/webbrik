# Webbrik — visual website builder

A TypeScript monorepo implementing the **website document engine** and a working visual editor shell. See `docs/engineering/status.md` for exactly what is implemented vs. planned.

**Guides:** [running locally](docs/guides/running-locally.md) · [deploying](docs/guides/deployment.md)

## Quick start
```bash
pnpm install
pnpm typecheck && pnpm test
# API + web. Data is durable when SQLITE_PATH or DATABASE_URL is set (otherwise in memory and lost on restart)
SQLITE_PATH=./webbrik.db DISABLE_RATE_LIMIT=1 PORT=4000 pnpm --filter @webbrik/api exec tsx src/main.ts &   # set ANTHROPIC_API_KEY to enable AI suggestions
pnpm --filter @webbrik/web dev      # http://localhost:3000/login  (or /editor for the local sandbox)
docker compose -f infrastructure/docker/docker-compose.yml up -d   # postgres, redis, minio (not yet used by the API)
```
Browser checks (after `next build && next start -p 3100`): `pnpm --filter @webbrik/web e2e` (smoke, panels, dnd, fullstack, project, cms, account, ai-settings; the API for these runs from `apps/api/test/e2e-server.ts`, which uses a fake AI provider)`.

## What works today
- **Web**: register/sign in, dashboard, server-synced editor (`/editor/:projectId`, offline-tolerant with crash recovery) and an anonymous local sandbox (`/editor`). Panels: elements, layers, pages, templates, components, tokens, quality, custom code, animation presets, history, help. Drag-and-drop, multi-select, on-canvas text editing, breakpoints, preview, undo/redo, ⌘K, zip export.
- **Engine packages**: document model, CSS compiler, sanitising renderer, static + React/Next/Vite export, interactions/animations, component system, collaboration, editor-core, CMS content engine, quality checks, AI proposal gate, deployment abstraction, assets, plugins, integrations.
- **API**: auth/MFA/sessions, workspaces/roles/plans, projects, revisioned documents, real-time ops, comments/review links, versions, assets, CMS/forms, deployments/domains/env/webhooks, AI proposals, audit log. Durable relational storage on PostgreSQL or SQLite; several API instances can share a database (`MULTI_INSTANCE=1`, ADR-0016).

## Layout
`apps/{web,api,worker}` · `packages/*` · `infrastructure/{docker,database}` · `docs/`

Read `docs/engineering/status.md` before assuming a blueprint item exists.

## Verification

`pnpm typecheck`, `pnpm test`, `pnpm --filter @webbrik/api bench` (benchmarks), and `pnpm --filter @webbrik/web e2e` (browser suites, including the axe accessibility audit). Details and limits here: `docs/engineering/status.md` and `docs/engineering/performance-and-accessibility.md`.
