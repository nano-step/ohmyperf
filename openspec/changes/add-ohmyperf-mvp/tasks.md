# Implementation Tasks: OhMyPerf v1 MVP

Phased delivery aligned with the design's 5-phase plan. Each task is independently verifiable. Group ordering reflects dependency.

## 1. P0 Day-1 — Project setup, audit, license

- [ ] 1.1 Run trademark audit: USPTO + EUIPO search for "OhMyPerf" / "Oh My Perf" / "ohmyperf"; pause and surface findings if a conflicting mark exists in classes 9 / 35 / 42.
- [ ] 1.2 Run domain availability check for `ohmyperf.dev`, `ohmyperf.com`, `ohmyperf.org`, `ohmyperf.io` and reserve the `.dev` if available.
- [ ] 1.3 Run npm name availability check for `@ohmyperf` org and reserve the org.
- [ ] 1.4 Reserve GitHub `ohmyperf` org (or confirm desired alternative).
- [ ] 1.5 Identify and reserve VSCode + JetBrains marketplace publisher names.
- [ ] 1.6 Decide CWS publisher account ownership (individual vs verified org) and register.
- [ ] 1.7 Add Apache-2.0 LICENSE file at repo root.
- [ ] 1.8 Add NOTICE file declaring axe-core (MPL-2.0), Playwright (Apache-2.0), vendored Lighthouse audits (Apache-2.0).
- [ ] 1.9 Initialize pnpm workspace with `package.json`, `pnpm-workspace.yaml`, Turborepo `turbo.json`, root `tsconfig.json` with project references.
- [ ] 1.10 Configure `eslint-plugin-import` rules forbidding cross-layer imports (plugins → core/internal, viewer → drivers, CDP types → public API).
- [ ] 1.11 Set up CI matrix (GitHub Actions): macOS arm64, macOS x64, Ubuntu 22.04, Ubuntu 24.04, Windows Server 2022 — all 5 must pass for any PR.
- [ ] 1.12 Add `api-extractor` step to CI for `@ohmyperf/core` to detect breaking exports.
- [ ] 1.13 Add license-audit CI step (verifies NOTICE matches the actual dependency tree).
- [ ] 1.14 Bootstrap `docs/` site (Vitepress or Astro) with stubs for: Quickstart, CLI, Plugin API, Variance, Capability Matrix, Privacy.

## 2. P0 — Engine foundation: types, driver, CDP, OOPIF corpus

