# Export architecture

`exportStatic(doc)` validates, then emits `index.html`, nested route folders, `assets/styles.css`, `assets/interactions.js` (when used), README and package.json — using the exact renderer/CSS compiler used by the canvas and publishing. Warnings are returned for dynamic routes and CMS bindings. The editor offers a one-click `.zip` (client-side store-only zip writer, verified to open with Python's zipfile).

Planned targets: React and Next.js (components from `ComponentDef`, CSS modules or Tailwind-free class CSS), CMS adapters, asset copying/optimisation. Not implemented.
