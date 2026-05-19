# Capability: open-design-styles

This capability formalises how ohmyperf renders reports in switchable visual brand styles via the open-design library. Calibre is the default; three vendored open-design brands (`linear-app`, `stripe`, `vercel`) are selectable via a strict `BrandId` union.

## Scope

The render-time `style` option on `renderReportHtml(report, opts)` and `renderReportDeck(report, opts)`, the CLI `--style` flag, the MCP `style` arg on rendering tools + new `list_styles` tool + new `generate_html_report` tool, and the website `/report` brand picker UI. Vendoring infrastructure (`packages/design-tokens/brands/`), sync script, and CI gates that enforce brand integrity. **Out of scope**: Report schema changes, layout/template switching, brand component HTML import, the 133 prose-only open-design brands.

## Requirements

### R1 — Strict BrandId union

The package `@ohmyperf/design-tokens` MUST export a strict TypeScript union literal type for valid brand identifiers.

**WHEN** a developer imports `BrandId` from `@ohmyperf/design-tokens`
**THEN** the type MUST be exactly `"calibre" | "linear-app" | "stripe" | "vercel"`
**AND** MUST NOT be a wider type (`string` or `BrandIdentifier`).

**WHEN** any code adds a new brand
**THEN** the `BrandId` union literal MUST be extended explicitly
**AND** a separate change proposal MUST accompany the addition
**AND** every consumer (CLI, MCP, viewer, deck, website) MUST update its own enum/manifest if it duplicates the list.

### R2 — Brand registry contract

`@ohmyperf/design-tokens` MUST expose a brand registry sufficient for runtime style resolution.

**WHEN** a developer imports `BRAND_MANIFEST` from `@ohmyperf/design-tokens`
**THEN** the export MUST be `Readonly<Record<BrandId, BrandManifest>>`
**AND** each manifest MUST include: `id`, `displayName`, `preferredTheme` (`"light"|"dark"`), `supportsLight: boolean`, `supportsDark: boolean`, `description`, `license`
**AND** vendored brands (non-calibre) MUST also include `upstreamSha: string`.

**WHEN** `getBrandCss(id: BrandId, theme: "light"|"dark"|"system"): string` is called
**THEN** for `id === "calibre"` it MUST delegate to the existing `PALETTE_CSS` / `PALETTE_CSS_LIGHT_ONLY` exports
**AND** for vendored brands it MUST return the concatenation of that brand's `tokens.css` + `bridge.css`
**AND** it MUST NEVER return an empty string or undefined for a valid `(id, theme)` pair where `supportsLight || supportsDark` covers `theme`.

### R3 — Token bridge mapping

Every vendored brand MUST ship a `bridge.css` that aliases its open-design `--bg/--fg/--accent/...` token namespace onto ohmyperf's `--color-*` namespace.

**WHEN** the bridge.css for any vendored brand is loaded after its tokens.css
**THEN** the following CSS variables MUST resolve to non-empty values:
  `--color-background`, `--color-foreground`, `--color-card`, `--color-card-foreground`, `--color-muted`, `--color-muted-foreground`, `--color-border`, `--color-primary`, `--color-primary-foreground`, `--color-accent-primary`, `--color-accent-success`, `--color-accent-warning`, `--color-accent-danger`, `--color-destructive`, `--color-destructive-foreground`.

