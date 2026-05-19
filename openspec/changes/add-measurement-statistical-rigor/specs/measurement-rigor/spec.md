# Spec: Measurement Rigor

## ADDED Requirements

### Requirement: Sampler decides run count (SPRT, bootstrap-CI, or fixed)
The engine SHALL drive its run loop via a `Sampler` object constructed from `MeasureOptions.sampling`. When `sampling` is absent, the sampler SHALL preserve today's fixed-N behavior. When `sampling.mode === 'sprt'` the sampler SHALL apply Sequential Probability Ratio Test stopping on the LCP metric **under a normal-mean test assumption**. When `sampling.mode === 'bootstrap-ci'` the sampler SHALL stop when the percentile-bootstrap CI width crosses a target threshold (distribution-agnostic — preferred for known heavy-right-tail metrics like INP). In all cases the engine SHALL cap total runs at `sampling.nMax ?? 30` and SHALL surface the outcome in `report.meta.sampling`.

> **Distribution assumption (documented limitation):** SPRT's LLR is derived for a normal-mean test. Real LCP samples often exhibit a heavy right tail from sporadic GC pauses, CPU governor shifts, or thermal events. Welford-based σ will underestimate that tail. The σ-floor (5ms) and `N_max` cap (30) prevent pathological early stopping; users who need stronger non-parametric guarantees SHOULD use `mode: 'bootstrap-ci'` instead. `docs/measurement-rigor.md` MUST document this and cite the V3 high-variance fixture as the empirical guard-rail.

#### Scenario: Default behavior is unchanged when `sampling` is absent
- **GIVEN** a `MeasureOptions` with no `sampling` field
- **WHEN** the engine runs
- **THEN** the run count equals `opts.runs ?? 5`
- **AND** `report.meta.sampling.stopReason` equals `"fixed"`
- **AND** the resulting Report is byte-identical (modulo timestamps and `meta.sampling` itself) to the pre-change Report on the same fixture

#### Scenario: SPRT terminates H1 on a real shift
- **WHEN** `sampling = { mode: 'sprt', mde: 0.05, alpha: 0.05, beta: 0.05 }` is configured
- **AND** synthetic per-run LCPs are drawn from `Normal(μ=1080, σ=80)` (an 8% upward shift vs a baseline of 1000ms)
- **THEN** in ≥80% of 100 Monte-Carlo trials the sampler terminates with `stopReason === "sprt-h1"` at `n_runs_actual ∈ [8, 14]`
- **AND** in the same 100 trials a fixed `runs: 5` baseline detects the shift (via z-test at α=0.05) in ≤60% of trials — i.e. SPRT yields at least a 20-percentage-point detection-rate gap that cannot be a coincidence

#### Scenario: SPRT terminates H0 on a null fixture
- **WHEN** synthetic per-run LCPs are drawn from `Normal(μ=1000, σ=80)` against an identical baseline
- **THEN** in ≥80% of 100 Monte-Carlo trials the sampler terminates with `stopReason === "sprt-h0"` before `n_runs_actual` reaches `N_max`
- **AND** false-positive `stopReason === "sprt-h1"` occurs in ≤5% of trials

#### Scenario: SPRT caps at N_max under unstable variance
- **WHEN** synthetic per-run LCPs are drawn from `Normal(μ=1000, σ=200)` (high noise)
- **THEN** in ≥90% of 100 Monte-Carlo trials the sampler terminates with `stopReason === "cap"` at `n_runs_actual === N_max`
- **AND** the Report is still produced with valid (if wide) aggregated metrics

#### Scenario: `meta.sampling` reports the full outcome
- **WHEN** any SPRT run completes
- **THEN** `report.meta.sampling.nRunsInstrumented` equals the number of instrumented runs executed
- **AND** `report.meta.sampling.stopReason` is one of `"sprt-h0" | "sprt-h1" | "cap" | "fixed" | "bootstrap-ci" | "error"`
- **AND** `report.meta.sampling.mde` equals the MDE used
- **AND** `report.meta.sampling.sigmaEstimate` equals the Welford σ estimate at stop

#### Scenario: Bootstrap-CI mode stops when relative width crosses target
- **WHEN** `sampling = { mode: 'bootstrap-ci', ciTargetWidth: 0.05, nBoot: 1000, seed: 0xC0FFEE }`
- **AND** per-run LCPs are drawn from `Normal(μ=1000, σ=40)`
- **THEN** the sampler stops at some `n_runs_actual` such that the resampled 90% CI width divided by the point estimate is < 0.05
- **AND** `report.meta.sampling.stopReason === "bootstrap-ci"`
- **AND** `report.meta.sampling.ciWidth` is populated and the value is < 0.05

