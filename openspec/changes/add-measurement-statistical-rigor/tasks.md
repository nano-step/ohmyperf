# Tasks: Measurement Statistical Rigor (v2 Track #1)

Each `M*` task is intended to be its own commit using:
`git -c user.name="Hoài Nhớ" -c user.email="nhoxtvt@gmail.com" commit -m "..."`. Identity is per-commit, NEVER `--local`.

## M0. Pre-flight — types, deps, taxonomy version

- [ ] **M0.1** Add `safe-stable-stringify@^2.4.3` to `packages/core/package.json` `dependencies`. Run `pnpm install` at root. Verify install adds zero transitives.
- [ ] **M0.2** Add `TAXONOMY_VERSION = '1.0.0'` constant to `packages/core/src/index.ts`. Export from index. Document bump policy in a top-of-file JSDoc.
- [ ] **M0.3** Extend `packages/core/src/types.ts` with additive-optional fields ONLY:
  - `ReportMeta.sampling?: SamplingMeta` (fields per spec R1.5)
  - `ReportMeta.crux?: CruxMeta` (fields per spec R2: `{ available, granularity, formFactor, fetchedAt?, reason?, p75?, representativenessScore? }`; `reason ∈ 'no-api-key' | 'not-in-dataset' | 'fetch-error'` when `available === false`)
  - `ReportMeta.captureFingerprint?: string`
  - `ReportMeta.taxonomyVersion?: string`
  - New `Report.diagnostics?: { measurementOverhead?: OverheadDiagnostic; warnings?: ReadonlyArray<DiagnosticWarning> }`
  - `Metric.corrected?: { value: number; method: 'ghost-paired-median'; overheadMs: number }`
  - `MeasureOptions.sampling?: SamplingConfig`
  - `MeasureOptions.ghostRun?: boolean`
  - `MeasureOptions.crux?: CruxOptions`
  - New type alias `RunMode = 'instrumented' | 'ghost'`
  - Extend `RunCtx` with `readonly mode?: RunMode` (OPTIONAL — consumers MUST treat `undefined` as `'instrumented'` for backward compat with any third-party collector that builds a `RunCtx` literal).
  - Extend `RunReport` with `readonly mode?: RunMode` (top-level, NOT under `RunReport.runtime` because `runtime` is `Readonly<Record<string, number>>` and cannot host an enum).
- [ ] **M0.4** Run `pnpm typecheck` — every package must still compile because all new fields are optional.
- [ ] **M0.5** Audit every consumer of `report.meta.*` and `metrics.X.*` in `apps/website/components/viewer/report-viewer.tsx` and `packages/viewer/src/render.ts`. Add defensive `?.` chains where new optional fields will be read by v1.1+ rendering code. (No new rendering yet — just hardening.)

## M1. SPRT + bootstrap CI sampler module

- [ ] **M1.1** Create `packages/core/src/sampling.ts` exporting:
  - `interface SamplingConfig { mode: 'fixed' | 'sprt' | 'bootstrap-ci'; runs?: number; mde?: number; alpha?: number; beta?: number; nMax?: number; ciTargetWidth?: number; nBoot?: number; seed?: number; metric?: 'lcp'; }`
  - `interface Sampler { shouldContinue(runs: ReadonlyArray<RunReport>): boolean; nextMode(runs: ReadonlyArray<RunReport>): RunMode; stopReason(runs: ReadonlyArray<RunReport>): SamplingStopReason; describe(runs: ReadonlyArray<RunReport>): SamplingMeta; }`
  - `function createSampler(config: SamplingConfig | undefined, opts: { ghostRun: boolean }): Sampler`
  - Internal: `welford`, `llrNormalMean(samples, mde, sigma)`, `bootstrapCi(samples, { nBoot, seed })`, `mulberry32(seed)`.
