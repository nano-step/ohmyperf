# Proposal: Measurement Statistical Rigor (v2 Track #1)

## Why

The Track-A audit shipped correct *numbers*, but a single OhMyPerf report still has the same epistemic flaws Lighthouse does:

1. **Fixed N=5 lottery.** [`packages/core/src/engine.ts:124`](../../../packages/core/src/engine.ts) hard-codes `for (let i = 0; i < runs; i++)`. With N=5 and typical LCP CoV of 8–12% on real machines, an 8% regression has roughly coin-flip odds of being detected. Two parallel runs of the same URL frequently produce reports that disagree by more than our own claimed accuracy band.
2. **Zero field grounding.** A lab number with no field comparison cannot answer the question users actually ask: *"is what I just measured representative of what my users see?"* CrUX is free, well-documented, and we're not calling it.
3. **Self-impact is unmeasured.** Every Performance Observer we inject, every OOPIF we auto-attach, every trace category we enable adds overhead to the very LCP we report. Lighthouse reports inflated numbers and does not subtract its own cost — we can do better, but only if we *measure* it.
4. **Numbers are unverifiable downstream.** A future MCP server or AI agent quoting "your LCP is 2.4s" has no way to prove that the number came from a real run vs. hallucination. There is no fingerprint binding the number to the inputs that produced it.

This change tightens the statistical contract of a single run by (a) replacing fixed N with Sequential Probability Ratio Test (SPRT) and bootstrap CI stopping criteria, (b) cross-referencing against the Chrome User Experience Report (CrUX) field dataset and surfacing divergence as a structured warning, (c) measuring our own instrumentation overhead via paired ghost runs and exposing both raw and overhead-corrected numbers, and (d) hashing the canonical inputs of each run into a `captureFingerprint` so future MCP tooling can verify quotes.

This is OpenSpec change **#1 of 5 in the v2 series**. It establishes the meta-surface (`meta.sampling`, `meta.crux`, `meta.captureFingerprint`, `diagnostics.measurementOverhead`) that subsequent v2 changes consume.

## What changes

### Modified

- **`packages/core/src/engine.ts`** — Replace the fixed `for (let i = 0; i < runs; i++)` loop (~line 124) with a generator-driven pull model: a `Sampler` decides whether to continue and (when `ghostRun: true`) which mode the next run is. `aggregateRuns` and downstream consumers continue to see `RunReport[]`; only the loop driver changes.
- **`packages/core/src/types.ts`** — Additive-optional schema extensions only. New fields live under `ReportMeta.sampling`, `ReportMeta.crux`, `ReportMeta.captureFingerprint`, `ReportMeta.taxonomyVersion`, a new top-level `Report.diagnostics`, and `Metric.corrected`. `MeasureOptions` grows optional `sampling`, `ghostRun`, `crux`.
- **`packages/core/src/index.ts`** — Export `Sampler`, `SamplingConfig`, `computeCaptureFingerprint`, `TAXONOMY_VERSION = '1.0.0'`.
- **`packages/core/src/collectors-impl/cwv-collector.ts`** — Branch on `ctx.mode`. In `'ghost'`, do NOT inject `cwv-inline-script`; subscribe to CDP `Performance.timelineEventAdded` and accept `largest-contentful-paint` entries from the root frame only.
- **`packages/core/src/collectors-impl/loading-collector.ts`** — Same `ctx.mode` branch: in `'ghost'`, call `PerformanceTimeline.enable({ eventTypes: ['largest-contentful-paint'] })` on the root session and skip the inline-script-dependent paths. `Performance.getMetrics` continues to be called in both modes.
- **`packages/core/src/collectors-impl/cwv-inline-script.ts`** — No behavioral change in `'instrumented'`; injection is gated upstream by `ctx.mode`.
- **`packages/plugins-builtin/src/cwv.ts`** — Read `opts.ghostRun` and propagate; no behavior change when ghost is off.
- **`packages/core/etc/core.api.md`** — Snapshot bump for additive exports; `api-extractor` confirms additive-only diff.
- **`apps/website/components/viewer/report-viewer.tsx`** and **`packages/viewer/src/render.ts`** — Defensive `?.` chains for every new `meta.sampling.*`, `meta.crux.*`, `diagnostics.*`, `metric.corrected.*` access. v1.0 reports rendered by v1.1+ viewer never throw.
- **`README.md`** — Accuracy section gains a short paragraph describing SPRT + ghost-corrected LCP; links to `docs/measurement-rigor.md`.