#### Scenario: Welford uses σ-floor and σ-prior for small n
- **WHEN** fewer than 5 runs have completed
- **THEN** the SPRT calculation uses `σ = max(welfordSigma, σ_min = 5ms)` if a Welford estimate exists, otherwise the prior `σ₀ = 15ms`
- **AND** SPRT does not stop with `sprt-h1` based on the first run alone

#### Scenario: Wall-clock cap belt-and-braces
- **WHEN** the cumulative measurement wall-clock exceeds 10 minutes
- **THEN** the sampler terminates with `stopReason === "cap"` regardless of `N_max` not being reached
- **AND** an INFO log line records the wall-clock cap as the trigger

### Requirement: Ghost-paired runs measure and report instrumentation overhead
When `MeasureOptions.ghostRun === true`, the engine SHALL run ghost (un-instrumented) runs interleaved 1:1 with instrumented runs and SHALL compute paired-overhead statistics. Ghost runs SHALL be excluded from SPRT's `N_max` budget. The engine SHALL surface raw and corrected LCP without mutating the raw value.

#### Scenario: Default is no ghost runs
- **GIVEN** `MeasureOptions` with no `ghostRun` field
- **THEN** the engine executes only instrumented runs
- **AND** `report.meta.sampling.nRunsGhost` is `undefined` or `0`
- **AND** `report.diagnostics.measurementOverhead` is `undefined`

#### Scenario: Ghost runs are interleaved with instrumented
- **WHEN** `ghostRun: true` is configured
- **THEN** the run ordering MUST be `instrumented, ghost, instrumented, ghost, …` until the sampler stops the instrumented sequence
- **AND** total runs = `nRunsInstrumented + nRunsGhost` with `|nRunsInstrumented - nRunsGhost| ≤ 1`

#### Scenario: Ghost run disables PerformanceObserver injection
- **WHEN** a run executes in `mode === 'ghost'`
- **THEN** the engine MUST NOT call `Page.addScriptToEvaluateOnNewDocument` for the CWV inline script
- **AND** the engine MUST call `PerformanceTimeline.enable({ eventTypes: ['largest-contentful-paint'] })` on the root CDP session before navigation
- **AND** the engine MUST subscribe to `Performance.timelineEventAdded` and accept only entries from the root frame

#### Scenario: Overhead is computed paired and reported
- **WHEN** both instrumented and ghost runs complete
- **THEN** `report.diagnostics.measurementOverhead.lcp.p50Ms` equals `median({ instr[i].lcp - ghost[i].lcp for each paired i })`
- **AND** `report.diagnostics.measurementOverhead.lcp.p95Ms` equals the 95th percentile of the same paired-delta array
- **AND** `report.diagnostics.measurementOverhead.lcp.nInstr` and `nGhost` reflect the actual counts

#### Scenario: Corrected LCP is added but raw LCP is untouched
- **WHEN** ghost runs are present and overhead computation succeeds
- **THEN** `report.aggregated.metrics.lcp.value` is untouched (still the median of instrumented runs)
- **AND** `report.aggregated.metrics.lcp.corrected.value` equals `report.aggregated.metrics.lcp.value - report.diagnostics.measurementOverhead.lcp.p50Ms`
- **AND** `report.aggregated.metrics.lcp.corrected.method` equals `"ghost-paired-median"`
- **AND** `report.aggregated.metrics.lcp.corrected.overheadMs` equals `report.diagnostics.measurementOverhead.lcp.p50Ms`

#### Scenario: Negative or excessive overhead triggers anomaly warning
- **WHEN** the computed `overhead_p50` is < 0 OR > 200ms
- **THEN** `report.diagnostics.warnings` MUST contain an entry with `code === "ghost_anomaly"`
- **AND** `metrics.lcp.corrected` MUST NOT be populated for this run
- **AND** the raw `metrics.lcp.value` is still reported

#### Scenario: Ghost run beats Lighthouse on synthetic ground-truth fixture
- **WHEN** the `ground-truth-paint` fixture (a page that paints LCP at exactly 1000ms via `setTimeout(injectImg, 1000)`) is measured with `{ sampling: { mode: 'sprt' }, ghostRun: true }`
- **AND** Lighthouse 13.x is run against the same fixture URL on the same Chromium build
- **THEN** `|report.aggregated.metrics.lcp.corrected.value - 1000|` is less than `|lighthouseLcp - 1000|`

