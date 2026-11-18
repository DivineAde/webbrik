# Product requirements

**Positioning.** A visual website builder with Webflow-class styling depth and developer-grade portability: one canonical document drives editor, preview, hosting and source export.

## Users
Visual creators (designers, agencies, marketers) and developers (custom code, components, export). Neither is restricted by the other: every visual control maps to real CSS; every export is readable source.

## Core workflows
Create account → workspace → project → build pages visually → style (classes/tokens/breakpoints) → componentise → CMS → preview → publish → domain → export/handoff.

## Functional requirements
Mapped 1:1 to the blueprint modules A–H (workspace, editor, design system, CMS, publishing, developer env, collaboration, AI). Implementation status is tracked in `docs/engineering/status.md`.

## Non-functional requirements
- Editor interactions < 100ms at 5k nodes (target; not yet measured — see status).
- Autosave never silently discards changes (revisioned saves, conflict on stale base, local recovery).
- Untrusted user code isolated (sandboxed iframe, sanitised CSS/HTML, CSP at publish).
- Keyboard-first and accessible (WCAG 2.2 AA target).
- Provider-independent deployment.

## MVP boundary (Milestones 1–4)
Auth/workspaces/projects, document engine, editor with navigator/canvas/inspector, CSS engine with classes/breakpoints, static publish + export.

## Success criteria
A user builds, previews, publishes and exports a multi-page responsive site without writing code, and a developer can take the export and extend it.

## Competitive analysis (to complete with hands-on study)
Webflow, Webstudio, Shopify theme editor were **not** hands-on tested in this build. Working hypotheses: Webflow has the deepest styling UX but weak portability; Webstudio is open and portable with a thinner editor; Shopify's editor is excellent for constrained section-based theming but not free-form. Our wedge: Webflow-depth styling + Webstudio-style portability + a style-source inspector that explains the cascade.
