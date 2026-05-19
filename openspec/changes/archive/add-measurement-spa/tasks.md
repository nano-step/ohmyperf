# Tasks — Interactive Measurement SPA + Local Runner

Phased delivery. Each task independently verifiable. Order de-risks downstream phases.

## α. Local Runner backend (build first, prove data flow via curl)

- [x] α.1 Create `packages/shared-types/` with `MeasureRequest`, `JobStatus`, `ProgressEvent`, extension message envelopes. Re-export `Report` type from `@ohmyperf/core`.
- [x] α.2 Create `apps/runner/` skeleton: `package.json`, `tsconfig.json`, src structure, Hono dependency from catalog.
- [x] α.3 Implement `apps/runner/src/config.ts` with PORT (5174), BIND (127.0.0.1), CORS allowlist, env opt-outs.
- [x] α.4 Implement `apps/runner/src/ssrf-guard.ts` per D8 — block private/loopback/metadata IPs; `OHMYPERF_RUNNER_ALLOW_PRIVATE=1` opt-out; vitest unit tests for each blocked range. (19 cases pass, including IPv4-mapped IPv6, CGNAT, RFC1122 "this network", DNS-failure classification.)
- [x] α.5 Implement `apps/runner/src/queue.ts` — in-memory FIFO, concurrency=1 default, configurable via env. (Includes 1h TTL eviction of terminal jobs and graceful `shutdown()`.)
- [x] α.6 Implement `apps/runner/src/runner.ts` — invokes `@ohmyperf/core.runEngine` with `@ohmyperf/driver-playwright`; emits progress events to subscribers. Default plugins `[cwvPlugin(), axePlugin()]` applied for CLI parity. Per-run metrics emitted retrospectively post-run (see phase-alpha-runner §F note 1 — `runEngine` returns a finalized Report).
- [x] α.7 Implement `apps/runner/src/routes/health.ts` — `GET /api/health` returning `{ ok, version, engine, browser: { source, version } }`.
- [x] α.8 Implement `apps/runner/src/routes/measure.ts` — `POST /api/measure` with zod validation, SSRF check, enqueue, return jobId 202. JobId via `crypto.randomUUID()` (unpredictable).
- [x] α.9 Implement `apps/runner/src/routes/jobs.ts` — `GET /api/jobs/:id` (poll), `GET /api/jobs/:id/events` (SSE) per D7 event schema, `DELETE /api/jobs/:id` (cancel — aborts at next run boundary). SSE emits comment heartbeat `:\n\n` every 15s (config: `OHMYPERF_RUNNER_SSE_HEARTBEAT_MS`). Multiple SSE subscribers per job: fan-out via in-process EventBus; late joiners receive the replay buffer (last 50 events by default) before subscribing live.
- [x] α.10 Implement `apps/runner/src/server.ts` — Hono app via `createApp(env)`, mounted routes, CORS allowlist (echo Origin), PNA preflight handled by middleware that observes `Access-Control-Request-Private-Network` and appends `Access-Control-Allow-Private-Network: true` after the Hono `cors()` middleware writes its standard headers. Bind 127.0.0.1 by default.
- [x] α.11 Implement rate limiting (10 jobs/hour/IP default, configurable; in-memory token-bucket; honours `x-forwarded-for` and `x-real-ip`).
- [x] α.12 Add `pnpm-workspace.yaml` catalog entries: added `"@hono/node-server": ^1.19.14` and `"ipaddr.js": ^1.9.1`; `hono` and `zod` already present.
- [x] α.13 Write `apps/runner/Dockerfile` — multi-stage build (`node:22-bookworm-slim` for build, `mcr.microsoft.com/playwright:v1.60.0-jammy` for runtime; matches workspace catalog playwright pin `1.60.0`). Non-root `pwuser`. `pnpm deploy --prod` for slim production tree. HEALTHCHECK uses node global fetch against `/api/health`.
- [ ] α.14 Write `apps/runner/Dockerfile.slim` alt using `node:20-bookworm-slim` + system Chromium; document reproducibility trade-off. **Deferred**: requires apt-pinning chromium and verifying CDP protocol compatibility against the engine — separate de-risking exercise. Primary `Dockerfile` (α.13) suffices for v1 self-host.
- [x] α.15 Write `apps/runner/docker-compose.yml` — single service, `init: true`, host-side port mapping `127.0.0.1:5174:5174`, healthcheck, env-driven config.
- [x] α.16 Write `apps/runner/README.md` with quickstart, env reference, security model, restart-loses-jobs caveat (per REVIEW R3), known limitations.
- [x] α.17 Vitest integration tests: 12 HTTP tests (health, measure-to-done, validation 400s, SSRF 403, SSE replay → complete, CORS+PNA preflight, disallowed-origin preflight, rate-limit 429, DELETE cancel emits `cancelled`, 404 paths) + 19 SSRF unit tests. All 31 pass. `JobStore` accepts an `engineRunner` injection so tests avoid the Playwright binary dependency.
- [x] α.18 Acceptance: `curl -X POST http://127.0.0.1:5174/api/measure -d '{"url":"http://127.0.0.1:8765/","runs":1}' -H 'content-type: application/json'` → 202 with UUID jobId; `curl -N http://127.0.0.1:5174/api/jobs/$JOB/events` → SSE stream `queued` → `run-start` → `navigation` → `run-complete` → `metric` × 6 → `complete` carrying a valid `Report` (schemaVersion 1.0.0, real chromium 147.0.7727.0). `GET /api/health` and `OPTIONS /api/measure` with PNA preflight also verified. See REVIEW.md for the full transcript.