- [ ] **M1.2** Implement `fixed` mode: ignores SPRT math entirely; iterates exactly `config.runs ?? 5` times. Backward-compatible default when `config` undefined.
- [ ] **M1.3** Implement `sprt` mode (LCP-only): per spec R1.1–R1.4. Welford running variance with prior `σ₀ = 15ms` until n ≥ 5; floor `σ_min = 5ms`. LLR for normal-mean test, α=β=0.05 default, MDE=0.05 default. Stop conditions: LLR > log((1-β)/α) → `sprt-h1`; LLR < log(β/(1-α)) → `sprt-h0`; n ≥ N_max (default 30) → `cap`.
- [ ] **M1.4** Implement `bootstrap-ci` mode: per spec R1.6. After n ≥ 4 runs, compute percentile-bootstrap 90% CI on LCP medians with `nBoot = 1000`, seeded `mulberry32(seed ?? 0xC0FFEE)`. Stop when CI width / point estimate < `ciTargetWidth ?? 0.05` OR n ≥ N_max.
- [ ] **M1.5** Implement `nextMode(runs)`: when `ghostRun: true` return alternating `'instrumented'`/`'ghost'` starting with `'instrumented'`; when `false` always `'instrumented'`. Ghost runs do NOT count toward SPRT N_max.
- [ ] **M1.6** Implement `describe(runs)` → `SamplingMeta` for `ReportMeta.sampling`: includes `nRunsInstrumented`, `nRunsGhost`, `stopReason`, and (when sprt) `mde`, `alpha`, `beta`, `sigmaEstimate`; or (when bootstrap-ci) `ciWidth`.
- [ ] **M1.7** Create `packages/core/src/sampling.test.ts` — Monte-Carlo unit tests against synthetic samples (V1/V2/V3) using the simulator and stop-reason assertions per spec R1.7–R1.10. No browser launches; pure-math fixtures only.

## M2. Engine run-loop refactor (consume sampler)

- [ ] **M2.1** In `packages/core/src/engine.ts`, replace the `for (let i = 0; i < runs; i++) { ... }` block (~line 124) with a `while (sampler.shouldContinue(runReports)) { const mode = sampler.nextMode(runReports); … }` loop. Preserve every existing collector hook, plugin lifecycle event, and `RunCtx` field; only the iteration driver changes.
- [ ] **M2.2** Build the `Sampler` via `createSampler(opts.sampling, { ghostRun: opts.ghostRun ?? false })`. Default behavior (no `opts.sampling`) MUST yield identical run count and ordering as the pre-change code path.
- [ ] **M2.3** Thread `mode` into `RunCtx`: extend the `RunCtx` factory inside `engine.ts` to set `mode` from the sampler. Default `'instrumented'`.
- [ ] **M2.4** After the loop, attach `report.meta.sampling = sampler.describe(runReports)`.
- [ ] **M2.5** Snapshot test: a measure call with no `sampling`/`ghostRun` config produces a Report byte-identical (ignoring timestamps) to the pre-refactor Report on the same fixture. Use existing `packages/core/src/engine.test.ts` style.

## M3. Ghost-mode collector branches

- [ ] **M3.1** In `packages/core/src/collectors-impl/cwv-collector.ts`, branch on `ctx.mode`:
  - `'instrumented'` (default): unchanged — inject `cwv-inline-script`, poll `window.__ohmyperfCwv`.
  - `'ghost'`: do NOT inject inline script; instead call `ctx.cdp.send('PerformanceTimeline.enable', { eventTypes: ['largest-contentful-paint'] })` on the root session, subscribe to `Performance.timelineEventAdded`, accept entries with `frameId === ctx.rootFrameId`. Emit a `Metric` for LCP with `value = entry.startTime + entry.duration` (matches the web-vitals LCP definition).
- [ ] **M3.2** In `packages/core/src/collectors-impl/loading-collector.ts`, leave `Performance.getMetrics` call unchanged in both modes (passive CDP, no PO injection).
- [ ] **M3.3** In `packages/core/src/collectors-impl/cwv-inline-script.ts`, no logic change required — upstream gates injection.
- [ ] **M3.4** In `packages/core/src/engine.ts` adapter call site (around `adapter.launchPageWithCdp`), if `mode === 'ghost'`, pass an option to the adapter or post-hoc disable `Target.setAutoAttach` for OOPIFs. (Document the exact mechanism in commit message; if adapter does not support per-call OOPIF flag, use `Target.setDiscoverTargets({discover:false})` on root session for the ghost run only.)
- [ ] **M3.5** Tests: extend `packages/core/src/engine.test.ts` with a mocked-driver test that asserts a ghost run does NOT call `Page.addScriptToEvaluateOnNewDocument` for the CWV inline script.

