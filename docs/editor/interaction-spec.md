# Editor interaction specification

Layout: toolbar (name, save status, undo/redo, breakpoints, zoom, ⌘K, preview, export) · left (Elements | Navigator) · canvas · right inspector.

Selection: click canvas → select nearest `[data-node-id]`; hover outlines dashed, selected solid. Navigator mirrors selection and hover.
Shortcuts: ⌘/Ctrl+K palette · ⌘Z / ⇧⌘Z undo/redo · ⌘D duplicate · Delete remove · Esc deselect. Shortcuts are suppressed while typing in inputs.
Insertion: into the selected element, else page root. Inspector edits commit on blur/Enter, one undo step each, at the active breakpoint.
Failure: rejected operations show an alert; the document is unchanged.
Specified but not built: drag-and-drop reorder/reparent, multi-select, alignment guides, rulers, direct text editing, resize handles, panel resizing/persisted layout, focus mode.
