# Tasks: Open Design Styles

Five commits inside one OpenSpec change. Each commit lands independently passing typecheck + tests + lint + bundle-budget + contrast + drift gates.

---

## Commit 1 — Vendoring Infrastructure

### 1.1 Brands directory + UPSTREAM_SHA pin

- [ ] 1.1.1 Create `packages/design-tokens/brands/` directory (empty for now).
- [ ] 1.1.1.1 Add `packages/design-tokens/brands/UPSTREAM_SHA` — single line: the commit SHA of the `nexu-io/open-design` upstream snapshot vendored at `~/.config/opencode/open-design-library/`. If not available, use the current local snapshot's last-modified timestamp ISO date + "local-vendor" sentinel.
- [ ] 1.1.2 Create `packages/design-tokens/brands/README.md` — documents the architecture (per-brand `tokens.css` + `bridge.css`), the hard 4-brand cap for v1.0, the v1.1 expansion procedure (new change proposal + WCAG-AA audit), the sync workflow, the strict `BrandId` union.

### 1.2 Sync script

- [ ] 1.2.1 Create `packages/design-tokens/scripts/sync-open-design.mjs`:
  - Args: `--brand=<id>` or `--all` (default: all 3 brands)
  - Reads `BRAND_IDS - "calibre"` from a constant (don't import from yet-unbuilt brands.ts; hardcode `["linear-app","stripe","vercel"]` for this script)
  - For each target brand:
    - Read source at `${HOME}/.config/opencode/open-design-library/design-systems/<brand>/tokens.css`
    - Apply font-stripping transform: regex replace `--font-display: ...;` and `--font-mono: ...;` declarations with system-stack equivalents (preserve weights/letter-spacing/feature-settings)
    - Apply color-mix precompute transform: for each `color-mix(in <space>, var(--accent), <color> <percent>%)` occurrence, resolve to static hex using a simple OKLCH/sRGB color mixer (~80 LOC; use a vendored mixer routine, not a heavy library)
    - Write transformed result to `packages/design-tokens/brands/<id>/tokens.css` with Apache-2.0 SPDX header preserved + provenance header appended (`/* Vendored from open-design @ <UPSTREAM_SHA> on <ISO date> · DO NOT EDIT · run pnpm sync:open-design to update */`)
    - Generate `packages/design-tokens/brands/<id>/bridge.css` from the canonical bridge template (16 var-alias mappings; see proposal section "Added — Three vendored brands")
    - Skeleton `packages/design-tokens/brands/<id>/README.md` (filled in Commit 2 task 2.4 with brand-specific notes)
  - Assert open-design schema version unchanged: read upstream `_schema/tokens.schema.ts` first/last lines and a digest of declared A1+A2 token names; compare against checked-in `packages/design-tokens/brands/.schema-digest`. Fail with diff on mismatch.
- [ ] 1.2.2 Add npm script to root `package.json`: `"sync:open-design": "node packages/design-tokens/scripts/sync-open-design.mjs --all"`
- [ ] 1.2.3 The sync script MUST NOT run in CI; document in script comment + brands/README.md.

### 1.3 NOTICE scaffold

- [ ] 1.3.1 Add new section in repo-root `NOTICE` under existing entries: "## Vendored open-design brand tokens (Apache-2.0)" — placeholder entries for `linear-app`, `stripe`, `vercel` with `<TBD upstream SHA, vendor date>` markers (filled in Commit 2).

### 1.4 License audit script extension

- [ ] 1.4.1 Extend `scripts/license-audit.mjs` (or add `scripts/check-brand-licenses.mjs` invoked from `license:audit`): walk `packages/design-tokens/brands/` and assert every `.css` file contains "Apache-2.0" header. Exit 1 on missing header.

### 1.5 Commit 1 acceptance

- [ ] 1.5.1 `pnpm install` succeeds; no new workspace package added yet (brands/ is just a subdirectory of design-tokens).
- [ ] 1.5.2 `pnpm typecheck` workspace: 43/43 packages green (unchanged from `add-beautiful-report` end-state).
- [ ] 1.5.3 `pnpm --filter @ohmyperf/design-tokens build` clean.
- [ ] 1.5.4 `pnpm --filter @ohmyperf/design-tokens test` 10/10 still pass.
- [ ] 1.5.5 `node packages/design-tokens/scripts/sync-open-design.mjs --brand=linear-app --dry-run` (if `--dry-run` implemented) prints transform plan without writing.
- [ ] 1.5.6 NOTICE entries appear under new "Vendored open-design" section.
- [ ] 1.5.7 No brands vendored yet; commit is pure infrastructure.

---

## Commit 2 — Vendor 3 Brands + Brand Registry + Contrast Gate

### 2.1 Vendor the 3 brands

- [ ] 2.1.1 Run `pnpm sync:open-design` once. Result: `packages/design-tokens/brands/{linear-app,stripe,vercel}/{tokens.css,bridge.css,README.md skeleton}`.
- [ ] 2.1.2 Manual review: confirm font-stripping transformed `Inter Variable` → system stack in all 3 brands' `tokens.css`. Confirm `color-mix()` calls all resolved to static hex.
- [ ] 2.1.3 Per-brand bridge.css canonical content (16 var-alias lines per proposal) is byte-identical across the 3 brands (only the input `--bg/--fg/...` values differ per brand's tokens.css — the bridge map itself is universal).

### 2.2 Brand registry

- [ ] 2.2.1 Create `packages/design-tokens/src/brands.ts`:
  - Export `type BrandId = "calibre" | "linear-app" | "stripe" | "vercel"` (strict union literal)
  - Export `const BRAND_IDS: ReadonlyArray<BrandId> = ["calibre","linear-app","stripe","vercel"] as const`
  - Export `interface BrandManifest { id: BrandId; displayName: string; preferredTheme: "light" | "dark"; supportsLight: boolean; supportsDark: boolean; description: string; license: string; upstreamSha?: string }`
  - Export `const BRAND_MANIFEST: Readonly<Record<BrandId, BrandManifest>>` with hand-authored manifests:
    - calibre: preferredTheme=light, supportsLight=true, supportsDark=true, license="Apache-2.0"
    - linear-app: preferredTheme=dark, supportsLight=true, supportsDark=true (linear's DESIGN.md has light-mode neutrals)
    - stripe: preferredTheme=light, supportsLight=true, supportsDark=false (stripe ships only light per its tokens.css)
    - vercel: preferredTheme=light, supportsLight=true, supportsDark=true (vercel has both per its DESIGN.md)
  - Export `function resolveTheme(id: BrandId, opts: { theme?: "light"|"dark"|"system" }): "light"|"dark"` — implements R5 truth table from spec
  - Export `function getBrandCss(id: BrandId, theme: "light"|"dark"|"system"): string` — for calibre delegates to PALETTE_CSS/PALETTE_CSS_LIGHT_ONLY; for vendored brands reads from `dist/brands/<id>/tokens.css` + `dist/brands/<id>/bridge.css` at build time, embeds as TS template literal via a generated module
  - The "generated module" is `packages/design-tokens/src/generated/brand-css.ts` produced by a build step (`packages/design-tokens/scripts/emit-brand-css.mjs`): reads each `brands/<id>/tokens.css` + `bridge.css`, base64-encodes? No — emit as plain TS string literals into a single map. Build runs as part of `pnpm build`.
- [ ] 2.2.2 Update `packages/design-tokens/src/index.ts` — re-export `BrandId`, `BRAND_IDS`, `BRAND_MANIFEST`, `getBrandCss`, `resolveTheme` from `./brands.js`. Existing exports unchanged.
- [ ] 2.2.3 Update `packages/design-tokens/package.json` `scripts.build`: now `tsc -b && node scripts/emit-css.mjs && node scripts/emit-brand-css.mjs`.
- [ ] 2.2.4 Create `packages/design-tokens/scripts/emit-brand-css.mjs`: reads 3 brands' `tokens.css` + `bridge.css`, emits `src/generated/brand-css.ts` with `BRAND_CSS_MAP: Record<BrandId, string>`. Generated file MUST be gitignored or committed with auto-generated header — pick commit (simpler, no .gitignore changes); regenerate on every build.
- [ ] 2.2.5 Update `packages/design-tokens/etc/design-tokens.api.md` via api-extractor; verify additive-only.

### 2.3 Contrast gate extended

- [ ] 2.3.1 Extend `scripts/check-contrast.mjs`:
  - For each `BrandId in BRAND_IDS`: for each theme in `BRAND_MANIFEST[id].{supportsLight,supportsDark}`: parse `packages/design-tokens/brands/<id>/tokens.css` (or for calibre, parse globals.css as before)
  - Compute WCAG-AA pairs: text-on-background (≥4.5:1), accent-on-background (≥3:1 for UI)
  - Output per brand × theme; fail exit non-zero on any brand failing
- [ ] 2.3.2 Run the gate. Confirm all 4 brands pass. If a brand fails: STOP, file the failure as a decision point (ship with override OR drop the brand from v1.0). Do NOT proceed to Commit 3 until contrast is clean.

### 2.4 Per-brand README

- [ ] 2.4.1 `packages/design-tokens/brands/linear-app/README.md`:
  - Source: `nexu-io/open-design` at `<UPSTREAM_SHA>` · License: Apache-2.0
  - Vendored: `<vendor date>`
  - Supported themes: light, dark · Preferred: dark
  - Divergences from upstream: font stack reduced to system fallback (Inter Variable → -apple-system, ...); `color-mix()` precomputed to static hex
  - WCAG-AA status: PASS (or document overrides)
  - Visual baseline: `tests/visual-regression/baselines/viewer/linear-app.png`
- [ ] 2.4.2 Same shape for `stripe/README.md` (light only).
- [ ] 2.4.3 Same shape for `vercel/README.md` (light, dark).

### 2.5 NOTICE update

- [ ] 2.5.1 Replace placeholders in NOTICE with actual upstream SHA + vendor date for all 3 brands.

### 2.6 Commit 2 acceptance

- [ ] 2.6.1 `pnpm typecheck` workspace: 43/43 packages green.
- [ ] 2.6.2 `pnpm --filter @ohmyperf/design-tokens build` clean; `dist/generated/brand-css.ts` exists with 3-brand map.
- [ ] 2.6.3 `pnpm --filter @ohmyperf/design-tokens test` 10+ pass (existing 10 + any new brand-registry tests).
- [ ] 2.6.4 `node scripts/check-design-tokens.mjs` exits 0 (calibre still gated; brand mirrors not yet token-emitting).
- [ ] 2.6.5 `node scripts/check-contrast.mjs` exits 0 across all 4 brands × supported themes.
- [ ] 2.6.6 `pnpm license:audit` exits 0; brand CSS files have Apache-2.0 header.
- [ ] 2.6.7 `pnpm api:check` (or equivalent api-extractor run) — additive only; no breaking change to design-tokens public API.
- [ ] 2.6.8 No viewer/deck/CLI/MCP/website changes yet (verify `git diff --stat` only touches `packages/design-tokens`, `scripts/`, `NOTICE`).

---

## Commit 3 — Chart Refactor + Viewer Style Threading

### 3.1 Chart refactor: data-status attributes

- [ ] 3.1.1 Refactor `packages/viewer/src/charts/donut.ts`:
  - Remove `import { CALIBRE_LIGHT }` and all references to `CALIBRE_LIGHT.*`
  - SVG path emit changes from `fill="${slice.color ?? DEFAULT_COLORS[i]}"` to `data-donut-slice="${i}"` (palette-agnostic)
  - `donutColorAt(index)` deprecated; remove if no external callers remain (audit via `grep`).
- [ ] 3.1.2 Refactor `packages/viewer/src/charts/cwv-traffic-light.ts`:
  - Remove `CALIBRE_LIGHT` import
  - Card emit already uses `data-cwv-status="..."`; ensure no inline `style="color:..."` remnants
- [ ] 3.1.3 Refactor `packages/viewer/src/charts/bar-chart.ts`:
  - Remove `CALIBRE_LIGHT` import
  - `<rect>` bar emit changes from `fill="${opts.color ?? CALIBRE_LIGHT.accentPrimary}"` to `data-bar="value"` (track) / `data-bar="filled"` (filled portion)
- [ ] 3.1.4 Update `packages/viewer/src/sections/third-parties.ts`:
  - Replace `style="background:${donutColorAt(i)}"` on legend swatches with `data-vendor-index="${i % 6}"` (6-color cycle)
- [ ] 3.1.5 Acceptance grep: `grep -rE "CALIBRE_LIGHT|CALIBRE_DARK" packages/viewer/src packages/reporter-deck/src | grep -v "// " | wc -l` MUST return 0.

### 3.2 CSS rules for chart palette

- [ ] 3.2.1 Add CSS rules to `packages/viewer/src/styles.ts` (STRUCTURAL_CSS):
  ```css
  [data-donut-slice="0"] { stroke: var(--color-accent-primary); }
  [data-donut-slice="1"] { stroke: var(--color-accent-success); }
  [data-donut-slice="2"] { stroke: var(--color-accent-warning); }
  [data-donut-slice="3"] { stroke: var(--color-accent-danger); }
  [data-donut-slice="4"] { stroke: var(--color-muted-foreground); }
  [data-donut-slice="5"] { stroke: var(--color-foreground); }
  [data-bar="value"] { fill: var(--color-muted); }
  [data-bar="filled"] { fill: var(--color-accent-primary); }
  [data-vendor-index="0"] { background: var(--color-accent-primary); }
  /* ... matching 6-cycle for vendors */
  ```
- [ ] 3.2.2 Verify CSS rules apply correctly to inline SVG by manually rendering `fixtures/rich.json` and inspecting in browser.

### 3.3 Viewer `opts.style` threading

- [ ] 3.3.1 `packages/viewer/src/render.ts`:
  - Extend `RenderViewerOptions` with `style?: BrandId` (default `"calibre"`)
  - Import `getBrandCss`, `resolveTheme`, `BRAND_MANIFEST` from `@ohmyperf/design-tokens`
  - Replace hard-coded `VIEWER_CSS` import composition with `getBrandCss(opts.style ?? "calibre", opts.theme ?? "system")` + `STRUCTURAL_CSS` concatenation
  - Add `console.warn` path for unsupported theme per R5 rules
- [ ] 3.3.2 `packages/viewer/src/styles.ts` — split into two exports: `PALETTE_CSS_INJECTED` (now empty placeholder; brand CSS supplies it via getBrandCss) + `STRUCTURAL_CSS` (everything else, including new chart selectors from 3.2.1). Update VIEWER_CSS to be a function or keep as compatibility re-export of STRUCTURAL_CSS only.
- [ ] 3.3.3 Footer attribution: in `render.ts`, when `opts.style !== "calibre"`, append ` · Styled like <displayName> via Open Design Library` to the foot paragraph. Add hidden HTML comment `<!-- Styled like <id> via Open Design Library (Apache-2.0) -->` before `</body>`.
- [ ] 3.3.4 Update existing tests in `packages/viewer/src/{fixtures,styles,render,charts/charts}.test.ts` to reflect:
  - Removed `CALIBRE_LIGHT` import references
  - New `data-status` / `data-donut-slice` / `data-bar` attribute presence
  - `opts.style` parameter

### 3.4 New brand snapshot tests

- [ ] 3.4.1 Create `packages/viewer/src/brand-snapshots.test.ts`:
  - For each `BrandId` in `BRAND_IDS`: render `fixtures/rich.json` with `{ style: <id> }`
  - Assert: HTML contains expected `--color-*` variables sourced from brand bridge (e.g. for `linear-app` dark, `--color-accent-primary` resolves through `--accent: #5e6ad2`)
  - Assert: HTML contains `data-cwv-status` markers + chart selectors regardless of brand
  - Assert: For non-calibre brands, footer contains brand attribution AND hidden HTML comment present
  - Assert: For calibre, NO attribution suffix and NO hidden comment

### 3.5 Commit 3 acceptance

- [ ] 3.5.1 `pnpm typecheck` workspace: 43/43 green.
- [ ] 3.5.2 `pnpm --filter @ohmyperf/viewer test` ALL pass (46 existing + N new brand-snapshot tests).
- [ ] 3.5.3 `grep -rE "CALIBRE_LIGHT|CALIBRE_DARK" packages/viewer/src packages/reporter-deck/src` returns 0 matches.
- [ ] 3.5.4 `node scripts/check-contrast.mjs` still exits 0.
- [ ] 3.5.5 `node scripts/check-design-tokens.mjs` still exits 0.
- [ ] 3.5.6 Manual render of `fixtures/rich.json` with `{ style: "linear-app" }` → HTML opens in browser; CWV cards show linear's dark palette; donut + bar charts pick up brand colors via CSS cascade.
- [ ] 3.5.7 Bundle size assertion: `report.html` rendered with `--style=linear-app` from fixtures/rich.json ≤ 200 KB gz.

---

## Commit 4 — Deck Style Threading + Visual Regression

### 4.1 Deck `opts.style` threading

- [ ] 4.1.1 `packages/reporter-deck/src/render.ts`:
  - Extend `RenderDeckOptions` with `style?: BrandId` (default `"calibre"`)
  - Thread through to `renderDeckShell`
- [ ] 4.1.2 `packages/reporter-deck/src/deck-shell.ts`:
  - Accept `style: BrandId` in shell options
  - Compose CSS: `PALETTE_CSS_LIGHT_ONLY` (Calibre light chrome, always) + `getDeckBrandOverlay(style)` (brand accent + typography only)
- [ ] 4.1.3 `packages/reporter-deck/src/styles.ts` — add function `getDeckBrandOverlay(style: BrandId): string`:
  - For calibre: return empty string
  - For other brands: emit `:root { --color-accent-primary: <brand --accent>; --color-accent-success: <brand --success>; --color-foreground-accent: <brand --fg>; --color-meta-accent: <brand --meta>; }` using values extracted from the brand's tokens.css at build time (reuse `BRAND_CSS_MAP` mechanism from Commit 2)
  - Slides + chart selectors then pick up brand accents via existing `var(--color-accent-*)` references; chrome (bg, borders, page break, etc.) stays light-locked
- [ ] 4.1.4 Add hidden HTML comment + footer attribution to deck cover slide (mirror viewer's pattern from 3.3.3).

### 4.2 Deck brand snapshot tests

- [ ] 4.2.1 Extend `packages/reporter-deck/src/render.test.ts`:
  - For each `BrandId`: render `fixtures/rich.json` deck
  - Assert 6 slides emitted per brand
  - Assert brand accent appears in slide CSS for non-calibre brands
  - Assert deck chrome stays light (no `prefers-color-scheme: dark` block emitted; no dark bg in slide markup)

### 4.3 Visual regression test setup

- [ ] 4.3.1 Create `tests/visual-regression/` workspace package:
  - `package.json` — name `@ohmyperf/tests-visual-regression`, devDeps: `@playwright/test` (catalog), `@ohmyperf/viewer`, `@ohmyperf/reporter-deck`, `@ohmyperf/design-tokens`
  - `playwright.config.ts` — chromium only, ubuntu-only assertion (skip on other OS via test.skip)
  - `tsconfig.json`
  - `tests/brand-fixtures.test.ts` — for each `BrandId × {viewer,deck}`:
    - Render to `tests/visual-regression/.tmp/<brand>-<surface>.html`
    - `page.goto('file://...')`
    - `page.setViewportSize({ width: 1280, height: 720 })`
    - `expect(await page.screenshot({ fullPage: true })).toMatchSnapshot('baselines/<surface>/<brand>.png', { maxDiffPixelRatio: 0.005 })`
- [ ] 4.3.2 Generate initial baselines: `pnpm --filter @ohmyperf/tests-visual-regression test --update-snapshots`
- [ ] 4.3.3 Commit baselines under `tests/visual-regression/baselines/`. ~6 PNGs for viewer (4 brands; linear-app rendered in dark; stripe + vercel + calibre in light) + ~4 PNGs for deck (always light) = ~10 baselines.
- [ ] 4.3.4 Add `pnpm test:visual` root script: `turbo run test:visual --filter @ohmyperf/tests-visual-regression`
- [ ] 4.3.5 Add `.github/workflows/visual-regression.yml` — ubuntu-24.04 only, runs on PRs touching `packages/design-tokens/brands` or `packages/viewer/src` or `packages/reporter-deck/src`. Uploads diff artifacts on failure.

### 4.4 Commit 4 acceptance

- [ ] 4.4.1 `pnpm typecheck` workspace: 44/44 (43 + new visual-regression package) green.
- [ ] 4.4.2 `pnpm --filter @ohmyperf/reporter-deck test` ALL pass (19 existing + N new brand-snapshot tests).
- [ ] 4.4.3 `pnpm test:visual` exits 0; baselines render deterministically on ubuntu-24.04.
- [ ] 4.4.4 Bundle size: deck rendered with each brand from fixtures/rich.json ≤ 500 KB gz.
- [ ] 4.4.5 Manual: open `tests/visual-regression/baselines/deck/linear-app.png` — visually confirm linear's purple accent appears on light slide chrome.

---

## Commit 5 — CLI + MCP + Website + Docs

### 5.1 CLI `--style` flag

- [ ] 5.1.1 `apps/cli/src/commands/run.ts`:
  - Add `style` to the citty `args` schema:
    ```ts
    style: { type: "string", description: "Visual style (calibre, linear-app, stripe, vercel)", default: "calibre" }
    ```
  - Validate against `BRAND_IDS` (citty enum support OR manual check + error)
  - Thread `style: args.style as BrandId` into `writeHtmlReport` and `writeDeckReport` calls
  - If `formats` contains only `json` (no html/deck) and user passed `--style=<x>`: `logger.warn` and continue (non-fatal)
- [ ] 5.1.2 Update CLI help text via `meta.description` or arg-level descriptions.

### 5.2 `ohmyperf list-styles` subcommand

- [ ] 5.2.1 Create `apps/cli/src/commands/list-styles.ts`:
  - Imports `BRAND_MANIFEST`
  - Prints table to stdout: ID, Display Name, Preferred Theme, Supports Light, Supports Dark, License, Description
- [ ] 5.2.2 Register `listStylesCommand` in `apps/cli/src/cli.ts` `subCommands` map.
- [ ] 5.2.3 `apps/cli/package.json` already has `@ohmyperf/design-tokens` via `@ohmyperf/viewer` transitive; add direct workspace dep if needed for type re-export.

### 5.3 MCP `list_styles` tool

- [ ] 5.3.1 `apps/mcp-server/src/server.ts`:
  - Register new tool `list_styles`:
    - Description: "List available visual styles (brand IDs + manifest metadata)."
    - Input schema: empty object
    - Handler: returns `{ content: [{ type: "text", text: "<table summary>" }, { type: "text", text: JSON.stringify(BRAND_MANIFEST, null, 2) }] }`
- [ ] 5.3.2 Add `@ohmyperf/design-tokens` workspace dep to `apps/mcp-server/package.json` if not transitive.

### 5.4 MCP `generate_deck` `style` arg

- [ ] 5.4.1 `apps/mcp-server/src/server.ts`:
  - Extend `generate_deck` tool input schema: add `style: { type: "string", enum: BRAND_IDS, default: "calibre", description: "..." }`
  - Handler: pass `style` to `writeDeckReport`
  - Throw on unknown style with descriptive error citing valid IDs

### 5.5 MCP NEW `generate_html_report` tool

- [ ] 5.5.1 Add new tool `generate_html_report` mirroring `generate_deck` shape but invoking `writeHtmlReport`:
  - Input: `reportPath` OR `uri`, optional `outputDir` (default `<reportsDir>/html/<measurementId>.html`), `style`, `theme`, `title`
  - File-writing (returns path, not body)
- [ ] 5.5.2 Add to tool list in `ListToolsRequestSchema` handler.
- [ ] 5.5.3 New MCP smoke-test fixture under `apps/mcp-server/src/server.test.ts`: assert tool count = 12 (was 10) and `list_styles` + `generate_html_report` present.

### 5.6 Website brand picker

- [ ] 5.6.1 Create `apps/website/components/report/style-picker.tsx`:
  - Headless dropdown (no shadcn additions); `<button>` + `<ul>` with `role="listbox"`
  - Reads `BRAND_MANIFEST` from `@ohmyperf/design-tokens`
  - State: current style from URL `?style=<id>` query param (default `calibre`); persists to `localStorage["ohmyperf:style"]`
  - On change: updates URL via `router.push({ query: { style: newId } })` (Next.js useRouter)
- [ ] 5.6.2 Update `apps/website/components/viewer/report-viewer.tsx` (or wherever `ReportViewer` lives):
  - Reads selected style from URL via `useSearchParams`
  - Dynamic-imports `getBrandCss` from `@ohmyperf/design-tokens` and injects via a `<style id="ohmyperf-brand-css">` tag in the component tree
  - When style changes: replace the `<style>` block's textContent (no React tree rebuild)
- [ ] 5.6.3 Update `apps/website/components/report/export-menu.tsx`:
  - Read selected style from URL
  - Pass `{ style: selectedStyle }` to `renderReportHtml` / `renderReportDeck` calls in "Download as HTML" / "Download as deck" handlers
- [ ] 5.6.4 Update `apps/website/app/report/page.tsx` (or report layout) to render `<StylePicker />` in toolbar.
- [ ] 5.6.5 `apps/website/package.json` — add `@ohmyperf/design-tokens` to dependencies (currently transitive via `@ohmyperf/reporter-markdown`, but make direct for clarity).
- [ ] 5.6.6 Bundle budget check: `/report/[[...id]]` route stays ≤ 250 KB gz (brand CSS loaded via dynamic import lazily; not in initial bundle).

### 5.7 Documentation

- [ ] 5.7.1 `docs/beautiful-report.md` — add new section "Brand styles":
  - 4-brand table: ID, Display Name, Preferred Theme, Description
  - Screenshots (link to `tests/visual-regression/baselines/`)
  - CLI usage: `ohmyperf run --style=linear-app https://example.com`
  - MCP usage: `generate_html_report(reportPath, style="stripe")`
  - Website usage: paragraph on URL query + brand picker UI
  - Attribution + Apache-2.0 note
- [ ] 5.7.2 Update `apps/cli/README.md` with `--style` flag + `list-styles` subcommand examples.
- [ ] 5.7.3 Update `apps/mcp-server/README.md` (or equivalent) with `list_styles` + `generate_html_report` tool descriptions; `generate_deck` `style` arg note.
- [ ] 5.7.4 Verify per-brand `packages/design-tokens/brands/<id>/README.md` files were created in Commit 2 task 2.4 with complete info (provenance, divergences, baseline link).

### 5.8 Commit 5 acceptance

- [ ] 5.8.1 `pnpm typecheck` workspace: 44/44 green.
- [ ] 5.8.2 `pnpm test` workspace passes (all existing + new).
- [ ] 5.8.3 CLI smoke: `node apps/cli/bin/ohmyperf.mjs list-styles` prints 4-brand table to stdout, exits 0.
- [ ] 5.8.4 CLI smoke: `node apps/cli/bin/ohmyperf.mjs run https://example.com --style=linear-app --browser-path /opt/chromium --runs 1 --mode real --output /tmp/test-style` produces `report.html` with linear-app dark palette + `report-deck.html` with linear accent on light chrome.
- [ ] 5.8.5 CLI smoke: `node apps/cli/bin/ohmyperf.mjs run https://example.com --style=unknown` errors with helpful message listing valid IDs.
- [ ] 5.8.6 MCP smoke: stdio handshake → `tools/list` returns 12 tools incl. `list_styles` + `generate_html_report`.
- [ ] 5.8.7 MCP smoke: `tools/call list_styles` returns BRAND_MANIFEST as JSON.
- [ ] 5.8.8 MCP smoke: `tools/call generate_html_report reportPath=<x> style=stripe` writes file to disk, returns path.
- [ ] 5.8.9 `pnpm --filter @ohmyperf/website build` succeeds; bundle budget gates pass.
- [ ] 5.8.10 Manual: open website `/report/<id>` with `?style=vercel` → ReportViewer renders in vercel palette; brand picker dropdown shows selected; URL stays `?style=vercel`.
- [ ] 5.8.11 `pnpm test:visual` exits 0 (baselines unchanged from Commit 4 — this commit doesn't change rendering logic, only adds UX surfaces).
- [ ] 5.8.12 `pnpm license:audit` exits 0; NOTICE entries finalized.

---

## Cross-Commit Acceptance (after all 5 land)

- [ ] X.1 `pnpm typecheck` workspace: 44/44 green
- [ ] X.2 `pnpm test` all packages pass (including new visual-regression on ubuntu-24.04)
- [ ] X.3 `pnpm lint` clean
- [ ] X.4 `node scripts/check-design-tokens.mjs` exits 0
- [ ] X.5 `node scripts/check-contrast.mjs` exits 0 across 4 brands × supported themes
- [ ] X.6 `node scripts/check-bundle-budgets.mjs` exits 0 (artifacts stay within caps per brand)
- [ ] X.7 `pnpm license:audit` exits 0; Apache-2.0 attribution complete
- [ ] X.8 `pnpm api:check` — additive only across all packages
- [ ] X.9 Manual: render fixtures/rich.json through CLI with each `--style` → 4 viewer HTML + 4 deck HTML files; visually inspect each pair
- [ ] X.10 Manual: render fixtures/rich.json through MCP `generate_html_report` + `generate_deck` for each style → 8 files written; paths returned correctly
- [ ] X.11 Manual: website at `/report/<id>?style=<each>` → picker shows correct selection, viewer renders in corresponding brand, export menu downloads with brand applied
- [ ] X.12 `git diff --stat add-beautiful-report HEAD` shows reasonable line counts per commit (no commit > 3000 LOC)

## Out of Scope (deferred to v1.1+)

- Expansion beyond 4 brands (audit cost; new change proposal required)
- DESIGN.md NLP parser for 133 prose-only brands (standalone project)
- Layout switching (`--deck-template=swiss|guizang|...`) — v1.2
- Density modes, motion preferences — upstream schema not stable
- Print-mode brand overrides — Calibre print CSS applies regardless of brand
- `BrandPalette` JSON export for external consumers — speculative
