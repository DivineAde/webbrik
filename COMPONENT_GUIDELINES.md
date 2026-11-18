# COMPONENT GUIDELINES

1. Compose from `components/ui` primitives; editor-specific components live in `features/editor`. Don't import editor code into `components/ui`.
2. Variants via a `variant`/`size` prop + `cn()`; never ad-hoc colour classes. Colours come from tokens only (`bg-primary`, `text-muted-foreground`, …).
3. Every interactive element: keyboard reachable, `focus-visible` ring, `disabled` state, accessible name.
4. Icon-only buttons require `aria-label` and a `title` with the shortcut.
5. Provide loading, empty and error states for any list/async surface (see `Navigator`, `ElementLibrary`, `Canvas` empty state).
6. Inputs commit on blur/Enter (inspector) so each edit is one undo step, not one per keystroke.
7. Forward refs on primitives; spread remaining props.
8. Choose one primitive base for shadcn (Radix **or** Base UI **or** React Aria) per ADR-0013.
