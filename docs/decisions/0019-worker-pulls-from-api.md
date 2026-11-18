# ADR-0019: Worker pulls from the API
Status: accepted. Queue jobs carry only ids. The worker fetches build input from `/v1/internal/projects/:id/build-input` with a `WORKER_TOKEN` bearer (timing-safe compare), checks the tenant, and reports to `build-result` (audit `build.ok` / `build.failed`).
