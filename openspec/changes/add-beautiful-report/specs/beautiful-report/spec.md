# Capability: beautiful-report

This capability formalises how OhMyPerf produces visually polished, brand-consistent perf reports across two static-HTML surfaces (the single-file viewer and the multi-slide deck) while keeping the canonical Report schema (`schemaVersion: "1.0.0"`) frozen and additive-only.

## Scope

Static HTML artifacts produced by `@ohmyperf/viewer` (reporter id `"html"`) and `@ohmyperf/reporter-deck` (reporter id `"deck"`). The interactive Next.js route at `/report` is OUT of scope (governed by `add-share-export-ui`). The Calibre OKLCH palette is the single source of visual truth; `apps/website/app/globals.css` is the canonical token source; `packages/design-tokens` is the canonical interface.

## Requirements

### R1 — Canonical design tokens

`packages/design-tokens` is the only place where Calibre OKLCH token values are declared as TypeScript constants and CSS strings.

**WHEN** a developer reads any OKLCH value from `packages/design-tokens/dist/index.js` (or `index.css`)
**THEN** every token value MUST equal the corresponding value in `apps/website/app/globals.css` (canonical source)
**AND** every token MUST have a hex fallback constant suffixed `_HEX` for stale-browser support.

**WHEN** `node scripts/check-design-tokens.mjs` runs in CI
**THEN** the script MUST parse OKLCH values from `apps/website/app/globals.css`, `packages/design-tokens/dist/index.js`, `packages/viewer/dist/styles.js`, and `packages/reporter-deck/dist/styles.js`
**AND** MUST exit non-zero if any token name diverges or any OKLCH coordinate differs.

**WHEN** any developer adds a new design token
**THEN** they MUST add it to `apps/website/app/globals.css` first
**AND** then to `packages/design-tokens/src/index.ts` (TS constant + CSS string)
**AND** the drift gate MUST cover the new token automatically (no manual list update).

### R2 — Viewer visual structure (v1.0)

The single-file HTML produced by `renderReportHtml(report)` MUST render exactly these sections in this order:

1. Hero card — URL, mode, runs, browser, host, calibration, unstable warning
2. CWV traffic-light grid — six tiles (LCP, INP, CLS, FCP, TTFB, TBT)
3. Third-parties — donut chart + entity list (when `pluginData.thirdParties` populated; else empty-state)
4. Audits — existing table, restyled
5. Opportunities — existing list, restyled
6. Long tasks — existing table, restyled
7. Render-blocking resources — existing table, restyled
8. Resources — existing table, restyled
9. Runs — existing table, restyled
10. Frames — existing tree, restyled

**WHEN** a section's underlying data is empty (e.g., zero long-tasks, zero opportunities, zero third-parties, zero render-blocking)
**THEN** the section MUST render an empty-state card with positive copy ("No long tasks detected ✓", "Zero render-blocking resources 🎉")
**AND** MUST NOT be silently hidden.

**WHEN** `report.aggregated` does not include a specific CWV metric (e.g., CLS missing)
**THEN** the corresponding CWV traffic-light tile MUST be omitted (not rendered as "missing").

**WHEN** `report.runs[0].resources.length === 0` (no resources captured)
**THEN** the resources section MUST render the empty-state card.

**WHEN** the Report is missing `pluginData.thirdParties` entirely
**THEN** the third-parties section MUST render the empty-state card: "Third-party scripts not measured — re-run with `plugins=['third-parties']`."

### R3 — CWV traffic-light coloring

Each CWV traffic-light tile MUST signal verdict via three redundant cues:

- **Color**: success/warning/danger OKLCH from design-tokens
- **Icon**: ✓ (good), ! (needs-improvement), ✗ (poor) emoji or unicode
- **Text label**: "Good" / "Needs improvement" / "Poor"

**WHEN** the rendered HTML is viewed in B&W print mode (`@media print`)
**THEN** the icon + text MUST remain legible (no color-only signaling)
**AND** the verdict MUST be derivable without seeing the background color.

Thresholds (from `apps/website/components/insights/lcp-breakdown-card.tsx` and peers):
- LCP: good ≤ 2500ms, poor > 4000ms
- INP: good ≤ 200ms, poor > 500ms
- CLS: good ≤ 0.1, poor > 0.25
- FCP: good ≤ 1800ms, poor > 3000ms
- TTFB: good ≤ 800ms, poor > 1800ms
- TBT: good ≤ 200ms, poor > 600ms

### R4 — Deck visual structure (v1.0)

The multi-slide HTML produced by `renderReportDeck(report)` MUST contain exactly six slides in this order:

1. Cover — title, URL, measurement date, browser
2. CWV summary — six traffic-light cards (reusing viewer charts)
3. Top opportunities — horizontal bar chart of top 5 opportunities by wastedMs (or empty-state slide)
4. Third-parties — donut + top 5 entities (or empty-state slide)
5. Long tasks — top 5 long-tasks by duration (or empty-state slide)
6. Methodology — mode, runs, browser source, parity, calibration, host platform

**WHEN** a data-driven slide has zero items (e.g., zero opportunities)
**THEN** the slide MUST render as a full-bleed empty-state slide with positive copy (NOT be omitted from the deck).

**WHEN** the deck is rendered
**THEN** each slide MUST be a `<section class="slide" id="slide-${N}">` element where N is 1..6.

**WHEN** the deck HTML is opened in a browser
**THEN** ArrowLeft/ArrowRight keys MUST navigate slides
**AND** `location.hash` MUST sync to `#slide-${N}` for deep-linking
**AND** the slide counter footer MUST display "${N} / 6".

**WHEN** the deck HTML is opened with JavaScript disabled
**THEN** CSS scroll-snap MUST allow vertical scroll-based slide navigation
**AND** slides MUST remain semantically reachable (no `hidden` attr).

**WHEN** the deck HTML is printed (`@media print`)
**THEN** each slide MUST occupy a single 1920×1080 landscape page
**AND** the deck navigation footer MUST be hidden in print
**AND** the `transform: scale()` MUST be removed in print (true 1920×1080 page size).

### R5 — Single-file constraint

Both viewer and deck artifacts MUST be self-contained single-file HTML.

**WHEN** the viewer or deck HTML is opened
**THEN** the browser MUST NOT make any external HTTP request to render the report
**AND** `<meta name="referrer" content="no-referrer">` MUST be present
**AND** no `<link rel="stylesheet">` with an external URL is allowed
**AND** no `<script src="...">` with an external URL is allowed
**AND** no external font reference (Google Fonts, CDN, etc.) is allowed
**AND** the system font stack MUST be used for typography.

**WHEN** the gzipped HTML artifact size is measured
**THEN** `report.html` MUST be ≤ 200 KB gzipped
**AND** `report-deck.html` MUST be ≤ 500 KB gzipped
**AND** the CI gate `scripts/check-bundle-budgets.mjs --artifact <name>.gz` MUST exit non-zero on overrun.

### R6 — OKLCH browser support

**WHEN** the rendered HTML is opened in a browser without OKLCH support (Safari < 15.4, etc.)
**THEN** every OKLCH-declared CSS variable MUST have a preceding hex fallback declaration
**AND** the page MUST remain visually correct (text legible, no white-on-white).

**WHEN** the rendered HTML contains `color-mix()`
**THEN** the viewer MAY use `color-mix` (already shipped in current `packages/viewer/src/styles.ts`)
**AND** the deck MUST NOT use `color-mix` (precompute tints as static OKLCH values).

### R7 — Dark mode policy

**WHEN** the viewer HTML is opened with `prefers-color-scheme: dark`
**THEN** the viewer MUST switch to dark palette automatically (existing behavior preserved).

**WHEN** the viewer HTML is opened with `?theme=dark` or `?theme=light` query param
**THEN** the viewer MUST force the corresponding scheme via `<html class="theme-light|theme-dark">`
**AND** ignore `prefers-color-scheme`.

**WHEN** the deck HTML is opened
**THEN** the deck MUST always render in light mode regardless of `prefers-color-scheme`
**AND** MUST set `color-scheme: light only` in CSS
**AND** MUST NOT include a `@media (prefers-color-scheme: dark)` block.

### R8 — Security

**WHEN** any URL from Report data is rendered as an `<a href>` or SVG `href` / `xlink:href`
**THEN** `safeUrl()` from `packages/viewer/src/escape.ts` MUST be applied
**AND** `javascript:`, `data:`, `vbscript:` schemes MUST be rejected (return `#` instead).

**WHEN** any numeric value from Report data is rendered as an SVG coordinate or dimension attribute
**THEN** `safeNumeric()` from `packages/viewer/src/escape.ts` MUST be applied
**AND** non-finite values MUST be replaced with the fallback (default 0).

**WHEN** any string value from Report data is rendered into HTML text or attribute
**THEN** `escapeHtml()` MUST be applied (existing behavior preserved).

**WHEN** the share-server redaction pipeline runs on a Report
**THEN** the new viewer/deck code MUST NOT bypass redaction
**AND** MUST NOT inline `screenshotsRef` artifact content into the standalone HTML.

