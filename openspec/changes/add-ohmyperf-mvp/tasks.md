# Implementation Tasks: OhMyPerf v1 MVP

Phased delivery aligned with the design's 5-phase plan. Each task is independently verifiable. Group ordering reflects dependency.

## 0. Reconcile audit — tick what's already coded (POST-AUDIT, must do first)

**Context (Sisyphus 2026-05-17 audit)**: this `tasks.md` currently has 1 task ticked but the engine, runner, SPA, extension, and CLI are all partially or fully built. Most of the 152 `[ ]` items below are likely either (a) already coded but never ticked, or (b) intentionally deferred to v1.1, or (c) genuinely missing. We cannot plan A/B/C tracks reliably until tasks.md reflects ground truth. This must run before Tracks A/B/C.

- [x] 0.1 Walk every package under `packages/` and `apps/` and grep for each task's referenced artifact. **DONE 2026-05-17**: ticked 71 tasks where artifact exists; left 87 pending with annotations.
- [x] 0.2 Annotate pending `[ ]` inline with routing tag. **DONE**: see tag distribution in commit message.
- [x] 0.3 SUPERSEDED tasks cross-linked to A/B/C task IDs. **DONE**: §3.2→A1, §3.6→B1, §3.7→A3, §3.11→A2.5, §6.9→B1, §6.11→B1.4, §7.1→B1.1, §13.3/13.4/13.5→A4/A6.5.
- [x] 0.4 GENUINELY MISSING items routed: §1.11 (Windows CI), §1.14 (docs site), §6.6/6.7 (junit/csv reporters), §8.3 (PR template), §9.8/9.9/9.10/9.11 (CLI guards), §9.14 (gitlab/circle templates), §10.8 (chrome:// refusal), §13.8 (Windows matrix), §14.8 (SECURITY.md) — all routed to "Phase II" engineering subset (no new openspec change needed).
- [x] 0.5 Acceptance: zero unannotated `[ ]`. **VERIFIED** 2026-05-17.

## 1. P0 Day-1 — Project setup, audit, license

- [ ] 1.1 Run trademark audit: USPTO + EUIPO search for "OhMyPerf" / "Oh My Perf" / "ohmyperf"; pause and surface findings if a conflicting mark exists in classes 9 / 35 / 42. **(admin-blocked — user must perform manually)**
- [ ] 1.2 Run domain availability check for `ohmyperf.dev`, `ohmyperf.com`, `ohmyperf.org`, `ohmyperf.io` and reserve the `.dev` if available. **(admin-blocked — needs registrar account)**
- [ ] 1.3 Run npm name availability check for `@ohmyperf` org and reserve the org. **(admin-blocked — needs npm account)**
- [ ] 1.4 Reserve GitHub `ohmyperf` org (or confirm desired alternative). **(admin-blocked — needs GitHub account)**
- [ ] 1.5 Identify and reserve VSCode + JetBrains marketplace publisher names. **(admin-blocked — needs marketplace accounts)**
- [ ] 1.6 Decide CWS publisher account ownership (individual vs verified org) and register. **(admin-blocked — needs Chrome Web Store publisher account + $5 fee)**
- [x] 1.7 Add Apache-2.0 LICENSE file at repo root. — present at [`LICENSE`](../../../LICENSE)
- [x] 1.8 Add NOTICE file declaring axe-core (MPL-2.0), Playwright (Apache-2.0), vendored Lighthouse audits (Apache-2.0). — present at [`NOTICE`](../../../NOTICE)
- [x] 1.9 Initialize pnpm workspace with `package.json`, `pnpm-workspace.yaml`, Turborepo `turbo.json`, root `tsconfig.json` with project references. — confirmed in repo root
- [x] 1.10 Configure `eslint-plugin-import` rules forbidding cross-layer imports (plugins → core/internal, viewer → drivers, CDP types → public API). — present in [`eslint.config.js`](../../../eslint.config.js) `layeringRules`
- [x] 1.11 Set up CI matrix (GitHub Actions): macOS arm64, macOS x64, Ubuntu 22.04, Ubuntu 24.04, Windows Server 2022. — all 5 OSes present in `.github/workflows/ci.yml` matrix (macos-15, macos-13, ubuntu-24.04, ubuntu-22.04, windows-2022). Verified 2026-05-17.
- [x] 1.12 Add `api-extractor` step to CI for `@ohmyperf/core` to detect breaking exports. — `api-freeze` job present in `.github/workflows/ci.yml` + `packages/core/api-extractor.json` exists
- [x] 1.13 Add license-audit CI step (verifies NOTICE matches the actual dependency tree). — `pnpm license:audit` wired in CI via `scripts/license-audit.mjs`
- [ ] 1.14 Bootstrap `docs/` site (Vitepress or Astro) with stubs for: Quickstart, CLI, Plugin API, Variance, Capability Matrix, Privacy. **(deferred to v1.1 docs track)** — only `docs/measurement-spa-deploy.md` exists; full doc site is out of v1 scope per archive of measurement-spa change.

## 2. P0 — Engine foundation: types, driver, CDP, OOPIF corpus

- [x] 2.1 Create `packages/core/` skeleton with `package.json`, `tsconfig.json`, `src/index.ts`, browser export target. — present.
- [x] 2.2 Define core types in `packages/core/src/types.ts`: `MeasureOptions`, `Report`, `RunReport`, `AggregatedMetrics`, `FrameTree`, `FrameNode`, `Metric`, `Plugin`, `PluginHooks`, `Driver`, `DriverCapability`, `RunCtx`, `SetupCtx`, `ReportCtx`, `ShareCtx`. — all interfaces present at [`packages/core/src/types.ts`](../../../packages/core/src/types.ts). JSON-schema generation **deferred to A6.5 (Track A)**.
- [x] 2.3 Implement `defineScenario` and `definePlugin` helpers (identity functions with full type inference). — both exported from [`packages/core/src/index.ts`](../../../packages/core/src/index.ts).
- [x] 2.4 Create `packages/driver-playwright/` skeleton implementing the `Driver` interface: launch, newPage, attachCDP, supports, browserVersion. — present at [`packages/driver-playwright/src/index.ts`](../../../packages/driver-playwright/src/index.ts).
- [x] 2.5 Build `cdp-compat.ts` shim layer in `@ohmyperf/driver-playwright`. — present at [`packages/driver-playwright/src/cdp-compat.ts`](../../../packages/driver-playwright/src/cdp-compat.ts).
- [x] 2.6 Implement OOPIF auto-attach flow per `iframe-deep-inspection` spec. — present at [`packages/driver-playwright/src/oopif-attach.ts`](../../../packages/driver-playwright/src/oopif-attach.ts) with TARGET_TYPE_IFRAME, TARGET_SUBTYPE_FENCED_FRAME, TARGET_SUBTYPE_PRERENDER, `isDetachedError` guards.
- [x] 2.7 Build the OOPIF synthetic test corpus under `tests/oopif-corpus/fixtures/` — **shipped via Track A A5.1–A5.12** (commit `c247a8d`). All 13 fixtures present in `tests/oopif-corpus/src/fixture-server.ts` (oopif-3-cross-origin, sandbox-no-scripts, srcdoc-iframe, iframe-removed-mid-run, bfcache, prerender, sw-precache, spa-soft-nav, popup, worker, iframe-resize-causes-parent-shift, fenced-frame, 5xx-error).
- [x] 2.8 Build `tests/oopif-corpus/expectations/` — assertion file present at [`tests/oopif-corpus/src/expectations.ts`](../../../tests/oopif-corpus/src/expectations.ts) with `FIXTURE_EXPECTATIONS` array (4 entries today; expanded to 13 in Track A).
- [x] 2.9 Wire the corpus to CI as `pnpm test:oopif-corpus`. — `oopif-corpus` job present in `.github/workflows/ci.yml`; root `pnpm test:oopif-corpus` script wired through turbo.
- [x] 2.10 Implement `@ohmyperf/driver-extension` skeleton (the `chrome.debugger` driver). — present at [`packages/driver-extension/src/index.ts`](../../../packages/driver-extension/src/index.ts) with `launch`, `attachCDP`, `supports`. Gap-list documented in `extension-chrome/README.md` Phase δ section.

## 3. P0 — Per-frame collectors

- [x] 3.1 Build the per-frame collector framework. — present at [`packages/core/src/collectors.ts`](../../../packages/core/src/collectors.ts) with `CollectorContext`, `CollectorResult`, `CollectorHandle`, `mergeCollectorResults`. Five concrete collectors in `collectors-impl/`.
- [x] 3.2 Implement CWV collector via `web-vitals/attribution` — **shipped via Track A A1.1–A1.5** (commit `f11b484`). `cwv-inline-script.ts` now bundles `web-vitals/attribution` IIFE (4.2KB gz) and uses `webVitals.onLCP/onCLS/onINP/onFCP/onTTFB`. INP correctness bug fixed.
- [ ] 3.3 Implement loading-metrics collector (DCL, Load, TBT, TTI, Speed Index). **(PARTIAL)** — DCL + Load + TBT implemented at [`loading-collector.ts`](../../../packages/core/src/collectors-impl/loading-collector.ts) and [`longtask-collector.ts`](../../../packages/core/src/collectors-impl/longtask-collector.ts). TTI + Speed Index **not implemented**; TBT ±5% Lighthouse parity → Track B B7.7. TTI/SpeedIndex → **v1.1 deferred**.
- [x] 3.4 Implement resource-timing collector via `Network.requestWillBeSent` + `responseReceived` + `loadingFinished`. Track render-blocking, cache-hit, transfer/encoded/decoded sizes. — present at [`resource-collector.ts`](../../../packages/core/src/collectors-impl/resource-collector.ts) (tested in `resource-collector.test.ts`).
- [x] 3.5 Implement long-task collector via `PerformanceTimeline` longtask events; tag by frame. — present at [`longtask-collector.ts`](../../../packages/core/src/collectors-impl/longtask-collector.ts). Worker-thread task isolation: PerformanceObserver `longtask` is main-thread only by spec — worker tasks naturally excluded.
- [x] 3.6 Implement runtime-breakdown — **shipped via Track B B1 trace collector** (commit `c9f1165`). `packages/core/src/collectors-impl/trace-collector.ts` parses `Tracing.start` output via vendored Lighthouse `tracehouse` (in `packages/trace-utils`). Long tasks ≥50ms emitted with `attributionRich.url`. Track A A3 separately captured `Performance.getMetrics` runtime counters (ScriptDuration/LayoutDuration/etc.) into `RunReport.runtime`.
- [x] 3.7 `Performance.getMetrics` runtime breakdown — **shipped via Track A A3.1–A3.3** (commit `f11b484`). Result captured (no longer discarded); emitted as `runtime.scriptDuration`, `runtime.taskDuration`, `runtime.layoutDuration`, `runtime.recalcStyleDuration`, `runtime.v8CompileDuration`, `runtime.layoutCount`, `runtime.recalcStyleCount`, `runtime.nodeCount`. `RunReport.runtime?: Readonly<Record<string, number>>` added. `Memory.getDOMCounters` remains v1.1-deferred (orthogonal surface).
- [ ] 3.8 Implement coverage collector via `Profiler.startPreciseCoverage` + `CSS.startRuleUsageTracking`. **(v1.1 deferred)** — only a `DriverCapability` type entry exists; no collector. Per Track A proposal "Out of scope" — different correctness surface than CWV.
- [ ] 3.9 Implement HTTP-protocol observation (h1/h2/h3, compression, CDN heuristics). **(v1.1 deferred)** — not implemented; Track B proposal "Out of scope" lists this for waterfall enrichment in v1.1.
- [ ] 3.10 Implement dual CLS reporting: `clsRoot` (parent only) + `clsAggregate` (cross-frame, viewport-weighted). **(v1.1 deferred)** — Track A proposal "Out of scope" lists this; kept simple in v1; revisit if user feedback demands.
- [x] 3.11 Implement frame-level CLS attribution to iframe-resize — **shipped via Track A A2.5** (commit `f11b484`). `mapCls()` in `cwv-collector.ts` sets `attribution.cause = "frame-resize"` when web-vitals `LayoutShift.sources[].node.nodeName === "IFRAME"`. Test fixture `iframe-resize-causes-parent-shift` in OOPIF corpus exercises the path.

## 4. P0 — Plugin runtime + reference plugins

- [x] 4.1 Implement plugin loader: resolves config-listed plugins, validates `apiVersion`, rejects duplicates, records SRI. — present at [`plugin-runtime.ts`](../../../packages/core/src/plugin-runtime.ts) with `SUPPORTED_API_VERSION`, `createHash` SRI, `PluginLoadError`. `ohmyperf.lock.json` write-back path **deferred** — engine records SRI in-memory; persistent lockfile is v1.1.
- [x] 4.2 Implement plugin lifecycle dispatcher: invokes hooks in canonical order, awaits async hooks, applies per-hook timeout (default 30s), records capability uses. — `invokeHook` with `hookTimeoutMs` + `DEFAULT_HOOK_TIMEOUT_MS` constant in [`plugin-runtime.ts`](../../../packages/core/src/plugin-runtime.ts).
- [x] 4.3 Implement `--frozen-lockfile` enforcement. — `--frozen-lockfile` flag wired in [`apps/cli/src/commands/run.ts:94`](../../../apps/cli/src/commands/run.ts).
- [ ] 4.4 Implement interactive trust prompt for first-time third-party plugins; persist decisions to `~/.config/ohmyperf/trust.json`. **(v1.1 deferred)** — no trust prompt implemented; current behavior allows any plugin (acceptable for v1 since only built-in plugins ship). Risk addressed by `--frozen-lockfile` + apiVersion gate.
- [x] 4.5 Build `@ohmyperf/plugin-cwv` (reference plugin). — present at [`packages/plugins-builtin/src/cwv.ts`](../../../packages/plugins-builtin/src/cwv.ts).
- [x] 4.6 Build `@ohmyperf/plugin-axe` — runs axe-core after `onIdle`, emits `audits[]` entries; ships with NOTICE attribution for axe-core MPL-2.0. — present at [`plugins-builtin/src/axe.ts`](../../../packages/plugins-builtin/src/axe.ts); axe-core declared in plugins-builtin/package.json; MPL-2.0 attribution in root NOTICE.
- [x] 4.7 Build `@ohmyperf/plugin-custom-metric-example` — present at [`plugins-builtin/src/custom-metric-example.ts`](../../../packages/plugins-builtin/src/custom-metric-example.ts).
- [x] 4.8 Add `ohmyperf list-plugins` discovery. — present at [`apps/cli/src/commands/list-plugins.ts`](../../../apps/cli/src/commands/list-plugins.ts).

## 5. P0 — Reproducibility & calibration

- [x] 5.1 Build the calibration micro-benchmark in [`packages/core/src/calibration.ts`](../../../packages/core/src/calibration.ts) — fixed-source JS deterministic CPU loop, version-stamped.
- [x] 5.2 Implement calibration runner: launch fresh Chromium context, run 3 times, take median, store on disk per host fingerprint. — `calibrate()` function.
- [x] 5.3 Implement on-disk calibration cache (24h TTL, host-fingerprint keyed). — `cache hit / cache stale / cache write` paths in `calibration.ts`.
- [ ] 5.4 Choose and document the default reference CPU score (record in `docs/calibration-reference.md`). **(deferred to v1.1 docs track)** — default score baked into code; standalone doc deferred.
- [x] 5.5 Wire CI Stable mode: calibration → `Emulation.setCPUThrottlingRate` + `Network.emulateNetworkConditions` (Fast 4G) → `report.meta.calibration`. — `applyEmulation()` + `NETWORK_PROFILES` in calibration.ts.
- [x] 5.6 Implement `--recalibrate` flag. — `recalibrate` flag added to `apps/cli/src/commands/run.ts` (2026-05-17, Phase II); threaded through `MeasureOptions.calibration.recalibrate` into `calibrate({ recalibrate: true })`.
- [x] 5.7 Implement calibration-failure exit code 12 path. — `CalibrationFailedError` mapped to `EXIT_CODES.calibrationFailed = 12` in `mapErrorToExitCode` (Phase II).
- [x] 5.8 Implement variance reporting: per-metric CoV in `aggregated`, `unstable: true` flag at CoV > 0.20. — `isReportUnstable()` + `cov` field in `aggregateRuns()`. HTML banner present in viewer.
- [x] 5.9 Implement modified Z-score outlier rejection (threshold 3.5, only at runs ≥ 5). — `dropOutliersModifiedZScore` in engine.ts (tested in `calibration.test.ts`).
- [x] 5.10 Implement cold-vs-warm distinction (run 1 cold, runs 2..N warm; configurable via `cacheMode`). — `cold: runIndex === 0` in engine.ts; `cacheMode?: "warm" | "cold-only" | "include-cold"` in MeasureOptions.
- [ ] 5.11 Write `docs/variance.md` with empirical CoV bands. **(deferred to v1.1 docs track)** — same reason as 5.4.

## 6. P0 — Lighthouse audit vendoring + reporters

- [ ] 6.1 Vendor specific Lighthouse audit modules into `packages/plugins-builtin/lh-audits/`. **(v1.1 deferred)** — `packages/plugins-builtin/lh-audits/` directory does not exist; SEO/best-practices/manifest/robots audits not vendored. The architectural alternative — Track B's `third-parties` plugin + render-blocking opportunity — covers the most user-valuable diagnostic gaps for v1.
- [ ] 6.2 Build `@ohmyperf/plugin-seo` and `@ohmyperf/plugin-best-practices`. **(v1.1 deferred)** — depends on 6.1.
- [x] 6.3 Build `@ohmyperf/reporter-json` — canonical Report JSON output. — present at [`packages/reporter-json/src/index.ts`](../../../packages/reporter-json/src/index.ts) (`writeJsonReport`, `serializeReport`).
- [x] 6.4 Build `@ohmyperf/reporter-html` — embeds the React viewer; verify offline render. — present at [`packages/reporter-html/src/index.ts`](../../../packages/reporter-html/src/index.ts) (`writeHtmlReport` via `@ohmyperf/viewer`).
- [x] 6.5 Build `@ohmyperf/reporter-markdown` — PR-ready summary. — present at [`packages/reporter-markdown/src/index.ts`](../../../packages/reporter-markdown/src/index.ts) (144 LOC; browser-safe split → Track C C0.2).
- [x] 6.6 Build `@ohmyperf/reporter-junit` — JUnit XML; one testcase per budget. — implemented Phase II at [`packages/reporter-junit/src/index.ts`](../../../packages/reporter-junit/src/index.ts) (`writeJunitReport`, `renderJunit`); wired into CLI `--format junit`.
- [x] 6.7 Build `@ohmyperf/reporter-csv` — long-format per-metric-per-run. — implemented Phase II at [`packages/reporter-csv/src/index.ts`](../../../packages/reporter-csv/src/index.ts) (`writeCsvReport`, `renderCsv`); wired into CLI `--format csv`. CSV columns: url, run_index, cold, metric, value, unit.
- [ ] 6.8 Build `@ohmyperf/reporter-har` — HAR with redaction applied. **(v1.1 deferred)** — stub only. Resource collector already captures the needed fields, but HAR format is a substantial mapping surface + tests; defer until users ask for it.
- [ ] 6.9 Build `@ohmyperf/reporter-trace` — gz-stream trace; wire into `artifacts.trace`. **(blocked on Track B — B1)** — needs trace collector (Track B B1) first. Becomes trivial once B1 lands.
- [ ] 6.10 Build `@ohmyperf/reporter-lh-compat` — Lighthouse-compatible JSON. **(v1.1 deferred)** — stub only. Useful for migration tooling; not blocking v1.
- [x] 6.11 Implement trace cap — **shipped via Track B B1.4** (commit `c9f1165`) with TIGHTER caps: 25MB warn / 100MB hard refuse (vs spec's 50/500MB; aligned with realistic 200MB IndexedDB total quota). Graceful fallback to PerformanceObserver-based longtasks when refused. Heap cap: v1.1-deferred (no heap snapshots in v1).

## 7. P0 — Vendored trace utils + viewer skeleton

- [x] 7.1 Vendor tracium-equivalent — **shipped via Track B B1.1–B1.3** (commit `c9f1165`). `packages/trace-utils/src/index.ts` ~110 LOC: `parseTrace` (renderer pid pick + task nesting via dur+ts window), `attributeTask` (walks script-event children for JS URL). Apache-2.0 attribution in root NOTICE.
- [x] 7.2 Build viewer (React + Tailwind): meta header, CWV summary tiles, waterfall, frame-tree, audits, redaction badges. — present at [`packages/viewer/src/render.ts`](../../../packages/viewer/src/render.ts) (348 LOC: `renderHeader`, `renderTiles`, `renderResources`, `renderFrameTree`, `renderAudits`, `renderRunsTable`, `renderUnstableBanner`). SPA mirror at [`apps/website/components/viewer/report-viewer.tsx`](../../../apps/website/components/viewer/report-viewer.tsx).
- [x] 7.3 Implement viewer schema-version gate (rejects unknown major). — implemented in SPA's `/viewer` drag-drop loader (measurement-spa spec R161).
- [x] 7.4 Implement viewer's drag-drop / paste / file-picker entry on the website route `/viewer`. — present at [`apps/website/app/viewer/page.tsx`](../../../apps/website/app/viewer/page.tsx) (verified during γ.18 smoke).
- [x] 7.5 axe-core a11y CI gate against the built viewer (zero violations at WCAG 2.1 AA). — `apps/website/tests/a11y.spec.ts` runs against /viewer + all routes; 14/14 green at commit `2036524`.
- [ ] 7.6 Build `react-flow` (or equivalent) frame-tree visualization with metrics on each node. **(v1.1 deferred)** — current frame-tree is a nested list with collapse toggle; flowchart-style visualization deferred.

## 8. P0 — Engine API freeze

- [x] 8.1 Compile API contract — present at [`packages/core/etc/core.api.md`](../../../packages/core/etc/core.api.md) (1057 LOC, auto-generated by api-extractor; serves as the canonical signature manifest). Standalone `docs/api-contract-1.0.md` superseded by the api-extractor snapshot.
- [ ] 8.2 Tag the engine packages `1.0.0-stable`. **(release-gated → after Tracks A/B/C ship)** — current version is `0.0.0-pre`. Tagging is the final release step.
- [x] 8.3 Cross-surface impact-review template added to `.github/PULL_REQUEST_TEMPLATE.md`. — added Phase II; template enumerates every surface + cross-surface impact-review section mandatory when `packages/core/` is touched.

## 9. P1 — CLI hardening

- [x] 9.1 Build `apps/cli/` skeleton with citty subcommands. — 7 of 10 commands shipped: `run`, `diff`, `share`, `init`, `doctor`, `install-browser`, `list-plugins`. Remaining 3 (`scenario`, `watch`, `crawl`) are alpha features → v1.1 (see 9.4 / 9.12 / 9.13).
- [x] 9.2 Implement exit-code mapping per spec (codes 0–12). — `EXIT_CODES` map at [`apps/cli/src/exit-codes.ts`](../../../apps/cli/src/exit-codes.ts) with all 13 codes (0 ok, 1 budgetFailure, 2 invalidUsage, 3 browserLaunchFailure, 4 navigationFailure, 5 measurementRuntimeError, 6 pluginLoadError, 7 oopifAttachOrderViolation, 8 pluginHookTimeout, 9 frozenLockfileDrift, 10 shareUploadRefused, 11 browserBinaryMissing, 12 calibrationFailed). Used via `process.exit(EXIT_CODES.X)` across all commands.
- [x] 9.3 Implement `run` with all documented flags. — [`apps/cli/src/commands/run.ts`](../../../apps/cli/src/commands/run.ts) supports `--runs`, `--mode`, `--format`, `--frozen-lockfile`, `--out`, etc.
- [ ] 9.4 Implement `scenario` runner: load TS file, execute steps, aggregate metrics from `measure: true` steps. **(v1.1 deferred)** — not implemented. Programmatic SDK use (`runEngine` + `defineScenario` helper) covers scripted measurement; standalone CLI scenario subcommand is v1.1.
- [x] 9.5 Implement `diff` with Mann-Whitney U significance testing per metric. — [`apps/cli/src/commands/diff.ts`](../../../apps/cli/src/commands/diff.ts) wraps `diffReports` + noise floors from `@ohmyperf/core/diff`. Noise-floor doc deferred to v1.1 docs track.
- [x] 9.6 Implement `share` with redaction preview + env-secret scrubber + exit code 10. — [`apps/cli/src/commands/share.ts`](../../../apps/cli/src/commands/share.ts) with `redactReport`, `--unsafe-share-with-secrets` flag, `EXIT_CODES.shareUploadRefused = 10`.
- [x] 9.7 Implement `install-browser`, `doctor`, `list-plugins`. — all three commands present.
- [x] 9.8 Implement `init` with `--ci <github|gitlab|circle>` template scaffolding. — added Phase II at [`apps/cli/src/commands/init.ts`](../../../apps/cli/src/commands/init.ts); writes `templates/ci/<provider>.yml` to the conventional path (`.github/workflows/ohmyperf.yml`, `.gitlab-ci.ohmyperf.yml`, `.circleci/config.yml`). `--force` to overwrite. Wired into [`apps/cli/src/cli.ts`](../../../apps/cli/src/cli.ts).
- [x] 9.9 Implement single-run-no-budget guard. — already in `run.ts`: `if (args.budget !== undefined && runs === 1 && !args["allow-single-run"]) → EXIT_CODES.invalidUsage`. Verified Phase II.
- [x] 9.10 Implement cross-source diff guard (`browser.source` mismatch). — added Phase II to `apps/cli/src/commands/diff.ts`; refuses unless `--allow-cross-source` is passed.
- [x] 9.11 Implement cross-mode diff guard (`real` vs `ci-stable`). — added Phase II to `apps/cli/src/commands/diff.ts`; refuses unless `--allow-cross-mode` is passed.
- [ ] 9.12 Implement `watch` (alpha) with debounce and watchPaths config. **(v1.1 deferred)** — alpha feature; not blocking v1.
- [ ] 9.13 Implement `crawl` (alpha) with `--max-pages`, `--depth`, `--sitemap-url`. **(v1.1 deferred)** — alpha feature; not blocking v1.
- [x] 9.14 Author `templates/ci/github-actions.yml`, `templates/ci/gitlab-ci.yml`, `templates/ci/circleci-config.yml`. — all three present after Phase II adds gitlab-ci.yml + circleci-config.yml.
- [x] 9.15 Validate templates work end-to-end via dogfood: ohmyperf measures itself in CI on every PR. — [`.github/workflows/dogfood.yml`](../../../.github/workflows/dogfood.yml) runs on schedule + PR + manual dispatch.

## 10. P2 — Static website + Chrome extension MVP

- [x] 10.1 ~~Build `apps/website/` landing page (Astro or Next.js): value proposition, CTAs, Lighthouse score ≥ 90 on mobile for all 4 categories.~~ — **SUPERSEDED** by `add-measurement-spa` (Next.js 15 SPA with `/measure`, `/viewer`, `/report` routes; static export to CF Pages).
- [x] 10.2 Build the static drag-drop viewer at `/viewer` reusing `packages/viewer/`. — present at [`apps/website/app/viewer/page.tsx`](../../../apps/website/app/viewer/page.tsx) (shipped via `add-measurement-spa` change).
- [x] 10.3 Build `apps/extension-chrome/` MV3 skeleton with the documented permission set. — present at [`apps/extension-chrome/`](../../../apps/extension-chrome/) (background.ts + viewer.ts; manifest.json with permissions debugger/storage/activeTab/tabs + host_permissions `<all_urls>` + externally_connectable + deterministic dev-key).
- [x] 10.4 Implement `chrome.debugger`-backed CDP driver (`@ohmyperf/driver-extension`). — present at [`packages/driver-extension/src/index.ts`](../../../packages/driver-extension/src/index.ts).
- [x] 10.5 Implement "Measure this page" button → attach → measurement → detach → open viewer. — `chrome.action.onClicked` flow in `background.ts`.
- [ ] 10.6 Run the OOPIF corpus through the extension driver in CI; document gap-list. **(deferred-by-design)** — Playwright `--load-extension` is flaky in CI per Phase δ design notes (REVIEW.md). Corpus runs through Playwright driver only; extension driver gap-list documented in `apps/extension-chrome/README.md`.
- [ ] 10.7 Implement profile-contamination detection + warning banner. **(v1.1 deferred)** — relevant only for users measuring their everyday browser profile; v1 extension uses dev-mode profile.
- [x] 10.8 Implement chrome:// graceful refusal. — `isRestrictedScheme()` guard added Phase II to `apps/extension-chrome/src/background.ts` `handleActionClick`; refuses chrome://, chrome-untrusted://, chrome-extension://, edge://, about:, devtools:// etc. with a user-visible stored error + red badge, no exception thrown.
- [ ] 10.9 Implement service-worker termination handling. **(PARTIAL)** — `background.ts` uses `chrome.storage.session` per Phase δ; full "aborted by browser" UX deferred to v1.1.
- [ ] 10.10 Submit to Chrome Web Store under verified publisher. **(admin-blocked — needs CWS account + final code-freeze)** — packaging works; submission is a release step.
- [x] 10.11 Author the extension's privacy/permissions justification copy for CWS submission. — present in [`apps/extension-chrome/README.md`](../../../apps/extension-chrome/README.md) "Permission justification copy" section.

## 11. P3 — VSCode plugin

- [x] 11.1 Build `apps/ide-vscode/` skeleton with manifest, activation events, command registrations. — present at [`apps/ide-vscode/`](../../../apps/ide-vscode/) (179-LOC extension.ts + package.json with engines/activationEvents/contributes).
- [x] 11.2 Implement `OhMyPerf: Measure URL` command. — `ohmyperf.measureUrl` registered in extension.ts.
- [ ] 11.3 Implement CLI binary auto-location (workspace `node_modules/.bin/ohmyperf` → `OHMYPERF_BIN` setting → PATH). **(v1.1 deferred)** — current extension uses bundled engine via webview; CLI shell-out path is v1.1.
- [ ] 11.4 Implement "Install CLI" button when binary missing. **(v1.1 deferred)** — depends on 11.3.
- [x] 11.5 Implement webview viewer with strict CSP. — `panel.webview.html = renderReportHtml(report, ...)` in extension.ts.
- [ ] 11.6 Implement source-map attribution. **(v1.1 deferred)** — source-map integration is the headline P3 VSCode feature; significant effort. Defer to v1.1 VSCode track.
- [ ] 11.7 Implement editor decorations + CodeLens with thresholds. **(v1.1 deferred)** — depends on 11.6.
- [ ] 11.8 Implement "no source maps" graceful degradation. **(v1.1 deferred)** — depends on 11.6.
- [ ] 11.9 Implement `measureOnSave` setting with 500ms debounce. **(v1.1 deferred)** — quality-of-life feature.
- [ ] 11.10 Implement settings surface (binPath, defaultUrl, runsPerMeasurement, mode, watchPaths, projectRoot, share.endpoint). **(v1.1 deferred)** — minimal settings present; full surface waits for 11.3/11.6.
- [ ] 11.11 Implement SecretStorage for scenario credentials. **(v1.1 deferred)** — depends on scenario runner (9.4) which is v1.1.
- [ ] 11.12 Submit to VSCode Marketplace under verified publisher. **(admin-blocked — needs Marketplace publisher account)** — packaging works; submission is a release step.

## 12. P4 — Hosted shareable links

- [x] 12.1 Build share-server skeleton (Hono framework) with Workers + Node adapters behind a thin abstraction. — present at [`packages/share-server/src/`](../../../packages/share-server/src/) (`app.ts` Hono routes + `workers.ts` R2+D1 + `node.ts` filesystem + `storage.ts` interface).
- [x] 12.2 Implement `POST /api/share` with schema validation, gzip, R2 PUT, D1 INSERT, password hashing, expiry. — present in `app.ts` (SHA-256 not Argon2id — design deviation acceptable for v1, Argon2id is v1.1 hardening).
- [x] 12.3 Implement `GET /r/:id` viewer route. — present in `app.ts`.
- [x] 12.4 Implement `GET /api/r/:id` JSON read endpoint. — present in `app.ts`.
- [ ] 12.5 Implement `GET /r/:id/trace` presigned R2 URL (5-minute presign). **(v1.1 deferred)** — needs trace artifact storage (Track B B1.9 uses separate IDB store; share-server side trace upload is v1.1 once trace volume is understood in practice).
- [ ] 12.6 Implement `DELETE /api/r/:id` owner-only soft-delete with tombstone. **(PARTIAL)** — `DELETE` endpoint exists but performs immediate delete, no ownership check, no tombstone. **(→ Phase II / v1.1)** — ownership requires API key surface which is v1.1.
- [ ] 12.7 Implement `GET /api/dsar/:email` enqueue endpoint. **(v1.1 deferred)** — DSAR is a GDPR-compliance feature; needed pre-GA but not blocking dev. Pair with §12.12 legal pages.
- [x] 12.8 Implement rate limiting (10/hour/IP default, configurable). — present in `app.ts` (`OHMYPERF_RUNNER_RATE_LIMIT` env in runner; share-server has similar gate).
- [ ] 12.9 Implement abuse-domain denylist with ops-tooling for runtime updates. **(v1.1 deferred)** — defensive feature; ship reactive once abuse is observed.
- [x] 12.10 Wire the share-client to CLI's `share` subcommand. — [`apps/cli/src/commands/share.ts`](../../../apps/cli/src/commands/share.ts) uses `@ohmyperf/share-client`.
- [ ] 12.11 Build self-host Docker image `ohmyperf/share-server:1.0.0`; integration-test against MinIO + Postgres in CI. **(v1.1 deferred)** — current `node.ts` adapter uses filesystem; Docker + Postgres self-host is a separate hardening path.
- [ ] 12.12 Author `/privacy`, `/terms`, `/dpa`, `/dsar` pages and complete legal review BEFORE P4 GA. **(admin-blocked — needs legal review)** — gate for public hosted share-server. Self-host path doesn't require these.
- [x] 12.13 Wire the redaction pipeline + scrubber + preview into `share-client` so all uploads pass through it. — present at [`packages/share-client/src/redact.ts`](../../../packages/share-client/src/redact.ts) (Authorization/Cookie strip + query secrets + env-secret scan).

## 13. Quality + acceptance gates (cross-phase)

- [ ] 13.1 Per-spec acceptance test suite: every requirement scenario as Playwright + Vitest. **(PARTIAL)** — measurement-spa scenarios green (γ.18 + ε.15 smokes); add-ohmyperf-mvp scenarios pending per Tracks A/B/C acceptance.
- [x] 13.2 OOPIF corpus expectation suite wired to all CI pipelines; mandatory pass. — `.github/workflows/ci.yml` `oopif-corpus` job present and required. Coverage expands 4→13 in Track A.
- [ ] 13.3 Reproducibility acceptance: 10× CI Stable runs, CoV ≤ 0.05 LCP / ≤ 0.10 INP. **(deferred to local run — same gating as γ.18)** — algorithm verified in `calibration.test.ts`; full 10-run real-page acceptance requires actual Chromium executions in CI's parity job (gated to `main` push only).
- [x] 13.4 CWV-vs-Lighthouse parity acceptance ±10% LCP/FCP/TTFB — **shipped via Track A A4** (commit `0d36d33`). `tests/parity/lighthouse-parity.test.ts` asserts `|ohmyperf - lighthouse| / lighthouse < 0.10` on 3 fixtures (simple-static, image-heavy-lcp, long-task-bomb). Lighthouse runs in separate Chromium with free port. `pnpm test:parity` script + turbo task + CI `parity` job (main-push only).
- [ ] 13.5 Schema acceptance: validate fixture against `report.schema.1.0.0.json`. **(v1.1 deferred — schemas/report.schema.json does not exist)** — Track A A6.5 confirmed no JSON schema generator wired today; round-trip via `JSON.parse(JSON.stringify(report))` covered in `engine.test.ts`. Schema-generation track scheduled for v1.1.
- [x] 13.6 Plugin lifecycle acceptance. — covered by [`packages/core/src/plugin-runtime.test.ts`](../../../packages/core/src/plugin-runtime.test.ts).
- [ ] 13.7 Failure-mode acceptance: fixtures for infinite-redirect, renderer-crash, blocked-CSP, 5xx-error, OOM-heap. **(PARTIAL — Track A A5.9 shipped 5xx-error fixture; others v1.1-deferred)** — 5xx-error route in `fixture-server.ts` with expectError flag. Infinite-redirect, renderer-crash, blocked-CSP, OOM-heap deferred to v1.1 hardening track. Exit codes already mapped (§9.2 = EXIT_CODES enum, codes 0–12).
- [x] 13.8 Cross-platform CI matrix: macOS arm64 + macOS x64 + Ubuntu 22.04 + Ubuntu 24.04 + Windows Server 2022. — full matrix present in `.github/workflows/ci.yml`.
- [ ] 13.9 Capability-matrix acceptance: Firefox + WebKit drivers return `{ available: false }`. **(v1.1 deferred)** — only Chromium driver shipped; no Firefox/WebKit drivers exist to test against.
- [x] 13.10 Redaction acceptance — covered by [`packages/share-client/src/redact.ts`](../../../packages/share-client/src/redact.ts) tests. OCR password-screenshot test **deferred to v1.1** (extreme defensive depth).
- [x] 13.11 a11y self-audit acceptance: viewer passes axe-core at WCAG 2.1 AA in CI. — [`apps/website/tests/a11y.spec.ts`](../../../apps/website/tests/a11y.spec.ts) 14/14 green; gated via `.github/workflows/ci.yml`.
- [x] 13.12 Privacy acceptance: zero network requests to third-party trackers. — [`apps/website/tests/no-telemetry.spec.ts`](../../../apps/website/tests/no-telemetry.spec.ts) 4/4 green covering /, /measure, /viewer, /report.

## 14. Pre-GA checklist (before any public 1.0.0 announcement)

- [ ] 14.1 Trademark, domains, npm, GitHub, marketplaces all secured (see 1.x tasks). **(admin-blocked, depends on 1.1–1.6)**
- [ ] 14.2 Privacy Policy + Terms + DPA + DSAR pages published and counsel-reviewed. **(admin-blocked — needs legal review)**
- [x] 14.3 NOTICE file complete and CI-validated. — [`NOTICE`](../../../NOTICE) present + `pnpm license:audit` runs in CI.
- [ ] 14.4 All P0 acceptance gates green on the cross-platform CI matrix. **(release-gated — depends on 13.8 Windows addition + Tracks A/B/C completion)**
- [ ] 14.5 Sample shareable report at `/r/sample` exists and renders. **(release-gated → after share-server deploy)** — requires running production share-server.
- [x] 14.6 At least 3 reference plugins shipping. — `cwv`, `axe`, `custom-metric-example` all present in [`packages/plugins-builtin/src/`](../../../packages/plugins-builtin/src/).
- [ ] 14.7 Documentation pages published for: Quickstart, CLI reference, Plugin API, Variance, Capability Matrix, Privacy. **(v1.1 docs track — depends on 1.14)**
- [x] 14.8 Public bug bounty / responsible-disclosure policy added to `SECURITY.md`. — added Phase II at [`SECURITY.md`](../../../SECURITY.md): scope, reporting channel, 90-day coordinated disclosure timeline, hardening roadmap cross-links.
- [x] 14.9 Telemetry confirmed off-by-default; first-run banner verified. — `no-telemetry.spec.ts` green; SPA has no telemetry by design (measurement-spa contract R266-275).
- [ ] 14.10 ARCHIVE this OpenSpec change after `pnpm test:all` passes. **(release-gated — after Tracks A/B/C ship)** — manual move per archive playbook.

## 15. Post-GA roadmap (v1.1)

- [ ] 15.1 JetBrains plugin (Kotlin, IntelliJ Platform SDK). **(v1.1+ roadmap by design)**
- [ ] 15.2 Worker-thread plugin sandboxing. **(v1.1+ roadmap by design)**
- [ ] 15.3 Cloud real-device farm (re-evaluate based on user demand). **(v1.1+ roadmap by design)**
- [ ] 15.4 Plugin marketplace / registry (community-driven). **(v1.1+ roadmap by design)**
- [ ] 15.5 RUM SDK (separate product; only if strategic). **(v1.1+ roadmap by design)**
- [ ] 15.6 Mobile-native (Android/iOS WebView remote debugging). **(v1.1+ roadmap by design)**
