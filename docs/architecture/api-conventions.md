# API conventions

REST under `/v1`, OpenAPI at `/docs` (`@nestjs/swagger`). JSON only. Cursor pagination (`?cursor=&limit=`). Errors: `{ error: { code, message, details? } }`. Mutations on documents require `baseRevision`; stale ⇒ `409 Conflict` with `headRevision`. Validation with Zod at the boundary (document payloads via `validateDocument`). Authorisation via `@RequirePermission()` + `PermissionGuard` using `@webbrik/shared` roles. Rate limiting and CSRF (cookie sessions: SameSite=Lax + double-submit token) are required before exposing auth endpoints.
