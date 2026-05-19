# Design: Counterfactual Causal Attribution

> Companion to `proposal.md`. Architecture deep-dive. Pinned 2026-05-19 from deep-design pipeline (Oracle + inline Metis-style risk pass; Metis sub-agent unavailable at execution time, risks self-reviewed against the same checklist).

## 1. Module boundaries

```
packages/driver-playwright/src/
  intervention-driver.ts          NEW ~250  CDP Fetch/Network interception, stateful
  fetch-router.ts                 NEW ~120  priority chain for Fetch.requestPaused
  cdp-compat.ts                   MOD  +20  expose Fetch.enable/disable helpers
  engine-adapter.ts               MOD  +40  wire InterventionDriver into context lifecycle

packages/core/src/
  counterfactual/
    index.ts                      NEW ~50   CounterfactualOrchestrator (engine entry)
    ranker.ts                     NEW ~150  deterministic LCP candidate ranking
    verdict.ts                    NEW ~80   threshold classifier
    types.ts                      NEW ~40   internal types
  stats/
    mann-whitney.ts               NEW ~120  exact U for N<=20, normal approx fallback
    bootstrap.ts                  NEW ~80   percentile CI95, seeded mulberry32 PRNG
  collectors-impl/
    counterfactual-collector.ts   NEW ~200  per-intervention LCP measurement loop
  engine.ts                       MOD  ~80  post-baseline orchestration hook

packages/shared-types/src/
  report.ts                       MOD  ~60  CounterfactualEvidence, Verdict, InterventionKind

apps/cli/                         MOD  ~30  --counterfactual flag wiring
apps/mcp-server/src/tools/
  analyze-counterfactuals.ts      NEW ~120  MCP tool (analyze | run modes)

tests/counterfactual-corpus/      NEW ~400  10 fixtures + harness + MAPE assertion
```

Total: **~1,720 LOC** (proposal budget 1,500–2,000).

**Why these splits:**

- `InterventionDriver` is its own file, not appended to `cdp-compat.ts`. `cdp-compat.ts` stays a low-level stateless wrapper. Intervention logic is stateful (tracks active rules + Disposables) and warrants isolation.
- `ranker.ts` and `verdict.ts` live in `core/src/counterfactual/`, not under `collectors-impl/`, because they are pure logic consumed by the engine and have no Playwright/CDP dependency. They are unit-testable without spawning a browser.
- Stats lives in `core/src/stats/`. Reusable beyond counterfactuals (regression detection in a later wave will consume the same Mann-Whitney + bootstrap modules).

## 2. Key interfaces

### `driver-playwright/src/intervention-driver.ts`

```ts
import type { CDPSession } from 'playwright-core';

export type InterventionKind =
  | 'fail'
  | 'fulfill-cached'
  | 'block-3p'
  | 'noop-script';

export interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;          // sourced from hermetic-replay cache (#4)
  mimeType: string;
}

export type InterventionSpec =
  | { kind: 'fail'; url: string; errorReason?: 'Failed' | 'TimedOut' }
  | { kind: 'fulfill-cached'; url: string; cachedBody: CachedResponse }
  | { kind: 'block-3p'; urlPattern: string }
  | { kind: 'noop-script'; url: string };

export interface Disposable {
  dispose(): Promise<void>;
}

export interface InterventionDriver {
  /** Idempotent. Safe to call before first navigation. */
  attach(session: CDPSession): Promise<void>;

  /** Returns Disposable; caller MUST dispose between passes. */
  applyIntervention(spec: InterventionSpec): Promise<Disposable>;

  /** Drops all active rules. Called between passes. */
  reset(): Promise<void>;

  /** Runtime gate. Consults CSP / cross-origin before applying. */
  canFulfill(url: string): Promise<{ ok: boolean; reason?: string }>;
}
```

### `core/src/counterfactual/ranker.ts`

```ts
import type { BaselineRun } from '../engine';
import type { InterventionKind } from '@ohmyperf/shared-types';

export interface RankedCandidate {
  cause: string;
  score: number;
  suggestedInterventions: InterventionKind[];   // ordered preference
  features: {
    normalizedTransferSize: number;
    normalizedLatency: number;
    criticalPathDepth: number;
    isThirdParty: boolean;
    isRenderBlocking: boolean;
  };
}

export interface RankerInput {
  baseline: BaselineRun[];
  topK?: number;   // default 3
}

/** Pure. Deterministic. Same input → same output. */
export function rankLcp(input: RankerInput): RankedCandidate[];
```

### `core/src/collectors-impl/counterfactual-collector.ts`

