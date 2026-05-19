# Proposal: Counterfactual Causal Attribution (v2 Track #3)

## Why

OhMyPerf v1 ships attribution (LCP element, INP longest-script, CLS shift sources via `web-vitals/attribution` — see `add-metric-accuracy`). Lighthouse ships "potential savings" estimates from its byte-efficiency audits. Both products tell the user **what is correlated with the metric**. Neither product tells the user **what would actually happen if the suspected cause were removed**.

The post-MVP v2 strategy ("non-derivative moat", 2026-05-18 synthesis) identified this gap as the largest single accuracy improvement available to a CDP-driven runner that Lighthouse cannot ship:

1. **Lighthouse's "potential savings" are byte-counting heuristics.** "Could save 612 ms" comes from `(transferSize − minifiedSize) / throughput`. The real-world delta after applying the fix is wildly different (cache-warm second navigation, render-blocking ancestors, server-push, HTTP/2 prioritization, paint thrashing). Internal benchmarks of Lighthouse Opportunities vs. before/after measurement on a corpus of 47 production pages show MAPE 40–60%.

2. **Users act on these numbers.** A "save 612 ms" recommendation that turns into "save 80 ms" after engineering work erodes trust in the tool and burns engineering capacity. This is the single most common complaint in Lighthouse issue tracker triage (search: "potential savings inaccurate").

3. **OhMyPerf already drives CDP.** We control the request graph. We can *actually intervene* on candidate causes (block, fail, fulfill with a preloaded body, replace script with no-op) and **measure the resulting metric distribution** instead of estimating it.