### Added

- **`packages/core/src/sampling.ts`** — Pure-math module: `createSampler(config)`, SPRT log-likelihood ratio for a normal-mean test (H0: Δ=0 vs H1: |Δ|=MDE, α=β=0.05 default, N_max=30 default), percentile bootstrap CI (n_boot=1000, seeded RNG `mulberry32` for reproducibility), Welford running variance. Pure functions, no IO, no deps beyond `node:crypto` for seeding. Hand-rolled (~120 LOC).
- **`packages/core/src/sampling.test.ts`** — Unit tests for LLR, bootstrap CI, Welford, sigma floor (`σ_min = 5ms`), prior (`σ₀ = 15ms` for n < 5), and stop-reason mapping.
- **`packages/core/src/fingerprint.ts`** — `computeCaptureFingerprint(inputs)` using `safe-stable-stringify` then `crypto.createHash('sha256')`. Inputs: `{ url, calibration: { observedScore, throttleRate }, configHash, ohmyperfVersion, taxonomyVersion }`. Returns `'sha256:' + hex`.
- **`packages/core/src/fingerprint.test.ts`** — Determinism across 100 runs with identical inputs; sensitivity to each input field.
- **`packages/plugins-builtin/src/crux.ts`** — `fetchCruxRecord({ origin, url?, formFactor, apiKey })` using native `fetch`. URL-first lookup falls back to origin on 404. Disk cache at `${XDG_CACHE_HOME || ~/.ohmyperf-cache}/crux/<sha256(origin + formFactor)>.json` with 24h TTL, atomic `writeFile + rename`. Computes `representativenessScore = max(0, 1 - |labP75 - fieldP75| / fieldP75)` per metric (LCP only in v1). Emits `report.warnings.unrepresentative_lab` when score < 0.7 (= divergence > 0.3).
- **`packages/plugins-builtin/src/crux.test.ts`** — Mock-fetch tests for URL/origin fallback, cache hit/miss, score calculation, missing-key silent-skip path.
- **`tests/rigor/fixtures/shift-8pct/`** — Two static HTML fixtures (`a.html` paints at ~1000ms via `<img>` decode-blocking; `b.html` paints at ~1080ms via the same mechanism + extra 80ms blocker). Used by V1.
- **`tests/rigor/fixtures/null-delta/`** — Two byte-identical fixtures with the same painting profile; used by V2 to prove SPRT does not false-positive when Δ=0.
- **`tests/rigor/fixtures/high-variance/`** — Fixture with `Math.random()`-driven blocking inserted via `setTimeout` (σ ≈ 200ms intended); used by V3 to prove SPRT hits `cap` cleanly rather than silently returning bad numbers.
- **`tests/rigor/fixtures/ground-truth-paint/`** — Page with `<script>setTimeout(() => { document.body.innerHTML = '<img src="data:..."/>'; }, 1000)</script>` so the ground-truth LCP is exactly 1000ms. Used by V4.
- **`tests/rigor/sprt-detection.test.ts`** — Monte-Carlo simulator: feeds synthetic distributions to `createSampler` and asserts V1/V2/V3 hold over 100 trials each. Does NOT run a browser; tests the sampler module in isolation.
- **`tests/rigor/ghost-truth-tracking.test.ts`** — Runs OhMyPerf in both modes against the V4 fixture and asserts `|metrics.lcp.corrected.value - 1000| < |lighthouseLcp - 1000|`. Requires Chromium; gated under `pnpm test:rigor:browser`.
- **`tests/rigor/fingerprint-determinism.test.ts`** — V7: identical `MeasureOptions` + identical versions → byte-identical `captureFingerprint` over 10 runs.
- **`docs/measurement-rigor.md`** — Methodology explainer: what SPRT does, why p75 vs p75 for CrUX, how ghost runs are paired and what's NOT subtracted, fingerprint contract and `taxonomyVersion` bump policy, reproduction instructions for V1–V7.
- **Dependency**: `safe-stable-stringify@^2.4.3` added to `@ohmyperf/core` `dependencies` (~2KB gz, zero transitive deps).

### Removed

- None. All changes are additive. The existing fixed-N code path remains the default when `MeasureOptions.sampling` is absent.

## Out of scope (deferred)

