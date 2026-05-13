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
- [x] α.13 Write `apps/runner/Dockerfile` — multi-stage build (`node:22-bookworm-slim` for build, `mcr.microsoft.com/playwright:v1.59.1-jammy` for runtime; matches pnpm-lock resolved Playwright version). Non-root `pwuser`. `pnpm deploy --prod` for slim production tree. HEALTHCHECK uses node global fetch against `/api/health`.
- [ ] α.14 Write `apps/runner/Dockerfile.slim` alt using `node:20-bookworm-slim` + system Chromium; document reproducibility trade-off. **Deferred**: requires apt-pinning chromium and verifying CDP protocol compatibility against the engine — separate de-risking exercise. Primary `Dockerfile` (α.13) suffices for v1 self-host.
- [x] α.15 Write `apps/runner/docker-compose.yml` — single service, `init: true`, host-side port mapping `127.0.0.1:5174:5174`, healthcheck, env-driven config.
- [x] α.16 Write `apps/runner/README.md` with quickstart, env reference, security model, restart-loses-jobs caveat (per REVIEW R3), known limitations.
- [x] α.17 Vitest integration tests: 12 HTTP tests (health, measure-to-done, validation 400s, SSRF 403, SSE replay → complete, CORS+PNA preflight, disallowed-origin preflight, rate-limit 429, DELETE cancel emits `cancelled`, 404 paths) + 19 SSRF unit tests. All 31 pass. `JobStore` accepts an `engineRunner` injection so tests avoid the Playwright binary dependency.
- [x] α.18 Acceptance: `curl -X POST http://127.0.0.1:5174/api/measure -d '{"url":"http://127.0.0.1:8765/","runs":1}' -H 'content-type: application/json'` → 202 with UUID jobId; `curl -N http://127.0.0.1:5174/api/jobs/$JOB/events` → SSE stream `queued` → `run-start` → `navigation` → `run-complete` → `metric` × 6 → `complete` carrying a valid `Report` (schemaVersion 1.0.0, real chromium 147.0.7727.0). `GET /api/health` and `OPTIONS /api/measure` with PNA preflight also verified. See REVIEW.md for the full transcript.

## β. SPA shell + landing + URL form + backend detector

- [ ] β.1 Remove `apps/website/src/`, `apps/website/scripts/`, `apps/website/static/index.html`, `apps/website/static/viewer.html` (preserved in git).
- [ ] β.2 Scaffold Next.js 15 in `apps/website/`: `next.config.mjs` with `output: 'export'`, `app/` directory, `tsconfig.json` extends root.
- [ ] β.3 Catalog entries in `pnpm-workspace.yaml`: `next ^15.1`, `react ^19`, `react-dom ^19`, `tailwindcss ^4`, `next-intl ^3`, `zustand ^5`, `idb ^8`, `uplot ^1.6`, `recharts ^2.15`, `lucide-react ^0.469`, `sonner ^1.7`, `react-hook-form ^7.54`.
- [ ] β.4 Tailwind v4 setup: `tailwind.config.ts`, `postcss.config.mjs`, `app/globals.css` with `@import "tailwindcss"`.
- [ ] β.5 shadcn/ui init: install components `button`, `input`, `card`, `progress`, `badge`, `skeleton`, `tooltip`, `dialog`, `tabs`, `alert`, `sonner`. Lock to Tailwind v4 compatible versions.
- [ ] β.6 Build `app/layout.tsx` — root layout with theme provider (`next-themes`), font (Inter via `next/font`), metadata, sonner toaster. Add CSP meta tag: `default-src 'self'; connect-src 'self' http://localhost:5174 http://127.0.0.1:5174; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`.
- [ ] β.7 Port landing copy from preserved `static/index.html` to `app/page.tsx` as React JSX. Action-first hero: URL input form above fold; capability matrix + install instructions below (Q5 user decision).
- [ ] β.8 Build `components/measure/url-form.tsx` with react-hook-form + zod validation: require http/https; soft-warn on localhost (the runner blocks; SPA just informs).
- [ ] β.9 Build `lib/url-validation.ts` — zod schema, helper to detect private IPs client-side (informational only; runner enforces).
- [ ] β.10 Build `lib/backend-detector.ts` per Oracle §2(a) — parallel ping race with 800ms timeout, returns `Backend` discriminated union.
- [ ] β.11 Build `components/measure/backend-card.tsx` — shows extension/runner/none status with install CTAs.
- [ ] β.12 Build `app/measure/page.tsx` — dedicated measurement flow with URL form + backend card + (placeholder) progress area.
- [ ] β.13 Build i18n scaffold: `i18n/en.json`, `i18n/vi.json` (VI keys present, copy = TODO), `next-intl` middleware (no, static export — use `getTranslations` server helper at build time or client provider).
- [ ] β.14 Configure `@next/bundle-analyzer` and add CI check: `apps/website` first-load JS for `/` ≤ 150KB gzipped (D11).
- [ ] β.15 Replace `apps/website/package.json` scripts: `dev`, `build`, `start`, `typecheck`, `lint`, `test`. Build outputs to `out/` for static export.
- [ ] β.16 Update root `turbo.json` if needed (likely no-op; Turbo picks up new app automatically).
- [ ] β.17 Smoke test: `pnpm --filter @ohmyperf/website dev` → http://localhost:3000 → landing renders → form submits → routes to `/measure?url=...` → backend detector card shows correct state.

