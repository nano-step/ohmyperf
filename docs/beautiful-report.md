# Beautiful Reports

OhMyPerf produces two beautifully-styled HTML artifacts for every measurement, both self-contained single files designed to travel — share in a PR comment, paste into Slack, archive in a Drive folder, print to PDF for stakeholder review.

## What you get

Every `ohmyperf run` produces, by default:

- **`report.json`** — canonical machine-readable payload (the source of truth)
- **`report.html`** — interactive single-file viewer with Calibre design language (Track C palette, OKLCH tokens, dark mode, hex fallbacks for archived viewing)
- **`report-deck.html`** — multi-slide presentation, 1920×1080 canvas, Swiss-grid layout, light-locked, print-to-PDF first-class

Both HTML artifacts are static. No external network requests when opened. No fonts pulled from a CDN. No JavaScript framework. Just HTML + inline CSS + a handful of inline SVG charts and (in the deck only) ~30 lines of vanilla JS for keyboard navigation.

## The viewer (`report.html`)

Visual sections, in order:

1. **Hero** — URL, mode, runs, browser, host, measurement ID
2. **CWV traffic-light grid** — six tiles (LCP / INP / CLS / FCP / TTFB / TBT). Each tile signals verdict via **color + icon + text** (color-blind safe).
3. **Attribution** — LCP element / INP interaction / etc. when captured
4. **Third parties** — donut chart + top-N vendor legend (when measured)
5. **Audits** — pass/fail table (with empty-state when none)
6. **Resources** — request waterfall data, sorted by total ms
7. **Frame tree** — main frame + OOPIFs with cross-origin markers
8. **Runs table** — per-run breakdown for variance inspection
9. **Plugin data** — raw collapsible `<details>` for `pluginData[*]`
10. **Raw JSON** — full Report payload as `<script type="application/json" id="ohmyperf-report-payload">` (extract via DevTools console)

### Themes

```bash
# Default: respects prefers-color-scheme
ohmyperf run --url https://example.com

# Force light mode via query param (browser-side only)
open "report.html?theme=light"

# Force dark mode
open "report.html?theme=dark"
```

Themes can also be set programmatically:

```ts
import { renderReportHtml } from "@ohmyperf/viewer";

const html = renderReportHtml(report, { theme: "light" });
```

### Bundle size

Per-artifact gzipped budget enforced in CI:
- `report.html` ≤ 200 KB gzipped

Typical "rich" report (every section populated) lands ~8 KB gzipped. Plenty of headroom.

## The deck (`report-deck.html`)

Six fixed slides designed for stakeholder distribution:

1. **Cover** — title, URL, measurement metadata
2. **Core Web Vitals** — large traffic-light tiles + verdict count summary
3. **Top opportunities** — horizontal bar chart, top 5 by `wastedMs` (or empty-state when none)
4. **Third parties** — donut + entity legend, top 5 by transfer (or empty-state)
5. **Long tasks** — horizontal bar chart, top 5 by duration (or empty-state)
6. **Methodology** — mode, browser, parity, calibration, host

### Navigation

| Key | Action |
|---|---|
| `→` / `Space` / `PageDown` | Next slide |
| `←` / `PageUp` | Previous slide |
| `Home` | First slide |
| `End` | Last slide |
| `#slide-3` URL hash | Deep-link slide 3 |

When JavaScript is disabled, CSS `scroll-snap` keeps slides reachable via vertical scroll.

### Print-to-PDF

In Chrome / Edge:
1. ⌘P (or Ctrl+P)
2. Destination: **Save as PDF**
3. Layout: **Landscape** (forced via `@page` rule)
4. Margins: **Default**

The print stylesheet:
- Hides the floating navigation bar
- Removes the fit-to-viewport `transform: scale()` (each slide prints native 1920×1080)
- Appends verdict text to CWV labels (`(good)`, `(needs improvement)`, `(poor)`) so verdict stays derivable in B&W
- Sets `page-break-after: always` between slides

### Bundle size

- `report-deck.html` ≤ 500 KB gzipped

Typical rich report lands ~7 KB gzipped.

## CLI usage

```bash
# Default: emits json, html, deck
ohmyperf run --url https://example.com

# Explicit reporter selection
ohmyperf run --url https://example.com --format json,html,deck

# Skip the deck (HTML viewer only)
ohmyperf run --url https://example.com --format json,html

# Add Markdown for PR comments + JUnit for CI gates
ohmyperf run --url https://example.com --format json,html,deck,markdown,junit
```

## MCP usage

The MCP server exposes a `generate_deck` tool that writes the deck to disk and returns the file path (never the body — avoids token overflow):

```
generate_deck(reportPath: "/path/to/report.json")
→ "Wrote deck to /Users/.../decks/<measurementId>.html (26904 bytes). Open in a browser, ⌘P → Save as PDF."
```

The existing `html` reporter is reachable via the run tool — no `generate_html_report` MCP tool was added (v1.0 scope decision).

## Design boundary — Calibre palette across all surfaces

The OKLCH tokens (`oklch(0.50 0.18 245)` accent, success/warning/danger at L=0.55, dark variants at L=0.65/0.70) live in [`apps/website/app/globals.css`](../apps/website/app/globals.css) as the canonical source. The [`@ohmyperf/design-tokens`](../packages/design-tokens) package reflects them for non-Next consumers.

The interactive `/report` route, the static `report.html`, and the slide `report-deck.html` all share the same palette via `scripts/check-design-tokens.mjs` CI drift gate.

