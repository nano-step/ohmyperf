# Proposal: Open Design Styles — Brand-Switchable Report Rendering

## Why

`add-beautiful-report` shipped a Calibre-styled viewer + deck. The reports look good but they all look **the same**. Calibre is one design choice; ohmyperf has no mechanism to render the same Report in a different visual language.

The `open-design-library` vendored at `~/.config/opencode/open-design-library/` ships **17 production-grade brand systems** with machine-parseable `tokens.css` files (Apache-2.0). Three of them (`linear-app`, `stripe`, `vercel`) match the perf-tool aesthetic and would give ohmyperf reports a brand-switchable identity layer.

User's stated requirement: *"Yêu cầu của tôi là dùng opendesign để render report."*

This change makes it real: a `--style=<brand>` flag swaps the viewer + deck palette + typography to any of 4 styles (`calibre` default, plus 3 vendored open-design brands). The website `/report` route gets a matching brand picker. MCP gains a `list_styles` tool and the rendering tools accept a `style` arg.

The deeper goal is **not** "151 brands available" — it's **"opendesign is a real integration, not a marketing claim"**. Three brands ship in v1.0; the bridge architecture supports adding more in v1.1+ via a documented vendoring process.

## What changes

### Added — Brand vendoring infrastructure

- `packages/design-tokens/brands/` — NEW directory housing vendored brand CSS
- `packages/design-tokens/brands/UPSTREAM_SHA` — pinned commit SHA from `nexu-io/open-design` for reproducible re-vendoring
- `packages/design-tokens/scripts/sync-open-design.mjs` — NEW: re-vendors brand tokens, strips non-system fonts, precomputes `color-mix()` to static values, asserts open-design schema version unchanged. Failure on schema drift = exit 1.
- `pnpm sync:open-design` — root npm script that invokes the sync. Manual-only; never runs in CI.
- `NOTICE` updated with Apache-2.0 attribution per vendored brand citing upstream SHA + date.

### Added — Three vendored brands

For each of `linear-app`, `stripe`, `vercel`:

- `packages/design-tokens/brands/<id>/tokens.css` — verbatim from upstream (Apache-2.0 header preserved) with two transforms applied at sync time:
  - **Font stripping**: `--font-display: Inter Variable, ...` → `--font-display: -apple-system, BlinkMacSystemFont, Inter, system-ui, sans-serif` (and same for `--font-mono`). Preserves weights, letter-spacing, OpenType features.
  - **color-mix() precomputation**: `color-mix(in oklab, var(--accent), black 8%)` → resolved hex. Single-file artifact stays portable to old browsers.
- `packages/design-tokens/brands/<id>/bridge.css` — NEW: aliases open-design tokens onto ohmyperf's `--color-*` namespace:
  ```css
  :root {
    --color-background: var(--bg);
    --color-foreground: var(--fg);
    --color-card: var(--surface);
    --color-card-foreground: var(--fg);
    --color-muted: var(--surface-warm);
    --color-muted-foreground: var(--meta);
    --color-border: var(--border);
    --color-primary: var(--accent);
    --color-primary-foreground: var(--accent-on);
    --color-accent-primary: var(--accent);
    --color-accent-success: var(--success);
    --color-accent-warning: var(--warn);
    --color-accent-danger: var(--danger);
    --color-destructive: var(--danger);
    --color-destructive-foreground: var(--accent-on);
  }
  ```
- `packages/design-tokens/brands/<id>/README.md` — provenance (upstream commit SHA, vendor date), license note, documented divergences (font stack reduced to system, color-mix precomputed), supported themes.

### Added — Brand registry

- `packages/design-tokens/src/brands.ts` — NEW:
  - `export type BrandId = "calibre" | "linear-app" | "stripe" | "vercel"`
  - `export const BRAND_IDS: ReadonlyArray<BrandId>` — for enumeration/iteration
  - `export interface BrandManifest { id: BrandId; displayName: string; preferredTheme: "light" | "dark"; supportsLight: boolean; supportsDark: boolean; description: string; license: string; upstreamSha?: string }`
  - `export const BRAND_MANIFEST: Readonly<Record<BrandId, BrandManifest>>` — manifest entries for all 4 brands
  - `export function getBrandCss(id: BrandId, theme: "light" | "dark" | "system"): string` — returns concatenated `tokens.css` + `bridge.css` for the brand+theme. Resolves `system` to `BrandManifest.preferredTheme`. For `calibre`, delegates to existing `PALETTE_CSS` / `PALETTE_CSS_LIGHT_ONLY`.
  - `export function resolveTheme(id: BrandId, opts: { theme?: "light" | "dark" | "system" }): "light" | "dark"` — applies the resolution rule (see Architecture below)