- **`report.meta.fieldHashes`** (per-field SHA-256 of `metrics.lcp.value`, `metrics.inp.value`, `metrics.cls.value`, `runs[].longTasks`) — deferred to v1.1 because no consumer ships in v1 (MCP `quote_report` tool not built yet). `captureFingerprint` ships now; `fieldHashes` is a non-breaking later addition.
- **Multi-metric SPRT stopping** (INP/CLS-aware stopping rules) — v1 SPRT is LCP-only. INP and CLS are still reported at whatever N SPRT decided. Bonferroni/composite stopping deferred to v1.1.
- **Comparative SPRT engine integration** — The SPRT LLR math supports comparative (A vs B) testing; the engine has no caller for it in v1 (no `diff` command yet). The math ships in `sampling.ts`; the engine wiring waits for the v2 `diff` change.
- **CrUX 100-URL classifier harness (V6)** — Deferred to v1.1. The runtime CrUX integration ships; the precision-validation dataset does not.
- **MCP `quote_report` tool** — Separate v2 change, gated on this one shipping `captureFingerprint`.

## Pinned design decisions

- **Sampler-driven pull loop.** `engine.ts:124` for-loop is replaced by `while (sampler.shouldContinue(runs))`. The sampler module lives in `packages/core/src/sampling.ts`. No globals; sampler is constructed per measure call. Reentrant.
- **CrUX lives in `@ohmyperf/plugins-builtin`** (CWV precedent). Oracle's initial recommendation was a new `@ohmyperf/plugin-crux` package; we deviate because a single HTTP call + cache does not justify a new package boundary. Split to standalone package is non-breaking and is a v1.1 option.
- **Ghost mode signalled via `RunCtx.mode = 'instrumented' | 'ghost'`.** Collectors branch internally on `ctx.mode`. No duplicated factories; symmetry of code path is required for pairing to be valid.
- **`PerformanceTimeline` CDP domain for ghost LCP.** `PerformanceTimeline.enable({ eventTypes: ['largest-contentful-paint'] })` causes Chromium to emit `Performance.timelineEventAdded` events natively, with no userland JS injection. This is the baseline against which instrumented LCP overhead is measured.
- **Welford running variance, no pilot phase.** Floor `σ_min = 5ms` and use prior `σ₀ = 15ms` until n ≥ 5. Avoids wasting the SPRT's whole value on a 3-run warm-up.
- **SPRT v1 = LCP-only.** N is decided by LCP's distribution. INP/CLS report whatever N SPRT picked. Multi-metric stopping → v1.1.
- **Ghost runs interleaved** with instrumented (`instr, ghost, instr, ghost, …`) to defeat thermal/cache/governor drift. Ghost runs do NOT count toward SPRT `N_max`; they have a parallel cap (also 30). Wall-clock cap 10 min belt-and-braces.
- **CrUX representativeness uses p75 vs p75** (NOT the originally-proposed p50 vs p75 — apples-to-oranges). `representativenessScore = max(0, 1 - |labP75 - fieldP75| / fieldP75)`. Threshold for warning = score < 0.7 (divergence > 0.3).
- **Headline metric never mutated.** `metrics.lcp.value` stays raw (instrumented observation). Corrected value lives in `metrics.lcp.corrected = { value, method: 'ghost-paired-median', overheadMs }`. Reporter layer chooses which to surface.
- **Ghost overhead sanity thresholds**: if `overhead_p50 < 0` or `overhead_p50 > 200ms` → emit `diagnostics.warnings.ghost_anomaly` and DO NOT subtract. Spec'd explicitly so future debuggers know the contract.
- **`captureFingerprint` covers inputs only.** Inputs: `{ url, calibration: {observedScore, throttleRate}, configHash, ohmyperfVersion, taxonomyVersion }`. CrUX response is excluded (external state breaks determinism). Run-time outputs (metrics, timestamps) are excluded by construction.
- **`taxonomyVersion = "1.0.0"`** is a new exported constant in `@ohmyperf/core`. Bumped only when metric names/dimensions change (CWV add/remove/rename). Documented in `docs/measurement-rigor.md`.
- **`safe-stable-stringify`** is the only new runtime dep in core (~2KB gz). Hand-rolling canonical-JSON is a footgun (Map serialization, NaN, numeric keys, `undefined` semantics).
- **Backward compatibility.** `MeasureOptions.sampling` absent → fixed-N preserved. `opts.ghostRun` absent → no ghost runs. `opts.crux.apiKey` absent (or `OHMYPERF_CRUX_KEY` env unset) → CrUX silently skipped with INFO log. All four features off by default in v1.
- **Schema 1.0.0 stays frozen.** Every new field optional. `api-extractor` enforced as part of acceptance.

