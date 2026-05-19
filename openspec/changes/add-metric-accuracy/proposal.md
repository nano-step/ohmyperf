# Proposal: Metric Accuracy + Validation (Track A)

## Why

The post-MVP audit (Sisyphus 2026-05-17, four parallel agents) uncovered **correctness bugs and accuracy claims without validation evidence** in the engine layer. While the runner+SPA pipeline (sealed by `measurement-spa`) ships measurements end-to-end, the numbers being reported are not yet trustworthy enough for users to act on them.

The biggest concrete findings:

1. **INP is computed wrong.** [`cwv-inline-script.ts`](../../../packages/core/src/collectors-impl/cwv-inline-script.ts) tracks `max(event.duration)` across all events. The actual Web Vitals INP algorithm requires interaction grouping (pointerdown + pointerup + click as one interaction), 98th-percentile selection, and an `interactionId` guard. The `web-vitals` package is already a declared dependency of `@ohmyperf/plugins-builtin` but is **never imported**. Every INP number OhMyPerf has reported to date is wrong.

2. **No attribution data is captured.** The `MetricAttribution` type exists in `packages/core/src/types.ts` with fields for `element`, `url`, `subparts`, but no collector ever populates it. Users cannot see "which DOM element is the LCP" or "which iframe caused the CLS shift."

3. **`Performance.getMetrics` result is discarded.** [`loading-collector.ts`](../../../packages/core/src/collectors-impl/loading-collector.ts) line 92 calls the CDP method but throws the response away. ScriptDuration / TaskDuration / LayoutDuration / RecalcStyleDuration are free data on the wire that we ignore.

4. **No parity tests vs Lighthouse.** README claims "matches what users actually experience" and "TBT validated within ±5% of Lighthouse algorithm" but no test fixture, no comparison harness, no assertion exists. Task 13.4 of `add-ohmyperf-mvp` is unticked.

5. **OOPIF corpus is 4/13.** [`tests/oopif-corpus/`](../../../tests/oopif-corpus/) ships only `oopif-3-cross-origin`, `sandbox-no-scripts`, `srcdoc-iframe`, `iframe-removed-mid-run`. The other 9 fixtures (BFCache, prerender, SW-precache, SPA soft-nav, popup, worker, iframe-resize-causes-parent-shift, fenced-frame, 5xx-error) are not implemented. Existing tests only assert attach/detach counts — no metric-availability assertions.

This change fixes the correctness bug, populates attribution, captures the free CDP data, and locks in validation tests so accuracy is an enforced contract, not a marketing claim.

## What changes

### Modified
- `packages/core/src/collectors-impl/cwv-inline-script.ts` — replace custom INP tracker with the official `web-vitals/attribution` build (`onINP`, `onLCP`, `onCLS`, `onFCP`, `onTTFB`). web-vitals callbacks write into the existing `window.__ohmyperfCwv` object; the host **polls** that object via `Runtime.evaluate` per the established collector pattern (no new `Runtime.addBinding` channel — IPC stays identical to today).
- `packages/core/src/collectors-impl/cwv-collector.ts` — accept the web-vitals attribution payloads (via the existing `readSnapshot()` polling), map to OhMyPerf's `Metric.attribution` shape (`element`, `url`, `subparts`).
- `packages/core/src/collectors-impl/loading-collector.ts` — capture `Performance.getMetrics` response and surface `ScriptDuration`, `TaskDuration`, `LayoutDuration`, `RecalcStyleDuration`, `V8CompileDuration` as `RunReport.runtime[]` entries.
- `packages/core/src/types.ts` — extend `MetricAttribution` with `subparts` (Record<string, number>), `interactionType`, `longestScript` fields; add `RunReport.runtime` for the new breakdown.
- `packages/plugins-builtin/src/cwv.ts` — bundle `web-vitals/attribution` via `Page.addScriptToEvaluateOnNewDocument`.