- `packages/design-tokens/src/index.ts` — re-export from `brands.ts`. Existing exports (`CALIBRE_LIGHT`, `CALIBRE_DARK`, `PALETTE_CSS`, `PALETTE_CSS_LIGHT_ONLY`, `TOKEN_NAMES`) UNCHANGED.
- `packages/design-tokens/etc/design-tokens.api.md` — additive update (new exports; no breaking diff).

### Added — Chart palette decoupling

- `packages/viewer/src/charts/{donut,cwv-traffic-light,bar-chart}.ts` — refactored: SVG elements emit `data-status="success|warning|danger|good|needs-improvement|poor"` instead of inline color attributes. JS no longer imports `CALIBRE_LIGHT` for color values.
- `packages/viewer/src/styles.ts` — new CSS rules using `var(--color-accent-*)` selected by `[data-status="..."]`. Charts inherit whatever brand palette is active. Back-compat to Chrome 49 / Safari 9.1.
- `packages/viewer/src/sections/third-parties.ts` — legend swatches change from `style="background:${colorString}"` to `data-vendor-index="N"` + CSS selector. Donut chart colors come from a CSS color cycle keyed off `--color-accent-*` tokens.
- After this refactor: `grep -r "CALIBRE_LIGHT\|CALIBRE_DARK" packages/viewer/src packages/reporter-deck/src` returns ZERO matches (enforced in CI).

### Added — Viewer style threading

- `packages/viewer/src/render.ts` — `RenderViewerOptions.style?: BrandId` added (default `"calibre"`). `renderReportHtml(report, opts)` calls `getBrandCss(opts.style, opts.theme)` instead of hard-coded `PALETTE_CSS`.
- Theme resolution per brand manifest:
  - `opts.theme === "system"` → uses `BRAND_MANIFEST[opts.style].preferredTheme`
  - `opts.theme === "light"` → honored if `supportsLight === true`; else fall back to `preferredTheme` with `console.warn(\`[ohmyperf/viewer] \${style} does not support light theme; using \${preferredTheme}\`)` (non-fatal)
  - `opts.theme === "dark"` → same pattern with `supportsDark`
- Attribution: when `style !== "calibre"`, the footer text appends ` · Styled like linear-app via Open Design Library` (or matching brand). Hidden HTML comment `<!-- Styled like <brand> via Open Design Library (Apache-2.0) -->` always present when brand differs from calibre.

### Added — Deck style threading (palette + typography only)

- `packages/reporter-deck/src/render.ts` — `RenderDeckOptions.style?: BrandId` added.
- Deck STAYS light-locked. Brand contributes only `--accent`, `--accent-hover`, `--fg`, `--meta`, `--font-display`; other tokens come from Calibre's `PALETTE_CSS_LIGHT_ONLY`. This is implemented in `packages/reporter-deck/src/styles.ts` via a new `getDeckBrandOverlay(style: BrandId): string` helper that emits only the 5 tokens listed above as `:root { --color-accent-primary: var(--brand-accent); ... }` overrides on top of light-locked chrome.
- No "fail-loud on dark-native brand" path — deck never inherits brand chrome, only palette accents.

### Added — CLI surface

- `apps/cli/src/commands/run.ts` — new `--style` flag (citty enum validation: `calibre | linear-app | stripe | vercel`). Default `calibre`. Threaded into `writeHtmlReport` + `writeDeckReport`.
- `apps/cli/src/commands/list-styles.ts` — NEW subcommand `ohmyperf list-styles`. Prints brand table: ID, display name, supported themes, preferred theme, license, upstream SHA, description.
- `apps/cli/src/cli.ts` — register `list-styles` subcommand.
- When `--style=<x>` + `--format=json` only (no html/deck reporters): warn to stderr (`[ohmyperf] --style is a no-op when no HTML reporter is selected`) but exit 0.
- When `--style=<unknown>`: citty surfaces enum validation error with hint listing valid values; exit non-zero.

### Added — MCP integration

- `apps/mcp-server/src/server.ts`:
  - `generate_deck` tool gains optional `style: BrandId` arg (enum validated). Defaults to `calibre`.
  - NEW `generate_html_report` tool — mirrors `generate_deck` but for the viewer HTML (file-writing, returns path). Writes to `<reportsDir>/html/<measurementId>.html`. Same input schema (reportPath OR uri + style + theme + title).
  - NEW `list_styles` tool — zero args. Returns the 4 brand manifests as structured JSON (id, displayName, supportedThemes, preferredTheme, license, description). Enables AI agents to discover styles without docs.
