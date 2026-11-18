# ADR-0009: Asset storage

**Status:** Proposed

## Context
Large binaries must not live in Postgres.

## Decision
S3-compatible object storage + CDN; metadata and sha256 in Postgres; upload validation and image transforms in the worker.

## Consequences
MinIO in docker-compose for local development. Pipeline not implemented.
