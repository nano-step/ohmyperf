# Tasks: Revise Open Design Integration

Six commits across two PRs. Each commit lands independently passing typecheck + tests + lint + bundle budget + contrast + brand-license gates.

---

## PR #1 — Viewer Integration (Commits 1-3)

### Commit 1 — Bridge Strip + Calibre `globals.css` Expansion + Sync-Script Byte-Fidelity Test

#### 1.1 Shrink bridge.css to 6-alias color shim

- [ ] 1.1.1 Update `packages/design-tokens/scripts/sync-open-design.mjs`:
  - `CANONICAL_BRIDGE` constant reduced from 16 lines to 6 (only color semantics aliases):
    ```css
    :root {
      --color-background: var(--bg);
      --color-foreground: var(--fg);
      --color-primary: var(--accent);
      --color-accent-success: var(--success);
      --color-accent-warning: var(--warn);
      --color-accent-danger: var(--danger);
    }
    ```
  - Removed aliases: `--color-card`, `--color-card-foreground`, `--color-muted`, `--color-muted-foreground`, `--color-border`, `--color-primary-foreground`, `--color-accent-primary`, `--color-destructive`, `--color-destructive-foreground`. STRUCTURAL_CSS will consume `var(--surface)`, `var(--meta)`, `var(--border)`, `var(--accent-on)` directly in Commit 2.
- [ ] 1.1.2 Run `pnpm sync:open-design` to regenerate all 3 vendored brands' bridge.css.
- [ ] 1.1.3 Update `scripts/check-brand-licenses.mjs`: provenance check still passes; no logic change needed.

#### 1.2 Expand calibre tokens in globals.css

- [ ] 1.2.1 Update `apps/website/app/globals.css` `@theme` block to add the full open-design token surface alongside existing `--color-*` declarations:
  - **Spacing**: `--space-1: 4px` through `--space-12: 48px` (8-step scale)
  - **Section rhythm**: `--section-y-desktop: 64px`, `--section-y-tablet: 48px`, `--section-y-phone: 32px`
  - **Typography scale**: `--text-xs: 12px` through `--text-4xl: 56px` (8-step)
  - **Leading + tracking**: `--leading-body: 1.5`, `--leading-tight: 1.1`, `--tracking-display: -0.01em`
  - **Radius**: `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 12px`, `--radius-pill: 9999px`
  - **Elevation**: `--elev-flat: none`, `--elev-ring: 0 0 0 1px var(--color-border)`, `--elev-raised: 0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)`
  - **Focus**: `--focus-ring: 0 0 0 3px color-mix(in oklab, var(--color-accent-primary), transparent 70%)`
  - **Motion**: `--motion-fast: 150ms`, `--motion-base: 200ms`, `--ease-standard: cubic-bezier(0.2, 0, 0, 1)`
  - **Layout**: `--container-max: 1100px`, `--container-gutter-desktop: 24px`, `--container-gutter-tablet: 16px`, `--container-gutter-phone: 12px`
  - **Open-design primitives (calibre values)**: `--bg`, `--fg`, `--fg-2`, `--surface`, `--surface-warm`, `--accent`, `--accent-on`, `--success`, `--warn`, `--danger`, `--meta`, `--muted`, `--border`, `--border-soft`
- [ ] 1.2.2 Update `apps/website/app/globals.css` dark mode block with corresponding dark-variant values for all new tokens.
- [ ] 1.2.3 Update `packages/design-tokens/scripts/emit-css.mjs` to dump the full expanded token set into `dist/palette.css`.
- [ ] 1.2.4 Update `packages/design-tokens/src/index.ts`:
  - `CALIBRE_LIGHT` and `CALIBRE_DARK` TS constants expanded with the full surface (or generated from globals.css at build time via parser).
  - `paletteCssVars(scheme)` emits all tokens, not just the 16 colors.
  - `PALETTE_CSS` template includes the full surface.
- [ ] 1.2.5 `packages/design-tokens/scripts/emit-brand-css.mjs` extended to recognize the expanded calibre surface and inline it correctly into `dist/generated/brand-css.ts`.

#### 1.3 Sync-script byte-fidelity test for multi-layer shadows

