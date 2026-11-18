# Known gaps

See status.md for the full ledger. Everything below is unverified against real services or deliberately limited.

1. **Not run against real services:** SMTP provider, Paystack (checkout, webhooks, renewals, cancel), GitHub/Google OAuth exchange, Vercel, Anthropic, Redis/BullMQ. All are tested against local fakes or unit level only.
2. **Multi-instance limits:** all rows are held in memory per instance; WebSocket hints, presence, op log and rate limits are per instance (other instances rely on 20 s polling).
3. **Billing limits:** coupon/upgrade purchases are one-off charges and do not auto-renew; proration uses list price; paid→cheaper downgrade waits until period end; Paystack plan amounts must include tax; coupons are created only through the admin API (no UI).
4. **Exports:** static exports contain CMS snapshots; the Vite live export doesn't create routes for new dynamic items; no real `next build`/`vite build` of an export was run.
5. **Assistive technology:** only automated axe audits; no screen-reader or voice-control testing.
6. **CI:** the workflow file has never run on GitHub.
7. **Performance numbers** come from the build sandbox, not user hardware.
8. **Typed-column migration** (`003_typed_columns`) was tested on SQLite and embedded Postgres, not on a hosted Neon database. Back up first. Upgraded SQLite files keep the new columns nullable.
9. **UI** was reviewed in the sandbox Chromium only (not Safari, Firefox or a Windows display). Workspace, settings and project pages still use their older layout; the right panel has no collapse button; unstyled new elements use the browser's default font inside the canvas.