- `apps/mcp-server/package.json` — already has `@ohmyperf/reporter-deck` from Commit 4 of `add-beautiful-report`; viewer is workspace-resolved via core.

### Added — Website brand picker

- `apps/website/components/report/style-picker.tsx` — NEW dropdown component (mirror of existing `export-menu.tsx` shape; uses local headless Combobox primitives, no shadcn additions). Lists 4 styles with display names. Selected style stored in URL query `?style=<id>` and `localStorage["ohmyperf:style"]`.
- `apps/website/components/report/export-menu.tsx` — existing "Download as HTML" + "Download as deck" items now honor the selected style (dynamic-import the relevant reporter, pass `{ style: selectedStyle }` at render time).
- `apps/website/app/report/page.tsx` — wires `StylePicker` into the toolbar between `ShareButton` and `ExportMenu`. The live `ReportViewer` React component reads the selected style and applies the corresponding brand bridge CSS via dynamic `<style>` injection (CSS-only swap; no React tree rebuild).
- Website route `/report/[[...id]]` bundle budget UNCHANGED at 250 KB gz; the 3 brand CSS files are loaded via dynamic import only when picked (lazy).

### Added — CI gates extended

- `scripts/check-contrast.mjs` — extended to walk `BRAND_IDS`. For each brand × supported theme, parses its `tokens.css` (source of truth) and asserts WCAG-AA: ≥4.5:1 for text-on-background, ≥3:1 for UI accent-on-background. Brand failure blocks merge.
- `scripts/check-design-tokens.mjs` — already sentinel-detects mirrors; extends naturally. Each brand's `bridge.css` is NOT a token mirror (no `--color-* := oklch(...)` declarations; only var-alias chains). Drift gate's existing logic still works; no change needed.
- `scripts/check-bundle-budgets.mjs` — no per-brand entries needed. The artifact bundle cap (viewer 200 KB gz / deck 500 KB gz) applies per render; only the selected brand is embedded.
- `scripts/license-audit.mjs` — extended to verify Apache-2.0 SPDX header on every file under `packages/design-tokens/brands/`.
- `.github/workflows/ci.yml` — `pnpm check:design-tokens && pnpm check:contrast` chain unchanged but now exercises 4 brands.

### Added — Visual regression baselines

- `tests/visual-regression/` — NEW test package using Playwright + chromium.
- `tests/visual-regression/brand-fixtures.test.ts` — for each of 4 brands × `fixtures/rich.json` × {viewer, deck}: renders to a temp file, opens in headless Chromium at 1280×720 viewport, captures full-page screenshot, diffs against committed baseline.
- `tests/visual-regression/baselines/{viewer,deck}/<brand>.png` — committed baselines. ~16 PNGs total (4 brands × 2 surfaces × 2 themes for brands that support both = up to 16).
- Tolerance: 0.5% pixel diff allowed (Playwright `expect.toMatchSnapshot({ maxDiffPixelRatio: 0.005 })`).
- New CI workflow step `visual-regression` (separate from existing matrix; runs only on ubuntu-24.04 to avoid font-rendering differences across OSes).
- `pnpm test:visual` script.

### Added — Documentation

- `packages/design-tokens/brands/README.md` — NEW: documents the bridge layer architecture, the strict 4-brand cap, the vendoring/sync workflow, the contrast gate, and v1.1 expansion procedure.
- `packages/design-tokens/brands/<id>/README.md` — per brand: source, license, sync date, font/color-mix divergences, supported themes, preview screenshot link to `tests/visual-regression/baselines/`.
- `docs/beautiful-report.md` — extended with a "Brand styles" section: 4-brand gallery table with screenshots, CLI/MCP/website usage examples, attribution guidance.
- `apps/cli/README.md` — `--style` flag documented; `list-styles` subcommand documented.
- `apps/mcp-server/README.md` — new `list_styles` + `generate_html_report` tools documented; `generate_deck` `style` arg documented.

### Modified — Architectural Invariants (preserved, not new)

The following are NOT new constraints — they are invariants from `add-beautiful-report` that this change preserves:

- Single-file no-external-requests artifacts (no Tailwind CDN, no Google Fonts CDN, no `<script src=...>` external URLs).
- Bundle budgets: viewer ≤ 200 KB gz, deck ≤ 500 KB gz per artifact.
- Reproducibility: no CI auto-sync of upstream open-design.
- Vendor-only-tokens: never import `components.html` or `DESIGN.md` from open-design.
- Calibre lifecycle separate from open-design (no `design-systems/calibre/` upstream).
- Report schema 1.0.0 FROZEN; no `Report.style` field. Style is a render-time option only.
- `@ohmyperf/design-tokens` API additive-only (api-extractor enforced).
- WCAG-AA contrast pre-gate on shipped artifacts.

