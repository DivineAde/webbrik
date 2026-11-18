# ADR-0002: Database and ORM

**Status:** Accepted

## Context
Relational tenancy model plus JSON documents.

## Decision
PostgreSQL + Prisma. Documents stored as JSONB revisions validated in application code.

## Consequences
Strong integrity for tenancy/billing; JSONB keeps the document schema evolvable. Prisma schema authored but unmigrated.