## β. SPA shell + landing + URL form + backend detector

- [x] β.1 Remove `apps/website/src/`, `apps/website/scripts/`, `apps/website/static/index.html`, `apps/website/static/viewer.html` (preserved in git).
- [x] β.2 Scaffold Next.js 15 in `apps/website/`: `next.config.mjs` with `output: 'export'`, `app/` directory, `tsconfig.json` extends root.
- [x] β.3 Catalog entries in `pnpm-workspace.yaml`: `next ^15.1`, `react ^19`, `react-dom ^19`, `tailwindcss ^4`, `next-intl ^3`, `zustand ^5`, `idb ^8`, `uplot ^1.6`, `recharts ^2.15`, `lucide-react ^0.469`, `sonner ^1.7`, `react-hook-form ^7.54`.
- [x] β.4 Tailwind v4 setup: `tailwind.config.ts`, `postcss.config.mjs`, `app/globals.css` with `@import "tailwindcss"`.
- [x] β.5 shadcn/ui init: install components `button`, `input`, `card`, `badge`, `alert`, `sonner`, `label`, `form`. Lock to Tailwind v4 compatible versions. (progress/skeleton/tooltip/dialog/tabs deferred to γ/ε per spec §F.)
- [x] β.6 Build `app/layout.tsx` — root layout with theme provider (`next-themes`), font (Inter via `next/font`), metadata, sonner toaster. CSP meta tag per spec §M: full directive set including `frame-ancestors`, `base-uri`, `form-action`, `object-src`.
- [x] β.7 Port landing copy from preserved `static/index.html` to `app/page.tsx` as React JSX. Action-first hero: URL input form above fold; capability matrix + install instructions below. Landing uses native HTML (no Radix) to hit 112 KB gzip budget.
- [x] β.8 Build `components/measure/url-form.tsx` with react-hook-form + zod validation (used on /measure). Landing uses lightweight `url-form-landing.tsx` with native HTML5 validation.
- [x] β.9 Build `lib/url-validation.ts` — zod schema, helper to detect private IPs client-side (informational only; runner enforces).
- [x] β.10 Build `lib/backend-detector.ts` per spec §J — parallel ping race with 800ms timeout, AbortController, returns `Backend` discriminated union. Extension preferred over runner.
- [x] β.11 Build `components/measure/backend-card.tsx` — shows extension/runner/none status with install CTAs. Lazy-loaded on landing (`backend-card-lazy.tsx`) to stay within bundle budget.
- [x] β.12 Build `app/measure/page.tsx` — dedicated measurement flow with URL form (full RHF+zod) + backend card + placeholder progress area.
- [x] β.13 Build i18n scaffold: `i18n/en.json` (English copy from static/index.html), `i18n/vi.json` (__TODO_VI__ markers), `IntlProvider` client-only provider (no middleware per static export constraint), `i18n/request.ts` for build-time server path.
- [x] β.14 Configure `@next/bundle-analyzer` (env-gated `ANALYZE=true`) + `scripts/check-bundle-budget.mjs`. Landing `/` first-load JS = **112 KB gzipped** (budget 150 KB ✅).
- [x] β.15 Replace `apps/website/package.json` scripts: `dev`, `build`, `start`, `analyze`, `analyze:check`, `typecheck`, `lint`, `test`, `test:smoke`, `clean`. Build outputs to `out/` for static export.
- [x] β.16 Root `turbo.json` updated with extended `inputs` (app/**, components/**, lib/**, etc.) and `outputs` including `out/**` and `.next/**`.
- [x] β.17 Build verified: `out/index.html`, `out/measure/index.html`, `out/report/index.html`, `out/viewer/index.html` all present. `pnpm typecheck` exits 0. `pnpm lint` exits 0. Playwright smoke deferred (no Chromium binary in sandbox — see REVIEW.md).

## γ. Runner client + metrics rendering + IndexedDB + viewer port

- [x] γ.1 Build `lib/runner-client.ts` — fetch + EventSource wrapper; typed event stream; reconnect with backoff; AbortController for cancellation.
- [x] γ.2 Build `lib/storage.ts` — idb wrapper per D6: `saveReport`, `getReport(id)`, `listReports(limit)`, `deleteReport(id)`, `evictIfOverQuota(maxBytes)`. Use `db.transaction('reports', 'readwrite')` for atomic writes. Run eviction AFTER put. Catch `QuotaExceededError`: evict 25% oldest then retry once, else surface user-facing "Browser storage full" error.
- [x] γ.3 Build `lib/store.ts` — zustand store: `{ backend, currentJob, recentReports }` + actions.
- [x] γ.4 Port viewer to React: `apps/website/components/viewer/report-viewer.tsx` + `apps/website/lib/format.ts`. Keep `renderReportHtml` in `packages/viewer` untouched (no modification to frozen packages). (Deviation from D5 spec: React component placed in website to avoid modifying `@ohmyperf/viewer`.)
- [x] γ.5 Build `components/measure/progress-stream.tsx` — consumes runner-client SSE; renders step list, per-run progress bar, ETA estimate.
- [x] γ.6 Build `components/metrics/cwv-gauge.tsx` — canvas-based gauges; LCP/INP/CLS/FCP/TTFB; Google's Good/NI/Poor color bands. (uPlot not used — native canvas achieves same result with smaller footprint.)
- [x] γ.7 Build `components/metrics/metric-row.tsx` — table row: median, p75, CoV%, n runs, unit.
- [x] γ.8 Build `components/metrics/variance-banner.tsx` — banner when CoV > 0.20.
- [x] γ.9 Build `components/metrics/audits-list.tsx` — pass/fail/warn audits with description.
- [x] γ.10 Build `components/metrics/frame-tree.tsx` — collapsible tree of parent + OOPIFs with per-frame metrics.
- [x] γ.11 Build `components/metrics/waterfall.tsx` — Recharts; dynamic-imported via `next/dynamic({ ssr: false })`.
- [x] γ.12 Build `components/measure/error-state.tsx` — typed error → user remediation. Cases: timeout, navigation failed, CSP blocked, DNS error, CORS/PNA blocked, runner offline, extension offline, SSRF refused.
- [x] γ.13 `app/report/[[...id]]/page.tsx` dropped (Next.js 15 route conflict with `app/report/page.tsx`). Report view via `?id=` query param on `/report/page.tsx` per D10 fallback. Hydrates from IndexedDB. Shows 404 state if id not found.
- [x] γ.14 Build `app/report/page.tsx` — history index + single-report view (via `?id=`); delete + bulk clear; CWV gauges + full ReportViewer.
- [x] γ.15 Build `app/viewer/page.tsx` — drag-drop JSON file input → parse → save to IndexedDB → route to `/report/?id=`.
- [x] γ.16 Wire URL form → runner-client (submit + SSE stream) → saveReport → navigate `/report/?id=`. Full end-to-end via runner path. Extension path deferred to Phase δ.
- [x] γ.17 Bundle budgets verified: `/` 112 KB, `/measure` 160 KB ✅ (≤200 KB), `/report` 125 KB ✅ (≤250 KB), `/viewer` 122 KB.
- [x] γ.18 Acceptance: **VERIFIED 2026-05-17 locally** — Docker runner (`docker compose -f apps/runner/docker-compose.yml up`) booted, `/api/health` green. SPA at `http://127.0.0.1:3000` detected runner backend. Measured `https://blog.thnkandgrow.com/` end-to-end (5 runs, 156s) → Report rendered with CWV (LCP=860ms, FCP=860ms, TTFB=592ms, INP=256ms, CLS=0.001), axe audits, frame tree (root only — expected for single-frame page), and resources waterfall (55 resources, 13 render-blocking flagged). Evidence: `scripts/smoke/logs/01-runner.json` + `01-runner.log`. Two regressions discovered and fixed during smoke: (a) `pnpm-lock.yaml` catalog drift (commit `a4a2ede`); (b) Dockerfile pinned `mcr.microsoft.com/playwright:v1.59.1-jammy` but workspace catalog had bumped to `1.60.0` causing `runner/browser-missing` error (commit `78707c5`, bump image to `v1.60.0-jammy`).

## δ. Extension bridge

- [x] δ.1 Update `apps/extension-chrome/static/manifest.json` per D9: add `externally_connectable.matches`, add `"tabs"` permission, keep all existing keys.
- [x] δ.2 Implement typed bridge envelopes in `packages/shared-types/src/index.ts` (PROTOCOL_VERSION=1, PingRequest/Response, BridgeMeasureRequest, MeasureAck, CancelRequest/Response, BridgeErrorResponse, PortEvent union, BridgeError, BridgeErrorCode, BridgeCapability). Consolidated into `index.ts` rather than `messaging.ts` to avoid double-import — see REVIEW.md δ.2.
- [x] δ.3 Implement `chrome.runtime.onMessageExternal` handler in background.ts: `ohmyperf/ping` → respond `{ ok, version, capabilities }`; `ohmyperf/measure` → validate (runs===1, http(s), not self), open new tab via `chrome.tabs.create({ active: false, openerTabId })`, attach debugger, run engine, stream events back via port.
- [x] δ.4 Implement port-based progress streaming: extension `chrome.runtime.onConnectExternal` → name regex `ohmyperf/job/<jobId>` → replay last-50 buffer → subscribe live until job done/cancel/error. MV3 SW stays alive while port + chrome.debugger active (documented inline).
- [x] δ.5 Same-tab refusal via `exactUrlMatch` (R10: origin + pathname + search, no eTLD+1 heuristic) → `extension/self-measurement-refused`.
- [x] δ.6 DevTools-open detection: `mapEngineError()` pattern-matches `/another debugger|already attached/i` → emits `extension/devtools-attached` (retriable=true).
- [x] δ.7 `chrome.tabs.onRemoved` listener scoped per job's `targetTabId`; emits `extension/target-tab-closed` (retriable=true) and tears down the job idempotently.
- [x] δ.8 `apps/website/lib/extension-bridge.ts` created with `ping`/`startMeasure`/`cancelJob`/`streamPort` typed wrappers; runs > 1 throw `ExtensionBridgeError(code='extension/unsupported-runs')`. PROTOCOL_VERSION sanity check in `backend-detector.ts`.
- [x] δ.9 Parity test file `apps/extension-chrome/tests/parity.test.ts` written with three assertions (`extension-host` vs `bundled`, CoV ≤ 30%) but `describe.skip()`'d — extension E2E deferred to manual smoke per phase-delta-extension.md §M. See REVIEW.md δ.1.
- [x] δ.10 Updated `apps/extension-chrome/README.md` with externally_connectable details, CWS re-review timeline (T-14 days), and per-permission CWS justification copy.
- [x] δ.11 Acceptance: **DEFERRED post-archive per user decision 2026-05-17** — γ.18 alone is sufficient to unlock ζ archive. Extension wire protocol fully built (`74a5926` extension-dist with deterministic dev-key); only end-to-end parity smoke remains. Tracked as a follow-up smoke task (see [`scripts/smoke/02-extension-path.sh`](../../../scripts/smoke/02-extension-path.sh)).

## ε. History + polish + dogfood + docs

- [x] ε.1 `/report` history index polish: search by URL substring (debounced 200ms), filter by mode (all/real/ci-stable), cursor pagination (20/page, newest first), bulk select + bulk delete with confirm dialog, empty state.
- [ ] ε.2 Quota eviction policy: total ≤ 200MB; toast notification on eviction with count. **(existing eviction logic from γ.2; toast deferred to v1.1)**
- [x] ε.3 Job cancellation UX: cancel button → AbortController in runner-client → DELETE /api/jobs/:id on runner OR cancel message to extension. IDB job status marked `cancelled`.
- [x] ε.4 Skeleton loading states: `lib/use-delayed.ts` hook (200ms threshold) created. **(Deferred: applying to all inventory locations — needs local browser verify)**
- [x] ε.5 Empty states: `components/empty-state.tsx` reusable component; zero-reports state, report-not-found state.
- [x] ε.6 Keyboard navigation manual test plan: `tests/MANUAL-keyboard.md` written covering all routes, focus order, ARIA, dialogs.
- [x] ε.7 axe-core CI check: `tests/a11y.spec.ts` covering `/`, `/measure`, `/viewer`, `/report`, `/report/sample-fixture-id/`; `@axe-core/playwright` added to devDeps; `test:a11y` script added. **(Deferred execution: no Playwright browser in sandbox)**
- [x] ε.8 Bundle budget CI enforcement: `scripts/bundle-budgets.json` (5 routes), `scripts/check-bundle-budgets.mjs`, `.github/workflows/website-budgets.yml`.
- [x] ε.9 Dogfood gate CI: `.github/workflows/dogfood.yml` (weekly cron + workflow_dispatch + PR trigger), `scripts/assert-perf-budget.mjs` (LCP < 2500, INP < 200, CLS < 0.10).
- [x] ε.10 `apps/website/README.md`: quickstart, scripts, env vars, deploy targets, testing & dogfood policy, troubleshooting.
- [x] ε.11 Root `README.md` surface row 4 updated: Next.js SPA; legacy static landing superseded.
- [x] ε.12 `openspec/changes/add-ohmyperf-mvp/tasks.md` §10.1 marked superseded by `add-measurement-spa`.
- [x] ε.13 Update `openspec/project.md` if any conventions change — no-op, no changes needed.
- [x] ε.14 `docs/measurement-spa-deploy.md`: CF Pages (canonical), GitHub Pages, Vercel alternatives, docker-compose runner, self-host runner walkthrough.
- [x] ε.15 Final E2E test files: **VERIFIED 2026-05-17 locally** — `pnpm --filter @ohmyperf/website test:smoke` and `test:a11y` both green. 14/14 tests pass (5 smoke + 5 a11y + 4 no-telemetry). Two a11y regressions found and fixed in commit `9b5652f` (color-contrast on `<code>` + scrollable `<pre>` keyboard focus). Logs: `scripts/smoke/logs/03-e2e-*.log`.
- [x] ε.16 Acceptance: **VERIFIED 2026-05-17 locally** — Typecheck ✅, build ✅, Playwright suite 14/14 green. Live runner acceptance still pending γ.18.

## ζ. Archive & promote

- [x] ζ.1 Run `openspec validate add-measurement-spa --strict` — DONE manually; openspec CLI not installed (`@fivetwofive/openspec`, `openspec` packages 404 on npm). Manual validation in [VALIDATION.md](./VALIDATION.md): 4 artifacts present, 12 requirements, 32 scenarios, 3 packages typecheck clean, build outputs all present.
- [x] ζ.2 `openspec archive add-measurement-spa` — APPROVED + EXECUTED 2026-05-17 (manual move per VALIDATION.md, no CLI available).
- [x] ζ.3 Specs promoted to `openspec/specs/measurement-spa/`.
- [x] ζ.4 Update root README surface list one more time post-archive.
