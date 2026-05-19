# Capability: iframe-deep-inspection

CDP-based cross-origin OOPIF deep-inspection: per-frame `CDPSession`, frame-tree report, dual CLS reporting, INP attribution, edge-case handling.

## ADDED Requirements

### Requirement: OOPIF auto-attach
On Chromium-family drivers the engine SHALL enable `Target.setAutoAttach({ autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: 'iframe', exclude: false }, { type: 'page', exclude: false }] })` on the root CDP session BEFORE `Page.navigate` is sent. On every `Target.attachedToTarget` event the engine SHALL create a per-frame `CDPSession`, enable Page/Network/Runtime/Performance/PerformanceTimeline/DOM/CSS/Log domains (plus Profiler/HeapProfiler/Tracing if their corresponding artifacts are opted in), inject the `web-vitals/attribution` library via `Page.addScriptToEvaluateOnNewDocument`, then call `Runtime.runIfWaitingForDebugger`.

#### Scenario: Cross-origin iframe attaches
- **WHEN** measurement runs against fixture `oopif-3-cross-origin.html` (parent + 3 cross-origin OOPIFs at distinct registrable domains)
- **THEN** the engine creates 4 `CDPSession`s (1 root + 3 OOPIF) before any metric is emitted
- **AND** each OOPIF session emits `web-vitals` events for the document loaded inside that frame

#### Scenario: Auto-attach ordering
- **WHEN** measurement is starting
- **THEN** `Target.setAutoAttach` is sent before `Page.navigate`
- **AND** if the driver cannot guarantee that ordering, the run is aborted with error `OOPIF_AUTOATTACH_ORDER_VIOLATION` and exit code 7

### Requirement: Per-frame metrics
For every attached target the engine SHALL emit per-frame metrics: LCP (frame-local), CLS (frame-local), INP (frame-local), FCP, TTFB, longTasks, resources, runtime, memory. The engine SHALL NOT discard a frame's metrics when the frame is later detached.

#### Scenario: Per-frame metrics in the report
- **WHEN** measurement runs against `oopif-3-cross-origin.html`
- **THEN** `report.frames.nodes` contains 4 entries (root + 3 OOPIFs)
- **AND** each entry has `metrics.lcp`, `metrics.cls`, `metrics.inp` populated when the frame had content (or `metrics.lcp.available: false, reason: '...'` when not)

### Requirement: Frame-tree representation
The report SHALL include a `frames` field of shape `{ root: frameId, nodes: Record<frameId, FrameNode> }` where each `FrameNode` carries `frameId`, `url`, `origin`, `parentFrameId`, `isOOPIF`, `isCrossOrigin`, `isSrcdoc`, `isFenced`, `attachedAt`, `detachedAt?`, `metrics`, `children: frameId[]`.

#### Scenario: Frame tree shape
- **WHEN** any measurement completes
- **THEN** `report.frames.root` is a non-empty string
- **AND** `report.frames.nodes[report.frames.root].parentFrameId === null`
- **AND** every non-root node's `parentFrameId` is a valid key in `report.frames.nodes`

### Requirement: Dual CLS reporting (root vs aggregate)
The engine SHALL report two CLS numbers per run: `clsRoot` (Lighthouse-compatible — sum of layout shifts in the parent document only) and `clsAggregate` (sum across all frames, weighted by viewport intersection × time visible). Both SHALL appear in `Report.runs[i].metrics` and in `Report.aggregated`.

#### Scenario: Root vs aggregate diverge under iframe shift
- **WHEN** measurement runs against `oopif-shift-in-child.html` (child frame causes layout shift, no shift in root document)
- **THEN** `report.runs[0].metrics.clsRoot` is approximately 0 (≤ 0.01)
- **AND** `report.runs[0].metrics.clsAggregate` is greater than `clsRoot` by an amount roughly equal to the child shift weighted by intersection

### Requirement: CLS attribution to iframe-resize
The engine SHALL tag layout shifts in the parent document that are temporally adjacent (within 100ms) to a `Page.frameResized` event for an iframe element with `cause: 'iframe-resize', frameId: <child>` in the shift's attribution data.

#### Scenario: Parent shift caused by iframe resize
- **WHEN** measurement runs against `oopif-resize-causes-parent-shift.html`
- **THEN** the resulting parent CLS shift entry has `attribution.cause === 'iframe-resize'` and a non-empty `attribution.frameId`

### Requirement: srcdoc iframe handling
The engine SHALL handle `srcdoc` iframes (which are same-origin same-process and do NOT create OOPIF targets) by folding their metrics into the parent session via the parent's `Page.frameAttached` / `Page.frameStartedLoading` / `Page.lifecycleEvent` events, without creating a per-frame `CDPSession`.

#### Scenario: srcdoc emitted under parent
- **WHEN** measurement runs against `srcdoc-iframe.html`
- **THEN** `report.frames.nodes` contains the srcdoc frame with `isSrcdoc: true` and `isOOPIF: false`
- **AND** the srcdoc frame's metrics are derived from the parent session (no separate CDPSession was created)

### Requirement: Sandboxed-no-scripts iframe handling
The engine SHALL classify iframes with `sandbox` attributes that omit `allow-scripts` as opaque to in-frame instrumentation. The corresponding `FrameNode.metrics` SHALL include `inFrameMetrics: { available: false, reason: 'sandboxed-no-scripts' }`. Network and frame-tree timing from the parent SHALL still be recorded.

#### Scenario: Sandboxed iframe documented as opaque
- **WHEN** measurement runs against `sandbox-no-scripts.html`
- **THEN** the sandboxed frame's `inFrameMetrics.available === false`
- **AND** `inFrameMetrics.reason === 'sandboxed-no-scripts'`
- **AND** the frame's `resources` array (network timing observed from parent) is populated

