# Deploying Webbrik

Step by step for Vercel (web) + Render (API) + Neon (database) + Backblaze (files): [deploy-render-vercel.md](deploy-render-vercel.md).

Nothing here has been run on a real host by me — treat it as a checklist to verify on a staging environment first.

## Shape
```
browser ──► web (Next.js :3000) ──/api/* rewrite──► API (NestJS :4000) ──► PostgreSQL
                                                     ▲
                       worker (BullMQ) ──Redis───────┘ (pulls build input with WORKER_TOKEN)
```
Serve web and API behind one HTTPS origin if you can: cookies stay first-party and the web app proxies `/api/*` (including the WebSocket at `/api/realtime`). Put a reverse proxy (Caddy/nginx/a platform router) in front that forwards `Upgrade` headers.

## Required production settings (the API refuses to start without them)
- `NODE_ENV=production`
- `SECRET_KEY` — long random value; keep it stable
- `DATABASE_URL` — PostgreSQL 14+ (tables and migrations are created automatically on first start). SQLite is fine only for a single small instance on a persistent disk (`SQLITE_PATH`)
- `APP_URL` — public web address (email links, Paystack return)
- `SMTP_URL` (or `SMTP_HOST/PORT/USER/PASS`) and `MAIL_FROM`
- `WEB_ORIGIN` — exact public web origin
- `PUBLIC_API_URL` — the API origin as browsers reach it (used in generated asset links)

Then, per feature: `PAYSTACK_*`, `BILLING_TAX_*`, `INVOICE_SELLER_*`, `ADMIN_EMAILS`, `ANTHROPIC_API_KEY`, `VERCEL_TOKEN`/`VERCEL_TEAM_ID`, `GITHUB_CLIENT_ID/SECRET` + `NEXT_PUBLIC_GITHUB_CLIENT_ID` (same for Google). `NEXT_PUBLIC_*` values and `API_URL` for the web app are baked in at **build** time.

## Option A — Docker Compose on one server
```bash
cp .env.example .env     # fill in, at least SECRET_KEY, SMTP_URL, MAIL_FROM, APP_URL, WEB_ORIGIN, PUBLIC_API_URL
docker compose --env-file .env -f infrastructure/docker/docker-compose.yml up -d --build
```
The compose file starts Postgres, the API, the web app, Redis and MinIO. Before using it for real:
1. Set `NODE_ENV=production` for the `api` service and change the default Postgres password.
2. The API image currently runs `pnpm … dev` (tsx); switch the command to `node apps/api/dist/main.js` after the build if you want a lean runtime.
3. Add a TLS-terminating reverse proxy and publish only 443.
4. A worker service is not in the compose file; add one (`pnpm --filter @webbrik/worker dev`) with `REDIS_URL`, `API_URL=http://api:4000` and the same `WORKER_TOKEN`, only if you use queued builds.

## Option B — managed platforms
- **Web:** any Node host or Vercel (`apps/web`, build `pnpm --filter @webbrik/web build`, start `next start`). Set `API_URL` to the API's internal/public URL before building.
- **API:** any container/Node host; start `pnpm --filter @webbrik/api start` (the workspace packages ship as TypeScript, so the API runs through tsx rather than `node dist`). Use managed Postgres.
- **Several API instances:** set `MULTI_INSTANCE=1` on all of them. Known limits: WebSocket hints, presence and rate limits are per instance (see `docs/engineering/known-gaps.md`).

## Paystack
1. Set live `PAYSTACK_SECRET_KEY`, currency and amounts (minor units).
2. Dashboard → Settings → API: webhook URL `https://<api-origin>/v1/billing/paystack/webhook`.
3. For auto-renewal create plans in Paystack and set `PAYSTACK_PLAN_PRO` / `PAYSTACK_PLAN_TEAM`. If tax is on, plan amounts must **include** tax.
4. Do a real test payment with a small amount, then a cancel.

## Backups and operations
- Back up PostgreSQL (`pg_dump` daily + WAL if you need point-in-time). Uploaded assets live with the API's store, so they are in that backup.
- Keep `SECRET_KEY` in your secret manager; losing it loses stored project env secrets.
- Logs go to stdout. The API serves Swagger at `/docs` when run from a `tsc` build; restrict it at the proxy if you don't want it public.
- Upgrades: deploy API first (migrations run on start), then web. Take a database backup beforehand.

## Pre-launch checklist
- [ ] HTTPS everywhere, `WEB_ORIGIN`/`APP_URL`/`PUBLIC_API_URL` exact
- [ ] Real email delivered (sign up, reset, invite, email change)
- [ ] A real Paystack payment, webhook, and invoice PDF
- [ ] WebSocket works through your proxy (editor shows "Live", not "Polling")
- [ ] A Vercel publish of a test project
- [ ] Database backup restored once on a scratch instance
- [ ] Rate limiting on (do not set `DISABLE_RATE_LIMIT`)