- [ ] 1.3.1 Add `packages/design-tokens/scripts/sync-open-design.test.mjs`:
  - Test: stripe's `--elev-raised` after sync matches upstream byte-for-byte (modulo documented font-strip + color-mix-precompute transforms).
  - Test: vercel's `--elev-raised` after sync matches upstream byte-for-byte.
  - Test: linear-app's `--elev-raised` after sync matches upstream byte-for-byte.
- [ ] 1.3.2 Wire test into `pnpm --filter @ohmyperf/design-tokens test` via vitest or standalone runner.

#### 1.4 STRUCTURAL_CSS visual neutrality assertion

- [ ] 1.4.1 Existing brand snapshot tests in `packages/viewer/src/brand-snapshots.test.ts` MUST still pass without modification (calibre viewer renders identical to v1).
- [ ] 1.4.2 Visual regression tests in `tests/visual-regression/src/brand-fixtures.test.ts` MUST still pass (Commit 6 regenerates baselines; until then v1 baselines hold).

#### 1.5 Commit 1 acceptance

- [ ] 1.5.1 `pnpm typecheck` workspace: 44/44 packages green.
- [ ] 1.5.2 `pnpm --filter @ohmyperf/design-tokens test` 32+ tests pass (existing + 3 new sync byte-fidelity).
- [ ] 1.5.3 `pnpm check:design-tokens` exits 0 (drift gate covers expanded calibre surface).
- [ ] 1.5.4 `pnpm check:contrast` exits 0 (4 existing accent tokens still gate).
- [ ] 1.5.5 `pnpm check:brand-licenses` exits 0.
- [ ] 1.5.6 `pnpm --filter @ohmyperf/viewer test` 73+ pass (existing snapshots unchanged).
- [ ] 1.5.7 `pnpm --filter @ohmyperf/reporter-deck test` 41+ pass.
- [ ] 1.5.8 Bundle size: viewer artifact still ≤ 200 KB gz per brand.

---

### Commit 2 — STRUCTURAL_CSS Rewrite (Token-Driven Baseline)

#### 2.1 Migrate viewer STRUCTURAL_CSS

- [ ] 2.1.1 `packages/viewer/src/styles.ts` STRUCTURAL_CSS rewritten:
  - Every `padding: <px>` → `padding: var(--space-N)`
  - Every `margin: <px>` → `margin: var(--space-N)` or `var(--section-y-*)` for section gaps
  - Every `border-radius: <px>` → `border-radius: var(--radius-*)`
  - Every `box-shadow: <value>` → `box-shadow: var(--elev-*)`
  - Every `font-family: <stack>` → `font-family: var(--font-display)` or `var(--font-mono)`
  - Every `font-size: <px>` → `font-size: var(--text-*)`
  - Every `line-height: <num>` → `line-height: var(--leading-*)`
  - Every hardcoded color → `var(--bg)`, `var(--fg)`, `var(--surface)`, `var(--accent)`, etc. (open-design names)
  - `max-width: 1100px` → `max-width: var(--container-max)`
- [ ] 2.1.2 Audit via `ast_grep_search` or `grep -E "(padding|margin|border-radius|box-shadow|font-size|line-height|max-width): [0-9]" packages/viewer/src/styles.ts` — count MUST drop to 0 after migration (or allowlist exceptions documented inline with `/* token-unsafe: <reason> */`).

#### 2.2 Migrate deck DECK_CSS

- [ ] 2.2.1 `packages/reporter-deck/src/styles.ts` DECK_CSS rewritten with the same token discipline as viewer.
- [ ] 2.2.2 Deck STILL light-locked at this commit. R7 rollback happens in Commit 4.
- [ ] 2.2.3 `getDeckBrandOverlay` still emits 4 accent overrides (unchanged); will be deprecated in Commit 3.

#### 2.3 Snapshot test refresh (calibre visually neutral)

- [ ] 2.3.1 `packages/viewer/src/brand-snapshots.test.ts` — calibre baseline visually unchanged.
- [ ] 2.3.2 Vendored brands (linear-app, stripe, vercel) NOW render with brand-token values — `box-shadow`, `border-radius`, `font-size`, `letter-spacing`, container width all differ from calibre.
- [ ] 2.3.3 Update brand snapshot assertions:
  - linear-app: `box-shadow: 0 0 0 1px rgba(255,255,255,0.05)` (luminance-stepped)
  - stripe: `box-shadow:` matches multi-layer regex
  - vercel: container max-width `1200px`

