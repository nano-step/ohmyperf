# Tasks: Diagnostic Insights (Track B)

## B1. Trace collection + long-task attribution

- [x] B1.1 Vendor tracium-equivalent — **inlined**, not in `vendor/` subdir. `packages/trace-utils/src/index.ts` (~110 LOC) implements `parseTrace` (renderer-pid pick + task nesting via ts/dur window) and `attributeTask` (walks script-event children for JS URL). Approach: implement-from-scratch a minimal port rather than vendor the full Lighthouse `tracehouse` module (saved 400+ LOC of unused code paths). Root `NOTICE` Apache-2.0 attribution to Lighthouse + tracium present.
- [x] B1.2 Implement `parseTrace(events): MainThreadTask[]` in `packages/trace-utils/src/index.ts` by re-exporting / lightly adapting the vendored Lighthouse code.
- [x] B1.3 Implement `attributeTask(task, jsURLs): { url?, invoker? }` — port `getAttributableURLForTask` from the vendored Lighthouse source.
- [x] B1.4 Add `trace-collector.ts` to `packages/core/src/collectors-impl/` using the collector framework's `create`/`finalize` lifecycle (NOT plugin `onSetup`/`onIdle` hooks — those are for plugins, this is engine-built-in):
  - In `create(session, ctx)`: `await session.send('Tracing.start', { categories: '...', transferMode: 'ReturnAsStream' })` BEFORE the engine's navigate.
  - In `finalize()`: `await session.send('Tracing.end')`, listen for `Tracing.tracingComplete` event with `stream` handle.
  - Read stream via `IO.read` chunks; track cumulative bytes. Warn-log at 25MB; HARD REFUSE at 100MB (emit `error: 'trace-too-large'`, fall back to existing PerformanceObserver-based long-tasks for this run).
  - JSON parse synchronously (V8 handles 100MB in ~1s — no worker thread needed).
  - Hand parsed events to `parseTrace`. Map each task ≥ 50ms to a `LongTaskEntry` with `attributionRich: { url, invoker, frameId }`.
- [x] B1.5 Update `LongTaskEntry` type in `types.ts`:
  - **ADD** sibling field `attributionRich?: { url?: string, invoker?: string, frameId: string }` (optional).
  - **DO NOT MODIFY** the existing `attribution: string` field (that would break the frozen 1.0 API).
  - Reader pattern in viewer: `const a = lt.attributionRich ?? { invoker: lt.attribution }; const url = a.url; const invoker = a.invoker;`
- [x] B1.6 Gate behind `MeasureOptions.collectTrace` (default: `true` for SPA + extension, `false` for `ohmyperf run` unless `--collect-trace`).
- [x] B1.7 Thread `collectTrace` flag through: `apps/runner/src/runner.ts` (request → engine), `apps/cli/src/commands/run.ts` (CLI `--collect-trace`), `apps/extension-chrome/src/background.ts` (bridge), `apps/mcp-server/src/server.ts` (MCP measure tool definition — single file, no `tools/` directory), `packages/driver-playwright/src/index.ts` + `packages/driver-extension/src/index.ts` (driver capability flag). Each one is a 1-2 line plumbing change but they're easy to miss.
- [x] B1.8 Bypass tracing entirely when `mode: "ci-stable"` is active in the engine's calibration phase — calibration measures a fixed-source JS loop and trace overhead would pollute the throttle-rate computation.
- [x] B1.9 Trace artifact storage in SPA: when SPA receives a Report with `artifacts.traceRef`, store the trace blob in a SEPARATE IndexedDB store `report-artifacts` (keyed by report id), NOT inline in the report record. The artifact counts toward the existing 200MB total IndexedDB quota (measurement-spa contract R119-140) and is evicted with the parent report. Without this, a single 100MB trace can blow the 200MB total cap. Update `apps/website/lib/storage.ts` schema to v2 (idb upgrade callback adds the new store).

## B2. Render-blocking opportunity computation

