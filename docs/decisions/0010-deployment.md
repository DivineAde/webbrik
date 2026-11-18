# ADR-0010: Deployment abstraction

**Status:** Accepted

## Context
Vercel first but not forever.

## Decision
`DeploymentProvider` interface; Vercel and in-memory implementations; Webbrik code depends only on the interface.

## Consequences
Adding providers is additive. Vercel adapter needs live verification.
