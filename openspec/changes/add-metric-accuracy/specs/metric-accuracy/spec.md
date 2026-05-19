# Spec: Metric Accuracy + Validation

## ADDED Requirements

### Requirement: INP must use web-vitals/attribution algorithm
The engine MUST compute INP using the official `web-vitals/attribution` library, not a custom `max(event.duration)` heuristic.

#### Scenario: Single interaction returns the proper INP
- **WHEN** a user clicks one button that runs a 240ms event handler
- **THEN** the Report's `metrics.inp.value` equals the value reported by `web-vitals` `onINP({ reportAllChanges: true })` within ±2ms

#### Scenario: Multiple interactions follow web-vitals worst-case rule
- **WHEN** the user performs 10 interactions with durations [50, 60, 80, 100, 120, 150, 200, 250, 300, 800] ms
- **THEN** the Report's `metrics.inp.value` equals `800` (web-vitals returns the worst when n < 50; the "drop 1 per 50 interactions" rule only kicks in at higher sample counts)
- **AND** the value matches `web-vitals` `onINP({ reportAllChanges: true })` reference within ±2ms

#### Scenario: INP attribution exposes interaction details
- **WHEN** the worst interaction is a pointer click on `<button id="submit">` taking 280ms (input 30ms / processing 200ms / presentation 50ms)
- **THEN** `metrics.inp.attribution.element` equals `"#submit"`
- **AND** `metrics.inp.attribution.interactionType` equals `"pointer"`
- **AND** `metrics.inp.attribution.subparts` equals `{ inputDelay: 30, processing: 200, presentation: 50 }`

### Requirement: LCP attribution must identify element + URL + sub-parts
Every Report SHALL include `metrics.lcp.attribution` populated with element selector, resource URL (when LCP is an image), and the 4 sub-part timings.

#### Scenario: LCP on an image populates url + element
- **WHEN** the LCP element is `<img class="hero" src="/hero.jpg">`
- **THEN** `metrics.lcp.attribution.element` equals `"img.hero"` (CSS selector)
- **AND** `metrics.lcp.attribution.url` equals the resolved absolute URL of `/hero.jpg`
- **AND** `metrics.lcp.attribution.subparts` has all four keys: `ttfb`, `loadDelay`, `loadDuration`, `renderDelay`
- **AND** the sum of the four sub-parts equals `metrics.lcp.value` within ±5ms

#### Scenario: LCP on a text node populates element only
- **WHEN** the LCP element is `<h1>Heading</h1>` (no resource fetch)
- **THEN** `metrics.lcp.attribution.element` is set
- **AND** `metrics.lcp.attribution.url` is undefined
- **AND** `metrics.lcp.attribution.subparts.loadDelay` equals 0
- **AND** `metrics.lcp.attribution.subparts.loadDuration` equals 0

### Requirement: CLS attribution must surface largest shift source + rects
Every CLS metric SHALL include the offending element selector and before/after rectangles for visualization.

#### Scenario: Single shift attributes the moving element
- **WHEN** an image lacking explicit dimensions shifts a heading down by 100px after load
- **THEN** `metrics.cls.attribution.element` equals a CSS selector for the moved element
- **AND** `metrics.cls.attribution.previousRect` and `currentRect` are plain `{x, y, width, height}` objects
- **AND** the diff in `y` between the two rects matches the shift offset

#### Scenario: iframe-resize-caused shift attributes the frame
- **WHEN** a cross-origin iframe changes its height mid-load, causing the parent to reflow
- **THEN** `metrics.cls.attribution.cause` equals `"frame-resize"`
- **AND** `metrics.cls.attribution.frameId` equals the offending frame's ID

### Requirement: Runtime breakdown must be captured from Performance.getMetrics
The loading collector SHALL call `Performance.getMetrics` and surface the result in `RunReport.runtime`.

#### Scenario: getMetrics result is preserved
- **WHEN** the engine completes a run
- **THEN** `runReport.runtime` is defined with the keys `scriptDuration`, `taskDuration`, `layoutDuration`, `recalcStyleDuration`, `v8CompileDuration`, `layoutCount`, `recalcStyleCount`, `nodeCount`
- **AND** each value is a finite non-negative number

### Requirement: Parity with Lighthouse must be tested
The repo SHALL ship a parity test harness that compares OhMyPerf output against Lighthouse 13.x on at least 3 fixture URLs.

#### Scenario: LCP/FCP/TTFB within ±10% of Lighthouse
- **WHEN** `pnpm test:parity` runs against fixture `image-heavy-lcp`
- **THEN** `|ohmyperf.lcp - lighthouse.lcp| / lighthouse.lcp` is less than 0.10
- **AND** the same bound holds for FCP and TTFB

#### Scenario: TBT parity test deferred to Track B
- **WHEN** Track A ships
- **THEN** TBT parity acceptance is owned by `tests/parity/tbt-parity.test.ts` (Track B B7), NOT `lighthouse-parity.test.ts`
- **AND** the deferral is documented in `tests/parity/README.md` with the rationale (TBT requires trace-based long-tasks, which Track B introduces)

### Requirement: OOPIF corpus must cover 13 scenarios with metric assertions
The OOPIF corpus SHALL include 13 fixtures, each with explicit metric-availability and attribution assertions.

#### Scenario: Each fixture has metric expectations
- **WHEN** a fixture is added under `tests/oopif-corpus/fixtures/`
- **THEN** a corresponding entry in `tests/oopif-corpus/expectations/<fixture>.ts` exists declaring `mustHaveMetrics: string[]`, `mayMissMetrics: string[]`, and `mustHaveAttribution: string[]`

#### Scenario: 13 corpus fixtures all pass
- **WHEN** `pnpm test --filter @ohmyperf/oopif-corpus` runs
- **THEN** all 13 fixtures pass attach/detach assertions
- **AND** all 13 fixtures pass metric-availability assertions
- **AND** at least the `oopif-3-cross-origin` and `iframe-resize-causes-parent-shift` fixtures pass attribution assertions

### Requirement: API surface remains additive
Changes to `MetricAttribution` SHALL be additive only (new optional fields), with `api-extractor` confirming no removed/renamed exports.

#### Scenario: api-extractor passes
- **WHEN** `pnpm api:check --filter @ohmyperf/core` runs after this change
- **THEN** exit code is 0
- **AND** `core.api.md` diff contains only `+` lines (no `-` lines for existing exports)
