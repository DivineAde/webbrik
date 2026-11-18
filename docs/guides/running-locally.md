# Running Webbrik locally

## Prerequisites
Node 22, pnpm 9 (`corepack enable`), and optionally Docker (for Postgres/Redis/MinIO). Nothing else is required: with no database configured the API keeps data in memory.

## 1. Install and check
```bash
pnpm install
pnpm typecheck && pnpm test      # ~1–2 minutes; the Postgres tests use an embedded Postgres
```

## 2. Configure
The API, worker and web app read the repo-root `.env` automatically when they start (variables already set in your shell win over the file).
```bash
cp .env.example .env             # then edit it
```
Minimum useful local setup (all optional, shown with their effect):

| Variable | Effect |
|---|---|
| `SQLITE_PATH=./webbrik.db` | durable data in a file (simplest). Or `DATABASE_URL=postgresql://webbrik:webbrik@localhost:5432/webbrik` |
| `SECRET_KEY` | encrypts project env secrets. Use a long random string; changing it makes stored secrets unreadable |
| `WEB_ORIGIN=http://localhost:3000` | the origin allowed to call the API and open WebSockets |
| `APP_URL=http://localhost:3000` | used in email links |
| `DISABLE_RATE_LIMIT=1` | handy for development only |
| `ANTHROPIC_API_KEY` | enables AI suggestions (never run against the real API by me) |
| `WORKER_TOKEN` | shared secret for the worker; also set it on the API |
| `ADMIN_EMAILS=you@example.com` | accounts allowed to manage coupons |

Without `SMTP_URL`, emails (verify, reset, invite) are **not delivered** outside production. Start the API with `NODE_ENV=development` and the email (with its link) is printed in the API log, or point `SMTP_URL` at a local catcher such as MailHog (`smtp://localhost:1025`).

## 3. Start
Two terminals :
```bash
# terminal 1 — API on :4000 (NODE_ENV=development prints emails to the log)
cd apps/api && NODE_ENV=development PORT=4000 npx tsx src/main.ts

# terminal 2 — web on :3000, proxies /api/* to the API
API_URL=http://localhost:4000 pnpm --filter @webbrik/web dev
```
Open http://localhost:3000/login, create an account, then create a workspace project. `/editor` is an anonymous local sandbox that needs no API.

Optional services:
```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis minio
DATABASE_URL=postgresql://webbrik:webbrik@localhost:5432/webbrik   # then use it instead of SQLITE_PATH
# worker (needs Redis, WORKER_TOKEN identical to the API's, API_URL):
REDIS_URL=redis://localhost:6379 API_URL=http://localhost:4000 pnpm --filter @webbrik/worker dev
```
Asset uploads are stored by the API itself; MinIO/S3 is not used yet.

## 4. Try payments locally
Use Paystack **test** keys: `PAYSTACK_SECRET_KEY=sk_test_…`, `PAYSTACK_PRO_AMOUNT=1500000`, `PAYSTACK_CURRENCY=NGN`. Paystack cannot call `localhost`; to test the webhook expose the API with a tunnel and set `<public API>/v1/billing/paystack/webhook` in the Paystack dashboard. Without a webhook, returning from checkout still settles the payment. Optional: `BILLING_TAX_PERCENT=7.5`, `INVOICE_SELLER_NAME`, `INVOICE_SELLER_ADDRESS`.
This path has only been tested against a fake Paystack server; expect to debug it first against the real one.

## 5. Browser test suites
```bash
pnpm --filter @webbrik/web build && (cd apps/web && npx next start -p 3100 &)
cd apps/api && DISABLE_RATE_LIMIT=1 PORT=4000 WEB_ORIGIN=http://localhost:3100 PUBLIC_API_URL=http://localhost:4000 npx tsx test/e2e-server.ts &
pnpm --filter @webbrik/web e2e     # see apps/web/e2e/run.sh for the billing variants
```
Needs Playwright with Chromium installed (`NODE_PATH=$(npm root -g)` is used by the scripts).

## Reading the API log
On start the API prints a banner (address, storage, web origin, email, payments, AI, publishing) and then one line per request, for example `POST /v1/auth/login 200 41ms`. Failures at startup are printed with a hint (wrong database password, host not found, SSL, port in use) and the process exits with an error code.
- `LOG_LEVEL=debug` shows everything (including health checks); `LOG_LEVEL=warn` shows only problems; `LOG_REQUESTS=0` turns the request lines off.
- Secrets are never printed; the database is shown as `PostgreSQL host/dbname`.

## Troubleshooting
- **Login works but everything 401s / WebSocket "Polling" badge:** `WEB_ORIGIN` doesn't match the exact origin in your browser address bar.
- **API refuses to start in production:** it requires `SECRET_KEY`, `APP_URL`, `SMTP_URL`/`MAIL_FROM` (or `ALLOW_OUTBOX=1`) and a database (or `ALLOW_EPHEMERAL=1`).
- **Data vanished after restart:** no `SQLITE_PATH`/`DATABASE_URL` was set.
- **Web can't reach the API after changing `API_URL`:** Next bakes the proxy target at build time; rebuild (`next build`) for `next start`.
- **Variables not picked up:** the startup log prints `Loaded environment from <path>`. If that line is missing, the file isn't named exactly `.env` or isn't in the repo root.