```ts
import type { InterventionDriver, InterventionSpec } from '@ohmyperf/driver-playwright';

export interface InterventionMeasurement {
  lcpMs: number;
  passIndex: number;
  appliedAt: number;
  skipped?: { reason: string };
}

export interface InterventionResult {
  spec: InterventionSpec;
  measurements: InterventionMeasurement[];
  partialFailure: boolean;
}

export interface CounterfactualCollector {
  measure(
    driver: InterventionDriver,
    spec: InterventionSpec,
    n: number,
    runOne: () => Promise<{ lcpMs: number }>,
  ): Promise<InterventionResult>;
}
```

### `core/src/stats/mann-whitney.ts`

```ts
export interface MWUResult {
  u: number;
  pValue: number;        // two-sided
  effectSize: number;    // rank-biserial correlation
  method: 'exact' | 'normal-approx';
}

/** Exact for n1+n2 <= 20, normal approximation with tie correction otherwise. */
export function mannWhitneyU(baseline: number[], intervention: number[]): MWUResult;
```

### `core/src/stats/bootstrap.ts`

```ts
export interface BootstrapCI {
  point: number;
  lower: number;
  upper: number;
  iterations: number;
}

/** Default 10k iterations, alpha=0.05, seed=0xC0FFEE. Deterministic. */
export function bootstrapDeltaCI(
  baseline: number[],
  intervention: number[],
  opts?: { iterations?: number; alpha?: number; seed?: number },
): BootstrapCI;
```

### `core/src/counterfactual/verdict.ts`

```ts
import type { Verdict } from '@ohmyperf/shared-types';

export interface VerdictInput {
  delta: number;
  ci95: [number, number];
  pValue: number;
}

export function classifyVerdict(input: VerdictInput): Verdict;
```

### `shared-types/src/report.ts` (additions only)

```ts
export type InterventionKind =
  | 'fail' | 'fulfill-cached' | 'block-3p' | 'noop-script';

export type Verdict =
  | 'causal-with-high-confidence'
  | 'causal-with-medium-confidence'
  | 'inconclusive'
  | 'no-effect';

export interface CounterfactualEvidence {
  cause: string;
  intervention: InterventionKind;
  observedDelta: number;          // ms; positive = metric improved when intervention applied
  ci95: [number, number];
  pValue: number;
  verdict: Verdict;
  baselineN: number;
  interventionN: number;
  skipped?: { reason: string };
  partialFailure?: boolean;
}

export interface Report {
  // ... existing fields
  counterfactuals?: CounterfactualEvidence[];
}
```

## 3. Data flow

```
CLI / MCP
  └─ parse --counterfactual=true
     └─ engine.run({ counterfactual: true })
        │
        ├─ Phase 1: SPRT baseline (from #1)         → BaselineRun[]
        │
        ├─ Phase 2: rankLcp(baseline, topK=3)        → RankedCandidate[]   (pure, no I/O)
        │
        ├─ Phase 3 (sequential, budget-gated):
        │   for each candidate:
        │     for each suggested intervention kind:
        │       ├─ fresh BrowserContext              ─┐
        │       ├─ attach replay handler (#4)         │ ordering MATTERS, see §4
        │       ├─ attach InterventionDriver          ┘
        │       ├─ driver.canFulfill(url) if 'fulfill-cached'
        │       │     skip with reason if blocked
        │       ├─ collector.measure(driver, spec, M=3, runOne)
        │       │     → InterventionResult
        │       ├─ driver.reset()
        │       └─ context.close()
        │     pick best intervention per candidate (max |delta|)
        │
        ├─ Phase 4: for each (candidate, chosen intervention):
        │     ├─ mannWhitneyU(baseline.lcp, intervention.lcp)
        │     ├─ bootstrapDeltaCI(baseline.lcp, intervention.lcp)
        │     └─ classifyVerdict({ delta, ci95, pValue })
        │           → CounterfactualEvidence
        │
        └─ Phase 5: report.counterfactuals = evidence[]
                    (additive; no existing field touched)
```

**Budget enforcement**. Engine wraps Phase 3 in a wall-clock check. If `elapsed > 4 × baselineElapsed`, abort remaining candidates and mark `partialFailure: true` on completed evidence. Emit a warning via the existing engine logger. Time accounting uses `performance.now()` checkpoints per phase.

## 4. Layering with hermetic replay (#4)

CDP `Fetch.requestPaused` fires once per request; only one handler can satisfy the pause (`Fetch.continueRequest` / `fulfillRequest` / `failRequest`). Replay (`#4`) and `InterventionDriver` both want to intercept. Solution: a chain.