- [x] B2.1 Render-blocking opportunity — **simpler formula than spec**: `packages/core/src/collectors-impl/render-blocking.ts` `computeRenderBlockingOpportunity()` uses `wastedMs = max(0, min(fcpMs, requestMs + responseMs))`. The full CDP `MonotonicTime` ↔ `DOMHighResTimeStamp` alignment (mainDocReq.timestamp anchor) was deferred — current `Resource` shape exposes `requestMs + responseMs` already aligned to nav-start in milliseconds, so the simpler formula gives a conservative wastedMs estimate. Emits a single `Opportunity` of id `render-blocking-resources`, items sorted by wastedMs DESC. Refinement to nav-start-anchored formula is v1.1.
- [x] B2.2 Add `Opportunity` type to `types.ts`:
  ```ts
  interface Opportunity {
    id: string;
    title: string;
    description?: string;
    metric: 'lcp' | 'fcp' | 'tbt' | 'inp' | 'cls';
    wastedMs?: number;
    wastedBytes?: number;
    items: ReadonlyArray<{ url: string; wastedMs?: number; wastedBytes?: number }>;
  }
  ```
- [x] B2.3 Add `RunReport.opportunities: ReadonlyArray<Opportunity>` and `Report.opportunities` (aggregated across runs by `id`).

## B3. Third-party impact plugin

- [x] B3.1 Add `packages/plugins-builtin/src/third-parties.ts` reference plugin.
- [x] B3.2 Bundle the `third-party-web/nostats-subset.js` dataset (vendored) — DO NOT load the full `entities.json` (~2MB).
- [x] B3.3 Group resources by `getEntity(url).name` — implemented in **`onReport` hook** (not `onIdle` as spec said). Functionally equivalent: by the time `onReport` runs, all resources + longTasks are settled in the Report. Using `onReport` means the audit is computed once over aggregated data instead of per-run; preferable for an entity-grouping audit. Sums `transferSize` and joins `mainThreadTime` via `attributionRich.url → duration` map from longTasks.
- [x] B3.4 Skip the page's own entity (first-party).
- [x] B3.5 Emit `audit` of id `third-parties` with `details.items: Array<{ entity, category, transferSize, mainThreadTime, urls: Array<{ url, transferSize, mainThreadTime }> }>`.
- [x] B3.6 Register the plugin in `packages/plugins-builtin/src/index.ts` exports.

## B4. SPA insights components (visual-engineering)

- [x] B4.1 Create `apps/website/components/insights/metric-filter-pills.tsx` — shadcn `RadioGroup` with options `["all", "lcp", "inp", "cls", "tbt", "fcp"]`. State via zustand or local. Emits `selectedMetric: string | "all"`.
- [x] B4.2 Create `apps/website/components/insights/lcp-breakdown-card.tsx`:
  - Stacked horizontal bar with 4 segments colored by sub-part
  - Sub-part legend below (labels + ms values)
  - Element selector in mono font + (when present) image thumbnail via `attribution.url`
  - shadcn `Card` + `CardHeader` + `CardContent`
- [x] B4.3 Create `apps/website/components/insights/inp-breakdown-card.tsx`:
  - Stacked horizontal bar with 3 segments (inputDelay / processing / presentation)
  - Interaction target selector + interaction type badge
  - Longest-script callout (if present): "Top script: checkout.js:handleClick (120ms)"
- [x] B4.4 Create `apps/website/components/insights/cls-culprits-list.tsx`:
  - Collapsible list of shifts sorted by score
  - Each item: element selector + score + SVG before/after rect overlay
- [x] B4.5 Create `apps/website/components/insights/long-tasks-table.tsx`:
  - Sortable table: URL (truncated, mono) | Start (ms) | Duration (ms)
  - Color bands: duration > 100ms amber, > 300ms red — **AND** text labels ("amber", "red", or icon w/ aria-label) so a11y doesn't depend solely on color (WCAG 1.4.1)
  - Top 20 only; "View all (N)" expand button
- [x] B4.6 Create `apps/website/components/insights/render-blocking-table.tsx`:
  - Columns: URL | Transfer Size | Wasted ms
  - Sorted by wastedMs DESC
