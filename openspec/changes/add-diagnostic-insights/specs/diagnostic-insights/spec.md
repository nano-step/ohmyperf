# Spec: Diagnostic Insights

## ADDED Requirements

### Requirement: Long tasks must be attributed to JS files
Every long task ≥ 50ms SHALL have `attribution.url` populated when an attributable script exists in the trace.

#### Scenario: Long task with clear script blame
- **WHEN** a page has a 200ms task triggered by `gtm.js`
- **THEN** the Report's `longTasks[]` entry for that task has `attribution.url` ending with `gtm.js`
- **AND** `attribution.frameId` equals the frame that ran the script

#### Scenario: Anonymous task
- **WHEN** a task originates from CPU work with no JS frames (layout, paint)
- **THEN** `attribution.url` is undefined
- **AND** the entry is still present with `attribution.invoker` set (e.g. `"layout"` or `"paint"`)

### Requirement: Render-blocking opportunity must compute wastedMs per resource
The engine SHALL compute the FCP delay caused by each render-blocking resource and surface it as an `Opportunity`.

#### Scenario: One render-blocking CSS delays FCP
- **WHEN** a page has `<link rel="stylesheet" href="style.css">` that finishes at t=500ms and FCP fires at t=800ms
- **THEN** `report.opportunities` contains an item with `id="render-blocking-resources"`
- **AND** that opportunity's `items[]` includes `{ url: ".../style.css", wastedMs: 300 }`

#### Scenario: Multiple resources sum to total wasted
- **WHEN** three render-blocking resources have `wastedMs` of 200, 150, 100 ms
- **THEN** the opportunity's top-level `wastedMs` equals 450
- **AND** the items are sorted by `wastedMs DESC`

### Requirement: Third-party impact must be grouped by entity
The third-parties plugin SHALL detect third-party resources via `third-party-web` and group them by entity name.

#### Scenario: GTM resources grouped under Google Tag Manager entity
- **WHEN** a page loads `googletagmanager.com/gtag/js` and `google-analytics.com/ga.js`
- **THEN** `report.audits` contains an audit with `id="third-parties"`
- **AND** `audit.details.items[]` contains an entry with `entity="Google Tag Manager"` (or per `third-party-web` mapping)
- **AND** that entry's `urls[]` includes both URLs
- **AND** `mainThreadTime` ≥ the sum of long tasks attributed to those URLs

#### Scenario: First-party resources are excluded
- **WHEN** the page origin is `blog.example.com` and a resource at `blog.example.com/app.js` is loaded
- **THEN** the third-parties audit `items[]` does NOT include any entity for `blog.example.com`

### Requirement: SPA Report screen must render Insights section
The `/report/?id=<id>` route SHALL display an Insights section in the four-zone Lighthouse layout: metrics → insights → score gauge.

#### Scenario: Insights section is present
- **WHEN** a Report with `attribution`, `opportunities`, and the `third-parties` audit is loaded
- **THEN** the rendered DOM contains an element with `data-testid="insights-section"`
- **AND** within it: an LCP breakdown card, INP breakdown card (if INP exists), CLS culprits list (if CLS > 0), long-tasks table, render-blocking table, third-parties card

#### Scenario: Metric filter pills filter the section
- **WHEN** the user clicks the "LCP" filter pill
- **THEN** the third-parties card and CLS culprits remain visible only IF they affect LCP (mainThreadTime contributing to LCP for third-parties; not visible for CLS culprits)
- **AND** the INP card hides

#### Scenario: Insights gracefully degrade for legacy reports
- **WHEN** a Report without `attribution` or `opportunities` is loaded (pre-Track-B)
- **THEN** the Insights section shows a single notice "Diagnostics unavailable — re-measure with engine v1.1+"
- **AND** the existing flat audits/resources blocks remain visible

### Requirement: LCP breakdown card must show 4 sub-part bar + element selector
The LCP breakdown card SHALL render a stacked horizontal bar with TTFB / loadDelay / loadDuration / renderDelay segments.

#### Scenario: All four sub-parts render
- **WHEN** `metrics.lcp.attribution.subparts` has all four keys
- **THEN** the card contains 4 colored segments whose widths are proportional to their ms values
- **AND** each segment has a hover label showing the sub-part name + ms value

#### Scenario: Element selector is shown
- **WHEN** `metrics.lcp.attribution.element` is `"img.hero"`
- **THEN** the card displays `"img.hero"` in mono font
- **AND** if `attribution.url` exists, a small thumbnail of that URL is shown

### Requirement: Long-tasks table must color-code by duration
The long-tasks table SHALL apply visual emphasis to tasks ≥ 100ms (amber) and ≥ 300ms (red).

#### Scenario: Task < 100ms renders neutral
- **WHEN** a task has duration = 80ms
- **THEN** its row has no special color class

#### Scenario: Task 100–300ms renders amber
- **WHEN** a task has duration = 250ms
- **THEN** its row has the amber emphasis class

#### Scenario: Task ≥ 300ms renders red
- **WHEN** a task has duration = 500ms
- **THEN** its row has the red emphasis class

### Requirement: Markdown reporter must surface insights
`ohmyperf run --format markdown` SHALL include an `## Insights` section.

#### Scenario: Insights section is present in markdown output
- **WHEN** a Report with attribution is exported as markdown
- **THEN** the output contains `## Insights` as an H2 header
- **AND** within it: subsections for LCP breakdown, top 5 long tasks, top 5 render-blocking, top 5 third parties (when each is non-empty)

### Requirement: Bundle budget for /report/[[...id]] must remain under 250 KB gzip
The SPA `/report/[[...id]]` route (the key used in `scripts/bundle-budgets.json`) SHALL stay under 250 KB First Load JS (gzipped).

#### Scenario: Bundle budget check passes
- **WHEN** `pnpm --filter @ohmyperf/website analyze:check` runs after this change
- **THEN** the `/report/[[...id]]` route bundle is ≤ 250 KB gzip
- **AND** the existing CI gate (`.github/workflows/website-budgets.yml`) fails the build on overage