The deck uses the **Swiss International** layout grammar (16-column grid, large display type, single accent stripe per slide) but overrides the Swiss skill's locked palettes (Klein Blue / Lemon / Mint / Safety Orange) to the Calibre tokens. Documented as an intentional override in [`packages/reporter-deck/README.md`](../packages/reporter-deck/README.md).

## Brand styles (Open Design integration, v1.0)

Reports can be rendered in 4 visual brand styles:

| ID | Display | Preferred | Light | Dark | Source |
|---|---|---|---|---|---|
| `calibre` | Calibre | light | ✓ | ✓ | OhMyPerf authored (default) |
| `linear-app` | Linear | dark | ✓ | ✓ | Vendored from open-design (Apache-2.0) |
| `stripe` | Stripe | light | ✓ | ✗ | Vendored from open-design (Apache-2.0) |
| `vercel` | Vercel | light | ✓ | ✓ | Vendored from open-design (Apache-2.0) |

### CLI

```bash
ohmyperf run https://example.com --style=linear-app    # non-interactive (CI-friendly)
ohmyperf run                                            # interactive prompt walk-through
ohmyperf list-styles                                    # discover available styles
```

The `--style` flag applies to `html` + `deck` reporters. With `--format=json` only it's a no-op (warning printed).

#### Interactive mode

Running `ohmyperf run` **without a positional URL** (and inside a TTY) launches an interactive prompt that walks through every option:

1. URL (text input, http(s) validation)
2. Visual style (select from 4 brands with hints)
3. Measurement mode (real / ci-stable)
4. Number of runs (1–30)
5. Output formats (multi-select)
6. Plugin set
7. Chromium binary path (optional)
8. Collect trace (yes/no)
9. Output directory
10. Confirmation summary box → start

The prompts use `@clack/prompts` for the UI. Stdin must be a TTY; in CI / piped environments the CLI falls back to the legacy error path. To force non-interactive mode (fail-loud on missing URL) pass `--no-interactive`.

#### Beautiful output

In TTY mode the final summary uses colorized verdicts and a tree-style artifact list:

```
URL     https://example.com
Style   linear-app
Browser chromium 147.0.7727.0 (bundled)
Mode    real · runs=3 · duration=8400ms

Core Web Vitals
  ✓ LCP        1850 ms   p75 1920   CoV 4.2%   n=3
  ! INP         280 ms   p75 305    CoV 6.0%   n=3
  ✓ CLS         0.020    p75 0.025  CoV 12.0%  n=3

Audits (1)
  ✓ a11y.axe-violations  Accessibility violations (axe-core)

Artifacts
  ├─ /tmp/out/report.json
  ├─ /tmp/out/report.html
  └─ /tmp/out/report-deck.html
```

Outside TTY (CI, piped), the legacy logger format is used unchanged.

### MCP

```text
list_styles                                              → returns BRAND_MANIFEST
generate_html_report reportPath=... style=stripe         → writes <reportsDir>/html/<id>.html
generate_deck reportPath=... style=vercel                → writes <reportsDir>/decks/<id>.html
```

Tool count: 12 (was 10 in MCP v2 Phase 2).

### Website

The `/report/<id>` route has a **Style** picker in the toolbar. Selected style:
- Updates URL query (`?style=linear-app`)
- Persists to `localStorage["ohmyperf:style"]`
- Re-renders the live preview via CSS-only swap (no React tree rebuild)
- Applies to "Download as HTML" / "Download as deck" exports

### Architecture

- Calibre lives in `@ohmyperf/design-tokens/src/index.ts` (authored source)
- Vendored brands at `packages/design-tokens/brands/<id>/{tokens.css,bridge.css,README.md}`
- `bridge.css` aliases open-design (`--bg`, `--fg`, `--accent`, ...) onto ohmyperf (`--color-*`) namespace
- Charts use `data-status` / `data-donut-slice` / `data-bar` attributes; CSS selectors provide palette per brand
- Deck is light-locked; brands contribute only `--color-accent-*` via an overlay
- `pnpm sync:open-design` re-vendors from pinned `UPSTREAM_SHA`
- All 4 brands × all 4 accent tokens pass WCAG-AA contrast gate (≥3:1)
- Apache-2.0 attribution lives in `NOTICE` per brand + visible footer suffix on rendered artifacts
- Visual regression baselines at `tests/visual-regression/baselines/` (gated on ubuntu-CI)

## What's NOT here (v1.0 scope decisions)

| Feature | Why deferred | When to expect |
|---|---|---|
| Sparklines | Single Report has ~3-5 per-run dots — too few to be a meaningful trend line. Real series lives in `track_url` time-series. | v1.1 — wired to `~/.ohmyperf-mcp/timeseries/*.ndjson` |
| Filmstrip slide | Report schema 1.0.0 has no inline filmstrip frames; only `screenshotsRef` artifact pointers. Inlining defeats single-file portability and collides with share-server redaction. | v1.1 — when Track A captures filmstrip data |
| Design-picker (`--style=linear\|stripe\|...`) | Calibre is locked in v1.0; opening to 151 styles is a separate concern. | v1.1 stretch |
| MCP `generate_html_report` tool | Existing `html` reporter is reachable via the run tool; no new MCP surface needed for v1.0. | v1.1 if usage warrants |
| Vietnamese localisation | New English strings annotated with `// __I18N_KEY__:` comments for later extraction. | v1.1 i18n track |
| Email-client-safe HTML | Decks render in browsers, not in mailers (Gmail/Outlook strip critical CSS). | Likely not needed — print-to-PDF is the supported sharing flow |
| PowerPoint `.pptx` export | Print-to-PDF via browser is the cross-platform path. | Not planned |
| Theme toggle UI in viewer | Use `?theme=light\|dark` query param; full UI toggle is v1.1. | v1.1 |
