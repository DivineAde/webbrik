# ADR-0013: shadcn primitive base

**Status:** Proposed

## Context
Mixing Radix/Base UI/React Aria creates inconsistent behaviour.

## Decision
Pick one base before generating the remaining shadcn components (recommend Radix for ecosystem maturity).

## Consequences
Decision to be confirmed when expanding the component set.

## Update
Now built on Radix primitives with class-variance-authority: dialog, alert-dialog (replaces native confirm), dropdown, tabs, tooltip, popover, select, switch, checkbox, label. See /ui-kit.
