# Tasks: Beautiful Report

Four commits inside one OpenSpec change. Each commit lands independently passing typecheck + tests + lint + bundle-budget + token-drift gates.

---

## Commit 1 — Design Tokens + Drift Guard

### 1.1 Package scaffold

- [ ] 1.1.1 Create `packages/design-tokens/` workspace package:
  - `package.json` — name `@ohmyperf/design-tokens`, version `0.0.0-pre`, license `Apache-2.0`, type `module`, main + types + exports map, `engines.node >= 22`, no runtime deps, devDep on `vitest` + `@microsoft/api-extractor` catalog versions.
  - `tsconfig.json` — extends `../../tsconfig.base.json`, references nothing.
  - `src/index.ts` — TS const exports: `CALIBRE_LIGHT`, `CALIBRE_DARK`, `paletteCssVars(scheme)`, `PALETTE_CSS` template string.
  - `src/index.css` — same CSS string written separately for raw `@import` consumers.
  - `etc/design-tokens.api.md` — api-extractor snapshot (generate with `pnpm exec api-extractor run --local`).
  - `api-extractor.json` — mirror `packages/core/api-extractor.json`.
  - `README.md` — documents canonical-source-is-globals.css decision, how to add a token.
- [ ] 1.1.2 Add `packages/design-tokens` to workspace pnpm-workspace.yaml (if explicit; pnpm typically auto-discovers).
- [ ] 1.1.3 `pnpm install`, then `pnpm --filter @ohmyperf/design-tokens build` clean.

### 1.2 Palette values

- [ ] 1.2.1 Read EXACT values from `apps/website/app/globals.css` (canonical source). Verify L=0.50 for accent (NOT L=0.55 as some proposal text mentions).
- [ ] 1.2.2 `CALIBRE_LIGHT` exports: `background`, `foreground`, `muted`, `mutedForeground`, `border`, `card`, `cardForeground`, `accent`, `accentForeground`, `success`, `warning`, `danger`. Each as an OKLCH string. Plus per-token hex fallback constants (`*_HEX`).
- [ ] 1.2.3 `CALIBRE_DARK` same shape with L=0.65/0.70 variants.
- [ ] 1.2.4 `PALETTE_CSS` template literal: emits both `:root { ... }` (light) and `@media (prefers-color-scheme: dark) { :root { ... } }` blocks. Each declaration emits hex fallback FIRST then OKLCH (browsers keep last valid).
- [ ] 1.2.5 vitest test: `PALETTE_CSS` includes both `#` hex and `oklch(` literals for every token. Round-trip parse via simple regex matches `CALIBRE_LIGHT`/`CALIBRE_DARK` constants.

### 1.3 Drift gate script

- [ ] 1.3.1 Create `scripts/check-design-tokens.mjs`:
  - Inputs: `apps/website/app/globals.css`, `packages/design-tokens/dist/index.js`, `packages/viewer/dist/styles.js` (skipped pre-Commit 2), `packages/reporter-deck/dist/styles.js` (skipped pre-Commit 3).
  - Parse OKLCH values via regex `/--color-([\w-]+):\s*oklch\(([\d.\s]+)\)/g`.
  - Assert every token name in globals.css exists in design-tokens with identical OKLCH coords (tolerance 0).
  - Skip files that don't exist yet (early-commit safety) with WARN log, not error.
  - Exit 1 on drift with diff output; exit 0 on match.
  - Add JSDoc + usage comment at top.
- [ ] 1.3.2 Add npm script to root `package.json`: `"check:design-tokens": "node scripts/check-design-tokens.mjs"`.
- [ ] 1.3.3 Wire into `.github/workflows/website-budgets.yml` (or new workflow): runs after `pnpm install`, before `analyze:check`.
- [ ] 1.3.4 Self-test: mutate one OKLCH value in `globals.css` temporarily, run script, assert exit 1; revert; assert exit 0.

### 1.4 api-extractor + tests

- [ ] 1.4.1 Generate `packages/design-tokens/etc/design-tokens.api.md` snapshot.
- [ ] 1.4.2 Add api-extractor diff check to existing CI api-extractor matrix (or new workflow step).
- [ ] 1.4.3 vitest: 3 tests minimum — palette completeness, CSS string structure, drift script self-test.

