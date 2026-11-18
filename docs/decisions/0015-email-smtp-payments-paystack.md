# ADR-0015: SMTP for email, Paystack for payments

**Status:** accepted

- **Email:** `Mailer` interface with `SmtpMailer` (nodemailer) and an in-memory `OutboxMailer` for dev/tests. Sending never blocks or fails a request (`safeSend`); password reset is fire-and-forget so response time doesn't reveal whether an account exists. Production requires SMTP config and `APP_URL`.
- **Payments:** Paystack only. The server is the authority: checkout is initialised server-side with a unique reference and workspace metadata; a payment counts only after the server re-verifies it with Paystack (callback verify or `charge.success` webhook) and amount, currency and workspace match. Webhooks are authenticated by HMAC-SHA512 over the raw body. A paid period is 31 days (plus a 3-day grace after which the workspace drops to free); with `PAYSTACK_PLAN_PRO` Paystack renews automatically and webhooks extend the period.
- **Manual plan changes** (`POST /workspaces/:id/plan`) are refused when Paystack is configured or in production.
- **Not verified:** real provider behaviour. Tests use a local SMTP server and a fake Paystack HTTP server.
