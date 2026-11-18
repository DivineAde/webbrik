# ADR-0014: Durable write-behind persistence (interim to Prisma)

**Status:** Accepted; the storage format was superseded by ADR-0016 (relational tables). The write-behind mechanism described here is still how writes reach the database unless `MULTI_INSTANCE=1`.

## Context
The API keeps every table in memory (`Db`/`Table`) and its code is synchronous. The Prisma/Postgres schema in `infrastructure/database` could not be migrated or verified in the build environment (Prisma engine downloads are blocked), and moving every call site to async relational queries is a large change that cannot be validated without a database client.

## Decision
Keep memory as the working set and make it durable with a `Persistence` layer (`apps/api/src/common/persistence.ts`):
- On boot, every table is loaded from a `RowStore`.
- After each write request (debounced 150 ms), every 5 s, and on shutdown, changed rows are diffed (JSON compare; immutable tables such as revisions and the audit log are only inserted) and applied to the store in one transaction.
- A failed write leaves the rows pending and retries; a failed final flush on shutdown throws.
- Stores: `PostgresStore` (`DATABASE_URL=postgres://…`, one JSONB row table, tested against a real embedded PostgreSQL) and `SqliteStore` (`SQLITE_PATH=…`, Node's experimental `node:sqlite`, for development and single-node self-hosting).
- Production refuses to start without one of them unless `ALLOW_EPHEMERAL=1`.

## Consequences
- Data survives restarts (tested with SQLite, PostgreSQL, and a real SIGTERM restart).
- **Single API instance only**: two instances would overwrite each other. No row-level locking, no SQL querying of fields, no relational constraints.
- A crash can lose up to ~150 ms of the newest writes (graceful shutdown loses none).
- Memory use grows with data (all revisions are held in memory).
- Migration path: replace `Table` internals with Prisma-backed queries table by table; `RowStore` data can be exported with one `SELECT` per table.
