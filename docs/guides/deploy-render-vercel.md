# Deploy Webbrik: Vercel (web) + Render (API)

```
browser ──► Vercel (apps/web, Next.js) ──/api/* rewrite──► Render (apps/api, NestJS) ──► Neon Postgres
                                                                          └──► Backblaze B2 (uploads)
```

The browser only ever talks to your Vercel address. Next.js forwards `/api/*` to the API, so session cookies stay first-party and there is no CORS to configure. Nothing here has been run on a real Render or Vercel account by me: do the first deploy on a staging project and use the checks at the end.

Do the steps in this order: the API needs the web address and the web build needs the API address, so you pick both names first.

## 0. Decide your names
- Web: `https://<your-domain>` (or the Vercel address, `https://<project>.vercel.app`, until the domain is ready)
- API: `https://webbrik-api.onrender.com` (the name comes from `render.yaml`; Render shows the real address after the first deploy)

## 1. Neon (database)
1. Create a project; choose the region nearest to where the API will run.
2. Copy the **pooled** connection string (host contains `-pooler`) and keep `?sslmode=require` on it. This is `DATABASE_URL`.
3. Nothing else: tables and migrations are created on the API's first start.

## 2. Backblaze B2 (uploads)
1. Create a bucket (Private is fine).
2. App Keys → Add a New Application Key, limited to that bucket, read and write.
3. Note the key ID (`S3_ACCESS_KEY`), the key (`S3_SECRET_KEY`, shown once), the bucket name (`S3_BUCKET`) and the bucket's S3 endpoint (`S3_ENDPOINT`, like `https://s3.us-west-004.backblazeb2.com`).

## 3. Email (SMTP)
Verification, reset and invitation emails need real SMTP in production. Use any provider (Resend, Postmark, Brevo, your own domain's mailbox). You need `SMTP_URL` (`smtps://user:pass@host:465`) and `MAIL_FROM` (`Webbrik <no-reply@yourdomain>`). Use a sender address on a domain you have verified with the provider, or messages land in spam.

## 4. Render (API)
1. Push the repo to GitHub (the `render.yaml` at the repo root describes the service).
2. Render dashboard → New → Blueprint → pick the repo. Render reads `render.yaml` and asks for each secret.
3. Fill in:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Neon pooled string |
| `APP_URL` | the exact web address, no trailing slash |
| `WEB_ORIGIN` | the same address |
| `PUBLIC_API_URL` | the API's Render address |
| `SMTP_URL`, `MAIL_FROM` | from step 3 |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | from step 2 |
| `VERCEL_TOKEN`, `VERCEL_TEAM_ID` | only for publishing users' sites (leave blank to publish into memory for testing) |
| `ADMIN_EMAILS` | your email, so you can manage coupons |

`SECRET_KEY` is generated for you. **Do not change or delete it later**: it encrypts stored project secrets. `TRUST_PROXY=2` is already set (see Notes).

4. Deploy. Wait for **Live**, then open `https://<api>/v1/health`: it should return `{"ok":true,…}`. If the deploy fails, the log names the missing variable; the API refuses to start in production without a database, email, `APP_URL` and object storage.

Add later, only if you use them: `PAYSTACK_*`, `BILLING_TAX_*`, `INVOICE_SELLER_*`, `ANTHROPIC_API_KEY`, `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`.

## 5. Vercel (web)
1. Add New → Project → import the same repo.
2. **Root Directory:** `apps/web`. Leave "Include source files outside of the Root Directory" **on** (the web app imports the `packages/*` workspace).
3. Framework: Next.js (detected). Install and build commands: leave the defaults. Vercel reads `pnpm@9.12.0` from the root `package.json`.
4. Environment variables (Production, and Preview if you want previews to work):

| Variable | Value |
|---|---|
| `API_URL` | the API's Render address, no trailing slash |
| `NEXT_PUBLIC_GITHUB_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | only if you enabled social sign-in |

`API_URL` is read **at build time** (it is baked into the rewrite), so changing it needs a redeploy. Leave `NEXT_PUBLIC_REALTIME_URL` empty.
5. Deploy. Then Settings → Domains → add your domain, and update `APP_URL` and `WEB_ORIGIN` on Render to match it exactly.

## 6. Publishing users' sites to Vercel
Webbrik's Publish tab deploys visitors' sites with a Vercel token.
1. Vercel → Account Settings → Tokens → create one (scope it to the team you want sites under).
2. Put it in Render as `VERCEL_TOKEN`, and the team's id as `VERCEL_TEAM_ID`. These are secrets: set them only in the Render dashboard.
3. Redeploy the API, then publish a test project from the dashboard.

## 7. Social sign-in and payments (optional)
- GitHub/Google OAuth: set the callback to `https://<web-address>/oauth/github` and `/oauth/google`.
- Paystack: webhook `https://<web-address>/api/billing/paystack/webhook` (goes through the same rewrite) or `https://<api>/v1/billing/paystack/webhook` directly. Details are in `deployment.md`.

## Check it worked
- [ ] `https://<api>/v1/health` returns ok
- [ ] The web address loads, sign up, and the verification email arrives and its link opens your **web** address
- [ ] After signing in, a refresh keeps you signed in (cookies work through the rewrite)
- [ ] Upload an image in a project, redeploy the API, and the image is still there (Backblaze works)
- [ ] Publish a test project and open the live address
- [ ] Hitting a rate limit (several wrong passwords) does not lock out a second device on another network

## Notes and known limits
- **Render free plan sleeps** after 15 minutes without traffic and takes about a minute to wake, so the first request after a pause is slow or times out. Use Starter for anything real.
- **Rate limits and IPs.** The API keys its rate limits on the visitor's IP. Behind Vercel and Render it only sees them if `TRUST_PROXY` matches the number of proxies (2 here: Vercel, then Render's router; use 1 if browsers call Render directly). I have not verified the count on a live host. After deploying, check the request log: the IP shown should be the visitor's, not the same address every time.
- **Live updates.** Vercel's rewrites don't proxy WebSockets, so the editor falls back to polling (it still works, with a short delay for changes from other people). A direct WebSocket to Render is not set up because the session cookie belongs to the Vercel domain.
- **One API instance.** Keep the Render service at 1 instance. For more, set `MULTI_INSTANCE=1` on all of them and read `docs/engineering/known-gaps.md`.
- **Previews.** Vercel preview deployments get new addresses, so sign-in works there only if `WEB_ORIGIN` on Render includes them (it takes a comma-separated list). Simplest: use previews only for looking at pages, test sign-in on production or staging.
- **Rolling back.** Vercel: redeploy an older deployment. Render: Events → Rollback. Database changes run on API start and are additive; take a Neon branch or backup before big upgrades.
- **Costs to expect:** Render Starter, Neon free or Launch, Backblaze (first 10 GB free), Vercel Hobby (personal use) or Pro (commercial use), plus your SMTP provider.