### 1.5 Commit 1 acceptance

- [ ] 1.5.1 `pnpm typecheck` clean across workspace (39+1=40 packages now).
- [ ] 1.5.2 `pnpm --filter @ohmyperf/design-tokens test` 3+ tests pass.
- [ ] 1.5.3 `node scripts/check-design-tokens.mjs` exits 0.
- [ ] 1.5.4 `node scripts/check-contrast.mjs` exits 0 (no regression).
- [ ] 1.5.5 No visual change in `apps/website` or `packages/viewer` (pure scaffold commit).
- [ ] 1.5.6 Commit message includes ESM-fix lessons learned format: subject + bullet list + verification log.

---

## Commit 2 — Viewer Restyle

### 2.1 Charts subpath

- [ ] 2.1.1 Create `packages/viewer/src/charts/`:
  - `donut.ts` — `renderDonut(slices: ReadonlyArray<{ label: string; value: number; color: string }>, opts: { size?: number; thickness?: number }): string`. Pure SVG string. Includes `<title>` + `role="img"` + `aria-label`. Uses `safeNumeric` on all coords. Handles zero-slice empty state.
  - `cwv-traffic-light.ts` — `renderCwvCard(name: string, agg: AggregatedMetric, thresholds: { good: number; needsImprovement: number }): string`. Returns a card with verdict color (success/warning/danger) + icon (✓/!/✗) + threshold range text. Card includes pattern fill in print mode (CSS handles).
  - `bar-chart.ts` — `renderHorizontalBars(items: ReadonlyArray<{ label: string; value: number; max?: number }>, opts: { width?: number }): string`. For opportunities + long-tasks ranking.
  - `sparkline.ts` — scaffolded with signature `renderSparkline(values: ReadonlyArray<number>): string` but throws `Error("sparkline-deferred-v1.1")` if called. Keeps the import surface ready.
  - `index.ts` — barrel re-export.
- [ ] 2.1.2 Update `packages/viewer/package.json`:
  - Add `"./charts"` to `exports` map.
  - Add workspace dep `"@ohmyperf/design-tokens": "workspace:*"`.
- [ ] 2.1.3 Update `packages/viewer/etc/viewer.api.md` (api-extractor regen).
- [ ] 2.1.4 vitest: render each chart against synthetic input, snapshot test. Negative test: `safeNumeric` strips `NaN`/`Infinity`/strings.

### 2.2 Extended escape

- [ ] 2.2.1 Extend `packages/viewer/src/escape.ts`:
  - `safeUrl(value: unknown): string` — rejects `javascript:`, `data:`, `vbscript:` (case-insensitive, leading/trailing whitespace tolerated); returns `"#"` on rejection else `escapeHtml(String(value))`.
  - `safeNumeric(value: unknown, fallback?: number): number` — returns `Number(value)` if finite, else `fallback ?? 0`.
- [ ] 2.2.2 vitest: positive + negative cases for both. Confirm `safeUrl("javascript:alert(1)")` returns `"#"`, `safeUrl("https://example.com")` returns the escaped string.

### 2.3 Styles rewrite

- [ ] 2.3.1 Rewrite `packages/viewer/src/styles.ts`:
  - Replace hard-coded hex palette with `import { PALETTE_CSS } from "@ohmyperf/design-tokens"`.
  - Add `@media print` block: CWV cards stay legible (icons + pattern fills, no background colors), tables use solid borders, hyperlinks show their URL via `a[href]::after { content: " (" attr(href) ")"; }`.
  - Add empty-state card styles (`.empty-state` with subdued success-tinted background).
  - Add new section styles: `.hero`, `.cwv-grid`, `.cwv-card`, `.third-parties`, `.donut`.
  - Keep `prefers-color-scheme: dark` block (override `body` + `--color-*` vars).
  - Keep existing table/code/page styles, restyled to consume design-tokens.
