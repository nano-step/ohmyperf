# Proposal: Beautiful Report — Restyled Viewer + Reporter Deck

## Why

OhMyPerf already produces functional perf reports through three surfaces:

1. **`packages/viewer/`** — single-file HTML report (391 LOC `render.ts` + 111 LOC inline CSS in `styles.ts`). Functional, hex-colored, no design language.
2. **`apps/website/app/report/page.tsx`** — interactive Next.js page (Track C just landed Calibre OKLCH palette, share/export UI, 8 React insight components).
3. **`packages/reporter-markdown/`** — text-only summary consumed by MCP `generate_markdown_summary`.

The interactive website route has visual identity (Calibre palette, WCAG-AA, OKLCH tokens). **The exportable HTML artifact does not.** When a developer shares `report.html` in a PR comment, posts it on Slack, or sends it to a stakeholder, the receiver opens a colorless table-heavy dump that looks like a 2008 Lighthouse export. The static artifact is the surface that travels — and it's the one we never invested in beauty for.

Worse, OhMyPerf has no **stakeholder-facing presentation output**. Chrome devtools-mcp, Lighthouse, and PageSpeed Insights all produce reports for engineers. None produce reports designed for product / exec / sprint-demo consumption. A slide-deck-style report fills a category none of our competitors occupy.

This change does two things:

1. **Restyle `packages/viewer/`** in-place — Calibre-locked OKLCH palette (matching the website), CWV traffic-light cards, third-parties donut, restyled tables, dark mode, print stylesheet, hex fallbacks for archived viewing. Same package name, same reporter id `"html"`, no `-v2` parallel. Every existing user gets a beautiful report on next run.

2. **New `packages/reporter-deck/`** — multi-slide HTML presentation using the Swiss International grid grammar (16-col layout pool from od-decks skill) but overriding Swiss's locked palettes to use Calibre tokens. Six slides: Cover · CWV summary · Top opportunities · Third-parties · Long-tasks · Methodology. Keyboard navigation, print-to-PDF support, light-locked (decks live on projectors).

A new `packages/design-tokens/` package extracts the canonical OKLCH palette from `apps/website/app/globals.css` so all three surfaces (website, viewer, reporter-deck) stay in sync. A new CI gate `scripts/check-design-tokens.mjs` enforces zero token drift across surfaces.

## Visual Direction — Calibre, Not Lighthouse

We pinned **Calibre / SpeedCurve** in Track C. The interactive `/report` route already follows it. This change extends the same visual language to the exportable artifacts:

- **Palette**: `oklch(0.50 0.18 245)` accent (deep blue). Success/warning/danger at L=0.55. Dark variants at L=0.65/0.70. All WCAG-AA verified (`scripts/check-contrast.mjs` MIN_RATIO=3.0).
- **Layout**: dense data, generous whitespace between sections, single accent hue, semantic traffic-light coloring for CWV verdicts.
- **Type**: system font stack (no Google Fonts CDN — keeps offline-correctness promise; viewer's `<meta name="referrer" content="no-referrer">` stays).
- **Charts**: inline SVG only (hand-rolled, no library) — sparklines deferred to v1.1.

## What changes

### Added — Design tokens package

- `packages/design-tokens/` — NEW workspace package
  - `src/index.ts` — TypeScript constants for the Calibre OKLCH palette (light + dark)
  - `src/index.css` — `PALETTE_CSS` string export consumed by viewer + reporter-deck
  - `src/parse-globals.ts` — at-build-time parser of `apps/website/app/globals.css` (canonical source) → asserts token names + values match TS constants
  - `package.json` — Apache-2.0, peerDep on nothing, browser-safe, no Node deps
  - `etc/design-tokens.api.md` — api-extractor snapshot from day 1
- `scripts/check-design-tokens.mjs` — NEW CI gate. Parses OKLCH tokens from `apps/website/app/globals.css`, `packages/design-tokens/dist/index.js`, `packages/viewer/dist/styles.js`, `packages/reporter-deck/dist/styles.js`. Asserts identical values. Fails CI on drift.
- `.github/workflows/website-budgets.yml` — extend to run `check-design-tokens.mjs`.

### Added — Viewer restyle

- `packages/viewer/src/styles.ts` — rewritten to consume `@ohmyperf/design-tokens`. Adds: hex fallback before every OKLCH declaration; `@media print` stylesheet for B&W stakeholder PDFs (CWV cards stay legible via icon + pattern redundancy); empty-state card styles; deck `prefers-color-scheme: dark` preserved.
- `packages/viewer/src/charts/` — NEW directory exposed via subpath export `@ohmyperf/viewer/charts`:
  - `donut.ts` — inline SVG arc chart for third-parties share
  - `cwv-traffic-light.ts` — three-state colored swatch with icon (✓/!/✗) for color-blind safety
  - `bar-chart.ts` — horizontal stacked bar for opportunities/long-tasks
  - `sparkline.ts` — scaffolded but UNUSED in v1.0 (kept for v1.1 readiness)
- `packages/viewer/src/sections/` — NEW directory, additive sub-renderers:
  - `hero.ts` — URL, mode, runs, browser, headline scores card
  - `cwv-cards.ts` — six traffic-light tiles (LCP/INP/CLS/FCP/TTFB/TBT)
  - `third-parties.ts` — donut chart + top-N entity list (from `pluginData.thirdParties`)
  - `empty-state.ts` — positive "no items detected ✓" card pattern
- `packages/viewer/src/render.ts` — refactored to compose new sections. Top-level `renderReportHtml()` signature unchanged. New sub-renderer functions added; existing sub-renderers restyled but not restructured.
- `packages/viewer/src/escape.ts` — extended with `safeUrl(value)` (rejects `javascript:` / `data:` / `vbscript:`) and `safeNumeric(value, fallback)` (defense-in-depth for SVG attrs).
- `packages/viewer/fixtures/` — NEW seed reports for snapshot tests:
  - `good.json` — all CWV green, zero opportunities/long-tasks/third-parties (empty-state showcase)
  - `rich.json` — every section populated (full visual showcase)
  - `broken.json` — missing optional fields (`pluginData.thirdParties` empty, `opportunities` undefined, `screenshotsRef` absent)
- `packages/viewer/src/render.test.ts` — extended with vitest snapshot tests against all three fixtures.
- `packages/viewer/package.json` — add `"./charts"` subpath export; add workspace dep on `@ohmyperf/design-tokens`.
- `packages/viewer/etc/viewer.api.md` — additive update for new charts subpath exports.
- `scripts/check-bundle-budgets.mjs` — extend to gate generated artifact file size (not just Next.js routes).
- `scripts/bundle-budgets.json` — add `report.html` ≤ 200 KB gzipped.

### Added — Reporter deck package

- `packages/reporter-deck/` — NEW workspace package
  - `src/index.ts` — `writeDeckReport(report, outputDir, opts)`, mirrors `packages/reporter-html/src/index.ts`
  - `src/render.ts` — `renderReportDeck(report, opts): string` returning multi-slide HTML
  - `src/deck-shell.ts` — fixed 1920×1080 canvas with CSS `transform: scale(var(--fit))` for fit-to-viewport, scroll-snap fallback, ~30-LOC inline JS for keyboard nav (ArrowLeft/ArrowRight) + hash sync (`#slide-3`)
  - `src/styles.ts` — Swiss-grid layout grammar (16-col) + Calibre palette (overriding Swiss's locked palettes), light-locked, `@page { size: 1920px 1080px landscape; }` print rules
  - `src/slides/` — six slide modules:
    - `cover.ts` — Title, URL, measurement date, browser
    - `cwv.ts` — CWV summary slide (large traffic-light cards)
    - `opportunities.ts` — Top opportunities horizontal bar chart
    - `third-parties.ts` — Donut + entity list
    - `long-tasks.ts` — Top long tasks ordered by duration
    - `methodology.ts` — Mode, runs, calibration, parity info
  - `src/escape.ts` — re-export from `@ohmyperf/viewer/escape` (no duplication)
  - `package.json` — Apache-2.0, peerDep `@ohmyperf/core`, workspace deps `@ohmyperf/viewer` + `@ohmyperf/design-tokens`, mirrors `packages/reporter-html/package.json` shape
  - `etc/reporter-deck.api.md` — api-extractor snapshot from day 1
  - `README.md` — documents Swiss-layout-grammar + Calibre-palette boundary, lists v1.0 limits + v1.1 stretch items
- `packages/reporter-deck/src/render.test.ts` — vitest snapshot tests against viewer fixtures, asserts ≥ 6 `<section class="slide">` elements.
- `scripts/bundle-budgets.json` — add `report-deck.html` ≤ 500 KB gzipped.

### Added — CLI + MCP integration

- `apps/cli/src/commands/run.ts` — invoke `writeDeckReport` alongside existing reporters (always-emit, per Q3=a decision). Produces `report-deck.html` next to `report.html`.
- `apps/cli/package.json` — add workspace dep on `@ohmyperf/reporter-deck`.
- `apps/cli/tsconfig.json` — add `packages/reporter-deck` to project references.
- `apps/mcp-server/src/server.ts` — add NEW tool `generate_deck` that writes the deck HTML to disk and returns the file path. Does NOT return the body inline (avoids ~75K-token MCP response overflow per Q5c-style file-writing pattern).
- `apps/mcp-server/package.json` — add workspace dep on `@ohmyperf/reporter-deck`.
- `apps/website/components/report/export-menu.tsx` — extend with "Download as deck" item that triggers a Blob download of the deck HTML (rendered client-side from the IndexedDB report via `@ohmyperf/reporter-deck`).

### Documentation

- `packages/viewer/README.md` — NEW; documents the restyled output, the design-tokens dependency, the inline-SVG chart subpath
- `packages/reporter-deck/README.md` — NEW; documents the slide structure, navigation, print-to-PDF, the Swiss-layout / Calibre-palette boundary
- `packages/design-tokens/README.md` — NEW; documents the canonical-source-is-globals.css decision and how to extend
- `docs/beautiful-report.md` — NEW; end-to-end user guide for both reporters; how to share, how to print to PDF, how to embed
- Update `docs/measurement-spa-deploy.md` Bundle baseline section with new artifact sizes
- Update `README.md` (root) with screenshots of viewer + deck (committed to `docs/assets/`)

### Modified — share-server compatibility

- `packages/share-server/src/redaction.ts` — verify `screenshotsRef` strip still works (no regression from new viewer code paths). No code change expected; this is a verification task.

## Out of scope (v1.0 — explicit "Must NOT Have")

- ❌ **`--style=` / `--palette=` flag** — design-picker is v1.1 stretch (separate change)
- ❌ **Multiple design-system support** — 151 od-design-systems styles are v1.1+ territory
- ❌ **Sparklines in viewer** — single Report has too few per-run dots (~3-5) for meaningful sparkline; deferred until `track_url` time-series data is integrated as a chart input
- ❌ **Filmstrip section** — Report schema 1.0.0 has no inline filmstrip frames (only `screenshotsRef`); section omitted entirely (NO placeholder card) until Track A v1.1 captures filmstrip data
- ❌ **Detailed LCP/INP/CLS breakdown sections in viewer** — keep these as website-only React components (`apps/website/components/insights/*`); viewer shows traffic-light + opportunities only
- ❌ **MCP `generate_html_report` tool** — existing `html` reporter is reachable via the run tool; no new MCP surface needed
- ❌ **`@ohmyperf/design-primitives` package extraction** — charts live in `packages/viewer/src/charts/` subpath, consumed by reporter-deck; extract only if a third consumer emerges
- ❌ **Schema changes to `packages/core/src/types.ts`** — schemaVersion 1.0.0 FROZEN; additive-only
- ❌ **Restructuring `renderReportHtml`'s top-level composition** — restyle, don't refactor
- ❌ **Vietnamese locale of new strings** — v1.1 i18n track owns this; new English strings get `// __I18N_KEY__:` comments for later extraction
- ❌ **Email-client-safe HTML** (Gmail, Outlook compatibility) — decks render in browser, not in mailers
- ❌ **React component sharing with `apps/website/components/insights/*`** — share `Report` type + design tokens ONLY; no rendering code shared
- ❌ **PowerPoint (.pptx) export** — print-to-PDF via browser is the supported flow
- ❌ **Theme toggle UI in viewer** — `prefers-color-scheme` only (toggle is v1.1)
- ❌ **WOFF2 font inlining** — system font stack only (keeps single-file under budget)

## Dependencies

- **Track A** (`add-metric-accuracy`, 42/47) — viewer consumes existing `MetricAttribution` for LCP/INP attribution; no new fields needed
- **Track B** (`add-diagnostic-insights`, 41/41) — viewer consumes existing `Opportunity[]`, `LongTask[]`, `pluginData.thirdParties`; no new fields needed
- **Track C** (`add-share-export-ui`, 44/44) — Calibre palette in `apps/website/app/globals.css` is the canonical token source
- **NO new core schema changes** — all Report fields consumed already exist

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Calibre vs Swiss palette collision** | Decided: deck uses Swiss layouts but Calibre palette. Documented as intentional skill-rule override in `packages/reporter-deck/README.md`. Swiss skill's "严禁改 hex" is the skill's internal rule; we vendor selectively and override deliberately. |
| **Design-picker scope leak** from v1.1 | Hard "Must NOT Have" guardrail in this proposal. No `--style=` / `--palette=` flag in any new CLI or MCP surface. v1.1 is a separate change. |
| **Token drift** between website / viewer / deck | `packages/design-tokens/` is canonical interface, `globals.css` is canonical source. `scripts/check-design-tokens.mjs` CI gate fails on any drift. |
| **MCP token overflow** on `generate_deck` (~300KB body) | Tool writes file to disk and returns the path string; never returns the HTML body inline. |
| **OKLCH browser support** in stale archives | Hex fallback before every OKLCH declaration (`--var: #hex; --var: oklch(...)`). Browsers ignore unknown values, keep last valid. |
| **`color-mix()` browser support** in deck | Precompute tints as static OKLCH values for deck CSS. Keep `color-mix` in viewer (already shipped). |
| **8-component duplication trap** (porting React insights to vanilla) | Locked visual sections list excludes detailed LCP/INP/CLS breakdowns. Viewer stays focused on traffic-light + opportunities + third-parties. |
| **SVG injection via Report data** | Extended `escape.ts` with `safeUrl` + `safeNumeric`; every SVG coord uses `safeNumeric`, every anchor uses `safeUrl`. |
| **share-server redaction collision** if we inline screenshots | Filmstrip section omitted entirely; `screenshotsRef` artifact pointers never inlined into the standalone HTML. |
| **Print stylesheet missed** (decks → stakeholder PDFs) | Print CSS is a mandatory deliverable in both Phase 2 (viewer) and Phase 3 (deck) commits. |
| **Single-file size blowout** | New `scripts/check-bundle-budgets.mjs` gate: viewer ≤ 200 KB gzipped, deck ≤ 500 KB gzipped, enforced in CI. |
| **WCAG-AA regression** from gradients/decoration | `check-contrast.mjs` extended to cover new artifacts; chart strokes ≥ 3:1 vs background (non-text rule); CWV cards use icon + pattern redundancy (color-blind safe). |
| **v1.1 i18n extraction grep** finding new English | All new strings annotated with `// __I18N_KEY__: <key>` source comments for later extraction. |

## Phasing

Single OpenSpec change, four commits delivered in sequence:

- **Commit 1** — Tokens + drift guard (de-risks downstream; zero visual change)
- **Commit 2** — Viewer restyle (ships user value standalone; no deck dependency)
- **Commit 3** — `packages/reporter-deck/` (greenfield, additive to CLI)
- **Commit 4** — MCP `generate_deck` tool + website export-menu deck download + docs

Each commit passes typecheck + tests + lint + bundle-budget + token-drift gates independently.
