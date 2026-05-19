# Tasks: Counterfactual Causal Attribution (v2 Track #3)

> Dependencies in build order: `add-sprt-baseline` (#1) → `add-hermetic-replay` (#4) → this change.
> All commits: `nhoxtvt@gmail.com` identity (auto via `~/.gitconfig-personal` `includeIf`).

## C0. Pre-flight — schema and dependency gates

- [ ] C0.1 Confirm `add-sprt-baseline` (#1) merged. Read `packages/core/src/sprt/` exports. Verify `BaselineRun[]` shape includes per-run LCP element URL, transferSize, RTT, render-blocking flag (the four features the ranker consumes). If missing any feature, file a follow-up in #1 BEFORE starting C1.
- [ ] C0.2 Confirm `add-hermetic-replay` (#4) merged. Read `packages/driver-playwright/src/replay/` exports. Verify `ReplayCache.getCached(url): CachedResponse | undefined` and `ReplayCache.getCspForOrigin(origin): string | undefined` exist. If missing, file a follow-up in #4.
- [ ] C0.3 `shared-types` schema dry-run: add `CounterfactualEvidence`, `Verdict`, `InterventionKind` interfaces (no consumer yet); run `pnpm --filter @ohmyperf/shared-types api:check` to ensure additive-only API extractor diff. Commit as standalone "shared-types: counterfactual interfaces" so reviewers can audit schema in isolation.
- [ ] C0.4 Defensive `?.` audit in reporters: search `packages/reporter-html`, `reporter-markdown`, `reporter-deck`, `viewer` for any code path that would crash if `report.counterfactuals` were `undefined`. Default-guard via `report.counterfactuals ?? []`. This guarantees v2.0 reports rendered by v2.1+ viewers do not throw.

## C1. Stats module (pure, no I/O, easy to TDD first)

- [ ] C1.1 `packages/core/src/stats/mann-whitney.ts`: implement exact Mann-Whitney U for `n1 + n2 ≤ 20`. Dynamic-programming null distribution over rank sums. Cache memoized. Two-sided p-value. Returns `MWUResult { u, pValue, effectSize, method: 'exact' }`.
- [ ] C1.2 Same file: implement normal-approximation fallback with tie correction for `n1 + n2 > 20`. Returns `method: 'normal-approx'`.
- [ ] C1.3 `packages/core/src/stats/mann-whitney.test.ts`: assert (a) exact match vs `scipy.stats.mannwhitneyu` reference outputs for 8 known inputs (1-line per case, hardcoded expected `u` and `pValue`); (b) at `n=3,3` minimum p-value is `≥ 0.05` (sanity floor); (c) tied-rank input produces correct tie-corrected p.
- [ ] C1.4 `packages/core/src/stats/bootstrap.ts`: implement `mulberry32` PRNG inline (~30 LOC) with explicit seed param. Implement percentile-method `bootstrapDeltaCI(baseline, intervention, opts)`: median delta bootstrap, default 10,000 iterations, alpha=0.05, seed=`0xC0FFEE`. Returns `BootstrapCI { point, lower, upper, iterations }`.
- [ ] C1.5 `bootstrap.test.ts`: (a) determinism — same input + seed produces byte-identical CI to 6 decimals across 3 runs; (b) coverage — Monte-Carlo experiment with known true delta lands inside CI in ≥ 93/100 trials (target 95%, tolerance for finite resamples); (c) seed change shifts CI by ≥ 1 ms on a high-variance fixture (proves seed is actually used).
- [ ] C1.6 `packages/core/src/stats/index.ts` barrel; export `mannWhitneyU`, `bootstrapDeltaCI`, all types.

## C2. Verdict classifier (pure, no I/O)

- [ ] C2.1 `packages/core/src/counterfactual/verdict.ts`: implement `classifyVerdict({ delta, ci95, pValue })` returning four-state `Verdict`. Thresholds per `design.md` §6 (50 ms / 20 ms / 10 ms). JSDoc comment marks thresholds as "starting points; tune via corpus calibration before locking."
- [ ] C2.2 `verdict.test.ts` matrix: 16 hand-authored cases covering all four verdict outputs ×  representative `(delta, ci95, pValue)` combinations. Include edge cases: `ci95 = [0, 100]` (crosses zero → never `causal-with-high-confidence`); `delta = 0, pValue = 0.01` (anomalous → `inconclusive`).

## C3. Deterministic ranker

- [ ] C3.1 `packages/core/src/counterfactual/types.ts`: internal types `CandidateFeatures`, `RankedCandidate`, `RankerInput`.
- [ ] C3.2 `packages/core/src/counterfactual/ranker.ts`: implement `rankLcp(input)` per `design.md` §5. Pure function. Stable sort with `score desc, url asc` tie-break. Feature values rounded to 2 decimals before scoring.
- [ ] C3.3 `pickInterventions(features)`: branching rules per `design.md` §5. Returns `[]` (skipped in evidence) for unsupported LCP sources (text LCP, CSS background-image, SW-served).
- [ ] C3.4 `ranker.test.ts` matrix: (a) determinism — same baseline JSON in/out byte-identical across 50 invocations; (b) tie-break — two equal-score candidates always sort by URL `localeCompare`; (c) third-party render-blocking suggests `['block-3p', 'fail']`; (d) `.js` suggests `['noop-script', 'fulfill-cached']`; (e) `topK` default 3, configurable; (f) empty baseline returns `[]` (no crash).
- [ ] C3.5 Hand-author 3 ranker fixture JSONs (`tests/counterfactual-corpus/fixtures-ranker/*.json`) representing realistic baselines; lock outputs as snapshot tests.

## C4. InterventionDriver (CDP layer)

- [ ] C4.1 `packages/driver-playwright/src/cdp-compat.ts`: add `enableFetchInterception(session)` and `disableFetchInterception(session)` thin wrappers. Document required CDP version (Chromium ≥ 119, already pinned in `add-metric-accuracy`).
- [ ] C4.2 `packages/driver-playwright/src/fetch-router.ts`: implement `FetchRouter` per `design.md` §4. `register(handler, priority)` returns `Disposable`. `onRequestPaused(event)` iterates handlers by priority desc; first to return `true` claims. Default fall-through: `Fetch.continueRequest`.
- [ ] C4.3 `fetch-router.test.ts`: (a) priority ordering deterministic; (b) two registrations at same priority resolve by insertion order, deterministically; (c) dispose removes handler from chain; (d) no-claim scenario triggers default continue exactly once.
- [ ] C4.4 `packages/driver-playwright/src/intervention-driver.ts`: implement class per `design.md` §2. Methods: `attach(session)`, `applyIntervention(spec)`, `reset()`, `canFulfill(url)`. Stateful (tracks active rules + Disposables).
- [ ] C4.5 `InterventionDriver.applyIntervention({ kind: 'fail', url, errorReason })`: register a `FetchHandler` at priority 100 that matches `url` exactly (post-redirect canonical), calls `Fetch.failRequest({ errorReason: 'Failed' })`, returns `Disposable`.
- [ ] C4.6 `applyIntervention({ kind: 'fulfill-cached', url, cachedBody })`: register handler that on match calls `Fetch.fulfillRequest({ requestId, responseCode: cachedBody.status, responseHeaders: cachedBody.headers, body: cachedBody.body.toString('base64') })`. Preserve `Content-Encoding`, `Content-Type`.
- [ ] C4.7 `applyIntervention({ kind: 'block-3p', urlPattern })`: call `Network.setBlockedURLs({ urls: [...current, urlPattern] })`. `Disposable` restores previous set on dispose.
- [ ] C4.8 `applyIntervention({ kind: 'noop-script', url })`: register handler that on match fulfills with `body: ';'`, `Content-Type: application/javascript`. Used for INP defer; v1 ships method but no LCP intervention uses it (kept for forward compat).
- [ ] C4.9 `canFulfill(url)`: queries `ReplayCache.getCspForOrigin(origin(url))`. If CSP `default-src 'self'` or `script-src` excludes the URL's origin, return `{ ok: false, reason: 'csp-violation' }`. Else `{ ok: true }`.
- [ ] C4.10 `intervention-driver.test.ts`: (a) `fail` on a fetched URL produces network error in page; (b) `fulfill-cached` with a hand-authored cached body satisfies request; (c) `block-3p` prevents request from being issued (verified via `Network.requestWillBeSent` absence); (d) `reset()` drops all handlers; (e) `canFulfill` blocks CSP-incompatible URL.

## C5. Engine integration

- [ ] C5.1 `packages/driver-playwright/src/engine-adapter.ts`: wire `InterventionDriver` into the per-run `BrowserContext` lifecycle. Attach on context create, dispose on close. Expose `getInterventionDriver()` to engine.
- [ ] C5.2 `packages/core/src/engine.ts`: detect `counterfactual: true` option. After SPRT baseline phase (from #1), invoke `runCounterfactualPhase(baseline)`.
- [ ] C5.3 `packages/core/src/counterfactual/index.ts` `CounterfactualOrchestrator.run(baseline, opts)`:
  - rank with `rankLcp({ baseline, topK: opts.topK ?? 3 })`
  - for each candidate, for each suggested intervention:
    - fresh `BrowserContext` via driver
    - `replayCache` already attached at priority 10 (from #4)
    - `interventionDriver.attach(session)` at priority 100
    - if `kind === 'fulfill-cached'`: pre-flight `canFulfill(url)` → on `{ ok: false }` record `skipped` and skip
    - if `fulfill-cached` and `replayCache.getCached(url) === undefined` → record `skipped: { reason: 'no-cache-entry' }` and skip
    - `collector.measure(driver, spec, M, runOne)` returns `InterventionResult`
    - `driver.reset()`
    - context close
  - pick best intervention per candidate (max `|median(measurements) − baselineMedian|`)
- [ ] C5.4 Wall-clock budget gate: `performance.now()` checkpoints per phase. If Phase-3 elapsed > `4 × baselineElapsed`, abort remaining candidates; mark each completed evidence `partialFailure: true`; emit `logger.warn('counterfactual.budget-breached', { elapsedMs, budgetMs })`.
- [ ] C5.5 Stats + verdict pass: for each chosen (candidate, intervention), compute `mannWhitneyU(baselineLcp, interventionLcp)` and `bootstrapDeltaCI(baselineLcp, interventionLcp)`; assemble `CounterfactualEvidence` via `classifyVerdict`.
- [ ] C5.6 Attach `evidence[]` to `report.counterfactuals` (additive).

## C6. Counterfactual collector

- [ ] C6.1 `packages/core/src/collectors-impl/counterfactual-collector.ts`: implement `CounterfactualCollector.measure(driver, spec, n, runOne)` per `design.md` §2.
- [ ] C6.2 Loop M passes. Each pass: (a) `driver.applyIntervention(spec)` → `Disposable`; (b) `runOne()` to navigate + capture LCP via existing `cwv-collector`; (c) record `{ lcpMs, passIndex, appliedAt }`; (d) `disposable.dispose()`.
- [ ] C6.3 Failure handling: try/catch per pass. On `runOne()` throw (page crash, timeout): record `measurements[i] = { lcpMs: NaN, passIndex, appliedAt, skipped: { reason: <message> } }`; set `partialFailure: true` on result; continue loop.
- [ ] C6.4 Adaptive M: if first 3 passes produce `verdict.classifyVerdict` (informal pre-check) === `'inconclusive'` AND `|delta| > 30 ms`, run 2 more passes. Cap at M=5. Disabled if budget gate would breach.
- [ ] C6.5 `counterfactual-collector.test.ts`: (a) M=3 happy path produces 3 measurements; (b) page-crash mid-pass continues; (c) adaptive-M triggers on inconclusive border case; (d) budget-disabled adaptive-M honors gate.

## C7. CLI + MCP wiring

- [ ] C7.1 `apps/cli/src/cli.ts`: add `--counterfactual` boolean flag and `--counterfactual-top-k <number>` (default 3). Pass through to `engine.run({ counterfactual, topK })`.
- [ ] C7.2 `apps/cli` flag interaction tests: (a) `--counterfactual` alone uses default `topK=3`; (b) `--counterfactual-top-k=5` propagates; (c) flag absent — counterfactual code path inert (existing snapshot tests unchanged).
- [ ] C7.3 `apps/mcp-server/src/tools/analyze-counterfactuals.ts`: implement tool per `design.md` §8. Two modes: `analyze` (read existing report file → summarize) and `run` (trigger fresh engine run with `counterfactual: true`). Input schema enforces `mode` discriminator.
- [ ] C7.4 `apps/mcp-server` tools registry: register `analyzeCounterfactualsTool` alongside existing tools.
- [ ] C7.5 MCP tool tests: (a) `analyze` mode on a fixture report returns expected summary; (b) `run` mode triggers engine (mocked) and returns evidence; (c) invalid `mode` rejected by schema.

## C8. Reporters

- [ ] C8.1 `packages/reporter-html/src/render.ts`: add a "Counterfactual evidence" section guarded by `report.counterfactuals?.length`. Render per-evidence card: cause, intervention, observed Δ, CI95, p-value, verdict badge. Verdict colors via existing `--color-accent-*` CSS vars (no hex literals).
- [ ] C8.2 `packages/reporter-markdown/src/render.ts`: add table-style section, same guard.
- [ ] C8.3 `packages/reporter-deck/src/render.ts`: add new slide template "Counterfactual findings" rendered iff evidence present.
- [ ] C8.4 `packages/viewer/src/render.ts` (CLI HTML reporter): mirror reporter-html section.
- [ ] C8.5 Reporter snapshot tests: (a) report WITHOUT counterfactuals — existing snapshots unchanged; (b) report WITH counterfactuals — new snapshot capturing rendered section.

## C9. Validation corpus

- [ ] C9.1 `tests/counterfactual-corpus/README.md`: document harness contract — each fixture is `{ name, html, knownOptimization, expectedDeltaMs }`. `knownOptimization` is a function that mutates the HTML to apply the documented fix; harness runs `ohmyperf --counterfactual` on the original, then runs ohmyperf baseline on the optimized version, then asserts `|predicted_delta − measured_real_delta| / measured_real_delta < 0.15`.
- [ ] C9.2 Fixture authoring (hand-coded HTML; no build):
  - [ ] C9.2.1 `lcp-oversized-hero-image/` — 4 MB hero image; fix: serve 200 KB resized.
  - [ ] C9.2.2 `lcp-render-blocking-script-3p/` — synchronous `<script src=cdn>` ahead of LCP image; fix: `defer`.
  - [ ] C9.2.3 `lcp-lazy-image-no-priority/` — LCP `<img loading="lazy">`; fix: `loading="eager" fetchpriority="high"`.
  - [ ] C9.2.4 `lcp-font-blocking-text/` — LCP is text gated on `font-display: block`; fix: `font-display: swap`. **Marked `unsupported-lcp-source` in v1 — fixture exists to assert ranker skips gracefully.**
  - [ ] C9.2.5 `lcp-css-background-hero/` — LCP is `<div>` with `background-image: url(...)`; fix: replace with `<img>`. **Marked `unsupported-lcp-source` in v1.**
  - [ ] C9.2.6 `lcp-third-party-tag-manager/` — render-blocking GTM-style tag; fix: async.
  - [ ] C9.2.7 `lcp-preconnect-missing/` — LCP image on third-party origin with no preconnect; fix: `<link rel=preconnect>`.
  - [ ] C9.2.8 `lcp-srcset-large-source-picked/` — picture element where browser picks the 4 MB source on 2× DPR; fix: cap with `sizes` attr.
  - [ ] C9.2.9 `lcp-server-side-redirect-chain/` — LCP image behind 3-hop 302; fix: direct URL.
  - [ ] C9.2.10 `lcp-csp-strict-fixture/` — CSP `default-src 'self'`; LCP is same-origin image. Asserts `canFulfill` returns `{ ok: true }` (same-origin fulfill is allowed). Companion test: cross-origin variant returns `{ ok: false, reason: 'csp-violation' }`.
- [ ] C9.3 `tests/counterfactual-corpus/harness.ts`: implements the contract from C9.1. Runs serial (avoid Chromium contention). Emits `tests/counterfactual-corpus/results.json` per CI run for visibility.
- [ ] C9.4 `tests/counterfactual-corpus/mape.test.ts`: aggregate predicted vs measured deltas across 8 supported fixtures (skipping the 2 `unsupported-lcp-source` ones); assert MAPE < 0.15. Also assert Lighthouse "opportunities" MAPE > 0.40 on the same corpus (reuse `add-metric-accuracy`'s Lighthouse 13.x harness) — this is the moat claim, must be defensible.
- [ ] C9.5 `tests/counterfactual-corpus/determinism.test.ts`: run counterfactual twice on the same fixture; assert byte-identical `report.counterfactuals` JSON output (proves seeded PRNG + pure ranker + deterministic stats).
- [ ] C9.6 `tests/counterfactual-corpus/calibration-report.json`: harness emits this file on every run. Documents threshold tuning evidence. ADR `openspec/adrs/counterfactual-verdict-thresholds.md` cites it.

## C10. Synthetic fixture acceptance gate

- [ ] C10.1 `tests/counterfactual-corpus/synthetic-preload-delta.test.ts`: single fixture with a 4 MB hero image deliberately not preloaded. Steps: (a) ohmyperf baseline N=5 → `baselineLcp_median`; (b) ohmyperf counterfactual with `intervention: 'fulfill-cached'` → `predictedDelta`; (c) modify fixture to add `<link rel="preload" href="hero.jpg" as="image">`; (d) ohmyperf baseline N=5 on optimized → `optimizedLcp_median`; (e) `realDelta = baselineLcp_median − optimizedLcp_median`; (f) assert `|predictedDelta − realDelta| < 100 ms`.
- [ ] C10.2 Document expected wall-clock for this test (~3 minutes) in `tests/counterfactual-corpus/README.md` and gate behind `pnpm test:counterfactual-synthetic` (not default `pnpm test`).

## C11. Documentation + ADR

- [ ] C11.1 `openspec/adrs/counterfactual-verdict-thresholds.md`: pin the four-verdict spectrum and the 50/20/10 ms thresholds; cite `calibration-report.json` evidence.
- [ ] C11.2 `openspec/adrs/counterfactual-fetch-router-priority.md`: pin `InterventionDriver` priority 100, replay priority 10; reasoning, alternative-considered (separate CDP session).
- [ ] C11.3 `openspec/adrs/counterfactual-hermetic-coupling.md`: document the strict `fulfill-cached` dependency on `add-hermetic-replay`, the graceful skip behavior, and the `--no-fulfill` soft-launch path.
- [ ] C11.4 `docs/counterfactuals.md` (user-facing): how to interpret each verdict; how to read `observedDelta` and `ci95`; when to trust `inconclusive`; budget expectations.
- [ ] C11.5 `README.md` update: add "Counterfactual causal attribution" feature blurb with one-liner explaining the moat vs Lighthouse opportunities.

## C12. Final acceptance gate

- [ ] C12.1 `pnpm test --filter @ohmyperf/core` green.
- [ ] C12.2 `pnpm test --filter @ohmyperf/driver-playwright` green.
- [ ] C12.3 `pnpm test --filter @ohmyperf/shared-types` green (api:check additive).
- [ ] C12.4 `pnpm test:counterfactual-corpus` green; MAPE < 15%; Lighthouse-opportunities MAPE > 40% on same corpus (moat assertion).
- [ ] C12.5 `pnpm test:counterfactual-synthetic` green; `|Δ_predicted − Δ_real| < 100 ms`.
- [ ] C12.6 Snapshot tests on existing (non-counterfactual) reports unchanged.
- [ ] C12.7 `pnpm ohmyperf run <fixture-url>` wall-clock within ±2% of pre-change baseline (counterfactual code-path inert when flag absent — regression guard).
- [ ] C12.8 `pnpm ohmyperf run <fixture-url> --counterfactual` produces report with non-empty `counterfactuals[]` on a known-cause fixture; wall-clock ≤ 4× the inert run.
- [ ] C12.9 MCP `analyze_counterfactuals` smoke test in both modes.
- [ ] C12.10 `openspec validate add-counterfactual-attribution --strict` green.