## M4. Ghost overhead aggregation

- [ ] **M4.1** In `packages/core/src/engine.ts` finalize (~line 329, before `report` is sealed), if any `RunReport.mode === 'ghost'` runs exist (or use `report.meta.sampling.nRunsGhost > 0`), compute:
  - `overhead_p50 = median(instrLcp[i] - ghostLcp[paired(i)])`
  - `overhead_p95 = p95(instrLcp[i] - ghostLcp[paired(i)])`
  - Pairing rule: by run index — instr[i] pairs with ghost[i] in interleaved ordering.
- [ ] **M4.2** Sanity gate: if `overhead_p50 < 0` OR `overhead_p50 > 200` → emit `report.diagnostics.warnings.push({ code: 'ghost_anomaly', message: '...' })` and DO NOT populate `metrics.lcp.corrected`.
- [ ] **M4.3** If sanity gate passes: set `metrics.lcp.corrected = { value: rawMedianLcp - overhead_p50, method: 'ghost-paired-median', overheadMs: overhead_p50 }` on the aggregated metric. Raw `metrics.lcp.value` MUST be untouched.
- [ ] **M4.4** Set `report.diagnostics.measurementOverhead = { lcp: { p50Ms, p95Ms, nInstr, nGhost } }`.
- [ ] **M4.5** Set `RunReport.mode` (top-level optional) to the `'instrumented' | 'ghost'` value the sampler picked for that run, so downstream consumers can split. (NOT under `RunReport.runtime` — that field is `Readonly<Record<string, number>>` and cannot host an enum string.)
- [ ] **M4.6** Unit test the pairing + overhead math with synthetic `RunReport[]` (no browser).

## M5. CrUX field anchor

- [ ] **M5.1** Create `packages/plugins-builtin/src/crux.ts` exporting `fetchCruxRecord({ origin, url?, formFactor, apiKey })`. Native `fetch` to `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=<apiKey>` with body `{ origin, url, formFactor }`. URL-specific lookup first; on 404 fall back to `{ origin, formFactor }`. Return `{ available, granularity, p75: { lcp?, inp?, cls? }, fetchedAt }`.
- [ ] **M5.2** Implement disk cache: dir = `${process.env.XDG_CACHE_HOME ?? path.join(homedir(), '.ohmyperf-cache')}/crux/`; file = `<sha256(origin + '|' + formFactor)>.json`; TTL 24h; atomic `writeFile(file + '.tmp')` then `rename`. Cache hit returns cached payload; miss fetches and writes.
- [ ] **M5.3** Implement `computeRepresentativeness({ labMetricP75, fieldMetricP75 })` → `max(0, 1 - |labMetricP75 - fieldMetricP75| / fieldMetricP75)`. v1 computes for LCP only.
- [ ] **M5.4** Integrate as a finalize hook in the engine: after `aggregateRuns`, if `opts.crux?.apiKey || process.env.OHMYPERF_CRUX_KEY` is present AND `opts.crux?.enabled !== false`, call `fetchCruxRecord` and populate `report.meta.crux`. Compute representativeness against the SPRT-decided lab LCP p75 (or raw if SPRT picked fixed mode). If score < 0.7, push `{ code: 'unrepresentative_lab', message: 'lab p75 LCP diverges from CrUX p75 by …' }` into `report.diagnostics.warnings`.
- [ ] **M5.5** When apiKey absent → `logger.info("crux: skipped (no api key)")` AND set `report.meta.crux = { available: false, granularity: 'unavailable', reason: 'no-api-key', formFactor }` so downstream readers can distinguish "intentionally skipped" from "feature missing". No warning, no error. On CrUX double-404 set `reason: 'not-in-dataset'`. On CrUX network/auth error set `reason: 'fetch-error'` plus an INFO log line; do NOT throw.
- [ ] **M5.6** Audit log surface: NEVER include `apiKey`, raw URL with query string, or pre-hash cache-key string in any log line.
- [ ] **M5.7** Tests in `packages/plugins-builtin/src/crux.test.ts` using `vi.mock('node:fetch')` (or `globalThis.fetch` stub): URL-200, URL-404→origin-200, both-404, cache hit/miss, atomic write semantics, score computation edge cases (fieldP75=0 → score=0 not NaN).

