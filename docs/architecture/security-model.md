# Security model

- **Untrusted content:** canvas in sandboxed iframe without `allow-same-origin`; renderer escapes text/attributes, drops event handlers, `style`/`srcdoc`, `javascript:` URLs and dangerous tags (`script`, `iframe`, `object`…); CSS sanitised. Custom head HTML/JS is intentionally preserved for the *published* site only and must be served from a separate origin with CSP.
- **Passwords/sessions:** see auth-design.md.
- **Tenancy:** workspace-scoped queries, `workspaceId` in every job, secrets encrypted per project.
- **Pending (required before production):** CSP + separate origin for published/preview sites, upload validation (magic-byte check, SVG sanitising), rate limiting, CSRF, audit log writers, dependency scanning (`pnpm audit` in CI), secrets management, abuse detection.
