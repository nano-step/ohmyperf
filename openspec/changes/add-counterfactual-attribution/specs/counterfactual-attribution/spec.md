# Spec: Counterfactual Causal Attribution

## ADDED Requirements

### Requirement: Counterfactual analysis is strictly opt-in

The engine MUST NOT execute counterfactual analysis unless the user explicitly opts in via the `--counterfactual` CLI flag or the `counterfactual: true` option on the MCP `run` tool. When the option is absent, the engine's wall-clock and behavior MUST be byte-identical to the pre-change baseline.

#### Scenario: Counterfactual flag absent — code path inert

- **WHEN** the user runs `pnpm ohmyperf run https://example.com` without `--counterfactual`
- **THEN** the resulting Report's `counterfactuals` field is `undefined`
- **AND** the total wall-clock is within ±2% of the same command on the pre-change baseline
- **AND** no `Fetch.enable` CDP call is issued
- **AND** no `InterventionDriver.attach` is invoked

#### Scenario: Counterfactual flag present — analysis runs

- **WHEN** the user runs `pnpm ohmyperf run https://example.com --counterfactual`
- **THEN** the Report's `counterfactuals` field is an array
- **AND** at least one of `counterfactuals[].verdict` is one of `'causal-with-high-confidence' | 'causal-with-medium-confidence' | 'inconclusive' | 'no-effect'`

### Requirement: Top-3 LCP candidate ranking is deterministic

For a given input set of SPRT baseline runs, the LCP candidate ranker MUST produce a byte-identical ordered top-K candidate list across invocations on the same machine and across different machines.

#### Scenario: Same baseline → same ranked candidates

- **WHEN** the same `BaselineRun[]` JSON is passed to `rankLcp({ baseline, topK: 3 })` 50 times in a single process
- **THEN** all 50 invocations return the same `RankedCandidate[]` with byte-identical `score`, `cause`, `suggestedInterventions`, and `features` fields

#### Scenario: Ties broken by URL ascending

- **WHEN** two candidate URLs `https://b.example/a.jpg` and `https://a.example/b.jpg` produce the same `score` after weighted scoring
- **THEN** `https://a.example/b.jpg` appears first in the ranked list (URL `localeCompare` ascending)

#### Scenario: Empty baseline returns empty list

- **WHEN** `rankLcp({ baseline: [], topK: 3 })` is called
- **THEN** the result is `[]`
- **AND** no exception is thrown

### Requirement: Intervention runs use fresh `BrowserContext` per pass

Each intervention measurement pass MUST execute in a freshly-created `BrowserContext` (cookies, storage, HTTP cache, service workers all empty) to eliminate cross-pass contamination.

#### Scenario: No state leaks between intervention passes