### R9 — Accessibility

**WHEN** any inline SVG chart is rendered (donut, bar, traffic-light)
**THEN** the SVG element MUST include `role="img"` + `<title>...</title>` + `aria-label`
**AND** the title MUST describe the chart's data (e.g., "Top 5 opportunities by waste").

**WHEN** the rendered HTML is evaluated against WCAG-AA contrast rules
**THEN** every text-vs-background pair MUST have ratio ≥ 4.5:1 (normal text) or ≥ 3:1 (large text + non-text UI)
**AND** `node scripts/check-contrast.mjs` MUST exit zero for both artifacts.

**WHEN** the CWV traffic-light cards are viewed by a color-blind user
**THEN** the verdict MUST be derivable from icon + text alone (color-only signaling forbidden).

### R10 — CLI integration

**WHEN** `ohmyperf run --url <url>` is invoked
**THEN** the CLI MUST emit `report.html` (existing behavior, now restyled)
**AND** MUST also emit `report-deck.html` (new always-emit per Q3=a decision)
**AND** if deck generation fails, the CLI MUST log a WARN line and continue (viewer + JSON are critical path; deck is best-effort).

**WHEN** `ohmyperf run` is invoked in CI with limited disk
**THEN** the deck file emission MUST NOT push total output past a reasonable threshold (~1 MB per run uncompressed)
**AND** users MAY opt out by passing `--no-deck` (NEW flag added in this change; defaults to false meaning "do emit").

### R11 — MCP integration

**WHEN** the MCP `tools/list` endpoint is queried
**THEN** the response MUST include a new `generate_deck` tool
**AND** the tool description MUST clarify it writes a file and returns the path (not the body).

**WHEN** the MCP `tools/call generate_deck` is invoked with valid `reportPath` or `uri`
**THEN** the tool MUST resolve the report via the same pattern as `analyze_report`
**AND** MUST write the deck HTML to disk under `${reportsDir}/decks/<measurementId>.html`
**AND** MUST return `{ content: [{ type: "text", text: summary }, { type: "text", text: JSON.stringify({ path, bytes }) }] }`
**AND** MUST NOT return the HTML body inline (token-overflow protection).

**WHEN** the MCP `tools/call generate_deck` is invoked with an invalid or missing report reference
**THEN** the tool MUST throw a descriptive error
**AND** MUST NOT write any partial file.

### R12 — Website export integration

**WHEN** the user opens a `/report/<id>` route on the website
**THEN** the export menu MUST include a "Download as deck" item
**AND** clicking it MUST trigger a Blob download of a deck-rendered HTML named `report-deck.html`.

**WHEN** the deck render is invoked client-side
**THEN** `@ohmyperf/reporter-deck` MUST be loaded via dynamic import to keep the initial route bundle small
**AND** the `/report/<id>` route bundle MUST remain ≤ 250 KB gzipped (existing budget).

### R13 — Localization readiness

**WHEN** a new English string is introduced into `packages/viewer/src/sections/` or `packages/reporter-deck/src/slides/`
**THEN** the source code MUST annotate the string with `// __I18N_KEY__: <key>` comment
**AND** the key MUST follow the pattern `<surface>.<section>.<field>` (e.g., `viewer.hero.url`, `deck.cover.title`).

**WHEN** the v1.1 i18n track later extracts strings
**THEN** all new strings introduced by this change MUST be discoverable via `grep -r '__I18N_KEY__' packages/viewer/src packages/reporter-deck/src`.

### R14 — Snapshot stability

**WHEN** the same Report JSON is re-rendered by the same package version
**THEN** the output HTML byte sequence MUST be identical (deterministic rendering).

**WHEN** a developer adds a new chart, section, or slide
**THEN** vitest snapshot tests MUST be updated alongside the code change
**AND** the snapshot tests MUST cover at least: `fixtures/good.json`, `fixtures/rich.json`, `fixtures/broken.json`.

**WHEN** any chart or section receives input from an empty or null field
**THEN** the rendering MUST NOT throw
**AND** MUST gracefully render an empty-state or omit the section per R2/R4.

### R15 — No schema changes

**WHEN** this change is implemented
**THEN** `packages/core/src/types.ts` MUST NOT be modified
**AND** `packages/core/etc/core.api.md` MUST NOT have any diff
**AND** `Report.schemaVersion` MUST remain `"1.0.0"`
**AND** any feature requiring new Report fields MUST be deferred to v1.1 (filmstrip, sparkline time-series, etc.).