#### 2.4 Commit 2 acceptance

- [ ] 2.4.1 `pnpm typecheck` workspace: 44/44 green.
- [ ] 2.4.2 Hardcoded-value audit: `grep -E "(padding|margin|border-radius|box-shadow|font-size|line-height): [0-9]" packages/viewer/src/styles.ts packages/reporter-deck/src/styles.ts | wc -l` → 0 (or documented allowlist).
- [ ] 2.4.3 Bundle size: viewer + deck artifacts still ≤ caps.
- [ ] 2.4.4 All existing tests pass.
- [ ] 2.4.5 Manual render of `fixtures/rich.json` × 4 brands: visually distinct between vendored brands; calibre visually identical to v1.

---

### Commit 3 — Per-Brand Structural Overrides + `getDeckBrandOverlay` Deprecation

#### 3.1 BRAND_STRUCTURAL_OVERRIDES map

- [ ] 3.1.1 Create `packages/viewer/src/structural-overrides.ts`:
  ```ts
  import type { BrandId } from "@ohmyperf/design-tokens";
  
  export const BRAND_STRUCTURAL_OVERRIDES: Readonly<Record<BrandId, string>> = {
    calibre: "",
    "linear-app": "/* tokens carry no-shadow via var(--elev-flat); no overrides needed */",
    stripe: "",
    vercel: `
      .cwv-card { border: none; }
      .hero { border: none; }
      .third-parties { border: none; }
    `,
  };
  ```
- [ ] 3.1.2 Override cap enforced via test: `Object.values(BRAND_STRUCTURAL_OVERRIDES).every(s => s.split("\n").length <= 20)`.
- [ ] 3.1.3 `packages/viewer/src/render.ts` concatenates `BRAND_STRUCTURAL_OVERRIDES[style]` after STRUCTURAL_CSS.

#### 3.2 Deck overrides

- [ ] 3.2.1 Mirror structural-overrides for deck if needed. Most brand identity lives in tokens; reserve overrides for true structural rules (border presence, custom layout).

#### 3.3 Deprecate `getDeckBrandOverlay`

- [ ] 3.3.1 Update `packages/design-tokens/src/brands.ts`:
  ```ts
  /**
   * @deprecated As of revise-open-design-integration. Deck now consumes the full brand CSS
   * via getBrandCss(id). This function returns empty string for back-compat with v1 callers.
   * Will be REMOVED in v0.1.0 (next minor version bump).
   */
  export function getDeckBrandOverlay(_id: BrandId): string {
    return "";
  }
  ```
- [ ] 3.3.2 Audit internal callers via `lsp_find_references` for `getDeckBrandOverlay` — migrate to `getBrandCss(id, theme)` if any exist in `packages/reporter-deck/src/`.
- [ ] 3.3.3 Add deprecation notice to `packages/design-tokens/etc/design-tokens.api.md` (api-extractor regen).

#### 3.4 Commit 3 acceptance

- [ ] 3.4.1 `pnpm typecheck` workspace: 44/44 green.
- [ ] 3.4.2 Override map size test passes.
- [ ] 3.4.3 `pnpm api:check` passes — `getDeckBrandOverlay` signature unchanged (just deprecated; no breaking).
- [ ] 3.4.4 All existing tests pass.
- [ ] 3.4.5 `pnpm --filter @ohmyperf/viewer test` brand snapshots show:
  - Vercel viewer HTML contains `.cwv-card { border: none }`
  - Linear-app viewer HTML does NOT contain `.cwv-card { border: none }`

---

## PR #2 — Deck Rollback + Tests + Baselines (Commits 4-6)

### Commit 4 — Deck Light-Lock Removed (R7 Superseded) + Per-Brand Print Blocks

#### 4.1 Deck honors brand.preferredTheme

- [ ] 4.1.1 `packages/reporter-deck/src/deck-shell.ts`:
  - Replace `<html class="theme-light">` with `<html class="theme-{resolveTheme(style, opts.theme)}">`.
  - Restore `@media (prefers-color-scheme: dark)` block in DECK_CSS for the auto-resolution path.