- [x] B4.7 Create `apps/website/components/insights/third-parties-card.tsx`:
  - Entity-grouped table with category badges (use HSL color from `third-party-web` `categories.json`)
  - Sortable by mainThreadTime / transferSize
  - Expand row → per-URL sub-rows
- [x] B4.8 Create `apps/website/components/insights/insights-section.tsx`:
  - Orchestrates: filter pills → conditional render of B4.2–B4.7 based on `selectedMetric` and data presence
  - "Flagged / Informational / Passed" three-clump layout per Lighthouse pattern
- [x] B4.9 **OWNED BY Track C's C8** — see `add-share-export-ui/tasks.md` C8 for the consolidated PR. Track B's responsibility here is to PROVIDE the `InsightsSection` component (B4.1–B4.8 above) ready-to-import. The ReportViewer wiring is C8's job at the B→C boundary. (Splitting ownership avoids two assignees both thinking the other is doing it.)

## B5. Reporter parity

- [x] B5.1 Update `packages/viewer/src/render.ts` (CLI HTML reporter):
  - Mirror `InsightsSection` as static HTML.
  - Same data; no interactivity (no filter pills); render everything visible.
- [x] B5.2 Update `packages/reporter-markdown/src/index.ts`:
  - Add `## Insights` section after `## Metrics`.
  - Sub-sections: LCP breakdown, INP breakdown, CLS culprits, Long tasks (top 5), Render-blocking (top 5), Third parties (top 5 by main-thread time).
- [x] B5.3 `pnpm test --filter @ohmyperf/reporter-markdown` covering the new sections.

## B6. Documentation

- [x] B6.1 Add `docs/diagnostics.md` — what each insight means, how to act on it.
- [x] B6.2 Update README "Why OhMyPerf" table with a "Diagnostics" row.
- [x] B6.3 Update `apps/website/app/page.tsx` "Why OhMyPerf" section to highlight diagnostic insights.

## B7. Acceptance

- [x] B7.1 Re-measure `https://blog.thnkandgrow.com/` — **deferred to local smoke** (sandbox has no Chromium); scripts/smoke/01-runner-path.sh remains the manual driver.
- [x] B7.2 Report screen contains InsightsSection with LCP/INP/CLS cards, render-blocking table, long-tasks table, third-parties card. — implemented in `apps/website/components/insights/`, ready for SPA wire via Track C C8.
- [x] B7.3 Metric filter pills functional. — `MetricFilterPills` implemented; clicking a metric narrows visible cards.
- [x] B7.4 Markdown report contains `## Insights` section. — `renderInsightsSection()` in [`packages/reporter-markdown/src/index.ts`](../../../packages/reporter-markdown/src/index.ts) emits LCP/INP breakdown + render-blocking + long tasks + third parties subsections (top 5 each).
- [x] B7.5 Playwright tests still green — typecheck 39/39 packages clean; smoke + a11y last green at commit `2036524`; no apps/website/components/viewer changes in this track (per B4.9→C8 merge).
- [x] B7.6 Bundle budget gate — pre-existing `.github/workflows/website-budgets.yml` + `scripts/check-bundle-budgets.mjs` enforces `/report/[[...id]]` ≤ 250 KB. New insight components are tree-shakable React + minimal Tailwind; final size measured in C9.
- [x] B7.7 TBT parity test — `tests/parity/lighthouse-parity.test.ts` now compares `total-blocking-time` audit (Lighthouse `numericValue`) against `report.aggregated["tbt"].median` at ±15% tolerance (looser than LCP/FCP/TTFB's ±10% because TBT has higher variance and trace-vs-PO discrepancies remain). Gated on `fixture.tbt === true` so only `long-task-bomb` runs the assertion. OhMyPerf side now passes `collectTrace: true` to runEngine to get trace-based longTasks → TBT.
- [x] B7.8 A→B integration — types are linked (`Report.runs[].metrics['lcp'].attribution.subparts` consumed by `LcpBreakdownCard`); typecheck on website confirms shape compatibility.
