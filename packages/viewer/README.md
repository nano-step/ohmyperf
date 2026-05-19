# @ohmyperf/viewer

Static single-file HTML viewer for OhMyPerf Reports. **No runtime dependencies. No React. No JS framework.** Just a string-returning function that emits a self-contained HTML document with inline CSS, inline SVG charts, and an inert JSON payload.

## Usage

```ts
import { renderReportHtml } from "@ohmyperf/viewer";

const html = renderReportHtml(report, {
  title: "Weekly perf — example.com",
  theme: "system",
});
```

Default reporter for the CLI: `ohmyperf run --format json,html` produces `report.html` next to `report.json`.

## Subpath exports

The package exposes three entry points:

```ts
import { renderReportHtml } from "@ohmyperf/viewer";
import { renderDonut, renderCwvCard, renderHorizontalBars, classifyCwv, CWV_THRESHOLDS } from "@ohmyperf/viewer/charts";
import { escapeHtml, safeUrl, safeNumeric } from "@ohmyperf/viewer/escape";
```

- `@ohmyperf/viewer` — main viewer entry (`renderReportHtml`)
- `@ohmyperf/viewer/charts` — hand-rolled inline SVG chart primitives, framework-agnostic
- `@ohmyperf/viewer/escape` — HTML/URL/numeric escape helpers used in all rendering surfaces

`@ohmyperf/reporter-deck` consumes the `/charts` and `/escape` subpaths.

## Visual sections

See [`docs/beautiful-report.md`](../../docs/beautiful-report.md) for the full guide.

| Section | Contents |
|---|---|
| Hero | URL, mode, runs, browser, host, measurement ID |
| CWV traffic-light grid | LCP, INP, CLS, FCP, TTFB, TBT — color + icon + text |
| Attribution | LCP element, INP interaction, etc. (when captured) |
| Third parties | Donut + entity legend (when `pluginData.thirdParties` populated) |
| Audits | Pass/fail table (or empty-state) |
| Resources | Sorted by response time |
| Frame tree | OOPIF detection + cross-origin markers |
| Runs | Per-run breakdown |
| Plugin data | Collapsible `<details>` for `pluginData[*]` |
| Raw JSON | Full Report payload via `<script type="application/json" id="ohmyperf-report-payload">` |

When a section's data is empty, an empty-state card with positive copy is rendered (not silently hidden).

## Theme

```ts
renderReportHtml(report, { theme: "light" });
renderReportHtml(report, { theme: "dark" });
renderReportHtml(report, { theme: "system" });
```

## Palette + design tokens

Tokens are imported from [`@ohmyperf/design-tokens`](../design-tokens/README.md), which reflects the canonical [`apps/website/app/globals.css`](../../apps/website/app/globals.css). Drift is gated by `scripts/check-design-tokens.mjs` in CI.

Every OKLCH declaration has a hex fallback ahead of it for stale-browser safety:

```css
--color-primary: #1855b8;
--color-primary: oklch(0.50 0.18 245);
```

## Self-contained

The output HTML opens with `<meta name="referrer" content="no-referrer">` and makes **zero external HTTP requests** when opened. System font stack only. No Google Fonts. No CDN. Safe to email, archive, or open offline.

## License

Apache-2.0.