### Requirement: Fenced frame handling
The engine SHALL classify `<fencedframe>` targets (CDP `Target.targetInfo.subtype === 'fenced-frame'`) as opaque. The engine SHALL attempt attach but accept partial-or-zero coverage, recording `inFrameMetrics: { available: false, reason: 'fenced-frame-opaque' }` when probe injection fails or returns no events.

#### Scenario: Fenced frame opaque
- **WHEN** measurement runs against `fenced-frame.html` (with the fenced-frame Origin Trial enabled)
- **THEN** the fenced frame entry has `isFenced: true` and `inFrameMetrics.available === false`
- **AND** the run completes successfully (does NOT crash)

### Requirement: Detached frame handling
Every CDP send to a per-frame session SHALL be wrapped in idempotent error handling. When the engine receives `Target.detachedFromTarget` for a frame, it SHALL finalize the frame's metrics, set `detachedAt`, and ignore any subsequent CDP errors of class `Session is detached` or `Target closed` for that session.

#### Scenario: Iframe removed mid-run
- **WHEN** measurement runs against `iframe-removed-mid-run.html` (iframe removed via JS at t=500ms)
- **THEN** the run completes without error
- **AND** the removed frame appears in `report.frames.nodes` with a `detachedAt` value
- **AND** that frame's metrics reflect data captured before detachment

### Requirement: BFCache restore semantics
On `Page.lifecycleEvent` with `name === 'load'` immediately preceded by a navigation flagged BFCache (CDP `Page.backForwardCacheNotUsed` not seen and the load lifecycle is unusually fast), the engine SHALL emit a separate `bfcacheRestore` metric block with the restored-state CWV (LCP often resets to 0; CLS continues; INP continues) and SHALL NOT count those values into the canonical CWV `aggregated`.

#### Scenario: BFCache restore reported separately
- **WHEN** measurement runs a scenario that navigates A → B → back-to-A and the back-nav is BFCache-served
- **THEN** the report includes a `bfcacheRestore` block with `lcp: 0` and the CLS/INP observed on the restored page
- **AND** the canonical `aggregated` reflects only the initial fresh load

### Requirement: Prerender activation handling
On Chromium drivers the engine SHALL detect prerender targets (`subtype: 'prerender'`) and SHALL distinguish "prerender measurement" from "post-activation measurement". The first navigation to the activated page SHALL be measured as a separate `activationRun` with its own LCP/INP/CLS.

#### Scenario: Prerender + activation reported
- **WHEN** measurement runs a scenario where the test page issues `<script type="speculationrules">` to prerender a target URL, then activates it
- **THEN** the report includes `prerenderRun` (the prerender side) and `activationRun` (the activated-on-screen side) with distinct CWV blocks

### Requirement: Service-Worker fetch annotation
When a navigation response is served by a Service Worker (CDP `Network.responseReceived.fromServiceWorker === true` or `Network.requestServedFromCache` for SW intermediation), the engine SHALL annotate the run with `meta.servedBy: 'service-worker'` and SHALL flag `ttfb` as `{ value, source: 'service-worker' }`.

#### Scenario: SW-served navigation flagged
- **WHEN** measurement runs against `sw-precache.html` (a fixture whose nav is fully SW-served)
- **THEN** `report.runs[0].meta.servedBy === 'service-worker'`
- **AND** `report.runs[0].metrics.ttfb.source === 'service-worker'`

### Requirement: SPA soft-nav default
By default the engine SHALL NOT reset CWV windows on `Page.navigatedWithinDocument` events. CWV windows continue to accumulate per the `web-vitals` library's session-window semantics. A first-party plugin (`@ohmyperf/plugin-spa-route-cwv`) MAY opt in to per-route CWV reset.

#### Scenario: Soft-nav does not reset CLS
- **WHEN** measurement runs a scenario that performs a `history.pushState` mid-run after CLS has already accumulated
- **THEN** `report.runs[0].metrics.cls` continues to include the pre-pushState shift contributions

### Requirement: Popup window handling
On `Target.attachedToTarget` events with `targetInfo.type === 'page'` and a non-null `openerId`, the engine SHALL create a separate sub-report `popupRuns[]` for that target and SHALL NOT merge popup metrics into the parent run's CWV.

#### Scenario: Popup measured separately
- **WHEN** measurement runs a scenario that programmatically calls `window.open('/popup')`
- **THEN** the report contains `popupRuns[0]` with the popup's URL and CWV
- **AND** the parent's CWV is unchanged

### Requirement: Worker long-task attribution
Long tasks emitted from `Worker` and `SharedWorker` targets SHALL be tagged with `attribution: 'worker:<scope>'` and SHALL NOT be aggregated into the main-thread Total Blocking Time (TBT). They SHALL appear in `report.longTasks` for completeness.

#### Scenario: Worker long-task tagged
- **WHEN** measurement runs against a fixture that runs a 100ms blocking computation in a Web Worker
- **THEN** the resulting long-task entry has `attribution: 'worker:<scope>'`
- **AND** that long-task does NOT contribute to `report.runs[0].metrics.tbt`

### Requirement: OOPIF synthetic test corpus
The repository SHALL maintain a synthetic test corpus under `tests/oopif-corpus/` containing fixture pages for every edge case enumerated above. CI SHALL run the engine against the corpus and SHALL fail when the engine produces a regression on any documented behavior.

#### Scenario: Corpus runs in CI
- **WHEN** the CI pipeline executes `pnpm test:oopif-corpus` on a PR
- **THEN** every fixture in `tests/oopif-corpus/fixtures/` is exercised by an end-to-end measurement
- **AND** every fixture has at least one assertion documented in `tests/oopif-corpus/expectations/`
- **AND** any fixture whose expectation fails causes the CI job to exit non-zero
