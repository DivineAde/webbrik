# ADR-0001: Monorepo tooling

**Status:** Accepted

## Context
Many packages share types and must be tested independently.

## Decision
pnpm workspaces + Turborepo; strict shared tsconfig; packages export TS source.

## Consequences
Fast installs and cached tasks. Source-exporting packages require consumers to transpile (Next `transpilePackages`, tsx).
