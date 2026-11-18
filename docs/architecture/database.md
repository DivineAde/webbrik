# Database design

Source: `infrastructure/database/schema.prisma` (PostgreSQL).

- **Tenancy:** `Workspace` → `Membership(role)` → `Project`. Every project-scoped table cascades from `Project`; every query must be filtered by workspace membership (enforced in the API layer; add RLS as defence in depth).
- **Documents:** `DocumentRevision(projectId, revision, document JSONB)` is append-only; `Project.headRevision` supports optimistic concurrency. `NamedVersion` marks restorable revisions. Prune/compact old auto-snapshots with a worker job.
- **Assets:** metadata in `Asset`; bytes in object storage via `storageKey`; `sha256` index for duplicate detection.
- **CMS:** `Collection.schema` (JSON, validated by content-engine) + `CollectionItem(data, status, publishAt)`.
- **Publishing:** `Deployment`, `Domain`, `EnvVar` (values stored encrypted).
- **Billing foundation:** `Subscription(plan, entitlements)`, `UsageRecord(metric, period)`.
- **Audit:** `AuditLog(workspaceId, actorId, action)`.
- **Auth:** `User`, `Session` (token hash only), `OAuthAccount`.

Status: schema authored but **not migrated or validated against a live database** in this build (no Postgres/Prisma generate was run).