- [ ] 4.1.2 `packages/reporter-deck/src/styles.ts`:
  - `PALETTE_CSS_LIGHT_ONLY` consumption replaced with full `PALETTE_CSS` (light + dark blocks).
  - Linear-app deck now renders dark canvas by default (`preferredTheme: dark`).
- [ ] 4.1.3 `packages/reporter-deck/src/slides/*.ts` chrome adjusted as needed if any slide hardcoded a light bg.

#### 4.2 Linear-app print block

- [ ] 4.2.1 Update upstream-vendored `packages/design-tokens/brands/linear-app/tokens.css` to include print-safe overrides at the END of the `:root` block:
  ```css
  @media print {
    :root {
      --bg: #ffffff;
      --fg: #000000;
      --surface: #ffffff;
      --surface-warm: #f5f5f5;
      --border: #cccccc;
      --border-soft: #e0e0e0;
    }
  }
  ```
- [ ] 4.2.2 Update `packages/design-tokens/scripts/sync-open-design.mjs` to apply this print-block as a sync-time transform (only for `linear-app` since it's the only dark-native brand vendored). Document the transform in the script's header comment.
- [ ] 4.2.3 Re-run `pnpm sync:open-design` to apply.
- [ ] 4.2.4 Stripe + Vercel: no print block needed (already light); sync script no-op for them.

#### 4.3 Spec deltas

- [ ] 4.3.1 R7 (deck light-lock) marked superseded in spec delta file.
- [ ] 4.3.2 R7a added: brand MUST declare print-safe token values when `supportsDark=true` and brand's `preferredTheme=dark`.

#### 4.4 Brand snapshot tests for deck

- [ ] 4.4.1 `packages/reporter-deck/src/brand-snapshots.test.ts`:
  - Linear-app deck HTML contains `<html class="theme-dark">`.
  - Stripe deck HTML contains `<html class="theme-light">`.
  - Vercel deck HTML contains `<html class="theme-light">` (preferredTheme=light).
  - Calibre deck HTML contains `<html class="theme-light">`.
- [ ] 4.4.2 Print-mode test:
  - Linear-app deck HTML contains `@media print { :root { --bg: #ffffff;`.
  - Stripe/Vercel/Calibre deck HTML do NOT need print block (no failure).

#### 4.5 Commit 4 acceptance

- [ ] 4.5.1 `pnpm typecheck` workspace: 44/44 green.
- [ ] 4.5.2 `pnpm --filter @ohmyperf/reporter-deck test` brand-snapshot tests assert dark/light per brand.
- [ ] 4.5.3 Bundle size: deck artifact still ≤ 500 KB gz per brand.
- [ ] 4.5.4 Manual render: linear-app deck visibly dark; stripe/vercel/calibre decks visibly light.

---

### Commit 5 — WCAG-AA 4-Tier Ramp Gate (R10a) + Per-Brand Structural Signatures (R17-R20)

#### 5.1 Extend WCAG-AA contrast gate

- [ ] 5.1.1 Update `scripts/check-contrast.mjs`:
  - Iterate `BRAND_IDS`.
  - For each brand × supported theme: parse `tokens.css` (or globals.css for calibre).
  - Tier checks:
    - `--fg` vs `--bg`: ≥ 4.5:1 (body primary)
    - `--fg-2` vs `--bg`: ≥ 4.5:1 (body secondary; skip if brand doesn't declare)
    - `--muted` vs `--bg`: ≥ 3:1 (UI label)
    - `--meta` vs `--bg`: ≥ 3:1 (chrome caption; skip if brand doesn't declare)
    - Same tiers vs `--surface`: ≥ same thresholds
  - Exit non-zero on any failure with `brand/tier/background` diagnostic.
- [ ] 5.1.2 Document target ratios in script header.

#### 5.2 Per-brand structural signature tests (R17-R20)

- [ ] 5.2.1 `packages/viewer/src/brand-structural-signatures.test.ts` — NEW:
  
  **Linear-app:**
  ```ts
  it("linear-app: cards have luminance-stepped border, no box-shadow", () => {
    const html = renderReportHtml(rich, { style: "linear-app", theme: "dark" });
    expect(html).toMatch(/\.cwv-card[^}]*box-shadow:\s*(0\s+0\s+0\s+1px|var\(--elev-flat\)|var\(--elev-ring\))/);
    expect(html).not.toMatch(/\.cwv-card[^}]*box-shadow:\s*0\s+[1-9]/);
  });
  it("linear-app: canvas dark by default", () => {
    const html = renderReportHtml(rich, { style: "linear-app", theme: "system" });
    expect(html).toContain('<html lang="en" class="theme-dark"');
  });
  it("linear-app: display tracking is -0.022em", () => {
    const html = renderReportHtml(rich, { style: "linear-app" });
    expect(html).toMatch(/--tracking-display:\s*-0\.022em/);
  });
  it("linear-app: container max 1200px", () => {
    const html = renderReportHtml(rich, { style: "linear-app" });
    expect(html).toMatch(/--container-max:\s*1200px/);
  });
  ```
  
  **Stripe:**
  ```ts
  it("stripe: multi-layer blue-tinted shadow present", () => {
    const html = renderReportHtml(rich, { style: "stripe" });
    expect(html).toMatch(/box-shadow:[^;]*,[^;]*,/);
    expect(html).toMatch(/rgba\(50,\s*50,\s*93/i);
  });
  it("stripe: nested panels use cool-pale surface", () => {
    const html = renderReportHtml(rich, { style: "stripe" });
    expect(html).toMatch(/--surface-warm:\s*#f6f9fc/i);
  });
  ```
  
  **Vercel:**
  ```ts
  it("vercel: cards have border:none (shadow-as-border)", () => {
    const html = renderReportHtml(rich, { style: "vercel" });
    expect(html).toMatch(/\.cwv-card\s*\{\s*border:\s*none/);
  });
  it("vercel: section rhythm 96px", () => {
    const html = renderReportHtml(rich, { style: "vercel" });
    expect(html).toMatch(/--section-y-desktop:\s*96px/);
  });
  it("vercel: display ceiling 48px (--text-3xl)", () => {
    const html = renderReportHtml(rich, { style: "vercel" });
    expect(html).toMatch(/--text-3xl:\s*48px/);
  });
  ```
  
  **Calibre:**
  ```ts
  it("calibre: identity preserved (uses var(--color-primary))", () => {
    const html = renderReportHtml(rich, { style: "calibre" });
    expect(html).toMatch(/var\(--color-primary\)/);
  });
  it("calibre: --elev-raised soft single-layer shadow", () => {
    const html = renderReportHtml(rich, { style: "calibre" });
    expect(html).toMatch(/--elev-raised:\s*0\s+1px\s+3px/);
  });
  ```

- [ ] 5.2.2 Mirror per-brand signature tests in `packages/reporter-deck/src/brand-structural-signatures.test.ts`.

#### 5.3 Override map size enforcement test

- [ ] 5.3.1 `packages/viewer/src/structural-overrides.test.ts`:
  ```ts
  import { BRAND_STRUCTURAL_OVERRIDES } from "./structural-overrides.js";
  it("override blocks stay ≤ 20 lines per brand", () => {
    for (const [brand, css] of Object.entries(BRAND_STRUCTURAL_OVERRIDES)) {
      const lines = css.split("\n").length;
      expect(lines, `${brand} override exceeds cap`).toBeLessThanOrEqual(20);
    }
  });
  ```

#### 5.4 Commit 5 acceptance

- [ ] 5.4.1 `pnpm typecheck` workspace: 44/44 green.
- [ ] 5.4.2 `pnpm check:contrast` exits 0 (extended gate).
- [ ] 5.4.3 `pnpm --filter @ohmyperf/viewer test` includes new structural-signature tests; ALL PASS.
- [ ] 5.4.4 `pnpm --filter @ohmyperf/reporter-deck test` includes deck signature tests; ALL PASS.
- [ ] 5.4.5 Override map cap test passes.

---

### Commit 6 — Visual Regression Baselines Regenerated (14 PNGs)

#### 6.1 Regenerate baselines

- [ ] 6.1.1 Boot dev environment matching CI (`ubuntu-24.04 ARM64` per existing visual-regression CI gate).
- [ ] 6.1.2 Run `pnpm test:visual --update-snapshots` to regenerate all baselines.
- [ ] 6.1.3 Visual review each diff:
  - linear-app viewer dark: dark canvas, luminance-stepped cards
  - linear-app viewer light: light canvas (less common, but supported)
  - linear-app deck dark: NEW — dark slides
  - stripe viewer light: multi-layer shadow on cards
  - stripe deck light: same shadows on slides
  - vercel viewer light: border-less cards with inner-ring shadow
  - vercel viewer dark: same with dark canvas
  - vercel deck light: same
  - vercel deck dark: same with dark canvas (NEW)
  - calibre viewer light: same as v1
  - calibre viewer dark: same as v1
  - calibre deck light: same as v1
  - calibre deck dark: NEW (was light-locked in v1)
  - cross-brand grid composite: 4-brand thumbnail at-a-glance
- [ ] 6.1.4 Commit baselines under `tests/visual-regression/baselines/{viewer,deck}/`.
- [ ] 6.1.5 Update `tests/visual-regression/README.md` to document the 14-baseline set.

#### 6.2 Final visual regression CI run

- [ ] 6.2.1 Push to PR #2 branch.
- [ ] 6.2.2 CI runs `pnpm test:visual` on ubuntu-24.04.
- [ ] 6.2.3 All 14 baselines match pixel-for-pixel (within 0.5% tolerance per existing gate).

#### 6.3 Commit 6 acceptance

- [ ] 6.3.1 `pnpm typecheck` workspace: 44/44 green.
- [ ] 6.3.2 `pnpm test:visual` exits 0 on ubuntu-CI.
- [ ] 6.3.3 14 baseline PNGs committed.
- [ ] 6.3.4 Manual reviewer ACK on the visual diffs in PR #2 description.

---

## Cross-PR Acceptance Gates (run after PR #1 + PR #2 merge)

- [ ] X.1 `pnpm typecheck`: 44/44 green.
- [ ] X.2 `pnpm test`: ALL workspace tests pass.
- [ ] X.3 `pnpm check:contrast`: 4-tier ramp gate green for all (brand, theme, tier, background) combos.
- [ ] X.4 `pnpm check:design-tokens`: drift gate green.
- [ ] X.5 `pnpm check:brand-licenses`: Apache-2.0 + provenance green.
- [ ] X.6 `pnpm check:bundle-budgets`: viewer ≤ 200 KB gz, deck ≤ 500 KB gz per brand.
- [ ] X.7 `pnpm api:check`: `@ohmyperf/design-tokens` surface additive-only (`getDeckBrandOverlay` deprecated but signature unchanged).
- [ ] X.8 `pnpm test:visual`: 14 baselines match on ubuntu-CI.
- [ ] X.9 Manual end-to-end smoke: `ohmyperf run https://example.com --style=<each>` produces visually-distinct viewer+deck artifacts per brand.
- [ ] X.10 Manual website smoke: `/report/<id>?style=<each>` renders with full brand structural identity (not just color swap).
- [ ] X.11 Honesty check: every "Out of Scope" item from proposal.md is genuinely absent from shipped code (no creep).

---

## Out of Scope (deferred to v3)

- `components.html` partial adoption
- `--motion-*` transitions beyond global rule
- Per-brand `:focus-visible` rings
- Per-brand print stylesheet beyond linear-app inversion
- WOFF2-inline brand fonts
- Custom slide templates per brand
- Expansion beyond 4 brands

---

## Notes on User Confirmation State

This task breakdown was authored under the following deferred-default assumptions per the deep-design Phase 2 checkpoint:

- **Q1 (calibre storage)** = **(b)** Keep in globals.css, expand with full token set.
- **Q2 (website refactor)** = **(b)** Stay Tailwind-utility-driven.
- **Q3 (defaults)** = accepted.

If the user overrides:

- **Q1=(a)** (promote calibre to `brands/calibre/tokens.css`): Add Commit 1.6 to create the file; Commit 1.2 shrinks to just generating from the new tokens.css; sync script iterates calibre too.
- **Q1=(c)** (hybrid declare-in-globals-generate-into-brands): Add a build step in Commit 1.2 that parses globals.css and emits `brands/calibre/tokens.css` automatically.
- **Q2=(a)** (full React refactor): Adds Commit 7 — React components migrated to consume `var(--space-N)`, `var(--elev-raised)` etc. directly. Touches `apps/website/components/report/*`, `apps/website/components/viewer/*`. +300-500 LOC.
- **Q3 reject any default**: Spec rollback needed.