### Added
- `tests/parity/lighthouse-parity.test.ts` — runs both `@ohmyperf/core` and Lighthouse 13.x against fixture URLs (using `lighthouse` programmatic API) and asserts LCP/FCP/TTFB medians within ±10%, TBT within ±5%.
- `tests/oopif-corpus/fixtures/` — 9 new fixtures: BFCache, prerender, SW-precache, SPA-soft-nav, popup, worker, iframe-resize-causes-parent-shift, fenced-frame, 5xx-error.
- `tests/oopif-corpus/expectations/*.ts` — for each new fixture: assertions on attach/detach counts AND metric availability (LCP/CLS/INP present per the spec frame) AND attribution shape (LCP must have `element` and `url`).
- `packages/core/src/cls-frame-attribution.ts` — derive iframe-resize attribution from web-vitals CLS `largestShiftEntry.sources[].node` correlated with frame ownership (NOT a phantom `Page.frameResized` event — that event does not exist in CDP). Populate `Metric.attribution.cause = "frame-resize"` and `frameId` when the source node is an iframe element.

### Removed
- The custom INP tracking branch in `cwv-inline-script.ts` (replaced).
- The discarded `await send("Performance.getMetrics")` call site (replaced with assignment).

## Out of scope (deferred to Track D or v1.1)
- Coverage collector (`Profiler.startPreciseCoverage`) — different correctness surface, not blocking trustable CWV.
- Memory collector (`Memory.getDOMCounters`) — same reason.
- Trace-utils stub promotion — Track B (diagnostic insights) covers this since flame-chart UI needs it.
- HTTP-protocol observation (h1/h2/h3) — Track B (waterfall enrichment).
- Dual CLS (`clsRoot` vs `clsAggregate`) — kept simple in v1; revisit if user feedback demands.
- i18n strings for any new error surface — defer to v1.1 i18n track (consistent with `messages/vi.json` already being `__TODO_VI__`).

## Pinned design decisions (from Phase 2 synthesis, 2026-05-17)

- **Node engines**: bump root `package.json` `engines.node` to `>=22.0.0`. Runner Docker already uses Node 22; CLI users on Node 20 must upgrade for Track A. Adds `"engines": { "node": ">=22" }` to all workspace packages that ship to npm.
- **Lighthouse pin**: `lighthouse@^13.3.0` (programmatic API, ESM-only, needs Node 22+).
- **TBT parity acceptance split**: A4 ships LCP/FCP/TTFB at ±10% in this track. TBT ±5% acceptance moves to a new B7 task gated on Track B's trace collector — preserves "no defer" by *tightening achievable acceptance*, not dropping it.
- **Schema stays `1.0.0`**: all type changes additive optional. `LongTask.attribution: string` stays as-is; Track B will add a sibling `attributionRich?` field rather than break the existing one. ReportViewer must use defensive `?.` chains for legacy reports lacking attribution.
- **Lighthouse parity runs in a SEPARATE Chromium**: don't reuse the runner's session (CDP attach conflict risk). The 30s parity test cost is acceptable for a gated `pnpm test:parity` suite.
- **i18n contract boundary**: this track may NOT edit `apps/website/messages/vi.json`; the `__TODO_VI__` placeholder is the v1.1 i18n track's responsibility.
- **UI color hardcoding forbidden**: any UI change (e.g. new INP interactionType badge) must use `--color-accent-*` CSS vars (defined by Track C's C7.1). No hex/rgb literals in component styles.

## Success criteria

1. `pnpm test --filter @ohmyperf/core` green, including new parity test.
2. INP numbers on a known fixture match `web-vitals/attribution` reference within float epsilon.
3. Lighthouse parity test passes: ±10% LCP/FCP/TTFB, ±5% TBT, on 3 static fixture URLs.
4. OOPIF corpus 13/13 fixtures with metric-availability assertions green.
5. A new Report from any path (CLI / SPA / extension) contains `attribution.element` and `attribution.subparts` for LCP on a page where LCP is a known `<img>`.

## Risks

- **web-vitals/attribution adds ~3KB gz to injected script.** Mitigation: load only when CWV plugin is registered (already conditional).
- **Lighthouse programmatic API requires Node 22+ ESM and matching Chromium revision.** Mitigation: pin `lighthouse@^13.3.0` in `devDependencies`; reuse runner's Chromium for both tools.
- **Parity test runtime ~30s on CI.** Mitigation: gate behind `pnpm test:parity` script, not default `pnpm test`.
- **Breaking change to `MetricAttribution` shape.** Mitigation: additive only (new optional fields), no removed fields. api-extractor will confirm.