#### Scenario: Vanilla static page produces no ghost anomaly
- **WHEN** a vanilla static page (single `<h1>` LCP, no JS) is measured with `ghostRun: true`
- **THEN** `overhead_p50` is in `[0, 200]` ms
- **AND** no `ghost_anomaly` warning is emitted

### Requirement: CrUX field anchor surfaces lab-vs-field divergence
When a CrUX API key is provided, the engine SHALL fetch a CrUX record for the measured URL and origin, SHALL compute a p75-vs-p75 representativeness score, and SHALL flag unrepresentative labs as a structured warning. CrUX SHALL silently skip without warning when no key is configured.

#### Scenario: Missing API key skips CrUX but records the absence
- **GIVEN** neither `opts.crux.apiKey` nor `process.env.OHMYPERF_CRUX_KEY` is set
- **WHEN** the engine finalizes a run
- **THEN** `report.meta.crux` is populated with `{ available: false, granularity: "unavailable", reason: "no-api-key", formFactor }` so AI agents reading the Report can see CrUX was intentionally not consulted
- **AND** `report.diagnostics.warnings` contains no `unrepresentative_lab` entry (no field anchor → no divergence claim)
- **AND** an INFO log line states "crux: skipped (no api key)"

#### Scenario: URL-specific lookup populates `granularity = "url"`
- **WHEN** an API key is configured and CrUX has data for the specific URL
- **THEN** the engine performs ONE `POST https://chromeuxreport.googleapis.com/v1/records:queryRecord` with body `{ url, origin, formFactor }`
- **AND** `report.meta.crux.available === true`
- **AND** `report.meta.crux.granularity === "url"`
- **AND** `report.meta.crux.p75.lcp` is a finite number in milliseconds

#### Scenario: URL 404 falls back to origin-level lookup
- **WHEN** CrUX returns 404 for the URL-specific query
- **THEN** the engine SHALL retry with `{ origin, formFactor }` (no `url`)
- **AND** on success `report.meta.crux.granularity === "origin"`
- **AND** on a second 404 `report.meta.crux.available === false`, `granularity === "unavailable"`, `reason === "not-in-dataset"`, and no warning is escalated

#### Scenario: Cache hit avoids network within 24h TTL
- **GIVEN** a prior CrUX fetch wrote `~/.ohmyperf-cache/crux/<sha256(origin + '|' + formFactor)>.json` less than 24h ago
- **WHEN** a new measurement runs against the same origin+formFactor
- **THEN** no HTTP request to `chromeuxreport.googleapis.com` is made
- **AND** `report.meta.crux.fetchedAt` reflects the cached timestamp

#### Scenario: Disk cache write is atomic
- **WHEN** the CrUX fetcher writes a cache file
- **THEN** the write goes to `<file>.tmp` first and is `rename`'d into place
- **AND** a partial write cannot leave a malformed cache file at the canonical path

#### Scenario: Representativeness uses p75 vs p75
- **WHEN** lab measurements produced `aggregated.metrics.lcp.p75 = 1500` and CrUX returned `field.lcp.p75 = 1200`
- **THEN** `report.meta.crux.representativenessScore` equals `max(0, 1 - |1500 - 1200| / 1200)` = `0.75`

#### Scenario: Score below 0.7 raises `unrepresentative_lab` warning
- **WHEN** the computed `representativenessScore < 0.7`
- **THEN** `report.diagnostics.warnings` MUST contain an entry with `code === "unrepresentative_lab"`
- **AND** the entry's `message` cites both lab p75 and field p75

#### Scenario: CrUX response is excluded from `captureFingerprint`
- **WHEN** the engine finalizes a run that fetched CrUX
- **THEN** the `captureFingerprint` input set excludes the CrUX response entirely
- **AND** two runs against the same URL with the same options yield identical fingerprints even if CrUX cache state differs

### Requirement: Capture fingerprint binds inputs to the produced numbers
Every Report SHALL include `report.meta.captureFingerprint` computed as `'sha256:' + sha256(safe-stable-stringify(inputs))` where `inputs = { url, calibration: { observedScore, throttleRate } | undefined, configHash, ohmyperfVersion, taxonomyVersion }`. The fingerprint SHALL be deterministic for identical inputs and SHALL change if any input changes. Run-time outputs and CrUX data SHALL NOT contribute to the fingerprint.

#### Scenario: Determinism over 10 runs
- **WHEN** the same `MeasureOptions` are measured 10 times against the same fixture, with `ohmyperfVersion` and `taxonomyVersion` pinned
- **THEN** all 10 reports have byte-identical `meta.captureFingerprint`

