# Proposal: Interactive Measurement SPA + Local Runner

## Why

OhMyPerf v1 MVP shipped 7 surfaces (CLI, npm SDK, Chrome extension, static website, VSCode extension, MCP server, share-server), but the website surface (`apps/website`) is a **static HTML landing page** that cannot do interactive measurement. Users who hit `ohmyperf.dev` see marketing copy and must install the CLI or Chrome extension separately before measuring anything.

This change **replaces the static landing with a Next.js 15 SPA** that:

1. Accepts a URL on the landing page itself and triggers a real CDP-based measurement in a new tab (extension path) or via a local Docker runner (self-host path).
2. Streams live progress and renders a metrics dashboard (CWV gauges, variance bands, audits, frame tree) directly in-app.
3. Stores reports per-device in IndexedDB; history view at `/report/[id]`.
4. Preserves drag-drop JSON viewer functionality by porting `packages/viewer` to a real React component (Q4 user decision).
5. Ships with a NEW companion `apps/runner` (Hono + Playwright) packaged as a Docker self-host service so users without the Chrome extension can still measure.

This closes the longstanding "click and measure on the website" experience without violating the locked **zero-cloud-cost** constraint: production `ohmyperf.dev` is a static export (Cloudflare Pages / GitHub Pages), measurement happens either in the user's browser (via extension) or on the user's own hardware (via docker-compose).

## What changes

### Added
- `apps/website/` — NEW Next.js 15 App Router SPA with `output: 'export'`, replacing current static HTML
  - Landing page with inline URL input + new-tab measurement orchestration
  - `/measure` full-flow page with backend detection card and progress streaming
  - `/report/[[...id]]` client-only report viewer (CWV gauges, metric tables, frame tree, audits, variance banner)
  - `/viewer` drag-drop JSON loader (ported from `packages/viewer` to React)
  - `/report` history index backed by IndexedDB
  - Tailwind v4 + shadcn/ui design system
  - next-intl i18n scaffold (EN-only copy in v1, VI keys present for v1.5)
- `apps/runner/` — NEW Hono HTTP service running `@ohmyperf/core` + `@ohmyperf/driver-playwright`
  - `POST /api/measure`, `GET /api/jobs/:id/events` (SSE), `GET /api/health`
  - In-memory job queue (concurrency=1 default)
  - SSRF guard blocking private/loopback/metadata IPs by default
  - Allowlist CORS with Private Network Access preflight support
  - Dockerfile + docker-compose.yml for self-host
- `packages/shared-types/` — NEW internal package with `MeasureRequest`, `JobStatus`, `ProgressEvent`, extension message envelopes
- `packages/viewer/` — port from static HTML string renderer to React component (`<ReportViewer />`), exposed for SPA consumption; keep legacy `renderReportHtml` export for `@ohmyperf/reporter-html`
- Apps shared lib in `apps/website/lib/`: `backend-detector.ts`, `extension-bridge.ts`, `runner-client.ts`, `storage.ts` (idb), `store.ts` (zustand), `url-validation.ts`

### Modified
- `apps/extension-chrome/static/manifest.json` — add `externally_connectable.matches` for `https://ohmyperf.dev/*` + `http://localhost:3000/*`
- `apps/extension-chrome/src/background.ts` — add `chrome.runtime.onMessageExternal` listener for `ping`, `measure`, `cancel`; long-running port via `chrome.runtime.connect` for progress streaming
- `pnpm-workspace.yaml` — catalog additions for next, tailwindcss, next-intl, zustand, idb, uplot, recharts, sonner, react-hook-form, lucide-react, ipaddr.js
- Root `README.md` — update surface description; SPA replaces static landing
- `openspec/changes/add-ohmyperf-mvp/tasks.md` — mark §10.1 landing as superseded by this change

### Removed
- `apps/website/src/index.ts`, `apps/website/src/viewer-page.ts`, `apps/website/src/viewer-page.test.ts`, `apps/website/scripts/bundle-site.mjs`, `apps/website/scripts/dev.mjs` — replaced by Next.js scaffold
- `apps/website/static/index.html`, `apps/website/static/viewer.html` — preserved in git history; content ported to React components

## Impact

- Affected specs: NEW `measurement-spa` capability spec (this change). NO modification to engine-api or extension-surface specs (engine 1.0 frozen contract preserved; extension gets additive `externally_connectable` permission only).
- Affected code:
  - `apps/website/` — full rewrite
  - `apps/runner/` — new
  - `apps/extension-chrome/` — additive (manifest + background bridge)
  - `packages/viewer/` — additive React export (legacy HTML renderer preserved)
  - `packages/shared-types/` — new
- License: All new dependencies (Next.js MIT, Tailwind v4 MIT, shadcn/ui MIT, Hono MIT, zustand MIT, idb ISC, uPlot MIT, Recharts MIT, next-intl MIT, ipaddr.js MIT, lucide-react ISC, sonner MIT) are permissive and Apache-2.0 compatible. No NOTICE edits needed.
- CI: add bundle-budget enforcement (`@next/bundle-analyzer` → fail if landing > 150KB gzipped JS); add dogfood gate (weekly `ohmyperf run https://ohmyperf.dev --mode ci-stable`, fail if LCP > 2500ms).
- Docs: new READMEs for `apps/website/`, `apps/runner/`, updated root README and Quickstart.
- Out of scope for THIS change (deferred to follow-ups): mobile-responsive dashboard, VI translation copy, comparison/diff UI in SPA, authenticated page scenarios in SPA, cloud-hosted runner.