## M6. Provenance fingerprint

- [ ] **M6.1** Create `packages/core/src/fingerprint.ts` exporting `computeCaptureFingerprint(inputs: FingerprintInputs): string`. Inputs type: `{ url: string; calibration?: { observedScore: number; throttleRate: number }; configHash: string; ohmyperfVersion: string; taxonomyVersion: string }`. URL is pre-normalized via `sanitizeUrlForFingerprint(url)` which strips userinfo (`https://user:pass@host` → `https://host`) and lowercases the protocol+host. Returns `'sha256:' + crypto.createHash('sha256').update(stableStringify(inputs)).digest('hex')` where `stableStringify` is `safe-stable-stringify`.
- [ ] **M6.2** Compute `configHash = sha256(stableStringify({ runs: opts.runs, sampling: opts.sampling, ghostRun: opts.ghostRun, emulation: opts.emulation, mode: opts.mode, plugins: opts.plugins?.map(p => ({ id: normalizePluginId(p), version: refVersion(p) })).sort((a, b) => a.id.localeCompare(b.id)) }))`. Pure inputs only — no `Date.now()`, no `randomUUID()`, no run-time outputs. `normalizePluginId(p)` returns the plugin's `package.json` `name` field when `p` is a `Plugin` object; the string verbatim when `p` is a string ref; `ref.id` when `p` is `PluginRefByName`. This avoids `"@ohmyperf/cwv"` vs `"cwv"` ambiguity producing two fingerprints for the same config.
- [ ] **M6.3** Wire into `engine.ts` finalize: set `report.meta.captureFingerprint = computeCaptureFingerprint({ url: opts.url, calibration: calibration ? { observedScore, throttleRate } : undefined, configHash, ohmyperfVersion: PACKAGE_VERSION, taxonomyVersion: TAXONOMY_VERSION })`. Also set `report.meta.taxonomyVersion = TAXONOMY_VERSION`.
- [ ] **M6.4** Tests in `packages/core/src/fingerprint.test.ts`:
  - Determinism: 100 calls with identical inputs → identical hash.
  - Sensitivity: changing any one field changes the hash.
  - Map/Set/undefined handling via `safe-stable-stringify`: include a test that ensures plugin lists with different in-memory orderings still produce identical hashes (sorted by id).
  - URL with query string: hash includes the URL verbatim (we don't pre-sanitize); document.

## M7. Validation fixtures + integration tests

- [ ] **M7.1** Create `tests/rigor/fixtures/shift-8pct/a.html` and `b.html`. Both serve a single `<img>` LCP candidate; `b.html` adds a synchronous `<script>` that blocks for 80ms before the image starts loading. Verify offline that on a calibrated machine, median LCP delta is ~8% (80ms / 1000ms).
- [ ] **M7.2** Create `tests/rigor/fixtures/null-delta/a.html` and `b.html` — byte-identical. Confirms Δ=0 input distribution.
- [ ] **M7.3** Create `tests/rigor/fixtures/high-variance/a.html` — page that delays LCP via `setTimeout(injectImg, 800 + Math.random() * 400)` (σ ≈ 115ms; intentionally noisy to force SPRT to N_max).
- [ ] **M7.4** Create `tests/rigor/fixtures/ground-truth-paint/index.html` — empty body + `<script>setTimeout(() => { document.body.innerHTML = '<img src="data:image/png;base64,...">'; }, 1000);</script>`. Ground-truth LCP = 1000ms.
- [ ] **M7.5** Create `tests/rigor/sprt-detection.test.ts` (no browser, simulator only): 100 trials per fixture, generate synthetic per-run LCPs from a normal distribution matching each fixture's expected (μ, σ), feed to `createSampler`, assert:
  - V1: detected at N ∈ [8, 14] in ≥80% of trials with `mode: 'sprt'`; fixed-N=5 detects in ≤60% (≥20pp gap, statistically non-coincidental).
  - V2: `stopReason === 'sprt-h0'` in ≥80% of trials.
  - V3: `stopReason === 'cap'` reported in ≥90% of trials; no silent garbage.
- [ ] **M7.6** Create `tests/rigor/fingerprint-determinism.test.ts` (V7): 10 calls with identical synthetic `MeasureOptions` and pinned version constants → byte-identical fingerprint each time.
- [ ] **M7.7** Create `tests/rigor/ghost-truth-tracking.test.ts` (V4, V5; gated under `pnpm test:rigor:browser`): run OhMyPerf against `ground-truth-paint` with `{ sampling: { mode: 'sprt' }, ghostRun: true }`; assert `|metrics.lcp.corrected.value - 1000| < |lighthouseLcp - 1000|`. For V5, run a vanilla static page; assert no `ghost_anomaly` warning emitted.
- [ ] **M7.8** Add `pnpm test:rigor` (Monte-Carlo + determinism, no browser) and `pnpm test:rigor:browser` (V4/V5, browser-gated) scripts to root `package.json` and `turbo.json`.

## M8. Docs, API freeze, README

- [ ] **M8.1** Create `docs/measurement-rigor.md` covering:
  - SPRT methodology (LLR for normal-mean, α/β/MDE meanings, why LCP-only in v1)
  - Welford with prior + floor rationale
  - Why ghost runs are paired-interleaved
  - CrUX p75-vs-p75 derivation
  - `captureFingerprint` input list + `taxonomyVersion` bump policy
  - Reproduction steps for V1–V7
  - Known deltas vs Lighthouse on ground-truth fixture
- [ ] **M8.2** Run `pnpm api:check --filter @ohmyperf/core`. Confirm additive-only diff in `core.api.md` (only `+` lines for existing exports).
- [ ] **M8.3** Update `packages/core/etc/core.api.md` snapshot.
- [ ] **M8.4** Update root `README.md` Accuracy section: add one paragraph describing SPRT and ghost-corrected LCP, with a link to `docs/measurement-rigor.md`. No marketing language; cite the V4 truth-tracking criterion.
- [ ] **M8.5** Regenerate JSON schema (`schemas/report.schema.json` if exists; flag for v1.1 if absent) and confirm additive-only diff.

## M9. Acceptance

- [ ] **M9.1** `pnpm typecheck` clean across workspace.
- [ ] **M9.2** `pnpm lint` clean on changed packages.
- [ ] **M9.3** `pnpm test --filter @ohmyperf/core` includes `sampling.test.ts`, `fingerprint.test.ts`, refactored `engine.test.ts` snapshot — all green.
- [ ] **M9.4** `pnpm test --filter @ohmyperf/plugins-builtin` includes `crux.test.ts` — green.
- [ ] **M9.5** `pnpm test:rigor` green (V1, V2, V3, V7).
- [ ] **M9.6** `pnpm test:rigor:browser` green (V4, V5) — local Chromium run; deferred from CI.
- [ ] **M9.7** `pnpm api:check --filter @ohmyperf/core` exit 0.
- [ ] **M9.8** Real-page smoke (`https://blog.thnkandgrow.com/`) with `{ sampling: { mode: 'sprt' }, ghostRun: true, crux: { apiKey: $OHMYPERF_CRUX_KEY } }` produces a Report containing all six new meta/diagnostics fields per success-criterion 5 of `proposal.md`. Save artifact to `scripts/smoke/logs/v2-rigor.json`.
- [ ] **M9.9** Legacy-call smoke (default options, no v2 fields set): identical run shape as pre-change; viewer renders without console errors.