- [ ] 2.1 Create `packages/core/` skeleton with `package.json`, `tsconfig.json`, `src/index.ts`, browser export target.
- [ ] 2.2 Define core types in `packages/core/src/types.ts`: `MeasureOptions`, `Report`, `RunReport`, `AggregatedMetrics`, `FrameTree`, `FrameNode`, `Metric`, `Plugin`, `PluginHooks`, `Driver`, `DriverCapability`, `RunCtx`, `SetupCtx`, `ReportCtx`, `ShareCtx`. JSON-schema-generate from these types via `ts-json-schema-generator` for `1.0.0`.
- [ ] 2.3 Implement `defineScenario` and `definePlugin` helpers (identity functions with full type inference).
- [ ] 2.4 Create `packages/driver-playwright/` skeleton implementing the `Driver` interface: launch, newPage, attachCDP, supports, browserVersion (sourced from Playwright's bundled Chromium revision).
- [ ] 2.5 Build `cdp-compat.ts` shim layer in `@ohmyperf/driver-playwright`: every raw CDP call goes through this shim so version churn touches one file.
- [ ] 2.6 Implement OOPIF auto-attach flow per `iframe-deep-inspection` spec (Target.setAutoAttach with flatten:true, runIfWaitingForDebugger, frameId↔sessionId reconciliation, idempotent error handling for detached/destroyed targets).
- [ ] 2.7 Build the OOPIF synthetic test corpus under `tests/oopif-corpus/fixtures/`: parent + 3 cross-origin OOPIFs, sandboxed-no-scripts, srcdoc, fenced-frame, BFCache, prerender, SW-precache, SPA soft-nav, popup, worker, iframe-removed-mid-run, iframe-resize-causes-parent-shift. Use Playwright's static server, no real internet.
- [ ] 2.8 Build `tests/oopif-corpus/expectations/` — assertion files keyed to fixture name, defining minimum number of attached targets, expected metric availability, expected attribution flags.
- [ ] 2.9 Wire the corpus to CI as `pnpm test:oopif-corpus`; require all expectations to pass on every PR.
- [ ] 2.10 Implement `@ohmyperf/driver-extension` skeleton (the `chrome.debugger` driver): `Driver` interface backed by the chrome extension API, with a documented gap-list vs the Playwright driver.

## 3. P0 — Per-frame collectors

- [ ] 3.1 Build the per-frame collector framework: each attached `CDPSession` registers Page/Network/Runtime/Performance/PerformanceTimeline/DOM/CSS/Log and feeds into a per-frame state machine.
- [ ] 3.2 Implement CWV collector via `web-vitals/attribution`: bundle the library, inject via `Page.addScriptToEvaluateOnNewDocument`, listen for the events, aggregate per-frame.
- [ ] 3.3 Implement loading-metrics collector (DCL, Load, TBT, TTI, Speed Index) using the spec's algorithms. Validate TBT against Lighthouse's algorithm within ±5%.
- [ ] 3.4 Implement resource-timing collector via `Network.requestWillBeSent` + `responseReceived` + `loadingFinished`. Track render-blocking, cache-hit, transfer/encoded/decoded sizes.
- [ ] 3.5 Implement long-task collector via `PerformanceTimeline` longtask events; tag by frame + worker scope; ensure worker tasks don't enter main-thread TBT.
- [ ] 3.6 Implement runtime-breakdown (jsExec/layout/paint/composite/idle) from trace events.
- [ ] 3.7 Implement memory collector via `Performance.getMetrics` and `Memory.getDOMCounters`.
- [ ] 3.8 Implement coverage collector via `Profiler.startPreciseCoverage` + `CSS.startRuleUsageTracking`. Critical: enable BEFORE `Page.navigate`. Add a runtime check that fails the run if ordering is violated.
- [ ] 3.9 Implement HTTP-protocol observation (h1/h2/h3, compression, CDN heuristics).
- [ ] 3.10 Implement dual CLS reporting: `clsRoot` (parent only) + `clsAggregate` (cross-frame, viewport-weighted). Validate against `oopif-shift-in-child.html` fixture.
- [ ] 3.11 Implement frame-level CLS attribution to iframe-resize via `Page.frameResized` correlation. Validate against `oopif-resize-causes-parent-shift.html`.

## 4. P0 — Plugin runtime + reference plugins

- [ ] 4.1 Implement plugin loader: resolves config-listed plugins from `node_modules` or relative paths, validates `apiVersion`, rejects duplicates, records SRI to `ohmyperf.lock.json`.
- [ ] 4.2 Implement plugin lifecycle dispatcher: invokes hooks in canonical order, awaits async hooks, applies per-hook timeout (default 30s), records capability uses.
- [ ] 4.3 Implement `--frozen-lockfile` enforcement.
- [ ] 4.4 Implement interactive trust prompt for first-time third-party plugins; persist decisions to `~/.config/ohmyperf/trust.json`.
- [ ] 4.5 Build `@ohmyperf/plugin-cwv` (reference plugin) — wraps the CWV collector behind the plugin interface.
- [ ] 4.6 Build `@ohmyperf/plugin-axe` — runs axe-core after `onIdle`, emits `audits[]` entries; ships with NOTICE attribution for axe-core MPL-2.0.
- [ ] 4.7 Build `@ohmyperf/plugin-custom-metric-example` — documented example demonstrating user-defined metric registration.
- [ ] 4.8 Add `ohmyperf list-plugins` discovery.

## 5. P0 — Reproducibility & calibration

- [ ] 5.1 Build the calibration micro-benchmark in `packages/core/src/calibration/` — fixed-source JS deterministic CPU loop, ~2s budget, version-stamped.
- [ ] 5.2 Implement calibration runner: launch fresh Chromium context, throttling disabled, run 3 times, take median, store on disk per host fingerprint.
- [ ] 5.3 Implement on-disk calibration cache (24h TTL, host-fingerprint keyed).
- [ ] 5.4 Choose and document the default reference CPU score (record in `docs/calibration-reference.md`).
- [ ] 5.5 Wire CI Stable mode: run calibration → set CDP `Emulation.setCPUThrottlingRate` → set `Network.emulateNetworkConditions` (Fast 4G default) → record `report.meta.calibration`.
- [ ] 5.6 Implement `--recalibrate` flag.
- [ ] 5.7 Implement calibration-failure exit code 12 path (host too slow even at no-throttle).
- [ ] 5.8 Implement variance reporting: per-metric CoV in `aggregated`, `unstable: true` flag at CoV > 0.20, banner in HTML report.
- [ ] 5.9 Implement modified Z-score outlier rejection (threshold 3.5, only at runs ≥ 5).
- [ ] 5.10 Implement cold-vs-warm distinction (run 1 cold, runs 2..N warm; configurable via `cacheMode`).
- [ ] 5.11 Write `docs/variance.md` with empirical CoV bands per mode/metric (collected from OOPIF corpus + a sample real-world page set).

## 6. P0 — Lighthouse audit vendoring + reporters

- [ ] 6.1 Vendor specific Lighthouse audit modules into `packages/plugins-builtin/lh-audits/` under Apache-2.0 (with NOTICE): SEO audits, best-practices audits (HTTPS, mixed-content, deprecated-APIs), manifest, robots.
- [ ] 6.2 Build `@ohmyperf/plugin-seo` and `@ohmyperf/plugin-best-practices` wrapping the vendored audits behind the OhMyPerf plugin interface.
- [ ] 6.3 Build `@ohmyperf/reporter-json` — canonical Report JSON output.
- [ ] 6.4 Build `@ohmyperf/reporter-html` — Vite single-file build; embeds the React viewer; verify offline render.
- [ ] 6.5 Build `@ohmyperf/reporter-markdown` — PR-ready summary.
- [ ] 6.6 Build `@ohmyperf/reporter-junit` — JUnit XML; one testcase per budget. Validate against `junit-xml-validator` in CI.
- [ ] 6.7 Build `@ohmyperf/reporter-csv` — long-format per-metric-per-run.
- [ ] 6.8 Build `@ohmyperf/reporter-har` — HAR with redaction applied.
- [ ] 6.9 Build `@ohmyperf/reporter-trace` — gz-stream trace; wire into `artifacts.trace`.
- [ ] 6.10 Build `@ohmyperf/reporter-lh-compat` — Lighthouse-compatible JSON.
- [ ] 6.11 Implement trace cap (warn 50MB, refuse >500MB) and heap cap.

## 7. P0 — Vendored trace utils + viewer skeleton

- [ ] 7.1 Vendor tracium-equivalent into `packages/trace-utils/`: `MainThreadTasks` parsing, function attribution, timeline view helpers. Apache-2.0 with NOTICE.
- [ ] 7.2 Build `packages/viewer/` (React + Vite + Tailwind): meta header, CWV summary tiles, waterfall, frame-tree visualization, audits list, redaction badges.
- [ ] 7.3 Implement viewer schema-version gate (rejects unknown major).
- [ ] 7.4 Implement viewer's drag-drop / paste / file-picker entry on the website route `/viewer`.
- [ ] 7.5 axe-core a11y CI gate against the built viewer (zero violations at WCAG 2.1 AA).
- [ ] 7.6 Build `react-flow` (or equivalent) frame-tree visualization showing parent → OOPIF → grandchild with metrics on each node.

## 8. P0 — Engine API freeze

- [ ] 8.1 Compile `docs/api-contract-1.0.md`: every exported symbol of `@ohmyperf/core` with its signature and stability commitment.
- [ ] 8.2 Tag the engine packages `1.0.0-stable`. Future P1+ surface PRs MUST NOT break this contract without a 2.0 bump.
- [ ] 8.3 Cross-surface impact-review template added to `.github/PULL_REQUEST_TEMPLATE.md` for any PR that touches `packages/core/`.

## 9. P1 — CLI hardening

- [ ] 9.1 Build `packages/cli/` skeleton with citty subcommands: `run` (default), `scenario`, `diff`, `share`, `install-browser`, `doctor`, `list-plugins`, `init`, `watch`, `crawl`.
- [ ] 9.2 Implement exit-code mapping per spec (codes 0–12).
- [ ] 9.3 Implement `run` with all documented flags.
- [ ] 9.4 Implement `scenario` runner: load TS file, execute steps, aggregate metrics from `measure: true` steps.
- [ ] 9.5 Implement `diff` with Mann-Whitney U significance testing per metric and noise-floor table in `docs/diff-noise-floors.md`.
- [ ] 9.6 Implement `share` with redaction preview + `--yes` skip + env-secret scrubber + exit code 10.
- [ ] 9.7 Implement `install-browser`, `doctor`, `list-plugins`.
- [ ] 9.8 Implement `init` with `--ci <github|gitlab|circle>` template scaffolding.
- [ ] 9.9 Implement single-run-no-budget guard.
- [ ] 9.10 Implement cross-source diff guard (`browser.source` mismatch).
- [ ] 9.11 Implement cross-mode diff guard (`real` vs `ci-stable`).
- [ ] 9.12 Implement `watch` (alpha) with debounce and watchPaths config.
- [ ] 9.13 Implement `crawl` (alpha) with `--max-pages`, `--depth`, `--sitemap-url`.
- [ ] 9.14 Author `templates/ci/github-actions.yml`, `templates/ci/gitlab-ci.yml`, `templates/ci/circleci-config.yml`.
- [ ] 9.15 Validate templates work end-to-end via dogfood: ohmyperf measures itself in CI on every PR.

## 10. P2 — Static website + Chrome extension MVP

- [x] 10.1 ~~Build `apps/website/` landing page (Astro or Next.js): value proposition, CTAs, Lighthouse score ≥ 90 on mobile for all 4 categories.~~ — **SUPERSEDED** by `add-measurement-spa` (Next.js 15 SPA with `/measure`, `/viewer`, `/report` routes; static export to CF Pages).
- [ ] 10.2 Build the static drag-drop viewer at `/viewer` reusing `packages/viewer/`.
- [ ] 10.3 Build `apps/extension-chrome/` MV3 skeleton with the documented permission set.
- [ ] 10.4 Implement `chrome.debugger`-backed CDP driver (`@ohmyperf/driver-extension`).
- [ ] 10.5 Implement "Measure this page" button → attach → 5-run measurement → detach → open viewer.
- [ ] 10.6 Run the OOPIF corpus through the extension driver in CI; document gap-list against the Playwright driver.
- [ ] 10.7 Implement profile-contamination detection + warning banner.
- [ ] 10.8 Implement chrome:// graceful refusal.
- [ ] 10.9 Implement service-worker termination handling (chrome.storage.session state, "aborted by browser" UX).
- [ ] 10.10 Submit to Chrome Web Store under verified publisher; iterate review until approved.
- [ ] 10.11 Author the extension's privacy/permissions justification copy for CWS submission.

## 11. P3 — VSCode plugin

- [ ] 11.1 Build `apps/ide-vscode/` skeleton with manifest, activation events, command registrations.
- [ ] 11.2 Implement `OhMyPerf: Measure URL` command with status-bar progress.
- [ ] 11.3 Implement CLI binary auto-location (workspace `node_modules/.bin/ohmyperf` → `OHMYPERF_BIN` setting → PATH).
- [ ] 11.4 Implement "Install CLI" button when binary missing.
- [ ] 11.5 Implement webview viewer with strict CSP.
- [ ] 11.6 Implement source-map attribution: source-map (Mozilla) library; map (scriptUrl, line, col) → (originalSource, line, col); aggregate per-file.
- [ ] 11.7 Implement editor decorations + CodeLens with thresholds (warn ≥ 50KB unused, info < 50KB).
- [ ] 11.8 Implement "no source maps" graceful degradation.
- [ ] 11.9 Implement `measureOnSave` setting with 500ms debounce.
- [ ] 11.10 Implement settings surface (binPath, defaultUrl, runsPerMeasurement, mode, watchPaths, projectRoot, share.endpoint).
- [ ] 11.11 Implement SecretStorage for scenario credentials; never write to settings/files.
- [ ] 11.12 Submit to VSCode Marketplace under verified publisher.

## 12. P4 — Hosted shareable links

- [ ] 12.1 Build `packages/share-server/` skeleton (Hono framework) with both Cloudflare Workers and Node + Postgres+S3 backends behind a thin adapter (~200 LOC abstraction).
- [ ] 12.2 Implement `POST /api/share` with schema validation, gzip, R2 PUT, D1 INSERT, password Argon2id hashing, expiry.
- [ ] 12.3 Implement `GET /r/:id` viewer route with password gate, expiry check, no-referrer headers.
- [ ] 12.4 Implement `GET /api/r/:id` JSON read endpoint.
- [ ] 12.5 Implement `GET /r/:id/trace` presigned R2 URL (5-minute presign).
- [ ] 12.6 Implement `DELETE /api/r/:id` owner-only soft-delete with tombstone.
- [ ] 12.7 Implement `GET /api/dsar/:email` enqueue endpoint.
- [ ] 12.8 Implement rate limiting (10/hour/IP default, configurable).
- [ ] 12.9 Implement abuse-domain denylist with ops-tooling for runtime updates.
- [ ] 12.10 Wire the share-client (`packages/share-client/`) to CLI's `share` subcommand.
- [ ] 12.11 Build self-host Docker image `ohmyperf/share-server:1.0.0`; integration-test against MinIO + Postgres in CI.
- [ ] 12.12 Author `/privacy`, `/terms`, `/dpa`, `/dsar` pages and complete legal review BEFORE P4 GA.
- [ ] 12.13 Wire the redaction pipeline + scrubber + preview into `share-client` so all uploads pass through it.

## 13. Quality + acceptance gates (cross-phase)

- [ ] 13.1 Per-spec acceptance test suite: every requirement scenario implemented as a Playwright Test + Vitest combination.
- [ ] 13.2 OOPIF corpus expectation suite (3.7+) wired to all CI pipelines; mandatory pass.
- [ ] 13.3 Reproducibility acceptance: 10× CI Stable runs against a fixture; assert CoV ≤ 0.05 on LCP and ≤ 0.10 on INP.
- [ ] 13.4 CWV-vs-Lighthouse parity acceptance: against a fixture, OhMyPerf LCP/FCP/TTFB are within ±10% of Lighthouse 12.x medians.
- [ ] 13.5 Schema acceptance: emit a fixture report; validate against `report.schema.1.0.0.json`; round-trip through JSON.
- [ ] 13.6 Plugin lifecycle acceptance: a recording plugin emits `[setup, beforeNavigate, onNavigate, onLoad, onIdle, onMetric*, beforeReport, onReport, teardown]`.
- [ ] 13.7 Failure-mode acceptance: fixtures for infinite-redirect, renderer-crash, blocked-CSP, 5xx-error, OOM-heap; CLI exits with documented codes; structured error JSON emitted.
- [ ] 13.8 Cross-platform CI matrix: all P0 acceptance must pass on macOS arm64 + macOS x64 + Ubuntu 22.04 + Ubuntu 24.04 + Windows Server 2022.
- [ ] 13.9 Capability-matrix acceptance: Firefox + WebKit drivers return `{ available: false }` (not `undefined`, not crash) for non-supported metrics.
- [ ] 13.10 Redaction acceptance: fixture report containing `Authorization: Bearer xyz`, `Cookie: session=abc`, `?api_key=secret123`, `<input type=password>` screenshot — all redacted; OCR over screenshot returns no chars in input box.
- [ ] 13.11 a11y self-audit acceptance: viewer passes axe-core at WCAG 2.1 AA in CI.
- [ ] 13.12 Privacy acceptance: built website makes zero network requests to third-party trackers on landing+viewer; verified via Playwright network log.

## 14. Pre-GA checklist (before any public 1.0.0 announcement)

- [ ] 14.1 Trademark, domains, npm, GitHub, marketplaces all secured (see 1.x tasks).
- [ ] 14.2 Privacy Policy + Terms + DPA + DSAR pages published and counsel-reviewed.
- [ ] 14.3 NOTICE file complete and CI-validated.
- [ ] 14.4 All P0 acceptance gates green on the cross-platform CI matrix.
- [ ] 14.5 Sample shareable report at `/r/sample` exists and renders.
- [ ] 14.6 At least 3 reference plugins shipping (`cwv`, `axe`, `custom-metric-example`).
- [ ] 14.7 Documentation pages published for: Quickstart, CLI reference, Plugin API, Variance, Capability Matrix, Privacy.
- [ ] 14.8 Public bug bounty / responsible-disclosure policy added to `SECURITY.md`.
- [ ] 14.9 Telemetry confirmed off-by-default; first-run banner verified.
- [ ] 14.10 ARCHIVE this OpenSpec change after `pnpm test:all` passes; promote specs to `openspec/specs/` with `openspec archive add-ohmyperf-mvp`.

## 15. Post-GA roadmap (v1.1)

- [ ] 15.1 JetBrains plugin (Kotlin, IntelliJ Platform SDK).
- [ ] 15.2 Worker-thread plugin sandboxing.
- [ ] 15.3 Cloud real-device farm (re-evaluate based on user demand).
- [ ] 15.4 Plugin marketplace / registry (community-driven).
- [ ] 15.5 RUM SDK (separate product; only if strategic).
- [ ] 15.6 Mobile-native (Android/iOS WebView remote debugging).
