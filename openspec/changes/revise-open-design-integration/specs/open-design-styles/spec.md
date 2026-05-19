# Spec Deltas: open-design-styles (revise-open-design-integration)

This change supersedes requirements from `add-open-design-styles` to land full structural integration: each brand owns layout + typography + spacing + radius + elevation + motion + focus, not just palette. Deck light-lock is rolled back; deck honors brand's preferred theme. WCAG-AA gate expands to 4-tier foreground ramp. Per-brand structural signatures become testable invariants.

## MODIFIED Requirements

### R3 — Token bridge layer scope (NARROWED)

**Previous (add-open-design-styles)**: Bridge.css must alias 16 open-design tokens (`--bg`, `--fg`, `--surface`, `--surface-warm`, `--accent`, `--accent-on`, `--success`, `--warn`, `--danger`, `--meta`, `--muted`, `--border`, `--border-soft`) onto the corresponding ohmyperf `--color-*` namespace.

**Revised (this change)**: Bridge.css MUST alias ONLY 6 color-semantics tokens. STRUCTURAL_CSS consumes brand-native tokens (e.g. `var(--space-6)`, `var(--surface)`, `var(--elev-raised)`) directly without going through the bridge.

**WHEN** a vendored brand's `bridge.css` is loaded
**THEN** it MUST declare exactly these 6 color aliases:
  - `--color-background: var(--bg)`
  - `--color-foreground: var(--fg)`
  - `--color-primary: var(--accent)`
  - `--color-accent-success: var(--success)`
  - `--color-accent-warning: var(--warn)`
  - `--color-accent-danger: var(--danger)`

**AND** MUST NOT declare any additional aliases.

**AND** `STRUCTURAL_CSS` (in both viewer and reporter-deck) MUST consume brand-native tokens directly (e.g. `padding: var(--space-6)`, `box-shadow: var(--elev-raised)`, `font-family: var(--font-display)`, `border-radius: var(--radius-lg)`, `max-width: var(--container-max)`).

**Rationale**: v1's 16-alias bridge was byte-identical across all 3 vendored brands — a no-op rename layer that masked the fact that STRUCTURAL_CSS was hardcoded. Narrowing the bridge to color semantics and letting STRUCTURAL_CSS consume brand-native tokens directly is what makes brand-distinct structural rendering possible.

### R7 — Deck theme policy (REVERSED)

**Previous (add-open-design-styles)**: The deck artifact MUST remain light-locked regardless of brand. It MUST NOT emit a `@media (prefers-color-scheme: dark)` block. It MUST always declare `<html class="theme-light">`.

**Revised (this change)**: The deck artifact MUST honor `BRAND_MANIFEST[id].preferredTheme`. Linear-app deck renders dark canvas. Brands with `preferredTheme: light` render light.

**WHEN** `renderReportDeck(report, { style })` is called
**THEN** the rendered HTML MUST emit `<html class="theme-{resolveTheme(style, opts.theme)}">`

**AND** the DECK_CSS MUST include the brand's full light + dark token surface (no light-locking).

**AND** for any brand with `BRAND_MANIFEST[id].preferredTheme === 'dark'`, the brand's `tokens.css` MUST also declare a `@media print { ... }` override block with light-mode token values (see R7a) so deck → PDF print remains legible without burning printer toner.

**Rationale**: v1's light-lock was a defensive compromise that erased linear-app's mandatory dark canvas. With per-brand print blocks (R7a), dark-canvas deck artifacts retain their identity on screen AND remain print-safe on paper.

## ADDED Requirements

### R7a — Print-safe token declaration for dark-native brands

For any brand where `BRAND_MANIFEST[id].preferredTheme === 'dark'` and `BRAND_MANIFEST[id].supportsLight === false`, OR where any rendered surface would otherwise emit a dark `--bg` to print:

**WHEN** the brand's vendored `tokens.css` is read
**THEN** it MUST contain a `@media print { :root { ... } }` block declaring light-mode override values for at least these tokens:
  - `--bg`
  - `--fg`
  - `--surface`
  - `--surface-warm` (or aliased)
  - `--border`
  - `--border-soft`

**AND** the print override values MUST be light (background near white, foreground near black) to keep printed PDFs legible.

**WHEN** the user prints a deck or viewer artifact rendered with such a brand
**THEN** the `@media print` block MUST take effect (browser native behavior).

**Rationale**: Without this, linear-app's `--bg: #08090a` deck on paper wastes toner and obscures readability. Brand-declared print blocks keep the discipline brand-owned and declarative rather than auto-inverted by ohmyperf heuristics.

### R10a — WCAG-AA contrast gate on 4-tier foreground ramp

**Previous (add-open-design-styles R10)**: WCAG-AA contrast verified on accent tokens per brand × supported theme.

