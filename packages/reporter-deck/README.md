# @ohmyperf/reporter-deck

Multi-slide HTML presentation reporter for OhMyPerf Reports.

## What you get

Single self-contained HTML file with **6 slides** in a fixed 1920×1080 canvas:

1. **Cover** — title, URL, measurement metadata
2. **Core Web Vitals** — six large traffic-light tiles (LCP / INP / CLS / FCP / TTFB / TBT)
3. **Top opportunities** — horizontal bar chart, top 5 by `wastedMs`
4. **Third parties** — donut + entity legend, top 5 by transfer size
5. **Long tasks** — horizontal bar chart, top 5 by duration
6. **Methodology** — mode, browser, parity, calibration, host

When a section's underlying data is empty, the slide renders an empty-state body with a positive message instead of being omitted.

## Usage (CLI / Node)

```ts
import { writeDeckReport } from "@ohmyperf/reporter-deck";

await writeDeckReport(report, "./out", { title: "Weekly perf — example.com" });
// → ./out/report-deck.html
```

Or render to a string:

```ts
import { renderReportDeck } from "@ohmyperf/reporter-deck";
const html = renderReportDeck(report);
```

## Navigation

- **Arrow keys** (← / →) — previous / next slide
- **PageUp / PageDown / Space** — same as arrows
- **Home / End** — first / last slide
- **`#slide-3`** — deep-link any slide via URL hash; the navigation script keeps it in sync
- **JS disabled** — CSS `scroll-snap` keeps slides vertically scrollable; layout stays semantic

## Print-to-PDF

Decks are designed to be printed to PDF for stakeholder distribution.

In Chrome / Edge:
- ⌘P (or Ctrl+P)
- Destination: "Save as PDF"
- Layout: "Landscape" (forced via `@page` rule)
- Margins: "Default"
- The navigation bar is hidden in print
- The fit-to-viewport transform is removed (slides print at native 1920×1080 per page)
- CWV tiles show verdict text suffix (`(good)` / `(needs improvement)` / `(poor)`) so the verdict stays derivable in B&W

## Design boundary — Swiss layout, Calibre palette

This package uses the **Swiss International** layout grammar (16-column grid, large display type, sparse decoration, single accent stripe per slide) BUT overrides the Swiss skill's locked palette (Klein Blue / Lemon / Mint / Safety Orange) to use the **Calibre OKLCH** palette from `@ohmyperf/design-tokens`.

This is an intentional skill-rule override:
- Swiss's hex lock is the skill's *internal* rule for new decks that don't have a brand.
- OhMyPerf already has a brand palette (Calibre) committed in `apps/website/app/globals.css`.
- Two coexisting palettes would create more user confusion than a single Calibre-blue accent does.

If a v1.1 design-picker ships, it MAY introduce alternative palettes including Swiss's locked four — but v1.0 stays Calibre-only.

## Charts

Charts are imported from `@ohmyperf/viewer/charts`:

- `renderDonut` — third-parties slide
- `renderHorizontalBars` — opportunities + long-tasks slides
- `renderCwvCard` / `classifyCwv` / `formatCwvValue` — CWV slide tiles
- `renderSparkline` — DEFERRED to v1.1 (throws if called)

No charting libraries are bundled. SVG strings only.

## What this package does NOT do (v1.0)

- ❌ Sparklines — deferred to v1.1 (single-Report sample size is too small)
- ❌ Filmstrip slide — Report schema 1.0.0 has no inline filmstrip frames
- ❌ Dark mode — slide decks live on projectors; CSS `color-scheme: light only`
- ❌ Brand-swap design-picker (`--style=linear|stripe|...`) — v1.1 stretch
- ❌ Email-client-safe rendering (Gmail/Outlook) — open in a browser
- ❌ PowerPoint `.pptx` export — print-to-PDF is the supported flow
- ❌ Vietnamese localisation of new strings — v1.1 i18n track
- ❌ Inline filmstrip frames or `screenshotsRef` artifact embedding (collides with share-server redaction)

## License

Apache-2.0.