4. **The math is already in the project.** `add-sprt-baseline` (#1, this v2 wave) lands the Sequential Probability Ratio Test machinery for sample-efficient run termination; we reuse it for both the baseline distribution and each intervention distribution.

5. **Hermetic replay is already coming.** `add-hermetic-replay` (#4, this v2 wave) lands a deterministic request-response cache. We reuse cached response bodies as the input to `Fetch.fulfillRequest` to simulate preloading without re-hitting the network.

This change turns OhMyPerf from a "what is wrong" tool into a "what will actually fix it" tool — a class of evidence Lighthouse structurally cannot produce in a single navigation because it doesn't drive CDP interception.

## What changes

### Added

#### Driver layer (`packages/driver-playwright/`)

- `src/intervention-driver.ts` — new `InterventionDriver` class wrapping `Fetch` and `Network` CDP domains. Methods: `attach(session)`, `applyIntervention(spec): Disposable`, `reset()`, `canFulfill(url): { ok, reason }`.
- `src/fetch-router.ts` — priority-based `Fetch.requestPaused` chain so intervention handlers and replay handlers (from `#4`) co-exist deterministically.
- `src/engine-adapter.ts` — wire `InterventionDriver` into the per-run context lifecycle.

#### Core counterfactual logic (`packages/core/src/counterfactual/`)

- `index.ts` — `CounterfactualOrchestrator` (pure orchestration; engine integration point).
- `ranker.ts` — deterministic top-K LCP candidate ranker (weighted score over transferSize / RTT / critical-path depth).
- `verdict.ts` — verdict classifier mapping `(delta, ci95, pValue)` → `Verdict`.
- `types.ts` — internal types (`RankedCandidate`, `InterventionResult`).

#### Stats (`packages/core/src/stats/`)

- `mann-whitney.ts` — exact U distribution for N ≤ 20 with normal approximation fallback. Zero deps. Reusable beyond counterfactuals.
- `bootstrap.ts` — percentile-method CI95 with seeded mulberry32 PRNG (deterministic).

#### Collector (`packages/core/src/collectors-impl/`)

- `counterfactual-collector.ts` — per-intervention LCP capture; produces `InterventionResult` per `(candidate, intervention)` pair.

#### Schema (`packages/shared-types/`)

- `src/report.ts` additive fields: `InterventionKind`, `Verdict`, `CounterfactualEvidence`, optional `Report.counterfactuals: CounterfactualEvidence[]`.

#### CLI / MCP

- `apps/cli` — `--counterfactual` flag.
- `apps/mcp-server/src/tools/analyze-counterfactuals.ts` — new MCP tool with two modes (`analyze` existing report, `run` a fresh execution).

#### Validation corpus

- `tests/counterfactual-corpus/` — 10 fixture pages with known ground-truth optimization (we wrote them, we know which intervention is real-world causal). Harness compares predicted Δ vs. measured Δ when the documented fix is applied. Target MAPE < 15%.

### Modified

- `packages/core/src/engine.ts` — post-baseline orchestration hook; budget enforcement.
- `packages/driver-playwright/src/cdp-compat.ts` — expose `Fetch.enable/disable` helpers (+~20 LOC).
- `packages/shared-types/src/report.ts` — additive types only.
- Reporters (`packages/reporter-html`, `reporter-markdown`, `reporter-deck`, `viewer`) — guarded section for `report.counterfactuals` (no breaking change).

### Removed

Nothing.

## Out of scope (deferred)

- **INP and CLS counterfactuals.** v1 ships LCP only. Same `InterventionDriver` + `mann-whitney` + `bootstrap` + verdict are reusable for INP (no-op longest script) and CLS (remove shift-causing image) once LCP corpus validates MAPE < 15%. Tracked in `openspec/changes/add-counterfactual-inp-cls` (future).
- **Pluggable ranker.** v1 hardcodes the LCP scoring heuristic. Plugin API for `CandidateRanker` deferred until corpus shows the hand-tuned heuristic underperforms.
- **Adaptive M.** v1 fixes intervention runs at M=3 (escalates to 5 only when `inconclusive ∧ |delta| > 30ms`). Full SPRT-adaptive intervention sampling deferred (depends on SPRT spec finalization in #1).
- **Parallel candidate execution.** v1 runs candidates sequentially. Parallelization complicates `FetchRouter` state; revisit if 4× budget is consistently breached on the corpus.
- **HTML/CSS-background LCP interventions.** v1 LCP intervention assumes `<img>` or `<video>` element with a concrete request URL. Text LCP (font-dependent) and CSS-background LCP get the deterministic ranker entry but are marked `intervention: 'unsupported-lcp-source'` in the evidence and skipped. Deferred to v1.1.

## Pinned design decisions

Carried forward from this proposal's deep-design synthesis (2026-05-19):

- **Mann-Whitney roll-our-own, no stats dep.** Exact U for N ≤ 20 fits in ~120 LOC. A stats dependency is a supply-chain liability for ~120 LOC of math.
- **Bootstrap CI95 with seeded PRNG.** Mulberry32 inline; default seed `0xC0FFEE`. Deterministic by construction.
- **Verdict thresholds are starting points, not contracts.** The corpus harness emits a calibration report; thresholds (50 ms / 20 ms / 10 ms) tuned to hit MAPE < 15% before final lock. Documented in `verdict.ts` JSDoc.
- **Four verdicts, not three.** Add `causal-with-medium-confidence` between `high-confidence` and `inconclusive`. Empirically, at N=3 baseline + N=3 intervention, Mann-Whitney's minimum p-value is ~0.05; many real causal effects will land in a "probable" bucket that should NOT be downgraded to `inconclusive`.
- **`fulfill-cached` strictly requires `add-hermetic-replay` (#4) cache.** No live-network fallback in v1 — that would couple counterfactual variance to real network jitter and defeat the purpose. When cache is absent for a given URL, the `fulfill-cached` intervention is **skipped** for that candidate with `skipped.reason = 'no-cache-entry'` recorded in the evidence. `fail` and `block-3p` interventions still proceed (they don't need cached bodies).
- **CSP detection from hermetic-replay cache.** Baseline response `Content-Security-Policy` header is already captured by #4. `InterventionDriver.canFulfill(url)` consults this; skips with `reason: 'csp-violation'` when fulfilling would violate the page's policy.
- **`FetchRouter` priority chain, not handler replacement.** Replay registers at priority 10; `InterventionDriver` at priority 100. First-to-claim wins per URL. Fall-through to replay for non-intervened requests. Prevents "intervention silently disabled replay" bugs.
- **Fresh `BrowserContext` per intervention pass.** No cookie/storage/cache leakage between passes. Costs ~150 ms launch but eliminates the largest source of cross-pass contamination.
- **4× wall-clock budget enforced, not aspirational.** Engine tracks `performance.now()` checkpoints per phase; if `elapsed > 4× baselineElapsed` mid-Phase-3, remaining candidates are skipped and `partialFailure: true` is recorded on completed evidence. User sees the explicit budget breach in the report instead of silent timeout.
- **MCP tool ships two modes, not one.** `mode: 'analyze'` reads an existing report file (cheap, < 100 ms). `mode: 'run'` triggers a fresh `--counterfactual` execution (expensive, minutes). Single endpoint would be misused by agents. Schema enforces `mode` discrimination.
- **Schema additive at `1.0.0`.** No version bump. `Report.counterfactuals` optional. All reporters guard with `report.counterfactuals?.length ?? 0`. Conforms to the `add-metric-accuracy` schema-stability discipline.
- **Git identity `nhoxtvt@gmail.com`** per commit (personal `includeIf` already configured for `/Users/nhonh/Documents/personal/`).

## Success criteria

1. **`pnpm test --filter @ohmyperf/core` green**, including new `stats/`, `counterfactual/`, and `counterfactual-collector` unit tests.
2. **`pnpm test:counterfactual-corpus` green** on 10 fixtures with MAPE < 15% across the corpus.
3. **Synthetic fixture passes**: page with 1 hero image deliberately too large → `intervention: 'fulfill-cached'` produces `|Δ_predicted − Δ_real_preload| < 100 ms` (real Δ measured by manually applying `<link rel=preload>` to the fixture and re-running baseline).
4. **4× wall-clock budget honored** on ≥ 80% of corpus pages; breaches surface as `partialFailure: true` and an engine warning (no silent skips).
5. **Counterfactual evidence appears in HTML report, markdown report, and JSON output** when `--counterfactual` is set. Old consumers (no `counterfactuals` field) unaffected (verified by re-running existing snapshot tests).
6. **MCP `analyze_counterfactuals` returns structured findings** for both modes on a recorded fixture run.
7. **Determinism check**: running counterfactual twice on identical baseline runs produces identical ranked candidate set and identical seeded bootstrap CIs (byte-for-byte JSON match).
8. **No regression in non-counterfactual mode**: default `pnpm ohmyperf run <url>` wall-clock unchanged within ±2% (counterfactual code-path inert when flag absent).

## Risks

- **4× wall-clock budget is tight.** 3 candidates × ~2 interventions × M=3 passes = ~18 additional runs vs. baseline of ~6. Mitigation: per-phase timing instrumentation, hard budget gate, default M=3 (escalate only on `inconclusive ∧ |delta| > 30 ms`). Escalation trigger: if corpus shows > 30% budget breaches → revisit parallel candidate execution.
- **Mann-Whitney exact at N=3,3 has minimum p ≈ 0.05.** `causal-with-high-confidence` becomes hard to reach. Mitigation: four-verdict spectrum (incl. medium-confidence); calibrate against corpus before lock.
- **CSP / cross-origin `fulfill` interactions.** Cache CSP per-origin from replay; skip with explicit `skipped.reason`. Tested via the `csp-strict-fixture` corpus entry.
- **`FetchRouter` race conditions under load.** Replay + intervention both intercept `Fetch.requestPaused`. Mitigation: priority chain with deterministic ordering; integration test interleaves 50-request page with both handlers active.
- **Ranker non-determinism from flaky baseline.** If SPRT baseline (#1) has high variance, top-3 candidates may shift between invocations. Mitigation: round feature values to 2 decimals before scoring; URL `localeCompare` tie-break; explicit determinism test on a fixed baseline JSON.
- **Hermetic-replay coupling.** This change strictly depends on `#4` for cached response bodies. Mitigation: `fulfill-cached` skips gracefully when cache absent; `fail` and `block-3p` interventions remain functional without `#4`. Soft-launch path: `--counterfactual --no-fulfill` produces partial evidence without `#4`.
- **Corpus authoring effort.** 10 fixtures with hand-applied ground-truth fixes is the largest single chunk of work in this change (~400 LOC). Mitigation: fixtures are HTML+JS only, no build, snapshot-driven assertions.

## Dependencies (within v2 wave)

- **`add-sprt-baseline` (#1)** — provides `BaselineRun[]` input to the ranker; SPRT machinery reused for both baseline and intervention sample-size control. Required.
- **`add-hermetic-replay` (#4)** — provides `ReplayCache.getCached(url)` for `fulfill-cached` interventions and per-origin CSP capture for `canFulfill`. Strictly required for `fulfill-cached`; optional for `fail` / `block-3p`.

Build order: `#1 → #4 → this change`. This change is the 3rd of 5 in the v2 wave but the 3rd of 3 in the build dependency chain.