#### Scenario: Sensitivity to URL
- **WHEN** two reports differ only in `opts.url`
- **THEN** their `meta.captureFingerprint` values differ

#### Scenario: URL userinfo is stripped before hashing
- **WHEN** `opts.url` is `https://alice:secret@example.com/page`
- **THEN** the fingerprint input for URL is `https://example.com/page` (userinfo removed, protocol+host lowercased)
- **AND** a second report against `https://example.com/page` (no userinfo) yields an identical fingerprint
- **AND** no log line, error message, or persisted artifact echoes the stripped userinfo

#### Scenario: Sensitivity to calibration
- **WHEN** two reports use identical `opts` but the calibration produces a different `observedScore`
- **THEN** their `meta.captureFingerprint` values differ

#### Scenario: Sensitivity to `ohmyperfVersion`
- **WHEN** two reports are produced by different `@ohmyperf/core` package versions
- **THEN** their `meta.captureFingerprint` values differ

#### Scenario: Sensitivity to `taxonomyVersion`
- **WHEN** two reports are produced under different `TAXONOMY_VERSION` constants (e.g. `1.0.0` → `1.1.0`)
- **THEN** their `meta.captureFingerprint` values differ

#### Scenario: Insensitivity to in-memory plugin ordering
- **WHEN** two reports register the same plugin list in different `Array` orderings
- **AND** the plugins resolve to the same `{ id, version }` set
- **THEN** their `meta.captureFingerprint` values are identical (canonical-JSON sorts keys; the `configHash` step sorts plugin entries by `id` before stringifying)

#### Scenario: Insensitivity to CrUX cache state
- **WHEN** two reports run the same `MeasureOptions` and only the CrUX cache state differs (warm vs cold) between runs
- **THEN** their `meta.captureFingerprint` values are identical

#### Scenario: Fingerprint format is namespaced
- **WHEN** any Report is produced
- **THEN** `meta.captureFingerprint` matches `/^sha256:[0-9a-f]{64}$/`

### Requirement: Schema additions are additive-optional only
All new fields introduced by this change SHALL be optional. The `SchemaVersion` constant SHALL remain `"1.0.0"`. `api-extractor` SHALL confirm an additive-only diff against the prior `core.api.md` snapshot.

#### Scenario: `api:check` passes
- **WHEN** `pnpm api:check --filter @ohmyperf/core` runs after this change
- **THEN** exit code is 0
- **AND** the diff against `packages/core/etc/core.api.md` contains only `+` lines for existing exports (no removed/renamed exports)

#### Scenario: Legacy v1.0 Reports still load in this codebase
- **WHEN** a Report serialized by the pre-change `@ohmyperf/core` (no `meta.sampling`, no `meta.crux`, no `meta.captureFingerprint`, no `diagnostics`) is deserialized and rendered by the post-change viewer
- **THEN** no `TypeError` is thrown
- **AND** the viewer renders the report with the new fields visually absent (not "undefined" strings)

#### Scenario: `SchemaVersion` constant is unchanged
- **WHEN** `@ohmyperf/core` is built after this change
- **THEN** the exported `SchemaVersion` type literal is still `"1.0.0"`

### Requirement: Validation evidence ships with the change
The repository SHALL include automated tests proving the validation claims V1–V5 and V7 from `proposal.md`. V6 (CrUX 100-URL classifier) is documented-deferred to v1.1 in `docs/measurement-rigor.md`.

#### Scenario: Monte-Carlo SPRT tests are reproducible
- **WHEN** `pnpm test:rigor` runs against a fixed RNG seed
- **THEN** V1 (8% shift), V2 (null), and V3 (high variance) all pass deterministically
- **AND** V7 (fingerprint determinism over 10 runs) passes

#### Scenario: Browser-gated truth-tracking test is wired
- **WHEN** `pnpm test:rigor:browser` runs with a local Chromium installed
- **THEN** V4 (ghost-corrected LCP closer to ground-truth than Lighthouse) passes
- **AND** V5 (no ghost anomaly on a vanilla static page) passes

#### Scenario: `docs/measurement-rigor.md` cites the methodology
- **WHEN** `docs/measurement-rigor.md` exists in the repo
- **THEN** it includes sections explaining SPRT methodology, Welford prior/floor rationale, p75-vs-p75 CrUX choice, fingerprint input list, `taxonomyVersion` bump policy, and reproduction commands for V1–V7