**WHEN** the bridge.css is rendered into an artifact
**THEN** it MUST be byte-identical across all 3 vendored brands (only the underlying `--bg/--fg/...` values differ per brand's tokens.css)
**AND** the bridge MUST NOT introduce per-brand custom aliases (no `--color-foo-stripe-special`).

### R4 — Vendoring discipline

Vendored brand files MUST follow strict provenance and content rules.

**WHEN** a brand is vendored from open-design upstream
**THEN** `packages/design-tokens/brands/<id>/tokens.css` MUST be transformed exactly by the sync script: font stacks stripped to system fallback, `color-mix()` calls precomputed to static hex
**AND** the file MUST contain a provenance header: `/* Vendored from open-design @ <UPSTREAM_SHA> on <ISO date> · DO NOT EDIT · run pnpm sync:open-design to update */`
**AND** the file MUST preserve the upstream Apache-2.0 SPDX header (`/* SPDX-License-Identifier: Apache-2.0 */` or equivalent).

**WHEN** `pnpm sync:open-design` runs
**THEN** it MUST assert the upstream open-design schema version unchanged (digest of A1+A2 token names in `_schema/tokens.schema.ts`) against `packages/design-tokens/brands/.schema-digest`
**AND** MUST exit non-zero if the digest mismatches
**AND** MUST NEVER run as part of CI; only as a manual human action.

**WHEN** a vendored brand directory is inspected
**THEN** it MUST contain exactly: `tokens.css`, `bridge.css`, `README.md`
**AND** MUST NOT contain `components.html`, `DESIGN.md`, fixtures, or any other file from upstream.

### R5 — Theme × Style truth table

The viewer's theme resolution MUST follow the brand manifest's declared support flags.

**WHEN** `renderReportHtml(report, opts)` is called with `opts.style` and `opts.theme`
**THEN** the effective theme MUST be resolved per this table:

| opts.theme | brand.supportsLight | brand.supportsDark | brand.preferredTheme | Effective theme | Console warning? |
|---|---|---|---|---|---|
| `"system"` or undefined | * | * | * | `brand.preferredTheme` | No |
| `"light"` | true | * | * | `"light"` | No |
| `"light"` | false | * | * | `brand.preferredTheme` | Yes: `"<brand> does not support light theme; using <preferredTheme>"` |
| `"dark"` | * | true | * | `"dark"` | No |
| `"dark"` | * | false | * | `brand.preferredTheme` | Yes: `"<brand> does not support dark theme; using <preferredTheme>"` |

**WHEN** the warning is emitted
**THEN** it MUST use `console.warn` with prefix `[ohmyperf/viewer]`
**AND** rendering MUST proceed to completion (warning is non-fatal).

### R6 — Chart palette decoupling

Inline SVG charts MUST NOT hard-code Calibre (or any brand-specific) color values.

**WHEN** a developer searches for `CALIBRE_LIGHT` or `CALIBRE_DARK` imports in `packages/viewer/src` or `packages/reporter-deck/src`
**THEN** the search MUST return zero matches
**AND** chart files (`donut.ts`, `cwv-traffic-light.ts`, `bar-chart.ts`) MUST emit SVG elements with `data-*` attributes (`data-donut-slice`, `data-cwv-status`, `data-bar`, `data-vendor-index`)
**AND** color application MUST happen via CSS selectors in the surface's styles.ts.

**WHEN** an artifact is rendered with a non-calibre style
**THEN** charts MUST visually display the brand's accent/success/warning/danger colors via the CSS cascade (no JS-side palette injection required).

### R7 — Deck style: palette + typography only

The deck MUST remain light-locked regardless of brand selection. Brands contribute only accent colors and typography overlays.

**WHEN** `renderReportDeck(report, opts)` is called with any `opts.style`
**THEN** the deck CSS MUST NOT contain any `@media (prefers-color-scheme: dark)` block
**AND** MUST contain `color-scheme: light only`
**AND** the slide chrome (background, borders, page-break behavior) MUST resolve to Calibre's `PALETTE_CSS_LIGHT_ONLY` values, NOT the brand's `--bg`/`--fg`.

**WHEN** a non-calibre style is selected for the deck
**THEN** ONLY these tokens MUST be overridden on the brand overlay: `--color-accent-primary`, `--color-accent-success`, `--color-accent-warning`, `--color-accent-danger`, `--color-foreground-accent` (for headings/eyebrows), `--font-display`, `--font-mono`
**AND** all other `--color-*` tokens MUST remain Calibre light-only values.

### R8 — Single-file no-external-requests preserved

The brand integration MUST NOT introduce any external HTTP request in rendered artifacts.

**WHEN** any artifact (viewer or deck) is rendered with any brand
**THEN** the HTML MUST NOT contain `<link rel="stylesheet" href="https://...">`
**AND** MUST NOT contain `<script src="https://...">`
**AND** MUST NOT contain `<link href="https://fonts.googleapis.com/...">` or any Google Fonts reference
**AND** MUST NOT contain any `cdn.tailwindcss.com` reference
**AND** MUST contain `<meta name="referrer" content="no-referrer">`
**AND** font stacks in CSS MUST reference only system-installed fonts (verified by absence of `Inter Variable`, `Geist`, etc. as the first stack entry).

**WHEN** the sync script processes a vendored `tokens.css`
**THEN** it MUST strip non-system font references and replace with `-apple-system, BlinkMacSystemFont, Inter, system-ui, sans-serif` for display + `ui-monospace, SFMono-Regular, Menlo, monospace` for mono.

### R9 — color-mix() precomputed at vendor time

Vendored `tokens.css` files MUST NOT contain runtime `color-mix()` calls.

**WHEN** a vendored `tokens.css` is read
**THEN** searching for `color-mix(` in the file MUST return zero matches
**AND** any value that upstream expressed via `color-mix()` MUST be present as a precomputed static hex value.

**WHEN** the sync script transforms a brand
**THEN** it MUST replace every `color-mix(in <space>, var(--X), <color> <pct>%)` expression with the resolved hex
**AND** add an inline comment documenting the source expression: `--accent-hover: #4434d4; /* was: color-mix(in oklab, var(--accent), black 8%) */`.

### R10 — WCAG-AA contrast gate per brand

Every brand × supported theme MUST pass WCAG-AA contrast thresholds, enforced as a CI gate.

**WHEN** `scripts/check-contrast.mjs` runs
**THEN** for each `BrandId` × each supported theme:
  - Text-on-background pair MUST achieve ≥4.5:1 contrast ratio
  - Accent-on-background pair (UI elements) MUST achieve ≥3.0:1 contrast ratio
**AND** failure on any brand × theme MUST exit non-zero (block merge)
**AND** the script MUST print per-brand per-theme verdict.

**WHEN** a brand fails the gate during integration (Commit 2)
**THEN** that brand MUST either ship with a documented darker-accent override OR be dropped from v1.0
**AND** the decision MUST be recorded in the brand's `README.md` under "WCAG-AA divergences".

### R11 — CLI surface

The CLI MUST expose `--style` and `ohmyperf list-styles`.

**WHEN** `ohmyperf run <url> --style=<id>` is invoked
**THEN** if `<id>` is a valid `BrandId`, the rendered html + deck artifacts MUST use that style
**AND** if `<id>` is invalid, the CLI MUST exit non-zero with an error citing valid IDs
**AND** if `--format=json` only (no html/deck reporters), `--style=<x>` MUST emit a stderr warning `[ohmyperf] --style is a no-op when no HTML reporter is selected` and proceed (exit 0).

**WHEN** `ohmyperf list-styles` is invoked
**THEN** the CLI MUST print to stdout a table containing all 4 brands with columns: ID, Display Name, Preferred Theme, Supports Light, Supports Dark, License, Description
**AND** MUST exit 0.

**WHEN** `ohmyperf run` is invoked without `--style`
**THEN** the effective style MUST be `"calibre"`.

### R12 — MCP surface

The MCP server MUST expose `list_styles` and accept `style` on rendering tools.

**WHEN** an MCP `tools/list` request is made
**THEN** the response MUST include: `measure`, `diff`, `analyze_report`, `generate_markdown_summary`, `list_runs`, `diff_resources`, `track_url`, `find_regression_cause`, `enforce_budget`, `generate_deck`, **`generate_html_report` (new)**, **`list_styles` (new)** — total 12 tools.

**WHEN** an MCP `tools/call list_styles` request is made (empty args)
**THEN** the response MUST contain `BRAND_MANIFEST` as JSON in `content[1].text`
**AND** `content[0].text` MUST be a human-readable summary table.

**WHEN** an MCP `tools/call generate_deck` or `generate_html_report` request includes `style: BrandId`
**THEN** the rendered HTML MUST use that style
**AND** the response MUST include the file path in `content[1].text` (parsed JSON)
**AND** MUST NOT include the HTML body inline (file-writing pattern, like `generate_deck`).

**WHEN** the MCP receives `style` with an invalid brand ID
**THEN** the response MUST be a structured error citing valid IDs
**AND** MUST NOT write any partial file.

### R13 — Website brand picker

The website `/report/[[...id]]` route MUST expose a brand picker that swaps the rendered preview without page reload.

**WHEN** a user navigates to `/report/<id>` without a `?style=` query
**THEN** the report MUST render in calibre style
**AND** the brand picker MUST show "Calibre" as selected.

**WHEN** a user changes the brand picker selection
**THEN** the URL query parameter `?style=<id>` MUST update
**AND** the report viewer MUST re-render in the new style without a full page reload (CSS-only swap via dynamic `<style>` injection)
**AND** `localStorage["ohmyperf:style"]` MUST be updated.

**WHEN** the user navigates to `/report/<id>?style=<id>`
**THEN** the picker MUST show `<id>` as selected
**AND** the report MUST render in that style.

**WHEN** the user clicks "Download as HTML" or "Download as deck" in the export menu
**THEN** the downloaded artifact MUST be rendered with the currently-selected style.

**WHEN** the `/report/[[...id]]` route bundle is measured
**THEN** the gzipped size MUST remain ≤ 250 KB (per existing `scripts/bundle-budgets.json` cap)
**AND** the 3 vendored brand CSS files MUST be loaded only via dynamic import when picked (not bundled into the initial JS chunk).

### R14 — Attribution

Non-calibre styles MUST include both visible footer attribution and a hidden HTML comment.

**WHEN** an artifact is rendered with `style !== "calibre"`
**THEN** the footer paragraph MUST end with ` · Styled like <displayName> via Open Design Library`
**AND** the HTML MUST contain (before `</body>`) the comment `<!-- Styled like <id> via Open Design Library (Apache-2.0) · upstream <UPSTREAM_SHA> -->`
**AND** the attribution text MUST NOT use registered trademarks (no "Linear®", "Stripe®", "Vercel®").

**WHEN** the repo-root `NOTICE` file is inspected
**THEN** it MUST contain a section "Vendored open-design brand tokens (Apache-2.0)" with one entry per vendored brand
**AND** each entry MUST cite the upstream commit SHA and the vendor date.

**WHEN** `pnpm license:audit` runs
**THEN** every `.css` file under `packages/design-tokens/brands/` MUST contain an Apache-2.0 SPDX header
**AND** failure MUST exit non-zero.

### R15 — Visual regression baselines

Each brand × surface combination MUST have a committed Playwright snapshot baseline.

**WHEN** `pnpm test:visual` runs
**THEN** for each `BrandId` × each supported theme × each surface (viewer + deck):
  - Render the corresponding artifact from `packages/viewer/fixtures/rich.json`
  - Open in headless chromium at 1280×720 viewport
  - Capture full-page screenshot
  - Diff against `tests/visual-regression/baselines/<surface>/<brand>-<theme>.png`
  - Fail if diff exceeds 0.5% pixel ratio (Playwright's `maxDiffPixelRatio: 0.005`)
**AND** the CI workflow MUST run this gate only on ubuntu-24.04 (font-renderer determinism)
**AND** macOS/Windows developers running `pnpm test:visual` locally MUST receive advisory output (not gating).

**WHEN** a baseline is regenerated via `--update-snapshots`
**THEN** the new PNG MUST be committed alongside the change that warrants it
**AND** the PR description MUST justify the visual change.

### R16 — Architectural invariants preserved

This change MUST NOT regress invariants from `add-beautiful-report`.

**WHEN** any change to this capability is implemented
**THEN** `Report.schemaVersion` MUST remain `"1.0.0"`
**AND** `packages/core/src/types.ts` MUST NOT change
**AND** `packages/core/etc/core.api.md` MUST have zero diff
**AND** `@ohmyperf/design-tokens` MUST NOT remove any existing export (`CALIBRE_LIGHT`, `CALIBRE_DARK`, `PALETTE_CSS`, `PALETTE_CSS_LIGHT_ONLY`, `TOKEN_NAMES`, `paletteCssVars`)
**AND** `packages/design-tokens/etc/design-tokens.api.md` diff MUST be additive only (only new exports for `BrandId`, `BRAND_IDS`, `BRAND_MANIFEST`, `getBrandCss`, `resolveTheme`, `BrandManifest`)
**AND** the viewer + deck single-file no-external-requests guarantee MUST hold (per R8)
**AND** bundle budgets MUST hold per artifact per brand (viewer ≤ 200 KB gz; deck ≤ 500 KB gz).
