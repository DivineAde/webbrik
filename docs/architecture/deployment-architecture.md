# Deployment architecture

`DeploymentProvider` interface: create/get deployment, logs, rollback, domains (add/verify/remove with DNS instructions), env vars, health check. Implementations: `VercelProvider` (REST, retry with backoff on 429/5xx, unit-tested against a mocked fetch), `MemoryProvider` (tests/dev). The API's `DeploymentsService` depends on the interface only.

Flow: export → provider.createDeployment(files) → persist `Deployment` row → poll/webhook for status → logs. Rollback = promote a previous provider deployment. Add Cloudflare Pages/S3 by implementing the interface.

**Caveat:** the Vercel adapter has **not** been run against the live Vercel API; endpoint paths/payloads follow the public REST docs from memory and must be verified with a real token (and Vercel's file-upload limits for large sites—use the `/v2/files` upload + SHA flow for big projects).
