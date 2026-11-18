# Performance and accessibility — what was measured

## Performance benchmarks (`pnpm --filter @webbrik/api bench`)

Measured in the build sandbox (Node 22, linux/x64, shared CPU; best of several runs). Treat as relative numbers, not guarantees for other hardware. `apps/api/test/perf-budget.test.ts` fails the test suite if any of these get ~10x worse.

| Operation | 1k nodes | 5k nodes | 20k nodes |
|---|---|---|---|
| Render a page to HTML | 3 ms | 6 ms | 25 ms |
| Compile CSS | 0.5 ms | 1.5 ms | 8 ms |
| Validate a document | 6 ms | 20 ms | 92 ms |
| Apply one edit | 0.4 ms | 1 ms | 5 ms |
| Apply 200 edits in one batch | 41 ms | 208 ms | **5 ms** (was 1,165 ms before batches shared one private node map) |
| Static export | 7 ms | 45 ms | not measured |

| Other | Result |
|---|---|
| Static export with 500 CMS-generated pages | 3.5 ms (small base page) |
| Persist 10,000 new rows (SQLite) | 69 ms (relational SQLite, with constraint checks); one changed row among 10,000: 3 ms |
| Cold start loading 10,001 rows | 16 ms |
| `GET /auth/me`, 20 concurrent clients | ~2,400 req/s, p95 12 ms |
| `GET /projects/:id/document`, 20 concurrent | ~3,300 req/s, p95 10 ms |

**Fixed hotspot:** `applyOperations` used to copy the whole node map per operation (a 200-op batch on a 20,000-node page took 1.2 s). A batch now works on one private copy and discards it on failure, so the caller's document is never touched (tested) and a batch costs ~5 ms. A single edit still copies the map once (~7 ms at 20k nodes).

## Postgres under load (`apps/api/bench/pg.ts`, embedded Postgres, sandbox)

Persist 10,000 rows 315 ms; one changed row 9.3 ms; cold load 10,001 rows 68 ms; `GET /auth/me` 2,230 req/s (p50 8.3 / p95 15.7 ms); `GET document` 3,618 req/s (p50 4.9 / p95 9.8 ms); `POST ops` with 10 concurrent editors, 300 commits: 539 req/s (p50 16.1 / p95 37.8 ms), 0 conflicts.

## Browser editor (`apps/web/e2e/perf.cjs`, Chromium, 775 elements, sandbox)

Open editor 229 ms; select element 163 ms median; style edit 255 ms median; JS heap 58 MB.

**Not measured:** large-asset uploads, multi-user collaboration load beyond 10 editors, long-run memory growth. The API holds all data in memory (ADR-0014).

## Accessibility (`apps/web/e2e/a11y.cjs`)

An automated audit with axe-core (WCAG 2.0/2.1/2.2 A + AA rules and best-practice rules) runs on every app screen in light and dark mode: login, sign-up, forgot password, dashboard, account settings, every project tab, every workspace tab, the editor with every left/right panel, the compare view and the command palette. Current result: **0 violations**. The audit found and led to fixes for: command palette without combobox/listbox semantics, scrollable regions without keyboard access, heading-level jumps, missing page heading and landmarks in the editor.

Also built in: all editor controls are keyboard reachable; resize handles and panel separators work with arrow keys; dialogs have names and close on Escape.

**Not done:** automated rules detect only a fraction of WCAG problems. No testing with a screen reader (NVDA/JAWS/VoiceOver), no switch/voice-control testing, and the editor canvas (a sandboxed iframe) is audited by the quality panel for the *user's* page, not by axe. Drag-and-drop from the library has a keyboard alternative (click to insert), but moving elements by keyboard on the canvas is limited to the Navigator and arrow-key shortcuts.
