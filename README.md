<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-dark.svg">
  <img src="docs/images/logo.svg" alt="Webbrik" width="220">
</picture>

### Design the site. Keep the code.

A visual website builder with full CSS control. Lay pages out on a canvas, publish them in one click, or export clean HTML, CSS and React.

[![CI](https://github.com/DivineAde/webbrik/actions/workflows/ci.yml/badge.svg)](https://github.com/DivineAde/webbrik/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-app_router-000000?logo=nextdotjs)
![NestJS](https://img.shields.io/badge/NestJS-API-e0234e?logo=nestjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169e1?logo=postgresql&logoColor=white)

[Quick start](#quick-start) · [Features](#what-you-can-do) · [How it works](#how-it-works) · [Deploy](#deploy) · [Docs](#documentation)

<br>

<img src="docs/images/hero.webp" alt="The Webbrik home page: a headline, and a working editor that reorders and restyles a bakery site" width="900">

</div>

<br>

## Why Webbrik

Most visual builders trade control for speed: you get a canvas, but the CSS underneath is out of reach and the export is a lock-in. Webbrik keeps both.

- **The page is a document.** Every element is a typed node with its own styles. The editor, the preview and the export all read the same document, so what you see is what ships.
- **You own the output.** Export a static site, a Next.js project or a Vite project. The code is readable and has no runtime that depends on Webbrik.
- **Safe by construction.** Styles are sanitised, custom code runs isolated, uploads are checked by their real file type, and AI suggestions are validated before they can touch your page.

## What you can do

### Build on a real canvas

<img src="docs/images/editor.webp" alt="The Webbrik editor with a template panel, a canvas showing a page, and a design panel with layout and size controls" width="900">

- Drag components and templates onto the canvas or the layers panel, multi-select, resize with snap guides, and edit text in place.
- Set every CSS property from a design panel: layout, size, spacing, position, typography, backgrounds, borders and effects, per breakpoint and per state.
- Compare desktop, tablet and mobile side by side. Undo and redo everything. Press <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>K</kbd> for the command palette.
- Add animations and interactions without code, with reduced-motion handled for you.
- Check quality as you go: accessibility, structure and performance hints in a dedicated panel.

### Start from a layout, not a blank page

<img src="docs/images/gallery.webp" alt="A row of generated example sites: finance app, architecture studio, outdoor shop and a plant shop" width="900">

Ten ready-made sections (navigation, hero, feature grid, pricing, FAQ, contact form and more), a component system with reusable instances, and design tokens for colour and type.

### Work with a team

<img src="docs/images/features.webp" alt="Four scenes: live collaboration with cursors and comments, publishing history, content collections and the AI assistant" width="900">

- **Live collaboration:** see who is editing, leave comments through a review link, compare any two versions visually, and restore one safely.
- **Content collections:** define fields once, add items, and bind them to headings, lists and dynamic pages such as `/blog/:slug`.
- **An assistant that asks first:** describe a change in words and review the proposed edits. Invalid suggestions never reach the document.
- **Workspaces and roles:** invitations, member roles, plan limits, an activity log, two-factor sign-in and Paystack billing.

### Publish, or take the code with you

<img src="docs/images/export.webp" alt="Export options: static site, Next.js project, Vite project, with a code panel showing the generated HTML, CSS and React" width="900">

One click publishes to a live address through Vercel, with previews, rollbacks, custom domains, environment secrets and webhooks. Prefer to host it yourself? Export a static site, a Next.js project or a Vite project as a zip.

<img src="docs/images/devices.webp" alt="The same page shown on desktop, tablet and phone" width="900">

### Manage everything from one dashboard

<img src="docs/images/dashboard.webp" alt="The Webbrik dashboard with project cards, a getting-started checklist and the workspace sidebar" width="900">

## How it works

```mermaid
flowchart LR
  subgraph Browser
    E[Editor<br/>apps/web]
  end
  subgraph Server
    A[API<br/>apps/api · NestJS]
    W[Worker<br/>apps/worker]
  end
  E -- "/api/* (same origin)" --> A
  A --> DB[(PostgreSQL<br/>or SQLite)]
  A --> S3[(Object storage<br/>Backblaze B2 / S3)]
  A --> V[Vercel<br/>publishing]
  A -. build jobs .-> W
  A -- email --> M[SMTP]
```

The engine is a set of small TypeScript packages that the web app and the API share:

| Package | What it does |
|---|---|
| `document-model` | The page schema, 30 operations, validation, history and diff |
| `css-engine` | Compiles styles with states, breakpoints and keyframes; sanitises input |
| `renderer`, `exporter` | Renders a document safely and exports static, React, Next.js and Vite code |
| `editor-core`, `collaboration` | Local and remote documents, offline retry, crash recovery, server-ordered operations |
| `component-system`, `design-system` | Templates, reusable components and design tokens |
| `content-engine` | Collections, bindings, repeaters and dynamic pages |
| `interactions`, `quality`, `ai` | Animations, quality checks and the AI proposal gate |
| `assets`, `deployment`, `integrations`, `plugins` | Uploads, publishing, outside services and the plugin SDK |

## Quick start

You need Node 22 and pnpm 9 (`corepack enable`). Nothing else: without a database the API keeps data in memory.

```bash
git clone https://github.com/DivineAde/webbrik.git
cd webbrik
pnpm install

# 1. the API (data is saved to a file; leave SQLITE_PATH out for in-memory)
SQLITE_PATH=./webbrik.db DISABLE_RATE_LIMIT=1 PORT=4000 \
  pnpm --filter @webbrik/api exec tsx src/main.ts

# 2. the web app, in a second terminal
pnpm --filter @webbrik/web dev
```

Open <http://localhost:3000>, create an account and start building. You can also open the editor without an account at `/editor`.

Outside production, emails (verification, password reset, invitations) are printed in the API log instead of being sent. Set `ANTHROPIC_API_KEY` to turn on AI suggestions. Every setting is described in [`.env.example`](.env.example) and the [local guide](docs/guides/running-locally.md).

## Deploy

| Part | Where | Guide |
|---|---|---|
| Web app (Next.js) | Vercel | [Render + Vercel step by step](docs/guides/deploy-render-vercel.md) |
| API (NestJS) | Render, or any Node host or Docker | same guide, plus [deployment overview](docs/guides/deployment.md) |
| Database | Neon PostgreSQL (or SQLite for a single host) | |
| Uploads | Backblaze B2 or any S3-compatible store | |

The browser only talks to the web app, which forwards `/api/*` to the API. Cookies stay first-party and there is no CORS to configure.

## Repository layout

```
apps/
  web/        Next.js app: landing page, dashboard, editor, settings
  api/        NestJS API: auth, workspaces, projects, documents, publishing, billing
  worker/     Build jobs that pull their input from the API
packages/     The engine: 17 small, separately tested packages (table above)
infrastructure/
  docker/     docker-compose for Postgres, Redis and MinIO; the API Dockerfile
  database/   Reference schema
docs/         Architecture, decisions (ADRs), guides and the status ledger
```

## Quality checks

```bash
pnpm typecheck                         # strict TypeScript across the monorepo
pnpm test                              # unit and HTTP-level API tests
pnpm --filter @webbrik/web build       # production build
pnpm --filter @webbrik/web e2e         # browser suites (Playwright), including an axe accessibility audit
pnpm --filter @webbrik/api bench       # benchmarks
```

CI runs install, typecheck, tests, the web build and a high-severity dependency audit on every push. Details and limits: [testing strategy](docs/engineering/testing-strategy.md) and [performance and accessibility](docs/engineering/performance-and-accessibility.md).

## Project status

Webbrik is under active development and has not launched. The [status ledger](docs/engineering/status.md) lists, feature by feature, what is built, what is tested and what is not, so nothing here is oversold. In short:

- **Built and tested:** the editor, the engine packages, auth with two-factor sign-in, workspaces and roles, revisioned documents with real-time collaboration, versions and visual diffs, content collections, forms, comments and review links, publishing and rollbacks, uploads, and the accessibility audit (zero violations in Chromium).
- **Built, and tested against the real service:** Vercel publishing, Paystack billing, Backblaze uploads, real SMTP delivery, GitHub and Google sign-in, and the Anthropic adapter. They are tested against a live pass.
- **Not built:** a visual form builder, a marketplace UI for plugins, and Lighthouse measurement inside the quality panel. See [known gaps](docs/engineering/known-gaps.md).

## Documentation

| Start here | |
|---|---|
| [Running locally](docs/guides/running-locally.md) | Setup, environment variables, local email |
| [Deploying](docs/guides/deploy-render-vercel.md) | Vercel, Render, Neon and Backblaze |
| [Architecture](docs/architecture/system-architecture.md) | How the pieces fit together |
| [Decisions](docs/decisions) | Why things are the way they are (22 ADRs) |
| [Security model](docs/architecture/security-model.md) | Sessions, CSRF, sanitising, isolation |
| [Design guidelines](DESIGN.md) | Visual language, components and motion |

## License

Webbrik is free to use, change and share under the [Apache License 2.0](LICENSE). The copyright stays with the author, and every copy or fork must keep the [LICENSE](LICENSE) and [NOTICE](NOTICE) files, which credit the original work. The Webbrik name and logo are not part of the license: a fork needs its own name. See [CONTRIBUTING.md](CONTRIBUTING.md) before sending changes.

<div align="center">

Designed and built by [Divine Adeyeye](https://github.com/DivineAde).

</div>

The sites in the screenshots above are made-up examples, not real customers.
