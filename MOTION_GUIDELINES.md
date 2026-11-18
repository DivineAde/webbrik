# MOTION GUIDELINES

- Motion communicates state change or preserves spatial continuity (canvas width when switching breakpoints; chevron rotation). Nothing decorative.
- Durations from tokens: 100ms (hover/press), 160ms (panels, breakpoint width), 240ms (overlays). Ease-out for entering, ease-in-out for moves.
- Interactions respond immediately and are interruptible: use CSS transitions (retarget mid-flight), not blocking timelines.
- Animate `transform`/`opacity` only; avoid layout-thrashing properties during drags.
- **Reduced motion:** `themeCss()` zeroes `--motion-*` under `prefers-reduced-motion`, and the generated interaction runtime skips animations and uses instant scrolling.
- Never animate during precision editing (canvas selection outlines, guides, resize handles are instant).
- Planned library: Motion for React for dialogs/command menu enter-exit; dnd-kit for drag-and-drop with its own accessible announcements.
