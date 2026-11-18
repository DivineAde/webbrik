#!/usr/bin/env bash
# Runs the browser suites against a production build. fullstack.cjs needs the API (see README) on :4000.
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
pnpm build >/dev/null
(npx next start -p 3100 >/tmp/next.log 2>&1 &) ; sleep 4
trap 'pkill -f next-server || true' EXIT
# API with a deterministic fake AI provider (see apps/api/test/e2e-server.ts) must be running on :4000, started with PUBLIC_API_URL=http://localhost:4000 (forms.cjs posts to it cross-origin).
for t in smoke panels dnd fullstack project cms cms2 forms editor2 editor3 realtime uikit onboarding versions-diff account account2 ai-settings a11y; do echo "== $t"; node "e2e/$t.cjs"; done
# billing.cjs needs the API restarted with the fake Paystack (manual plan changes are refused once payments are configured):
#   E2E_PAYSTACK=1 APP_URL=http://localhost:3100 DISABLE_RATE_LIMIT=1 PORT=4000 npx tsx apps/api/test/e2e-server.ts
#   node e2e/billing.cjs