- [ ] 2.3.2 Keep `color-mix()` only where it already exists (`styles.ts:79,90,91,92`); don't add new uses. Note: existing `color-mix` stays for viewer; deck Commit 3 will precompute.
- [ ] 2.3.3 vitest: parse `VIEWER_CSS` constant, assert hex fallback appears before every `oklch(` declaration.

### 2.4 New sections

- [ ] 2.4.1 Create `packages/viewer/src/sections/hero.ts`:
  - `renderHero(report: Report): string` — card with URL (use `safeUrl`), mode badge, runs count, browser+version, host platform, calibration line if `report.meta.calibration`, "unstable" warning if `report.meta.unstable`.
  - Hard-codes labels with `// __I18N_KEY__: hero.<field>` source comments.
- [ ] 2.4.2 Create `packages/viewer/src/sections/cwv-cards.ts`:
  - `renderCwvGrid(report: Report): string` — six tiles (LCP / INP / CLS / FCP / TTFB / TBT) via `renderCwvCard` from charts/.
  - Thresholds match `apps/website/components/insights/lcp-breakdown-card.tsx` thresholds (good/needs-improvement boundaries). Extract to a shared constant in `packages/viewer/src/sections/cwv-thresholds.ts` (don't re-import from website).
  - Hides any metric not in `report.aggregated`.
- [ ] 2.4.3 Create `packages/viewer/src/sections/third-parties.ts`:
  - `renderThirdParties(report: Report): string`.
  - Reads `report.pluginData.thirdParties` (set by `thirdPartiesPlugin`). Donut chart + top-N entity list. If absent or empty: empty-state card "Third-party scripts not measured — re-run with `plugins=['third-parties']`."
- [ ] 2.4.4 Create `packages/viewer/src/sections/empty-state.ts`:
  - `renderEmptyState(message: string, tone: "success" | "info"): string`. Used for zero-long-tasks, zero-opportunities, zero-third-parties, zero-render-blocking cases.
- [ ] 2.4.5 vitest: render each section against `fixtures/good.json` (empty-state showcase) and `fixtures/rich.json` (populated showcase). Snapshot tests.

### 2.5 Render.ts refactor (additive only)

- [ ] 2.5.1 Read existing `packages/viewer/src/render.ts` end-to-end. List every sub-renderer function and its output position.
- [ ] 2.5.2 Add new sub-renderer composition: hero → cwv-cards → third-parties → existing audits → existing opportunities → existing long-tasks → existing render-blocking → existing resources → existing runs → existing frames. (Order: marketing/headline first, deep-data later.)
- [ ] 2.5.3 Wrap any existing sub-renderer that previously emitted zero items (when input array empty) with `renderEmptyState`.
- [ ] 2.5.4 Keep top-level `renderReportHtml()` signature unchanged. Existing callers (CLI, MCP) untouched.
- [ ] 2.5.5 Keep `<script type="application/json" id="ohmyperf-report-payload">` payload (`render.ts:368`) — preserves the in-page data extraction pattern.
- [ ] 2.5.6 Add new `RenderViewerOptions.theme?: "light" | "dark" | "system"` — default "system" preserves current behavior; "light" / "dark" force the scheme via inline `<html class="theme-light|theme-dark">`.

### 2.6 Fixtures

- [ ] 2.6.1 Create `packages/viewer/fixtures/`:
  - `good.json` — `schemaVersion: "1.0.0"`, all CWV in "good" range, zero opportunities, zero long-tasks, zero render-blocking, zero audits. Minimal but valid Report.
  - `rich.json` — every section populated: 3 audits (1 pass + 2 fail), 5 opportunities (mixed wastedMs), 8 long-tasks (mixed duration), 12 resources (mix of render-blocking + image + js + font), `pluginData.thirdParties` with 4 entities, `frames` with 2 OOPIF.
  - `broken.json` — `pluginData = {}`, no `opportunities`, no `audits`, single empty `runs[0].resources = []`. Tests defensive rendering.
- [ ] 2.6.2 Add `packages/viewer/scripts/regenerate-fixtures.mjs` — captures a real report from a known URL and pins it (for v1.1 maintenance). Optional, helpful.

### 2.7 Tests

- [ ] 2.7.1 Extend `packages/viewer/src/render.test.ts`:
  - Snapshot test against `fixtures/good.json` → asserts empty-state cards visible for opportunities/long-tasks/render-blocking sections, all CWV cards show "good" tone.
  - Snapshot test against `fixtures/rich.json` → asserts hero, cwv-cards, third-parties, all populated tables present.
  - Snapshot test against `fixtures/broken.json` → renders without throwing; missing sections gracefully hidden or empty-state-rendered.
- [ ] 2.7.2 New `packages/viewer/src/security.test.ts`:
  - `safeUrl("javascript:alert(1)")` → "#"
  - `safeUrl("https://x.com/<script>")` → properly escaped
  - `safeNumeric("abc")` → 0
  - End-to-end: synthetic Report with a `<script>` in a URL is escaped in the output HTML (no `<script>` substring in resulting render).
- [ ] 2.7.3 New `packages/viewer/src/print.test.ts`:
  - Parse `VIEWER_CSS`, assert presence of `@media print { ... }` block.
  - Asserts CWV cards have `::before` icon content for print legibility.

### 2.8 Bundle budget

- [ ] 2.8.1 Extend `scripts/check-bundle-budgets.mjs` to accept an artifact-path mode (not just Next.js routes).
- [ ] 2.8.2 Add `packages/viewer/scripts/measure-size.mjs`: renders `fixtures/rich.json` → gzips the HTML → writes the byte count to `packages/viewer/dist/.size.json`.
- [ ] 2.8.3 Add `scripts/bundle-budgets.json` entry: `"report.html.gz": 200000` (200 KB).
- [ ] 2.8.4 Wire into existing `website-budgets.yml` or new `artifact-budgets.yml` workflow.
- [ ] 2.8.5 Self-test: artificially inflate `styles.ts` with 250 KB of comments, build, run budget script, assert exit 1, revert.

### 2.9 Commit 2 acceptance

- [ ] 2.9.1 `pnpm --filter @ohmyperf/viewer typecheck` clean.
- [ ] 2.9.2 `pnpm --filter @ohmyperf/viewer test` all tests pass (snapshot, security, print).
- [ ] 2.9.3 `pnpm typecheck` workspace clean.
- [ ] 2.9.4 `node scripts/check-design-tokens.mjs` exits 0.
- [ ] 2.9.5 `node scripts/check-contrast.mjs` exits 0.
- [ ] 2.9.6 `node scripts/check-bundle-budgets.mjs --artifact report.html.gz --report-input packages/viewer/fixtures/rich.json` exits 0.
- [ ] 2.9.7 Open `report.html` (rendered from `fixtures/rich.json`) in Chrome/Safari/Firefox manually — visual sanity check. (Local user action, not CI.)
- [ ] 2.9.8 Existing CLI `pnpm --filter @ohmyperf/cli build && node apps/cli/dist/cli.js run --url https://example.com` succeeds and emits a beautiful `report.html`.

---

## Commit 3 — `packages/reporter-deck/`

### 3.1 Package scaffold

- [ ] 3.1.1 Create `packages/reporter-deck/`:
  - `package.json` — name `@ohmyperf/reporter-deck`, version `0.0.0-pre`, license `Apache-2.0`, type `module`. Mirrors `packages/reporter-html/package.json` exactly: same fields, same engines, same devDeps shape.
  - Workspace deps: `@ohmyperf/core` (peer), `@ohmyperf/viewer` (charts subpath), `@ohmyperf/design-tokens`.
  - `tsconfig.json` extends base, references `@ohmyperf/viewer` + `@ohmyperf/design-tokens`.
  - `api-extractor.json` mirrors `packages/reporter-html/api-extractor.json`.
  - `etc/reporter-deck.api.md` — api-extractor snapshot from day 1.
  - `README.md` — boundary doc (Swiss layouts + Calibre palette), keyboard nav, print-to-PDF, v1.0 limits + v1.1 stretch.
- [ ] 3.1.2 `pnpm install`, then `pnpm --filter @ohmyperf/reporter-deck build` clean.

### 3.2 Deck shell

- [ ] 3.2.1 Create `packages/reporter-deck/src/styles.ts`:
  - 16-column grid (Swiss grammar).
  - Calibre palette (overrides Swiss's locked palettes — documented as intentional in README).
  - Force `color-scheme: light only` (no `prefers-color-scheme: dark`).
  - Precompute tints as static OKLCH values (no `color-mix()`).
  - Hex fallback before every OKLCH.
  - `.slide { width: 1920px; height: 1080px; transform: scale(var(--fit)); transform-origin: top left; ... }`.
  - CSS scroll-snap fallback: `.deck { scroll-snap-type: y mandatory; } .slide { scroll-snap-align: start; }`.
  - `@page { size: 1920px 1080px landscape; margin: 0; } @media print { .slide { page-break-after: always; transform: none; } .deck-nav { display: none; } }`.
- [ ] 3.2.2 Create `packages/reporter-deck/src/deck-shell.ts`:
  - `renderDeckShell(slides: readonly string[], opts: { title: string }): string`.
  - Renders `<!doctype html>` + `<head>` (meta charset, meta viewport, `<meta name="referrer" content="no-referrer">`, embedded `<style>${DECK_CSS}</style>`) + `<body>` with `.deck` wrapper containing all slides + `.deck-nav` footer (slide counter + arrow buttons).
  - Embeds ~30-LOC inline `<script>` for: keyboard ArrowLeft/ArrowRight nav, hash sync (`location.hash = "#slide-N"`), resize observer for `--fit` CSS var.
  - Embeds `<script type="application/json" id="ohmyperf-report-payload">${escaped JSON}</script>` mirroring viewer pattern.

### 3.3 Six slide modules

- [ ] 3.3.1 `src/slides/cover.ts` → `renderCoverSlide(report: Report): string`:
  - Large title "Performance Report", URL, measurement date (`startedAt`), browser+version+source, mode badge.
  - Single accent stripe (Calibre blue).
- [ ] 3.3.2 `src/slides/cwv.ts` → `renderCwvSlide(report: Report): string`:
  - 6-tile grid (large traffic-light cards), one per CWV metric.
  - Reuses `renderCwvCard` from `@ohmyperf/viewer/charts`.
  - Headline interpretation line ("4 metrics good, 1 needs improvement, 1 poor").
- [ ] 3.3.3 `src/slides/opportunities.ts` → `renderOpportunitiesSlide(report: Report): string`:
  - Top 5 opportunities by `wastedMs`.
  - Horizontal bar chart via `renderHorizontalBars` from `@ohmyperf/viewer/charts`.
  - Empty-state slide if no opportunities (`renderEmptyStateSlide("No opportunities detected ✓")`).
- [ ] 3.3.4 `src/slides/third-parties.ts` → `renderThirdPartiesSlide(report: Report): string`:
  - Donut chart + top-5 entity list with main-thread time + transfer size.
  - Empty-state slide if `pluginData.thirdParties` absent or empty.
- [ ] 3.3.5 `src/slides/long-tasks.ts` → `renderLongTasksSlide(report: Report): string`:
  - Top 5 long-tasks by duration. Each card shows duration, attribution (script URL if `attributionRich`), startTime.
  - Empty-state slide if zero long-tasks.
- [ ] 3.3.6 `src/slides/methodology.ts` → `renderMethodologySlide(report: Report): string`:
  - Static slide. Lists: mode (real/ci-stable), runs count, browser source (bundled/system/extension-host), parity headless mode, calibration info if present, host platform.
- [ ] 3.3.7 `src/slides/empty-state-slide.ts` → `renderEmptyStateSlide(message: string): string` — full-bleed centered card.
- [ ] 3.3.8 `src/slides/index.ts` — barrel re-export.

### 3.4 Renderer + writer

- [ ] 3.4.1 Create `packages/reporter-deck/src/render.ts`:
  - `renderReportDeck(report: Report, opts: RenderDeckOptions = {}): string`.
  - Composes: cover → cwv → opportunities → third-parties → long-tasks → methodology.
  - Each slide is a `<section class="slide" id="slide-N">...`.
  - Returns full HTML via `renderDeckShell`.
- [ ] 3.4.2 Create `packages/reporter-deck/src/index.ts`:
  - `writeDeckReport(report, outputDir, opts): Promise<DeckReporterResult>` — mirrors `writeHtmlReport` from `packages/reporter-html/src/index.ts`.
  - `renderReportToString(report, opts)` re-export.
  - `REPORTER_ID = "deck"`.
- [ ] 3.4.3 Re-export `escape.ts` from `@ohmyperf/viewer` (no duplication): `export { escapeHtml, safeUrl, safeNumeric } from "@ohmyperf/viewer/escape"`. (If `@ohmyperf/viewer` doesn't expose `escape` subpath, add `"./escape"` to its `exports` map in Commit 2 task 2.2.)
- [ ] 3.4.4 api-extractor snapshot.

### 3.5 Tests

- [ ] 3.5.1 `packages/reporter-deck/src/render.test.ts`:
  - Snapshot against `packages/viewer/fixtures/rich.json` (re-use cross-package via relative path or copy).
  - Assert ≥ 6 `<section class="slide">` elements.
  - Assert no `<script>` injection from URL fields.
  - Assert `<style>` block includes hex fallbacks for every OKLCH.
  - Assert print stylesheet present.
- [ ] 3.5.2 Snapshot against `fixtures/good.json` — verify empty-state slides appear for opportunities + third-parties + long-tasks.
- [ ] 3.5.3 Snapshot against `fixtures/broken.json` — renders without throwing.
- [ ] 3.5.4 Playwright e2e (if Playwright available in this sandbox; else mark as user-deferred):
  - Open generated deck HTML in headless Chromium.
  - `await page.keyboard.press('ArrowRight')` → URL hash becomes `#slide-2`.
  - `await page.emulateMedia({ media: 'print' })` → screenshot, manual review of B&W legibility.
  - `await page.evaluate(() => getComputedStyle(document.querySelector('h1')).color)` → returns the OKLCH-computed value or the hex fallback.

### 3.6 Bundle budget

- [ ] 3.6.1 Add `scripts/bundle-budgets.json` entry: `"report-deck.html.gz": 500000` (500 KB).
- [ ] 3.6.2 `packages/reporter-deck/scripts/measure-size.mjs` mirroring viewer's.
- [ ] 3.6.3 Self-test: inflate styles, assert exit 1, revert.

### 3.7 Commit 3 acceptance

- [ ] 3.7.1 `pnpm --filter @ohmyperf/reporter-deck typecheck` clean.
- [ ] 3.7.2 `pnpm --filter @ohmyperf/reporter-deck test` all tests pass.
- [ ] 3.7.3 `pnpm typecheck` workspace clean (41 packages now).
- [ ] 3.7.4 `node scripts/check-design-tokens.mjs` exits 0 (deck dist now in scope).
- [ ] 3.7.5 `node scripts/check-contrast.mjs` exits 0 (deck artifact in scope).
- [ ] 3.7.6 `node scripts/check-bundle-budgets.mjs --artifact report-deck.html.gz --report-input packages/viewer/fixtures/rich.json` exits 0.
- [ ] 3.7.7 Open deck HTML in Chrome — keyboard nav works, slides snap, print preview is clean (manual user action).

---

## Commit 4 — CLI + MCP + Website + Docs

### 4.1 CLI integration

- [ ] 4.1.1 Add workspace dep `@ohmyperf/reporter-deck` to `apps/cli/package.json`.
- [ ] 4.1.2 Add `packages/reporter-deck` to `apps/cli/tsconfig.json` references.
- [ ] 4.1.3 Update `apps/cli/src/commands/run.ts`:
  - Import `writeDeckReport` from `@ohmyperf/reporter-deck`.
  - After existing `writeHtmlReport` invocation, call `writeDeckReport(report, outputDir, opts)`.
  - Log line: `Wrote report-deck.html (${path.relative(cwd, deckPath)})`.
  - Failures: catch + log as WARN; do not fail the run (deck is opt-out-by-failure, viewer/json are critical path).
- [ ] 4.1.4 `pnpm --filter @ohmyperf/cli typecheck` clean; `pnpm --filter @ohmyperf/cli test` passes; existing `tests/parity/lighthouse-parity.test.ts` still green.

### 4.2 MCP `generate_deck` tool

- [ ] 4.2.1 Add workspace dep `@ohmyperf/reporter-deck` to `apps/mcp-server/package.json` devDeps.
- [ ] 4.2.2 Update `apps/mcp-server/src/server.ts`:
  - Import `writeDeckReport` from `@ohmyperf/reporter-deck`.
  - Register new tool `generate_deck` in ListTools handler:
    - Input schema: `{ reportPath?: string, uri?: string, outputDir?: string }`.
    - Description: "Render a saved report as a multi-slide presentation HTML deck. Writes to disk and returns the file path. Does not return body inline."
  - Handler (CallTool): resolve report via `resolveReportRef(reportsDir, args)`, default outputDir to `${reportsDir}/decks/`, call `writeDeckReport`, return `{ content: [{ type: "text", text: "Wrote deck to ${path}" }, { type: "text", text: JSON.stringify({ path, bytes }, null, 2) }] }`.
- [ ] 4.2.3 Optionally add `track_deck` companion prompt that sequences `track_url` → `generate_deck` for a "weekly perf digest" flow. Decide at implementation time; default = skip.
- [ ] 4.2.4 `pnpm --filter @ohmyperf/mcp-server typecheck` clean; `pnpm --filter @ohmyperf/mcp-server test` 13+ tests pass (existing + any new).
- [ ] 4.2.5 Layered MCP smoke (Python script mirroring Phase 2 testing pattern):
  - `tools/list` includes `generate_deck`.
  - `tools/call generate_deck reportPath=fixtures/rich.json outputDir=/tmp/...` returns a path; file exists; size < 500KB gzipped.

### 4.3 Website export-menu

- [ ] 4.3.1 Add workspace dep `@ohmyperf/reporter-deck` + `@ohmyperf/viewer` (charts) to `apps/website/package.json`. Confirm both are browser-safe (no Node deps).
- [ ] 4.3.2 Update `apps/website/components/report/export-menu.tsx`:
  - New item "Download as deck" between "Download HTML" and "Download JSON".
  - On click: import `renderReportDeck` client-side (dynamic import to avoid SSR bundle bloat), render to string, create Blob, trigger download as `report-deck.html`.
  - Use existing pattern from "Download HTML" item.
- [ ] 4.3.3 Update `apps/website/components/report/export-menu.test.tsx` (Playwright or testing-library) — new item visible + clickable.
- [ ] 4.3.4 Bundle-budget for `/report/[[...id]]` route still ≤ 250 KB gzipped after adding deck import (dynamic import keeps initial bundle small).

### 4.4 Documentation

- [ ] 4.4.1 `packages/viewer/README.md` — write doc covering: what restyled output looks like, design-tokens dep, charts subpath, screenshot link.
- [ ] 4.4.2 `packages/reporter-deck/README.md` — write doc covering: slide structure, keyboard nav, print-to-PDF, Swiss-layout + Calibre-palette boundary explained, v1.0 limits, v1.1 stretch (design-picker, sparklines, filmstrip).
- [ ] 4.4.3 `packages/design-tokens/README.md` — already written in Commit 1.1.1; expand if needed.
- [ ] 4.4.4 NEW `docs/beautiful-report.md` — end-to-end guide: how to invoke, how to share, how to print to PDF, how to embed in PR comments.
- [ ] 4.4.5 Update `docs/measurement-spa-deploy.md` Bundle baseline section with new artifact sizes (viewer + deck gz).
- [ ] 4.4.6 Capture screenshots: `docs/assets/viewer-light.png`, `viewer-dark.png`, `deck-cover.png`, `deck-cwv.png`, `deck-print.png`. Source from rendering `fixtures/rich.json`.
- [ ] 4.4.7 Update root `README.md` with one hero screenshot + link to docs/beautiful-report.md.
- [ ] 4.4.8 Annotate every new English string in viewer + deck sources with `// __I18N_KEY__: <key>` comments. Grep self-check: `grep -r '__I18N_KEY__' packages/viewer/src packages/reporter-deck/src | wc -l > 0`.

### 4.5 Share-server regression check

- [ ] 4.5.1 Read `packages/share-server/src/redaction.ts`. Confirm `screenshotsRef` stripping unchanged.
- [ ] 4.5.2 Confirm shared link load path: `packages/share-server` returns the JSON Report (unchanged); the SPA renders it. New viewer code in `packages/viewer` doesn't affect shared-link rendering (shared SPA uses `apps/website` React components, not the static viewer).
- [ ] 4.5.3 If any change required, file as a follow-up; do not block this change.

### 4.6 NOTICE + license updates

- [ ] 4.6.1 Verify no new vendored snippets need NOTICE entries (Swiss layout patterns are reimplementation, not vendored; tracehouse / web-vitals / third-party-web entries already in `NOTICE`).
- [ ] 4.6.2 If any new font / icon snippet inlined, add NOTICE entry.

### 4.7 Commit 4 acceptance

- [ ] 4.7.1 `pnpm typecheck` workspace clean (41 packages).
- [ ] 4.7.2 `pnpm test` workspace passes (existing + new tests).
- [ ] 4.7.3 `pnpm --filter @ohmyperf/cli build && node apps/cli/dist/cli.js run --url https://example.com --browserPath /opt/chromium --runs 1 --mode real` → emits `report.html` + `report-deck.html` + `report.json`. Both HTMLs render in browser.
- [ ] 4.7.4 MCP layered smoke (mirroring previous test):
  - `tools/list` includes `generate_deck` (10 tools now).
  - `tools/call generate_deck` writes deck file.
- [ ] 4.7.5 Website route `/report/<id>` shows "Download as deck" menu item; click downloads `report-deck.html`.
- [ ] 4.7.6 All gates green: `check-design-tokens`, `check-contrast`, `check-bundle-budgets` (route + artifacts).
- [ ] 4.7.7 `git diff --stat HEAD~4..HEAD` shows reasonable line counts per commit (no commit > 2500 LOC).

---

## Cross-commit acceptance (run after all 4 land)

- [ ] X.1 Full `pnpm typecheck` clean across 41 packages.
- [ ] X.2 Full `pnpm test` across workspace passes.
- [ ] X.3 `pnpm lint` clean.
- [ ] X.4 `node scripts/check-design-tokens.mjs && node scripts/check-contrast.mjs && node scripts/check-bundle-budgets.mjs` all exit 0.
- [ ] X.5 Manual visual review (user action): open viewer + deck against `fixtures/rich.json` in Chrome/Safari/Firefox, dark mode, print preview. Confirm no broken layouts.
- [ ] X.6 Open the deck on a 4K monitor and on a 1366×768 laptop — `--fit` scaling works for both.
- [ ] X.7 Print viewer + deck to PDF via Chrome's "Save as PDF" — CWV cards still legible in B&W.
- [ ] X.8 Test MCP `generate_deck` from your OpenCode client (Layer 3 testing pattern from previous session).

---

## Deferred to v1.1 (explicit, with acceptance criteria for the future change)

- Sparklines: integrate with `~/.ohmyperf-mcp/timeseries/<sha256>.ndjson` data; render per-metric trend sparkline in viewer hero card.
- Filmstrip: requires Track A v1.1 schema additions (inline base64 frames OR offline-portable artifact bundling).
- Design-picker: `--style=calibre|linear|stripe|vercel|...` CLI flag + `--palette=` flag. Touches `packages/design-tokens` with multi-palette support.
- MCP `generate_html_report` tool (file-writing variant, mirrors `generate_deck`).
- Theme toggle UI in viewer (button + localStorage).
- Vietnamese locale extraction via `__I18N_KEY__` annotations.
- Detailed LCP/INP/CLS breakdown sections in viewer (port `apps/website/components/insights/*` to vanilla).
- `@ohmyperf/design-primitives` package extraction if third consumer emerges.
- Email-client-safe HTML variant.