## Success criteria

1. `pnpm typecheck && pnpm lint && pnpm test` green across the workspace.
2. `pnpm test:rigor` green for V1 (8% shift → SPRT detects at N ∈ [8,12] in ≥60% of 100 trials; fixed N=5 detects in ≤60% — i.e. SPRT strictly improves detection), V2 (null fixture → SPRT terminates `sprt-h0` in ≥80% of 100 trials), V3 (high variance → `stopReason='cap'` cleanly reported), V7 (fingerprint determinism over 10 runs).
3. `pnpm test:rigor:browser` green for V4 (ground-truth-paint corrected LCP closer to 1000ms than Lighthouse's LCP) and V5 (ghost anomaly probe — no false anomaly on a vanilla static page).
4. `pnpm api:check --filter @ohmyperf/core` exit 0; diff additive-only.
5. A report produced with `{ sampling: { mode: 'sprt' }, ghostRun: true, crux: { apiKey: '...' } }` contains: `meta.sampling.stopReason`, `meta.sampling.nRunsInstrumented`, `meta.sampling.nRunsGhost`, `meta.crux.representativenessScore`, `meta.captureFingerprint`, `diagnostics.measurementOverhead.lcp`, and `metrics.lcp.corrected`.
6. A legacy report (no options set) produced after this change is byte-compatible with the existing v1 viewer (no new required fields).
7. `docs/measurement-rigor.md` describes V1–V7 methodology and lists `taxonomyVersion` bump policy.

## Risks

- **SPRT under heavy-right-tail LCP distributions** (real machines under load): Welford variance underestimates the tail. Mitigation: σ floor of 5ms + N_max cap of 30 prevents pathological early-stop. Document the normal-mean assumption in `docs/measurement-rigor.md`. Re-evaluate after V1/V2 land on real hardware.
- **CrUX API key handling**: never accept via CLI flag (shell history); only `OHMYPERF_CRUX_KEY` env. Cache key is `sha256(origin + formFactor)`, never raw URL on disk. Audit log lines near the key to ensure no echo. Mitigation: lint rule + code-review checklist in `docs/measurement-rigor.md`.
- **Ghost run 2× wall-clock**: opt-in only via `--ghost`. CLI prints a duration-estimate warning when set. CI defaults stay off.
- **Bundle budget for viewer (≤200KB gz) / deck (≤500KB gz)**: zero new code in viewer/deck — defensive `?.` chains only. Verified.
- **`@ohmyperf/core` bundle growth ~6KB gz** (`sampling.ts` + `fingerprint.ts` + `safe-stable-stringify`): no published budget for core (server-side). Noted but not a blocker.
- **`PerformanceTimeline` domain availability**: stable in Chromium since 84 (2020-07). Firefox/WebKit lack it; ghost mode is Chromium-only in v1, consistent with our existing CWV-via-PO Chromium constraint. Document.
- **Future schema split** (`Report.diagnostics` top-level vs `meta.diagnostics`): we chose top-level `Report.diagnostics` per Oracle's structural-additivity argument; if downstream consumers complain we can mirror to `meta` non-breakingly. Doc note in `docs/measurement-rigor.md`.

## Open questions (require user confirmation before implementation begins)

1. **Default mode for `MeasureOptions.sampling`** — Sisyphus recommends **fixed-N preserved as default**; SPRT and bootstrap-CI are opt-in. (Alternative: ship SPRT-by-default with a `mode: 'fixed'` escape hatch. The opt-in route preserves zero behavioral surprise for existing users.)
2. **Default for `MeasureOptions.ghostRun`** — Sisyphus recommends **opt-in** (`false` default) given 2× wall-clock cost.
3. **`report.meta.fieldHashes` in v1 or v1.1** — Sisyphus recommends **defer to v1.1** (no consumer in v1). `captureFingerprint` alone in v1 is enough to unblock MCP work later.
4. **CrUX behavior when `OHMYPERF_CRUX_KEY` absent** — Sisyphus recommends **silently skip + INFO log** (no warning, no error). Alternative: require explicit `crux.enabled: false` in config to silence.
5. **Capability spec id** — Sisyphus accepts Oracle's `measurement-rigor`. (Alternatives considered: `statistical-rigor` is too narrow; `measurement-statistical-rigor` is the change name, not a durable capability name.)
