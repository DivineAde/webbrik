# Testing strategy

- **Unit (Vitest):** every package has tests; critical invariants (operations/inverses/atomicity, CSS sanitising, renderer escaping, permissions, quotas, proposal gate) are covered. Run `pnpm test`.
- **Integration:** `DocumentsService` conflict handling, deployment through the provider interface, worker build job. Database/Redis/S3 integration tests need docker-compose and are not yet written.
- **Editor/browser (Playwright):** the build was verified manually with a Playwright script covering: insert elements, undo, layer tree, command palette, breakpoint switch, canvas selection → inspector, style edit, autosave status, zip export, reload recovery, no console errors. That script is committed as `apps/web/e2e/smoke.cjs` (a manual script, not yet a Playwright Test suite).
- **E2E target list** (blueprint §24.4): register → workspace → project → … → export; blocked on API controllers.
- **Performance:** not yet measured (no large-document benchmark yet).

## Added suites
- API (HTTP): `email-change`, `realtime` (WebSocket), `billing-extras` (tax, proration, coupons, invoice PDF), `worker` (build-input/result). `TEST_STORE=sqlite pnpm test` runs on the relational store.
- Worker: `worker.test.ts`. Postgres load: `pnpm --filter @webbrik/api exec tsx bench/pg.ts`.
- Playwright (`apps/web/e2e`): `editor3`, `realtime`, `uikit`, `onboarding`, `versions-diff`, `billing2` (needs `E2E_PAYSTACK=1 E2E_TAX=7.5 ADMIN_EMAILS=admin@example.com`), `perf`; `auto-confirm.cjs` is a helper. Run all with `e2e/run.sh`.
- Performance is measured now (see performance-and-accessibility.md); the older "not measured" lines above are superseded.


Browser suites share `apps/web/e2e/helpers.cjs` (right-panel overflow tabs, sign-out). The accessibility audit exempts the canvas resize handles from the 24px target-size rule only; each has keyboard control and a numeric alternative in the Design panel.