```ts
// in driver-playwright/src/fetch-router.ts

export interface FetchHandler {
  /** Return true to claim the request; false to fall through. */
  handle(event: Fetch.RequestPausedEvent): Promise<boolean>;
}

export class FetchRouter {
  private handlers: Array<{ h: FetchHandler; p: number }> = [];

  register(handler: FetchHandler, priority: number): Disposable {
    this.handlers.push({ h: handler, p: priority });
    this.handlers.sort((a, b) => b.p - a.p);   // desc
    return { dispose: async () => { /* remove */ } };
  }

  async onRequestPaused(event: Fetch.RequestPausedEvent): Promise<void> {
    for (const { h } of this.handlers) {
      if (await h.handle(event)) return;       // first to claim wins
    }
    // no claim → default continue
    await this.session.send('Fetch.continueRequest', { requestId: event.requestId });
  }
}
```

**Resolution rules:**

- `InterventionDriver` registers at **priority 100**, replay at **priority 10**.
- Intervention matches URL → claims (`fail` / `fulfill` / rewrite to no-op).
- Intervention does not match → falls through to replay.
- `fulfill-cached` queries `ReplayCache.getCached(url)`. If absent: `canFulfill` returns `{ ok: false, reason: 'no-cache-entry' }`, the intervention is skipped (recorded in evidence, NOT silently failed).
- CSP detection: per-origin CSP captured by replay during baseline; `InterventionDriver.canFulfill` consults it before fulfilling. Cross-origin script fulfill blocked by `default-src 'self'`, etc. → skip with `reason: 'csp-violation'`.

**Contract for `#4` (must add):**

```ts
export interface ReplayCache {
  getCached(url: string): CachedResponse | undefined;
  getCspForOrigin(origin: string): string | undefined;
}
```

This is ~10 LOC inside `#4`; counterfactual change does not modify `#4` source but documents the requirement in this design.

## 5. Deterministic ranker (LCP v1)

```ts
// core/src/counterfactual/ranker.ts

interface CandidateFeatures {
  url: string;
  transferSize: number;         // bytes
  rttMs: number;                // to origin
  criticalPathDepth: number;    // count of render-blocking ancestors
  isThirdParty: boolean;
  isRenderBlocking: boolean;
}

const WEIGHTS = {
  transferSize: 0.5,
  latency: 0.3,
  criticalPath: 0.2,
} as const;

function normalize(value: number, max: number): number {
  return max === 0 ? 0 : Math.min(1, value / max);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function rankLcp(input: RankerInput): RankedCandidate[] {
  const features = extractFeatures(input.baseline);              // dedup by URL
  const maxSize = Math.max(...features.map(f => f.transferSize), 1);
  const maxRtt = Math.max(...features.map(f => f.rttMs), 1);
  const maxDepth = Math.max(...features.map(f => f.criticalPathDepth), 1);

  const scored = features.map(f => ({
    cause: f.url,
    score: round2(
      WEIGHTS.transferSize * normalize(f.transferSize, maxSize) +
      WEIGHTS.latency * normalize(f.rttMs, maxRtt) +
      WEIGHTS.criticalPath * normalize(f.criticalPathDepth, maxDepth),
    ),
    suggestedInterventions: pickInterventions(f),
    features: {
      normalizedTransferSize: round2(normalize(f.transferSize, maxSize)),
      normalizedLatency: round2(normalize(f.rttMs, maxRtt)),
      criticalPathDepth: f.criticalPathDepth,
      isThirdParty: f.isThirdParty,
      isRenderBlocking: f.isRenderBlocking,
    },
  }));

  // Stable sort: score desc, then URL asc (deterministic tie-break)
  scored.sort((a, b) => b.score - a.score || a.cause.localeCompare(b.cause));
  return scored.slice(0, input.topK ?? 3);
}

function pickInterventions(f: CandidateFeatures): InterventionKind[] {
  if (f.isThirdParty && f.isRenderBlocking) return ['block-3p', 'fail'];
  if (f.url.endsWith('.js')) return ['noop-script', 'fulfill-cached'];
  return ['fulfill-cached', 'fail'];
}
```

**Determinism guarantees:**

- Stable sort with URL tie-break.
- No `Math.random`. Bootstrap uses seeded mulberry32.
- Feature extraction iterates baseline runs sorted by `runIndex`.
- Feature values rounded to 2 decimals before scoring (eliminates floating-point jitter between cold/warm reads of the same HAR-equivalent data).

## 6. Stats module

### Mann-Whitney U (~120 LOC)