**This change ADDS**: WCAG-AA contrast verified on the full 4-tier foreground ramp.

**WHEN** `scripts/check-contrast.mjs` runs
**THEN** for each `BrandId` × each supported theme:
  - `--fg` vs `--bg` MUST achieve ≥ 4.5:1 (body primary)
  - `--fg-2` vs `--bg` MUST achieve ≥ 4.5:1 (body secondary; skip if brand doesn't declare `--fg-2`)
  - `--muted` vs `--bg` MUST achieve ≥ 3:1 (UI label tier)
  - `--meta` vs `--bg` MUST achieve ≥ 3:1 (chrome caption tier; skip if not declared)
  - Same 4 tiers MUST also pass vs `--surface` (card background)

**AND** failure on any (brand, theme, tier, background) MUST exit non-zero, blocking merge.

**AND** the gate MUST print a per-pair verdict.

**Rationale**: Linear-app's identity depends on a 4-tier ramp (`--fg`, `--fg-2`, `--muted`, `--meta`). v1's gate only checked the 4 accent colors. Without expanding the gate, vendored brands could ship with secondary text failing contrast and the CI wouldn't catch it.

### R17 — Per-brand structural signature: linear-app

**WHEN** an artifact is rendered with `style: 'linear-app'`
**THEN** the artifact MUST satisfy these structural invariants:
  1. **No shadows on cards**: `box-shadow` on `.cwv-card`, `.hero`, `.empty-state` MUST resolve to `none` or `0 0 0 1px <color>` (ring-only) — NEVER multi-layer offset shadows.
  2. **Dark canvas by default**: when `theme: 'system'`, the rendered `<html>` MUST have `class="theme-dark"`.
  3. **Display tracking**: rendered CSS MUST include `--tracking-display: -0.022em` (signature negative tracking).
  4. **Container max**: rendered CSS MUST include `--container-max: 1200px`.
  5. **Border ramp**: cards' border MUST be `1px solid rgba(255, 255, 255, 0.08)` or `var(--border)` resolving to that rgba value.

**AND** snapshot tests in `packages/viewer/src/brand-structural-signatures.test.ts` MUST assert each of these via direct CSS-rule regex / string contains.

**Rationale**: Linear's identity is "elevation via luminance stepping, not box-shadows" + "dark canvas as native medium" + "compressed tight typography." Without these gates, drift over time (especially via sync from upstream) can quietly erode the signature.

### R18 — Per-brand structural signature: stripe

**WHEN** an artifact is rendered with `style: 'stripe'`
**THEN** the artifact MUST satisfy:
  1. **Multi-layer shadow**: `box-shadow` declarations in `--elev-raised` MUST contain at least 2 comma-separated layers (regex `/box-shadow:[^;]*,[^;]*,/`).
  2. **Blue-tinted shadow**: at least one shadow layer MUST use `rgba(50, 50, 93, ...)` (Stripe's signature blue-tint).
  3. **Cool-pale nested panel surface**: `--surface-warm` MUST resolve to `#f6f9fc`.
  4. **Hero font weight 300**: display headings MUST consume a font-weight of 300 (Stripe's "whisper authority").
  5. **3-tier foreground ramp consumed**: rendered HTML MUST reference `--fg`, `--fg-2`, and `--muted` (the navy heading / dark-slate label / slate body tiers).

**AND** snapshot tests MUST assert each via regex / string match.

**Rationale**: Stripe's brand signature is multi-layer blue-tinted shadows and quiet typography — both completely absent in v1's color-only integration.

### R19 — Per-brand structural signature: vercel

**WHEN** an artifact is rendered with `style: 'vercel'`
**THEN** the artifact MUST satisfy:
  1. **Cards have no border** (shadow-as-border philosophy): `.cwv-card`, `.hero` MUST emit `border: none` in their CSS rules (via `BRAND_STRUCTURAL_OVERRIDES`).
  2. **4-layer elevation including inner ring**: `--elev-raised` declaration MUST contain at least 3 comma-separated shadow layers AND include a layer with positive offset (`0 0 0 1px #fafafa` or similar inner-ring layer).
  3. **Display ceiling 48px**: `--text-3xl` MUST equal `48px` (lower than other brands by design).
  4. **Section rhythm**: `--section-y-desktop` MUST equal `96px` ("gallery emptiness").
  5. **Tracking**: display tracking MUST equal `-0.05em` (Vercel/Geist signature).

**AND** snapshot tests MUST assert each via regex / string match.

**Rationale**: Vercel's shadow-as-border philosophy + 96px rhythm + 48px display ceiling are deliberate brand engineering choices. Without these signatures, vercel renders as "calibre with blue accents" — the user's exact complaint.

### R20 — Per-brand structural signature: calibre

**WHEN** an artifact is rendered with `style: 'calibre'`
**THEN** the artifact MUST satisfy:
  1. **Identity preservation**: at least one CSS rule MUST reference `var(--color-primary)` (back-compat with v1 reports that consumed this name).
  2. **Soft elevation**: `--elev-raised` MUST resolve to a single-layer or two-layer soft shadow (no aggressive multi-layer drop shadows).
  3. **Open-design token surface declared**: `globals.css` `@theme` block MUST declare all tokens listed in tasks.md §1.2.1 (spacing, typography, radius, elevation, motion, container, focus, open-design primitives).
  4. **Visual continuity with v1**: calibre viewer + deck rendered against `fixtures/rich.json` MUST be visually-neutral against v1 baselines at Commit 2 stage (calibre signature gate fails if calibre visually regresses).

**AND** snapshot tests + visual-regression baselines MUST assert each.

**Rationale**: Calibre is ohmyperf's authored default. Users who never opt into a vendored brand must see no change. This signature locks visual continuity.

### R21 — STRUCTURAL_CSS hardcoded-value ban

**WHEN** a developer reads `packages/viewer/src/styles.ts` or `packages/reporter-deck/src/styles.ts`
**THEN** the file MUST NOT contain any CSS rule with hardcoded `<number>px` or `<number>rem` for these properties:
  - `padding`, `padding-*`
  - `margin`, `margin-*`
  - `border-radius`, `border-*-radius`
  - `box-shadow` (must reference `var(--elev-*)`)
  - `font-size`, `line-height`, `letter-spacing`
  - `max-width`, `min-width`, `width` (for layout shells, not data-driven sizes)

**AND** the value MUST come from `var(--<token-name>)` referring to a brand-declared token.

**AND** allowed exceptions MUST be inline-documented with `/* token-unsafe: <reason> */`.

**AND** `pnpm check:structural-css-hardcoded` (or equivalent grep) MUST fail CI on undocumented hardcoded values.

**Rationale**: Without a hardcoded-value ban, future PRs slowly re-introduce hardcoded `padding: 16px` rules that don't respond to brand swap. The gate is the only way to keep brand structural integration honest over time.

### R22 — BRAND_STRUCTURAL_OVERRIDES cap

**WHEN** `packages/viewer/src/structural-overrides.ts` is committed
**THEN** the exported `BRAND_STRUCTURAL_OVERRIDES` map MUST satisfy:
  - Each `BrandId` key maps to a string ≤ 20 lines.
  - The map MUST contain entries for all 4 `BrandId` values (no silent omissions; empty string `""` is acceptable for brands with no overrides).

**AND** `packages/viewer/src/structural-overrides.test.ts` MUST assert these invariants programmatically.

**Rationale**: The override map exists for structural rules tokens can't express (e.g. vercel's `border: none`). Without a cap, it becomes a hack-collector. 20 lines is enough for legitimate overrides (~5 rules); more is a smell that needs token-level redesign.

### R23 — Calibre token surface parity

**WHEN** `apps/website/app/globals.css` is parsed
**THEN** its `@theme` block MUST declare all open-design tokens listed in this change's tasks.md §1.2.1 (spacing scale, typography scale, leading, tracking, radius, elevation, focus, motion, container, section rhythm, open-design primitives).

**AND** the count of `--*` tokens declared MUST be ≥ the count in any vendored brand's `tokens.css`.

**AND** missing tokens MUST cause `pnpm check:design-tokens` to exit non-zero.

**Rationale**: STRUCTURAL_CSS consumes `var(--space-6)` etc. If calibre's globals.css doesn't declare those tokens, the viewer breaks when `--style=calibre`. Parity gate prevents this regression mode.

## REMOVED Requirements

None. Behavior changes flow through MODIFIED (R3, R7) rather than removal.

## Acceptance Criteria Summary

All requirements are enforced by automated gates. **Zero subjective "looks branded enough" criteria**.

| Requirement | Gate |
|---|---|
| R3 (narrowed bridge) | `pnpm check:design-tokens` — bridge file size + content |
| R7 (deck theme honors brand) | `packages/reporter-deck/src/brand-snapshots.test.ts` — assert theme class per brand |
| R7a (print-safe blocks) | Snapshot test asserts `@media print { :root` present in linear-app tokens.css |
| R10a (4-tier ramp WCAG-AA) | `pnpm check:contrast` extended gate |
| R17-R20 (per-brand signatures) | `packages/viewer/src/brand-structural-signatures.test.ts` + deck mirror |
| R21 (no hardcoded values) | `pnpm check:structural-css-hardcoded` (new script) |
| R22 (override cap) | `packages/viewer/src/structural-overrides.test.ts` |
| R23 (calibre parity) | `pnpm check:design-tokens` extended gate |
