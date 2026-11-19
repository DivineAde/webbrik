# Webbrik — implementation status (honest ledger)

Legend: ✅ implemented & automatically tested · 🟡 partial / not verified live · ⬜ not built

Verified at last run: `pnpm typecheck` (20/20) · `pnpm test` (all packages green; 92 HTTP-level API tests incl. SMTP against a real local SMTP server and Paystack against a fake Paystack server) · `next build` · thirteen Playwright scripts in `apps/web/e2e` (smoke, panels, dnd, fullstack, project, cms, cms2, editor2, account, account2, ai-settings, a11y with the plain e2e API; `billing` needs the API started with `E2E_PAYSTACK=1`, see `run.sh`). Benchmarks and the axe audit: see `performance-and-accessibility.md`.

| Area | Status | Notes |
|---|---|---|
| Monorepo, strict TS, turbo, pnpm, CI file, docker-compose | ✅ | CI workflow never executed on GitHub |
| Design tokens (light/dark, OKLCH, reduced motion) | ✅ | |
| Document model: schema, 30 ops, validation, history, diff | ✅ | incl. pages, breakpoints, components, animations, custom code |
| CSS engine (sanitised, states, breakpoints, keyframes, precedence inspector) | ✅ | no container queries |
| Renderer, static export, React/Next/Vite export, zip | ✅ | exported TSX transpile-checked, and a sample Next export (with CMS repeater, dynamic route and rich text) was type-checked with the real compiler against React/Next types; no real `next build`/`vite build` of an export has been run. Exports ship published CMS content as a snapshot file (`content/cms.ts`) |
| Interactions runtime + animations (presets, reduced-motion) | ✅ | timeline keyframe editor (timing, repeat, WAAPI preview) and interaction builder panel (`e2e/editor3.cjs`) |
| Component system: templates (10), instances, usage, cycle detection | ✅ | no variants editor UI |
| Collaboration engine (server-ordered ops, convergence, presence) | ✅ | WebSocket push hints (`ws`, Origin + session + membership checked; ADR-0017) with HTTP as the source of truth and slow polling as fallback; hints are per API instance |
| editor-core: LocalDoc / RemoteDoc, offline retry, crash recovery, undo-as-ops | ✅ | tested with in-memory transport and fake clock |
| Content engine (CMS), forms | ✅ API + web | collections, item create/edit/status/delete; **element bindings (text/rich text/src/href/alt, including reference paths like `author.name`), repeaters with filters (is / is not / contains / > / <), sort and limit, dynamic pages (`/blog/:slug`) in editor, preview, publish and static/React/Next/Vite export**; rich text (allowlist-sanitised on write, at render and at export); reference and multi-reference pickers; item history with safe restore (blocked if the old version no longer fits the schema). Only published/due items ship. No form builder, no pagination, no multi-reference bindings, rich-text bindings need a container element without children (React export drops children with a warning). |
| Quality center | ✅ engine + panel | no Lighthouse/CWV measurement |
| AI proposal gate | ✅ API + web | editor AI tab: prompt → server-validated proposal → change summary → accept/reject; invalid suggestions never touch the document; accepted proposals apply server-side and the editor resyncs (browser-tested with a deterministic fake provider). **Anthropic adapter never run against the real API.** No inline per-element diff overlay. |
| Assets (magic bytes, SVG sanitiser) | ✅ API + web | upload/alt text/delete; no folders UI, no picker inside the editor, no S3 implementation |
| Deployment abstraction + Vercel | 🟡 | Vercel adapter never run against the real API; memory provider tested |
| Deploy/publish, rollback, domains, env secrets (AES-GCM) | ✅ API + web | Publish tab; webhooks and analytics settings have no UI |
| Webhooks (HMAC, SSRF guard), analytics snippets | ✅ API + web | Project → Settings tab; signing secret shown once. Delivery to real endpoints never exercised live; delivery log (last 100 per project, with status, duration and error) and “Send test” are in the Settings tab. |
| Auth: sessions, CSRF, MFA, reset, OAuth interface, sessions list | ✅ API + web | login/register, forgot/reset password, verify-email, account settings (profile, password, TOTP setup with QR code + 8 one-time recovery codes (regenerate, count remaining), sessions, **account deletion** (password + code; blocked while you are the only owner of a workspace with other members)); OAuth provider adapters not run live; no UI buttons for OAuth; **email is sent over SMTP** (nodemailer; `SMTP_URL` or `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`; tested against a real local SMTP server incl. STARTTLS, implicit TLS, auth, refusal of untrusted certificates and header-injection stripping; **no real mail provider has been contacted**). Without SMTP config the API uses an in-memory outbox in dev/tests and refuses to start in production Email-change flow with confirmation link; OAuth login buttons appear when client IDs are set (real provider exchange untested). |
| Workspaces, roles, invites, plans/quota, audit log | ✅ API + web | workspace page: members (role change, remove, leave), invitations (send, pending list, revoke), plan & usage meters, activity log, rename, **workspace deletion** (owner + typed name; removes projects, content, assets, audit). **Payments via Paystack**: owner upgrades to Pro from the Plan tab (hosted checkout → return → server-side verify), cancel, payment history, signed webhook (`POST /v1/billing/paystack/webhook`, HMAC-SHA512) for renewals/failures/cancellation, exact amount+currency+workspace check, lapse to free 3 days after the paid period ends, receipt emails. Tested against a fake Paystack server (API tests + a Playwright run of the whole upgrade/cancel flow); **real Paystack has never been called**, so plan codes, webhook delivery and live amounts need a test-mode pass before launch. Invites are emailed (the UI warns when delivery failed). Billing extras: Team plan, tax, proration on upgrade, coupons (admin API via `ADMIN_EMAILS`), invoice PDFs; all against a fake Paystack only. |
| Comments, review links, version history/compare/restore | ✅ API + web | project page tabs + public `/review/:token` page (sandboxed, no scripts); visual before/after diff with added/removed/changed/moved outlines |
| API persistence | ✅ | **Relational tables** (ADR-0016) on PostgreSQL (`DATABASE_URL`) or SQLite (`SQLITE_PATH`): typed/indexed columns, unique constraints, foreign keys, migrations table, automatic import of older JSON-row databases. **Several API instances** can share one database (`MULTI_INSTANCE=1`: change feed, write-through, revision-clash guard); tested with two instances on SQLite and on a real embedded PostgreSQL, and the whole API suite also runs on the relational SQLite store. Limits: all rows are held in memory per instance; presence/op log/rate limits are per instance; no multi-host or load test. `schema.prisma` is a reference only. |
| Worker (BullMQ build job) | 🟡 | pulls build input from the API with `WORKER_TOKEN` (ADR-0019), unit + HTTP tested; never run against a real Redis |
| Web editor: panels (templates, pages, components, tokens, quality, code, animate, history, help), command palette, shortcuts, autosave, server sync | ✅ | |
| Web editor: drag-and-drop (layers, library, templates → layers or canvas), multi-select (shift/⌘-click, bulk delete/duplicate/move/style), double-click text editing, Alt+↑/↓ reorder, shortcuts forwarded from the canvas | ✅ | unit-tested (`dnd.test.ts`) + `e2e/dnd.cjs` |
| Web editor: resize handles (right/bottom edges, mouse + arrow keys) with snap guides to sibling/parent edges, centres and sibling sizes; side-by-side compare of all breakpoints; resizable, persisted, keyboard-operable panels; asset picker with upload and in-canvas previews | ✅ | free positioning (X/Y/W/H per breakpoint), rulers, user guides, keyboard canvas moves, editable compare view (`e2e/editor3.cjs`) |
| UI redesign: Inter Variable, larger type scale, dashboard with sidebar/grid-list/menus, editor with icon rail + titled panels + grouped component tiles + main menu, redesigned auth pages | ✅ | screenshot-reviewed in Chromium only; `e2e/*.cjs` updated |
| Web editor: pointer-based drag and drop (ADR-0021) from the component tiles, templates and layers onto the canvas (including empty pages) or the layers panel | ✅ | real-mouse test in `e2e/dnd.cjs` |
| API logging: startup banner, failure hints, per-request lines (ADR-0022) | ✅ | |
| Users/sessions/workspaces/memberships as real typed columns (ADR-0020) | ✅ | SQLite + embedded Postgres tests; **not run on a real Neon database** |
| UI kit | ✅ | Radix + cva: dialog, alert-dialog confirm, dropdown, tabs, tooltip, popover, select, switch, checkbox, label (`/ui-kit`, `e2e/uikit.cjs`) |
| Plugin SDK, integrations | ✅ packages | no marketplace UI |
| Onboarding/help | ✅ | help center (`/help`), dashboard checklist, editor help panel |
| Performance benchmarks | ✅ measured | incl. Postgres load and browser editor timings, from the sandbox only; see `performance-and-accessibility.md` |
| Accessibility: automated axe audit of all screens, light+dark | ✅ | 0 violations; **no testing with real assistive technology** |
| Editor right panel in titled, collapsible sections (layout, size, spacing, position, typography, backgrounds, borders, effects) with paired unit fields, segmented controls and colour swatches; right-click menu on canvas and layers; move up/down/start/end with a sliding animation | ✅ | `e2e/*.cjs`; menu and reorder checked in Chromium |
| Landing page at `/`; settings, workspace, project pages in the sidebar layout; dashboard overview, `/` and `N` shortcuts | ✅ | screenshot-reviewed |

## Round 3 (UI)
- Signed-in users are redirected from /login and /forgot-password to /dashboard; the homepage header shows "Open dashboard" when signed in.
- Redesigned: homepage (hero, wall, footer), dashboard sidebar and Get started card, account settings, workspace page.

- Round 4: drag grip to reorder selected elements on the canvas, menus scroll/fit inside the window, resend-verification on account settings, client-side navigation everywhere with a cached sidebar.
- Round 5: removed sidebar New project; loading.tsx skeletons in the shell frame; Help inside the shell when signed in; sidebar scrolls on its own; Link on dashboard cards.

- Uploads: S3-compatible object storage (Backblaze B2) via S3_* env vars; falls back to memory with a warning. Production refuses to start without it unless ALLOW_EPHEMERAL=1.

## Landing page redesign
- Home page rebuilt: interactive hero editor (reorder layers, restyle, guided tour), generated fictional site snapshots, device previews, export code tabs, product scenes, FAQ. Styles in `app/lx.css`; components in `components/landing/`.