- **N1 + N2 ≤ 20**: exact null distribution via dynamic programming over rank sums. Precompute `nullDist[n1][n2][u]` lazily; cache memoized.
- **N1 + N2 > 20**: normal approximation with tie correction. Two-sided p-value.

### Bootstrap CI (~80 LOC)

- Seeded PRNG: `mulberry32` (32-bit state, inlined ~30 LOC). Seed `0xC0FFEE` default.
- Iterations: 10,000 (configurable via opts).
- Percentile method: `[alpha/2, 1 − alpha/2]` quantiles of resampled deltas.

### Verdict thresholds (`verdict.ts`)

```ts
export function classifyVerdict({ delta, ci95, pValue }: VerdictInput): Verdict {
  const absDelta = Math.abs(delta);
  const ciCrossesZero = ci95[0] <= 0 && ci95[1] >= 0;

  if (pValue < 0.05 && absDelta > 50 && !ciCrossesZero) return 'causal-with-high-confidence';
  if (pValue < 0.05 && absDelta > 20 && !ciCrossesZero) return 'causal-with-medium-confidence';
  if (absDelta < 10 && pValue >= 0.5) return 'no-effect';
  return 'inconclusive';
}
```

**Calibration**: thresholds (50 ms, 20 ms, 10 ms) are starting points. Corpus harness emits a calibration report (`tests/counterfactual-corpus/calibration-report.json`). Tune to MAPE < 15% before locking. Calibration tunings recorded as ADR.

## 7. Additive schema

- All `shared-types/src/report.ts` changes are additions. No existing field touched.
- `Report.counterfactuals` is optional → existing JSON consumers (no key) unaffected.
- Reporters guard with `if (report.counterfactuals?.length)`.
- No `shared-types` minor version bump required (additive optional under semver discipline established in `add-metric-accuracy`).

## 8. MCP tool `analyze_counterfactuals`

```ts
// apps/mcp-server/src/tools/analyze-counterfactuals.ts

export const analyzeCounterfactualsTool = {
  name: 'analyze_counterfactuals',
  description: 'Inspect or trigger counterfactual causal analysis of a perf report.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['analyze', 'run'] },
      reportPath: { type: 'string' },          // required when mode=analyze
      target: { type: 'string' },              // required when mode=run (URL)
      topK: { type: 'number', default: 3 },
    },
    required: ['mode'],
  },
  async handler(input) {
    if (input.mode === 'analyze') {
      const report = await loadReport(input.reportPath);
      return summarize(report.counterfactuals ?? []);
    }
    const report = await engine.run({
      url: input.target,
      counterfactual: true,
      topK: input.topK,
    });
    return summarize(report.counterfactuals ?? []);
  },
};

function summarize(evidence: CounterfactualEvidence[]) {
  return {
    summary: `${evidence.filter(e => e.verdict.startsWith('causal')).length} causal findings`,
    findings: evidence.map(e => ({
      cause: e.cause,
      verdict: e.verdict,
      delta: `${e.observedDelta.toFixed(0)} ms`,
      confidence: `p=${e.pValue.toFixed(3)}, CI=[${e.ci95[0].toFixed(0)}, ${e.ci95[1].toFixed(0)}]`,
      ...(e.skipped && { skipped: e.skipped.reason }),
    })),
  };
}
```

Two modes is the right call. `analyze` is cheap (read JSON file). `run` is expensive (full execution, minutes). A single endpoint would be misused by agents asking "analyze this URL" and getting surprise minute-long runs.

## 9. File list & LOC

| File | LOC |
|---|---|
| `driver-playwright/src/intervention-driver.ts` | 250 |
| `driver-playwright/src/fetch-router.ts` | 120 |
| `driver-playwright/src/engine-adapter.ts` (additions) | 40 |
| `driver-playwright/src/cdp-compat.ts` (additions) | 20 |
| `core/src/counterfactual/index.ts` | 50 |
| `core/src/counterfactual/ranker.ts` | 150 |
| `core/src/counterfactual/verdict.ts` | 80 |
| `core/src/counterfactual/types.ts` | 40 |
| `core/src/stats/mann-whitney.ts` | 120 |
| `core/src/stats/bootstrap.ts` | 80 |
| `core/src/collectors-impl/counterfactual-collector.ts` | 200 |
| `core/src/engine.ts` (integration) | 80 |
| `shared-types/src/report.ts` (additions) | 60 |
| `apps/cli` flag wiring | 30 |
| `apps/mcp-server/src/tools/analyze-counterfactuals.ts` | 120 |
| `tests/counterfactual-corpus/` (10 fixtures + harness) | 400 |
| **TOTAL** | **~1,840** |

Fits 1,500–2,000 budget.