- **WHEN** two consecutive `fulfill-cached` passes are executed on a fixture that writes a cookie on first load
- **THEN** the second pass observes no cookie set by the first pass (verified via `Network.getCookies` returning empty for the fixture's domain)

### Requirement: `fulfill-cached` strictly requires hermetic-replay cache

The `fulfill-cached` intervention MUST source its response body from the `add-hermetic-replay` `ReplayCache.getCached(url)` API. When the cache does not contain an entry for the candidate URL, the engine MUST skip that intervention and record `skipped: { reason: 'no-cache-entry' }` in the resulting `CounterfactualEvidence`. The engine MUST NOT fall back to a live-network fetch for the cached body.

#### Scenario: Hermetic cache hit — fulfill proceeds

- **WHEN** `intervention.kind === 'fulfill-cached'` for `https://cdn.example/hero.jpg` and `ReplayCache.getCached('https://cdn.example/hero.jpg')` returns a valid `CachedResponse`
- **THEN** the intervention applies via `Fetch.fulfillRequest` with the cached body
- **AND** the resulting evidence has `skipped: undefined`

#### Scenario: Hermetic cache miss — intervention skipped

- **WHEN** `intervention.kind === 'fulfill-cached'` for `https://cdn.example/hero.jpg` and `ReplayCache.getCached(...)` returns `undefined`
- **THEN** no `Fetch.fulfillRequest` is issued for that intervention
- **AND** the resulting evidence has `skipped = { reason: 'no-cache-entry' }`
- **AND** the engine's overall run does NOT fail

#### Scenario: `fail` intervention works without hermetic cache

- **WHEN** `intervention.kind === 'fail'` is applied to a candidate URL and `ReplayCache.getCached(...)` returns `undefined`
- **THEN** the `fail` intervention proceeds normally via `Fetch.failRequest`
- **AND** the resulting evidence does NOT have `skipped: { reason: 'no-cache-entry' }`

### Requirement: CSP-violating fulfills are skipped

Before applying a `fulfill-cached` intervention, the engine MUST consult per-origin CSP captured by the hermetic-replay cache. When fulfilling would violate the page's Content-Security-Policy (e.g. cross-origin script with `script-src 'self'`), the intervention MUST be skipped with `skipped: { reason: 'csp-violation' }`.

#### Scenario: Same-origin fulfill under strict CSP — allowed

- **WHEN** the page declares `Content-Security-Policy: default-src 'self'`
- **AND** the candidate URL is `https://example.com/hero.jpg` (same origin)
- **THEN** `InterventionDriver.canFulfill(url)` returns `{ ok: true }`
- **AND** the `fulfill-cached` intervention applies

#### Scenario: Cross-origin fulfill blocked by CSP — skipped

- **WHEN** the page declares `Content-Security-Policy: default-src 'self'`
- **AND** the candidate URL is `https://cdn.example/hero.jpg` (cross-origin)
- **THEN** `InterventionDriver.canFulfill(url)` returns `{ ok: false, reason: 'csp-violation' }`
- **AND** the evidence has `skipped = { reason: 'csp-violation' }`

### Requirement: `FetchRouter` priority chain co-exists with hermetic replay

When both `InterventionDriver` (priority 100) and hermetic-replay handlers (priority 10) are registered on the same `Fetch.requestPaused` stream, the higher-priority handler that claims a request MUST win. Unclaimed requests MUST fall through to lower-priority handlers. The router MUST issue exactly one `Fetch.continueRequest` (or fulfill/fail) per `requestPaused` event.

#### Scenario: Intervention claims; replay falls through

- **WHEN** a `fail` intervention is active for `https://cdn.example/hero.jpg` and a replay handler is registered at priority 10
- **AND** the page requests `https://cdn.example/hero.jpg`
- **THEN** the request is satisfied by `Fetch.failRequest` (the intervention)
- **AND** the replay handler is NOT invoked

#### Scenario: Non-intervened request falls through to replay

- **WHEN** the active intervention matches only `https://cdn.example/hero.jpg`
- **AND** the page requests `https://api.example/data.json` (no intervention match)
- **THEN** the replay handler at priority 10 handles `data.json` per its cache
- **AND** the request is satisfied exactly once (either by replay or by default continue)

### Requirement: Mann-Whitney U test selects exact vs. normal-approx by sample size

The stats module MUST use the exact null distribution of the U statistic when `n1 + n2 ≤ 20` and the normal approximation with tie correction otherwise. The returned `MWUResult.method` MUST identify which path was taken.

#### Scenario: Small N uses exact

- **WHEN** `mannWhitneyU(baseline=[100, 110, 120], intervention=[80, 90, 95])` is called (n1=3, n2=3, total=6 ≤ 20)
- **THEN** `result.method === 'exact'`
- **AND** `result.pValue` matches `scipy.stats.mannwhitneyu` reference output within 1e-6

#### Scenario: Large N uses normal approximation

- **WHEN** `mannWhitneyU` is called with `n1=15, n2=15` (total=30 > 20)
- **THEN** `result.method === 'normal-approx'`

### Requirement: Bootstrap CI is deterministic via seeded PRNG

The `bootstrapDeltaCI` function MUST produce byte-identical CI95 output for byte-identical inputs and a fixed seed. The default seed is `0xC0FFEE`.

#### Scenario: Same input + same seed → same CI

- **WHEN** `bootstrapDeltaCI(baseline, intervention)` is called twice with the same inputs in the same process
- **THEN** both calls return `BootstrapCI` with `lower` and `upper` byte-identical to 6 decimal places

#### Scenario: Different seed shifts CI

- **WHEN** `bootstrapDeltaCI(baseline, intervention, { seed: 1 })` and `bootstrapDeltaCI(baseline, intervention, { seed: 2 })` are called on a high-variance fixture
- **THEN** the two `lower` (or `upper`) bounds differ by at least 1 ms (proves the seed parameter actually controls sampling)

### Requirement: Verdict classifier returns one of four states

The `classifyVerdict({ delta, ci95, pValue })` function MUST return exactly one of: `'causal-with-high-confidence' | 'causal-with-medium-confidence' | 'inconclusive' | 'no-effect'`.

#### Scenario: Strong effect, narrow CI, low p → high confidence

- **WHEN** `delta = -612, ci95 = [-720, -504], pValue = 0.003` is classified
- **THEN** verdict is `'causal-with-high-confidence'`

#### Scenario: Medium effect → medium confidence

- **WHEN** `delta = -35, ci95 = [-60, -10], pValue = 0.02` is classified
- **THEN** verdict is `'causal-with-medium-confidence'`

#### Scenario: CI crosses zero — never high confidence

- **WHEN** `delta = -80, ci95 = [-150, 50], pValue = 0.04` is classified
- **THEN** verdict is `'inconclusive'` (CI crosses zero precludes both "causal" verdicts)

#### Scenario: Negligible effect with high p → no effect

- **WHEN** `delta = 2, ci95 = [-5, 9], pValue = 0.85` is classified
- **THEN** verdict is `'no-effect'`

#### Scenario: Default to inconclusive

- **WHEN** none of the other verdict conditions are met
- **THEN** verdict is `'inconclusive'`

### Requirement: 4× wall-clock budget is enforced

The engine MUST track per-phase wall-clock time and abort remaining intervention candidates when total Phase-3 elapsed time exceeds 4× the SPRT baseline phase elapsed time. Already-completed evidence entries MUST be marked `partialFailure: true` and an engine-level warning MUST be emitted.

#### Scenario: Budget honored — full evidence

- **WHEN** Phase 3 completes within `4 × baselineElapsedMs`
- **THEN** all top-K candidates have evidence with `partialFailure: undefined` (or `false`)
- **AND** no budget-breach warning is emitted

#### Scenario: Budget breached — partial evidence

- **WHEN** Phase 3 elapsed time exceeds `4 × baselineElapsedMs` after completing 1 of 3 candidates
- **THEN** the 1 completed candidate's evidence has `partialFailure: true`
- **AND** the 2 remaining candidates do not appear in `report.counterfactuals` (or appear with `skipped: { reason: 'budget-exceeded' }`)
- **AND** the engine logger emits `counterfactual.budget-breached` at `warn` level with `{ elapsedMs, budgetMs }`

### Requirement: Schema is additive at `1.0.0`

All counterfactual-related shared-types additions MUST be optional fields on existing types or new types. The `Report` type MUST gain `counterfactuals?: CounterfactualEvidence[]` only. No existing field's required/optional status, name, or shape may change. No `shared-types` major or minor version bump is required.

#### Scenario: Old consumer reads new report — no crash

- **WHEN** a v2.0 viewer (compiled against pre-counterfactual `shared-types`) reads a Report with `counterfactuals: [...]`
- **THEN** the viewer renders the report without throwing
- **AND** the new `counterfactuals` field is simply ignored

#### Scenario: New viewer reads old report — no crash

- **WHEN** a v2.1 viewer (compiled against post-counterfactual `shared-types`) reads a Report WITHOUT a `counterfactuals` field
- **THEN** the viewer renders normally
- **AND** any code reading `report.counterfactuals?.length` evaluates to `0`

### Requirement: MCP tool `analyze_counterfactuals` supports two distinct modes

The MCP tool MUST accept a required `mode` parameter with values `'analyze'` (read an existing report file) or `'run'` (trigger a fresh `--counterfactual` engine execution). The tool MUST reject inputs missing `mode` or with any other `mode` value.

#### Scenario: `analyze` mode reads existing report

- **WHEN** the tool is invoked with `{ mode: 'analyze', reportPath: '/tmp/report.json' }`
- **AND** `/tmp/report.json` contains a Report with 3 counterfactual evidence entries
- **THEN** the tool returns `{ summary, findings }` with 3 findings
- **AND** no new engine run is triggered (verified by no `Fetch.enable` CDP call)
- **AND** the tool completes in under 1 second

#### Scenario: `run` mode triggers fresh execution

- **WHEN** the tool is invoked with `{ mode: 'run', target: 'https://example.com', topK: 3 }`
- **THEN** the engine executes `engine.run({ url: 'https://example.com', counterfactual: true, topK: 3 })`
- **AND** the tool returns `{ summary, findings }` derived from the fresh report

#### Scenario: Invalid mode rejected

- **WHEN** the tool is invoked with `{ mode: 'foo' }`
- **THEN** the input schema validation rejects the call
- **AND** no engine action is taken

### Requirement: Validation corpus achieves MAPE < 15%

The counterfactual corpus harness MUST measure the absolute percentage error between the predicted Δ (from `--counterfactual`) and the real Δ (from baseline runs on the fixture-with-fix-applied) for each supported fixture, and the mean across the supported-fixture set MUST be below 15%.

#### Scenario: Aggregate MAPE under threshold

- **WHEN** the `tests/counterfactual-corpus/mape.test.ts` harness runs all 8 supported fixtures (the 2 `unsupported-lcp-source` fixtures are excluded from the aggregate)
- **THEN** `mean(|predictedDelta_i − realDelta_i| / realDelta_i for i in 1..8) < 0.15`

#### Scenario: Lighthouse-opportunities MAPE benchmark exceeds 40%

- **WHEN** the same harness measures Lighthouse 13.x "opportunities" potentialSavingsMs predictions against the same real Δ values
- **THEN** `mean(|lighthousePrediction_i − realDelta_i| / realDelta_i for i in 1..8) > 0.40`
- **AND** the corpus's `results.json` records both MAPE values side-by-side for moat-claim defense

### Requirement: Synthetic preload-delta acceptance gate

For the synthetic fixture `lcp-oversized-hero-image`, the predicted Δ from `intervention: 'fulfill-cached'` MUST be within 100 ms of the real measured Δ produced by applying `<link rel="preload">` to the fixture and re-running baseline.

#### Scenario: Predicted Δ matches real preload Δ within 100 ms

- **WHEN** `tests/counterfactual-corpus/synthetic-preload-delta.test.ts` runs end-to-end
- **THEN** `|predictedDelta − (baselineLcp_median − optimizedLcp_median)| < 100 ms`

### Requirement: Determinism — identical input produces byte-identical evidence

Running the counterfactual analysis twice on the same SPRT baseline input (frozen JSON file) MUST produce byte-identical `report.counterfactuals` JSON output.

#### Scenario: Two runs on same baseline → same evidence

- **WHEN** `tests/counterfactual-corpus/determinism.test.ts` invokes the counterfactual orchestrator twice with the same `BaselineRun[]` input JSON
- **THEN** `JSON.stringify(report1.counterfactuals) === JSON.stringify(report2.counterfactuals)`

### Requirement: Unsupported LCP sources are explicitly marked

LCP sources that v1 does not support (text LCP, CSS background-image LCP, service-worker-served LCP) MUST appear in the ranker output as candidates but with `suggestedInterventions: []`, and MUST produce evidence entries with `skipped: { reason: 'unsupported-lcp-source' }` instead of silently absent results.

#### Scenario: Text LCP — present in evidence as skipped

- **WHEN** the fixture's LCP element is `<h1>Heading</h1>` (text LCP)
- **THEN** the ranker includes the text LCP as a candidate
- **AND** `suggestedInterventions === []`
- **AND** the evidence for that candidate has `skipped = { reason: 'unsupported-lcp-source' }`
- **AND** no CDP intervention call is issued for that candidate

#### Scenario: CSS background-image LCP — present in evidence as skipped

- **WHEN** the fixture's LCP element is a `<div>` with `background-image: url(/hero.jpg)`
- **THEN** the evidence for that candidate has `skipped = { reason: 'unsupported-lcp-source' }`
