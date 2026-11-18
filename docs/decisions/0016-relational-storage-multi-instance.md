# ADR-0016: Relational tables and multi-instance operation

**Status:** accepted

## Decision
- Storage is a real relational schema (`apps/api/src/common/relational.ts`) on PostgreSQL (`DATABASE_URL`) or SQLite (`SQLITE_PATH`): one table per entity (`wb_users`, `wb_projects`, `wb_revisions`, …) with typed, indexed columns, **unique constraints** (user email, workspace slug, `(project, revision)`, domain hostname, collection/item slugs, payment reference, …) and **foreign keys** (deferred, so a transaction may delete a parent and its children together). The complete row is also kept in a `data` column; the API loads it at start-up. Schema changes are tracked in `wb_migrations`.
- A database created by the earlier JSON-row store (`webbrik_rows`) is imported automatically on first start; the old table is left as a backup.
- Several API instances can share one database. Every write is recorded in `wb_changes`; each instance pulls the others' changes (`Persistence.sync`, every 500 ms and on every request when `MULTI_INSTANCE=1`) and keeps its in-memory tables current. Rows with unsaved local edits are not overwritten by a pull.
- With `MULTI_INSTANCE=1`, every successful write request answers only after the database has accepted it (write-through), so the next request on any instance sees it.
- Two instances committing the same revision number of a project is stopped by the unique `(project, revision)` constraint: the loser's request fails with 409 `revision_conflict`, its local copy is reverted to the database's, and the client reloads. Other constraint violations revert the refused row and are logged.

## Consequences / limits
- Memory is still the working set (each instance holds all rows), so this scales out request throughput, not dataset size.
- Presence, the collaboration op log and rate limits are per instance. Real-time collaborators on one project should be routed to one instance (sticky by project) for presence and low-latency ops; correctness of saved documents does not depend on that.
- Only tested with two instances in one process on SQLite and on a real (embedded) PostgreSQL server; no multi-host or load testing. Prisma is not used; `infrastructure/database/schema.prisma` is a reference only.