## γ. Runner client + metrics rendering + IndexedDB + viewer port

- [ ] γ.1 Build `lib/runner-client.ts` — fetch + EventSource wrapper; typed event stream; reconnect with backoff; AbortController for cancellation.
- [ ] γ.2 Build `lib/storage.ts` — idb wrapper per D6: `saveReport`, `getReport(id)`, `listReports(limit)`, `deleteReport(id)`, `evictIfOverQuota(maxBytes)`. Use `db.transaction('reports', 'readwrite')` for atomic writes. Run eviction AFTER put. Catch `QuotaExceededError`: evict 25% oldest then retry once, else surface user-facing "Browser storage full" error.
- [ ] γ.3 Build `lib/store.ts` — zustand store: `{ backend, currentJob, recentReports }` + actions.
- [ ] γ.4 Port `packages/viewer/` to React: `packages/viewer/src/react/ReportViewer.tsx` (Q4 decision). Extract format helpers to `format.ts`. Keep `renderReportHtml` export for CLI reporter-html (parity tested).
- [ ] γ.5 Build `components/measure/progress-stream.tsx` — consumes runner-client SSE; renders step list, per-run progress bar, ETA estimate.
- [ ] γ.6 Build `components/metrics/cwv-gauge.tsx` — uPlot canvas; LCP/INP/CLS/FCP/TTFB; Google's Good/NI/Poor color bands.
- [ ] γ.7 Build `components/metrics/metric-row.tsx` — table row: median, p75, CoV%, n runs, unit.
- [ ] γ.8 Build `components/metrics/variance-banner.tsx` — banner when CoV > 0.20.
- [ ] γ.9 Build `components/metrics/audits-list.tsx` — pass/fail/warn audits with description.
- [ ] γ.10 Build `components/metrics/frame-tree.tsx` — collapsible tree of parent + OOPIFs with per-frame metrics.
- [ ] γ.11 Build `components/metrics/waterfall.tsx` — Recharts; dynamic-imported via `next/dynamic({ ssr: false })`.
- [ ] γ.12 Build `components/measure/error-state.tsx` — typed error → user remediation. Cases: timeout, navigation failed, CSP blocked, DNS error, CORS/PNA blocked, runner offline, extension offline, SSRF refused.
- [ ] γ.13 Build `app/report/[[...id]]/page.tsx` — catch-all dynamic route, `dynamic = 'force-static'`, `generateStaticParams: () => []`, hydrates from IndexedDB. Show 404 state if id not found.
- [ ] γ.14 Build `app/report/page.tsx` — index of recent reports from IndexedDB; delete + bulk clear; "Measure another" CTA.
- [ ] γ.15 Build `app/viewer/page.tsx` — drag-drop JSON file input → parse → save to IndexedDB → route to `/report/[id]`.
- [ ] γ.16 Wire URL form → backend-client → SSE consumption → save report → navigate `/report/[id]`. End-to-end via runner path.
- [ ] γ.17 Update bundle budget: `/measure` ≤ 200KB, `/report/[[...id]]` ≤ 250KB gzipped first-load JS.
- [ ] γ.18 Acceptance: with runner running locally, enter URL on landing → see live progress → see Report with CWV/audits/frame-tree/waterfall, no console errors.

## δ. Extension bridge