## Genuinely deferred to v1.1+ (5 items)

These ARE real defers — not architectural invariants, not stale.

1. **Expand beyond 4 brands** — DESIGN.md NLP parser for the 133 prose-only brands is its own project; expansion to the remaining 14 with ready `tokens.css` requires per-brand WCAG-AA audit (~5× audit work).
2. **Layout switching** (`--deck-template=swiss|guizang|...`) — Q3 lock; deck layout vs palette are orthogonal concerns; v1.2 work.
3. **Density modes, motion preferences** — open-design schema doesn't have these layers stable yet upstream.
4. **Print-mode brand overrides** — per-brand `@media print` rules. Currently Calibre's print CSS applies regardless of brand; minor visual mismatch acceptable for v1.0.
5. **`BrandPalette` JSON export for external consumers** — speculative; no consumer requesting yet.

## Dependencies

- `add-beautiful-report` (already shipped via commits `8443b71` → `4ec0db3`). This change is strictly additive on top.
- Open-design upstream at `~/.config/opencode/open-design-library/` — vendored, not a build-time dependency. Sync is manual.
- Playwright (already installed for `tests/parity` and `tests/oopif-corpus`). Visual regression reuses the existing chromium install.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Bridge API churn breaks `@ohmyperf/design-tokens` consumers | api-extractor snapshot enforced; additive-only contract; existing `CALIBRE_LIGHT`/`PALETTE_CSS`/`TOKEN_NAMES` exports UNCHANGED. |
| stripe/vercel/linear-app fails WCAG-AA at integration | Contrast gate runs in Commit 2 (BEFORE viewer/deck integration). If a brand fails, decision point at merge: ship with documented darker-accent override OR drop the brand from v1.0. NOT punted to later. |
| Brand-list creep to 17 or 151 | `BrandId` is a strict TypeScript union literal; expansion requires type change + new change proposal. Hard guardrail in `packages/design-tokens/brands/README.md`. |
| Hard-coded `CALIBRE_LIGHT` imports leak past chart refactor | Commit 3 acceptance gate: `grep -r "CALIBRE_LIGHT\|CALIBRE_DARK" packages/viewer/src packages/reporter-deck/src` MUST return zero matches. |
| Open-design upstream schema changes | Pin SHA in `UPSTREAM_SHA` file. Sync script asserts schema version. No auto-sync in CI. |
| `color-mix()` browser support for archived reports | Precomputed at vendor time (same playbook as Calibre's hex fallbacks). |
| Visual regression baselines drift on font-renderer differences across OS | Visual regression CI step runs only on ubuntu-24.04 (single OS). macOS/Windows users running `pnpm test:visual` locally get advisory output only (not gated). |
| Inline SVG `var(--color-*)` doesn't work in older browsers | Charts use `data-status` attributes + CSS rules on parent — supported back to Chrome 49 / Safari 9.1 (no SVG `var()` dependency). |
| Brand attribution legal interpretation | Apache-2.0 only requires NOTICE-level attribution. Footer text reads "Styled like linear-app via Open Design Library" — avoids trademark implications by omitting registered marks (Linear®/Stripe®/Vercel®). |
| Theme × style matrix produces nonsensical combinations | Spec R5 documents explicit truth table (12 cells) with behavior per cell; `console.warn` for graceful degradation. |

## Architectural Invariants (preserved from `add-beautiful-report`)

These are explicit reaffirmations, NOT new constraints. The change MUST honor them:

- No external CDN dependencies of any kind
- Single-file no-external-requests artifact guarantee
- Bundle budget caps (viewer 200 KB gz, deck 500 KB gz)
- Reproducibility (no CI auto-sync)
- Vendor-only-tokens (no `components.html`, no `DESIGN.md`)
- Calibre stays as authored ohmyperf source; not vendored upstream
- Report schema 1.0.0 FROZEN

## Phasing

Single OpenSpec change, **5 commits delivered sequentially**, each independently passes typecheck + tests + lint + bundle-budget + contrast + drift gates:

- **Commit 1** — Vendoring infrastructure (sync script, UPSTREAM_SHA pin, NOTICE scaffold; no brands yet)
- **Commit 2** — Vendor 3 brands + brand registry + WCAG-AA contrast gate extended (BLOCKS if any brand fails)
- **Commit 3** — Chart refactor (`data-status` attributes) + viewer style threading + theme resolution rules
- **Commit 4** — Deck style threading (palette+typography only) + visual regression baselines + Playwright test
- **Commit 5** — CLI `--style` flag + `list-styles` subcommand + MCP `list_styles` + `generate_html_report` + website brand picker + docs
