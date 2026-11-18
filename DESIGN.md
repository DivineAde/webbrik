# DESIGN

Restrained, precise, tool-like. The editor is a professional instrument, not a dashboard template.

## Principles
- **Black is the primary action.** `--primary` is near-black with white text. Secondary actions are quiet bordered/grey; destructive is the only red.
- **Neutral surfaces.** White canvas chrome, `--panel-bg` for side panels, `--canvas-bg` behind the page. No decorative colour; the only accent is `--selection` (blue), reserved for selection/hover on the canvas.
- **Density.** 13px base type, 7px-high controls (28px), 4px grid. Panels are information-dense but aligned.
- **Subtle structure.** 1px borders (`--border`), shadows only on floating layers (`--shadow-md/lg`).
- **State is always visible.** Hover, focus (2px ring), selected, disabled, locked and hidden each have a distinct treatment.

## Tokens
Defined once in `packages/design-system/src/index.ts` (OKLCH), emitted as CSS variables by `themeCss()`, mapped to Tailwind via `@theme inline` in `apps/web/app/globals.css`. Light and dark are variable sets only — **components never branch on theme**. Toggle with the `.dark` class (command palette: "Toggle dark theme").

| Group | Tokens |
|---|---|
| Colour | background, foreground, card, muted, primary, secondary, accent, destructive, border, input, ring, panel-bg, canvas-bg, selection |
| Type | text-xs 11 / sm 12 / base 13 / md 14 / lg 16 / xl 20; weights 400/500/600 |
| Radius | sm 4 / md 6 / lg 8 / xl 12 |
| Shadow | sm / md / lg |
| Z-index | canvas 0, panel 10, toolbar 20, popover 40, dialog 50, toast 60 |
| Motion | fast 100ms, base 160ms, slow 240ms, easeOut, easeInOut |

## Status
Implemented: tokens, light/dark, Button, Input, toolbar, panels, navigator rows, command palette, canvas selection outlines.
Not yet implemented: the full shadcn component set (dialogs, drawers, popovers, selects, tooltips, toasts, context menus, resizable panels, colour picker, etc.). `components/ui` currently hand-rolls Button/Input following shadcn conventions (`cn`, variants, focus-visible). Generate the rest with `npx shadcn@latest add …` using the tokens above, choosing **one** primitive base (Radix or Base UI) and not mixing them (see ADR-0013).
