# System architecture

```
 apps/web (Next.js)  ──REST──▶  apps/api (NestJS) ──▶ PostgreSQL (Prisma)
   editor UI, zustand            auth, projects,        documents (JSONB revisions)
   canvas (sandboxed iframe)     documents, deployments  
        │                              │ ──▶ Redis/BullMQ ──▶ apps/worker (build/export/deploy)
        ▼                              └──▶ S3-compatible storage + CDN (assets)
  packages: document-model · css-engine · renderer · exporter · interactions
            content-engine · quality · ai · deployment · design-system · shared
```

**One engine.** `document-model` is the source of truth. `css-engine` compiles styles, `renderer` produces HTML, `exporter` writes static output, `deployment` ships artifacts. The editor canvas, preview, published site and export all call the same `renderPage` + `compileCss`.

**Layering rules.** packages never import from apps; `document-model` imports nothing from the rest of Webbrik; UI code never mutates documents except through `Operation`s; `deployment` knows nothing about the document.

**Request path for saves.** editor commits ops locally (History) → debounced save sends full validated snapshot with `baseRevision` → `DocumentsService.save` validates, rejects stale revisions with `409`, appends revision N+1.

**Build path.** API enqueues a `BuildJob` (carrying `workspaceId`) → worker validates → exports → `DeploymentProvider.createDeployment` → status/logs persisted.