- [ ] δ.1 Update `apps/extension-chrome/static/manifest.json` per D9: add `externally_connectable.matches`, add `"tabs"` permission, keep all existing keys.
- [ ] δ.2 Implement `apps/extension-chrome/src/messaging.ts` — typed message envelopes; import from `packages/shared-types`.
- [ ] δ.3 Implement `chrome.runtime.onMessageExternal` handler in background.ts: `ohmyperf/ping` → respond `{ ok, version }`; `ohmyperf/measure` → validate (runs ≤ 1, URL allowed), open new tab via `chrome.tabs.create({ active: false })`, attach debugger, run engine, stream events back via port.
- [ ] δ.4 Implement port-based progress streaming: extension `chrome.runtime.connect` from SPA → bidirectional stream until job done/cancel/error.
- [ ] δ.5 Implement same-tab refusal: if `request.url` host matches current tab's host (`ohmyperf.dev`), refuse with error code `'extension/self-measurement-refused'`.
- [ ] δ.6 Implement DevTools-open detection: if `chrome.debugger.attach` fails with `"Another debugger is already attached"`, emit `error` event with code `'extension/devtools-attached'`; SPA shows "Close DevTools on target tab" guidance with Retry button.
- [ ] δ.7 Implement `chrome.tabs.onRemoved` listener — if target tab closed mid-measurement, abort cleanly AND emit `error` event `{ code: 'extension/target-tab-closed', message }` to the port subscriber so SPA can render guidance.
- [ ] δ.8 Update `apps/website/lib/extension-bridge.ts`: typed `chrome.runtime.sendMessage` + `chrome.runtime.connect` wrappers; clamp runs ≤ 1 with user-facing tooltip.
- [ ] δ.9 Parity test: run identical fixture URL through (a) extension path and (b) runner path. Assert `Report` shapes match (allow numerical variance within CoV bound). **Verify** `Report.meta.browser.source` literals per `packages/core/src/types.ts:135`: extension path → `"extension-host"`, runner path → `"bundled"` (NOT `"extension"` / `"playwright"`). CWV CoV bound: 30% for v1 single-run.
- [ ] δ.10 Update `apps/extension-chrome/README.md` with externally_connectable note and CWS re-review timeline guidance.
- [ ] δ.11 Acceptance: install unpacked extension → SPA detects → measure single URL via extension → identical Report (modulo run-to-run variance) as runner path.

## ε. History + polish + dogfood + docs

- [ ] ε.1 `/report` history index polish: search by URL substring, filter by mode, sort by date.
- [ ] ε.2 Quota eviction policy: total ≤ 200MB; toast notification on eviction with count.
- [ ] ε.3 Job cancellation UX: cancel button → AbortController in runner-client → DELETE /api/jobs/:id on runner OR cancel message to extension.
- [ ] ε.4 Skeleton loading states everywhere: form submission, backend detection, report hydration.
- [ ] ε.5 Empty states: zero reports, no backend, no metrics for unsupported browser.
- [ ] ε.6 Keyboard navigation pass: focus order, ARIA labels on gauges, Esc closes dialogs.
- [ ] ε.7 axe-core CI check: SPA pages must pass WCAG 2.1 AA (matches master `tasks.md` §13.11).
- [ ] ε.8 Bundle budget CI enforcement (D11); fail PR on regression.
- [ ] ε.9 Dogfood gate CI (D12): weekly `ohmyperf run https://ohmyperf.dev --mode ci-stable --runs 5`; assert LCP < 2500ms, INP < 200ms, CLS < 0.10.
- [ ] ε.10 Write `apps/website/README.md` with dev/build/deploy instructions; document static export target (Cloudflare Pages / GitHub Pages).
- [ ] ε.11 Update root `README.md`: SPA replaces static landing in surface list.
- [ ] ε.12 Update `openspec/changes/add-ohmyperf-mvp/tasks.md`: mark §10.1 (static landing) as superseded; add cross-reference note.
- [ ] ε.13 Update `openspec/project.md` if any conventions change (likely no-op).
- [ ] ε.14 Create `docs/measurement-spa-deploy.md`: how to deploy static SPA to CF Pages + how end users run docker-compose for runner.
- [ ] ε.15 Final E2E test: Playwright Test driving the SPA end-to-end through (a) runner path, (b) extension path (if extension load supported in test).
- [ ] ε.16 Acceptance: all four surfaces work: landing measure, /measure measure, /viewer drag-drop, /report history. Dogfood CI green.

## ζ. Archive & promote

- [ ] ζ.1 Run `openspec validate add-measurement-spa --strict`.
- [ ] ζ.2 After all phases green: `openspec archive add-measurement-spa`.
- [ ] ζ.3 Specs promoted to `openspec/specs/measurement-spa/`.
- [ ] ζ.4 Update root README surface list one more time post-archive.