## 10. Risks & mitigations (self-reviewed against Metis checklist)

### CDP edge cases

- **Service workers**: SW can intercept before `Fetch.requestPaused` fires for sub-resources. Mitigation: `Service-Worker-Allowed: none` header injected via intervention; baseline ranker flags SW-served resources and `pickInterventions` returns `[]` (mark as unsupported in evidence).
- **Redirects**: `Fetch.requestPaused` fires per-hop. `fail` and `fulfill-cached` interventions match by post-redirect canonical URL; documented in `intervention-driver.ts` JSDoc.
- **HTTP/2 push & Brotli**: cached bodies from `#4` are already decoded; intervention re-encodes per response headers. `Content-Encoding` matched to the original to preserve client decoding path.
- **Range requests**: rare for LCP images; current scope is full-response interventions. Range fulfills marked unsupported.
- **CSP / SRI**: handled via `canFulfill` gate (§4).
- **`srcset` / `picture`**: ranker resolves the picked source via baseline `PerformanceResourceTiming.name` (which web-vitals already records). Document: v1 intervenes on the picked source only. Full srcset multi-intervention deferred.
- **CSS background-image LCP / text LCP**: ranker entry with `intervention: 'unsupported-lcp-source'` → skipped in evidence. Deferred to v1.1.

### Determinism

- Cache-bust URLs (`?_t=12345`): mitigated by hermetic replay (#4) which canonicalizes; ranker dedup by URL preserves duplicate cache-bust entries as separate candidates (intentional — they ARE separate requests).
- Floating-point jitter: feature values rounded to 2 decimals before scoring.

### Statistical power

- N=3+3 Mann-Whitney has min p ≈ 0.05 → calibrate four-verdict spectrum against corpus before lock.
- Honest "inconclusive" verdict — never downgrade to "no-effect" without `|delta| < 10 ms AND p ≥ 0.5`.

### Failure modes

- Page crash on intervention (e.g., removing the hero image crashes the JS that depends on it): collector catches, records `measurements[i].skipped = { reason: 'page-crash' }`, intervention marked `partialFailure: true`, run continues.
- Cumulative timeout: 4× baseline wall-clock hard gate at Phase 3 boundary.

### Audit trail

- Every intervention application logs CDP-level request/response IDs via the engine logger at `debug` level. Aggregated to `report.counterfactuals[i].auditTrail?` (compile-time-flagged off in v1; design exists for v1.1).

### Privacy

- Cached bodies live in the same boundary as `#4`'s hermetic-replay cache (under `.ohmyperf/cache/`). No new exposure surface. Documented in tasks.

### Idempotency

- Ranker is pure. Bootstrap uses seeded PRNG. Mann-Whitney is deterministic. Same baseline JSON → byte-identical counterfactual evidence (test: `corpus/determinism.test.ts`).

## 11. Open questions (carried into proposal review, max 5)

These were the questions a Metis-style risk pass would surface. Answers pinned in proposal.md "Pinned design decisions":

1. **`fulfill-cached` when hermetic cache absent?** → Skip that intervention, record `skipped.reason = 'no-cache-entry'`. `fail` / `block-3p` proceed. No live-network fallback.
2. **`srcset` / `picture`: intervene on picked source or all?** → Picked source only in v1. Multi-source deferred.
3. **Adaptive M on `inconclusive`?** → Conditional escalation: default M=3, escalate to M=5 when `verdict === 'inconclusive' && |delta| > 30 ms`. Full SPRT-adaptive deferred.
4. **MCP `analyze_counterfactuals`: analyze existing vs trigger new?** → Both via `mode` param.
5. **Pluggable ranker?** → No in v1. Hardcoded heuristic. Plugin API deferred until corpus shows underperformance.

## 12. Escalation triggers (revisit design)

- Corpus MAPE consistently > 20% after threshold tuning → ranker scoring weights need ML-based calibration, not hand-tuned constants.
- 4× budget breached on > 30% of corpus runs → need parallel intervention execution or smarter candidate pruning.
- `FetchRouter` exhibits flaky behavior under replay → consider isolating interventions to a separate CDP session via `Target.attachToTarget`.

## 13. Effort estimate

**Large (3–5 days).** Realistic split:

- Day 1: `InterventionDriver` + `FetchRouter` + CDP integration tests.
- Day 2: stats (Mann-Whitney + bootstrap) + verdict + ranker (all pure, easy to unit-test).
- Day 3: collector + engine integration + CLI flag.
- Day 4: corpus authoring + harness + calibration pass.
- Day 5: MCP tool + reporter integration + documentation + final corpus tuning.
