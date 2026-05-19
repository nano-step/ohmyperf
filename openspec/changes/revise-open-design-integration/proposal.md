# Proposal: Revise Open Design Integration — Full Structural, Not Just Palette

## Why

`add-open-design-styles` (commits `0af165c` → `543054f`, shipped 7 commits ago) integrated 3 vendored open-design brands (`linear-app`, `stripe`, `vercel`) + Calibre into ohmyperf reports via the CLI `--style` flag, MCP `style` arg, and website brand picker. The integration is **architecturally too shallow**: every brand renders with the same layout, the same spacing, the same typography weights/tracking, the same flat elevation, the same radius scale. Only 4 colors differ.

User feedback (verbatim): *"Cách mà bạn kết hợp opendesign vào report chưa hợp lý, tôi thấy chỉ khác nhau ở màu sắc. Đây là hoàn toàn là điều mà tôi không mong đợi, chúng ta nên có sự sáng tạo, opendesign không chỉ đến đây, lỗi là do cách bạn sử dụng."*

### Root cause

v1 placed brand identity at the wrong layer of the CSS pipeline:

- `bridge.css` aliases 16 tokens (`--bg` → `--color-background`, `--accent` → `--color-primary`, etc.). **Byte-identical across brands.** That's the giveaway — if the bridge does the same thing for every brand, it's not a bridge, it's a no-op rename.
- `STRUCTURAL_CSS` hardcodes every structural value: `padding: 16px`, `border-radius: 12px`, `box-shadow: 0 1px 2px rgba(0,0,0,0.05)`, `font-size: 14px`, `max-width: 1100px`.
- Result: brand identity collapses to **4 color slots**. Open-design brands ship **50+ tokens** per brand (spacing scale, typography scale, radius, elevation, motion, container, focus, foreground ramp, border ramp, surface tier).

The user-correct framing: open-design isn't a theme system, it's a **complete visual identity system**. The v1 integration imported brand colors and threw the other 40 tokens away.

### What "real" integration looks like

| Brand | v1 signature | v2 signature (this proposal) |
|---|---|---|
| **linear-app** | indigo accent on calibre layout | **Dark canvas (#08090a) mandatory**. No shadows ever — luminance-stepped borders via `rgba(255,255,255,0.05)`. Ultra-thin rgba white borders throughout. Body text on 4-tier ramp (`--fg`, `--fg-2`, `--muted`, `--meta`). -0.022em display tracking. Weight 510 signature. |
| **stripe** | violet accent on calibre layout | **Multi-layer blue-tinted shadow** (`rgba(50,50,93,0.25) 0 50px 100px -20px, rgba(0,0,0,0.3) 0 30px 60px -30px`) as `--elev-raised`. Cool-pale `#f6f9fc` for nested panels. Hero @ 56px weight 300 with -1.4px tracking ("whisper authority"). 3-tier foreground ramp (navy heading / dark-slate label / slate body). |
| **vercel** | blue accent on calibre layout | **Shadow-as-border philosophy**. 4-layer elevation including `#fafafa` inner ring. **Cards have `border: none`** (the shadow IS the border). 48px display ceiling (lower than other brands, intentional). 96px desktop section rhythm ("gallery emptiness"). Geist W600 -0.05em tracking. |
| **calibre** | OKLCH palette on calibre layout | Unchanged visual, **expanded token surface** to participate symmetrically in the token contract. |

## What changes

### Bridge layer: dissolves for non-color, survives as 6-line color shim

**Decision**: Bridge.css stops being load-bearing. It keeps only the 6 color aliases that downstream consumers (existing reports in the wild) might rely on. STRUCTURAL_CSS migrates to brand-native tokens directly.

- `packages/design-tokens/brands/<id>/bridge.css` shrinks from 16 lines to 6:
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
- STRUCTURAL_CSS consumes brand-native tokens: `padding: var(--space-6)`, `box-shadow: var(--elev-raised)`, `font-family: var(--font-display)`, `border-radius: var(--radius-lg)`, `max-width: var(--container-max)`, `transition-duration: var(--motion-fast)`.
- Removed tokens (`--color-card`, `--color-muted`, `--color-border`, etc.) no longer authored by bridge — STRUCTURAL_CSS uses `var(--surface)`, `var(--muted)`, `var(--border)` directly.

### STRUCTURAL_CSS: token-driven baseline + ≤20-line override map per brand

**Decision**: 90% of STRUCTURAL_CSS uses brand-native tokens; ~10% lives in a `BRAND_STRUCTURAL_OVERRIDES` map for hard CSS rules tokens can't express (e.g. Vercel's `border: none` on cards — that's a structural rule, not a token value).

- `packages/viewer/src/styles.ts` STRUCTURAL_CSS rewritten:
  - Replace `padding: 16px` → `padding: var(--space-4)`
  - Replace `border-radius: 12px` → `border-radius: var(--radius-lg)`
  - Replace `box-shadow: 0 1px 2px rgba(...)` → `box-shadow: var(--elev-raised)`
  - Replace `font-family: ...` → `font-family: var(--font-display)`
  - Replace `max-width: 1100px` → `max-width: var(--container-max)`
- `packages/viewer/src/structural-overrides.ts` — NEW:
  ```ts
  export const BRAND_STRUCTURAL_OVERRIDES: Readonly<Record<BrandId, string>> = {
    calibre: "",
    "linear-app": "/* enforce no-shadow; defense even though token aliases handle it */",
    stripe: "",
    vercel: ".cwv-card { border: none; }\n.hero { border: none; }",
  };
  ```
- Override cap: ≤20 lines per brand. Reviewers reject PRs that exceed.

### Calibre symmetry: tokens expand in `globals.css` (preserves R16 "authored source")

**Decision (Q1=b, my recommendation)**: Calibre stays authored in `apps/website/app/globals.css`. The `@theme` block expands with the full open-design token surface. `getBrandCss('calibre', ...)` extracts the relevant subset at build time.

- `apps/website/app/globals.css` `@theme` adds:
  - `--space-1` through `--space-12` (spacing scale)
  - `--text-xs` through `--text-4xl` (typography scale)
  - `--leading-body`, `--leading-tight`, `--tracking-display`
  - `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill`
  - `--elev-flat`, `--elev-ring`, `--elev-raised`
  - `--focus-ring`
  - `--motion-fast`, `--motion-base`, `--ease-standard`
  - `--container-max`, `--container-gutter-desktop/tablet/phone`
  - `--section-y-desktop/tablet/phone`
  - `--bg`, `--fg`, `--surface`, `--surface-warm`, `--accent`, `--success`, `--warn`, `--danger`, `--meta`, `--muted`, `--border`, `--border-soft` (open-design-named primitives, calibre values)
- `packages/design-tokens/scripts/emit-css.mjs` extended to dump the full calibre token set into `dist/palette.css` and the TS constants.
- Preserves the prior change's R16 commitment that "calibre is the authored source of truth, vendored brands are imports."

### Calibre asymmetric storage: documented gap

The sync script (`pnpm sync:open-design`) iterates `["linear-app", "stripe", "vercel"]`. Calibre is excluded by design (authored, not vendored). This asymmetry is **documented in `packages/design-tokens/brands/README.md`** as intentional, not a bug.

### Deck light-lock: rolled back (R7 superseded)

**Decision**: Deck honors `BRAND_MANIFEST[id].preferredTheme`. Linear-app deck renders dark canvas. Stripe/Vercel/Calibre stay light per their preferred themes.

- `packages/reporter-deck/src/styles.ts`: emit theme class via brand resolution:
  ```html
  <html class="theme-{preferredTheme}">
  ```
- `@media (prefers-color-scheme: dark)` block in DECK_CSS is restored.
- New R7a: **each brand MUST declare print-safe token values** for dark themes. Linear-app's `tokens.css` adds:
  ```css
  @media print {
    :root {
      --bg: #ffffff;
      --fg: #000000;
      --surface: #ffffff;
      --surface-warm: #f5f5f5;
      --border: #cccccc;
    }
  }
  ```
- Stripe/Vercel `@media print` blocks are no-ops (already light).

### `getDeckBrandOverlay`: deprecated, returns empty string

**Decision**: Function survives as no-op for back-compat; marked `@deprecated` in TSDoc. Removed in next minor version bump.

```ts
/** @deprecated As of v2, deck consumes full brand CSS via getBrandCss(id).
 * Returns empty string. Will be removed in v0.1.0. */
export function getDeckBrandOverlay(_id: BrandId): string {
  return "";
}
```

### `components.html`: hard ban (unchanged from v1)

Reaffirmed. Markup stays ohmyperf-authored. Spec R-vendoring-discipline updated.

### WCAG-AA gate expands to 4-tier foreground ramp (R10a)

**Decision**: `scripts/check-contrast.mjs` extends to walk `--fg`, `--fg-2`, `--muted`, `--meta` on both `--bg` and `--surface`.

- Body text tiers (`--fg`, `--fg-2`): ≥ 4.5:1 vs each background
- Chrome text tiers (`--muted`, `--meta`): ≥ 3:1 vs each background
- Per-brand verdict: pass/fail per (brand, theme, tier, background) — 4 brands × 2 themes × 4 tiers × 2 backgrounds = up to 64 checks (skipping unsupported brand/theme pairs).
- Block ship on any failure.

### Per-brand structural signatures (R17-R20): objective gates

**Decision**: Spec adds testable invariants per brand. Each signature is a direct CSS-rule assertion (NOT visual regression). These are the architectural commitments.

**Linear-app**:
- `box-shadow: var(--elev-flat)` (= `none`) on `.cwv-card`, `.hero`, `.empty-state`
- Canvas is dark when `theme=system` (`--bg: #08090a` resolves)
- `letter-spacing: var(--tracking-display)` = `-0.022em` on display headings
- `max-width: var(--container-max)` = `1200px`

**Stripe**:
- Multi-layer shadow regex `box-shadow:[^;]*,[^;]*,` matches at least once in viewer artifact
- `background: var(--surface-warm)` on nested panels (e.g. `.attribution-panel`)
- Hero font-weight `300` (from `--font-weight-display`)

**Vercel**:
- `.cwv-card { border: none }` (shadow-as-border)
- `--section-y-desktop` = `96px` reflected in section margins
- `--text-3xl` = `48px` (display ceiling)

**Calibre**:
- At least one rule uses `var(--color-primary)` (identity preservation)
- `box-shadow: var(--elev-raised)` resolves to soft single-layer shadow

### Visual regression baselines: 14 PNGs, regenerated as LAST commit

**Decision**: Baselines regenerate in commit #6 only. Mid-series regeneration produces stale baselines that don't represent final state.

- Linear-app viewer dark: 1 baseline
- Linear-app viewer light: 1 (still supported per manifest)
- Linear-app deck dark: 1 (NEW — was light-locked in v1)
- Stripe viewer light: 1
- Stripe deck light: 1
- Vercel viewer light: 1
- Vercel viewer dark: 1
- Vercel deck light: 1
- Vercel deck dark: 1 (NEW)
- Calibre viewer light: 1
- Calibre viewer dark: 1
- Calibre deck light: 1
- Calibre deck dark: 1 (NEW per rollback)
- Cross-brand layout sanity: 1 (4-brand grid composite at thumbnail size, for at-a-glance review)

Total: **14 PNGs**.

### Website React surface: stays Tailwind-utility-driven

**Decision (Q2=b, my recommendation)**: No React component refactor. Tailwind v4 `@theme` accepts the expanded token set; existing `BrandStyleInjector` mechanism handles brand swap by overriding tokens at runtime — utilities continue to resolve.

- `apps/website/components/*` untouched.
- `apps/website/components/report/brand-style-injector.tsx` unchanged — already overrides tokens via inline `<style>` injection.
- The website's live `/report` route renders with full brand visual identity automatically once Commit 1 expands calibre's tokens AND vendored brands' tokens are consumed via the existing injection mechanism.

### Sync script byte-fidelity for multi-layer shadows

**Decision**: Stripe's `--elev-raised` upstream is 3-layer (`rgba(50,50,93,0.25) 0 50px 100px -20px, rgba(0,0,0,0.3) 0 30px 60px -30px`). Vercel's is 4-layer including `inset` keyword. Sync script's existing font-strip + color-mix-precompute transforms MUST preserve these byte-for-byte.

- New unit test in `scripts/sync-open-design.test.mjs` (or equivalent) asserts:
  - Stripe's `--elev-raised` after sync matches upstream byte-for-byte (modulo transforms)
  - Vercel's `--elev-raised` after sync matches upstream byte-for-byte
- Test runs in CI as a sync-gate before vendored brand changes can merge.

### Out of Scope (deferred to v3)

- `components.html` partial adoption (button/card/hero primitives from open-design)
- `--motion-*` transitions on interactive elements beyond the global rule
- Per-brand `:focus-visible` rings beyond the single global rule
- Per-brand print stylesheet beyond linear-app's dark→light inversion
- WOFF2-inline brand fonts (Inter Variable, Geist) — system font stack final
- Custom slide templates per brand (Swiss-22 layouts, Guizang-10 layouts) — 6-slide structure brand-invariant
- Expansion beyond 4 brands

## Dependencies

- Builds on `add-open-design-styles` (commits `0af165c` → `543054f`). MODIFIES R3 + R7 from that change's spec; ADDS R7a, R10a, R17-R20.
- Sync script (`packages/design-tokens/scripts/sync-open-design.mjs`) needs minor extension (presence check for non-color tokens; byte-fidelity test for multi-layer shadows).
- Visual regression test package (`tests/visual-regression/`) needs baseline regeneration.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Bridge dissolution breaks downstream consumers | 6-line color shim preserved; `--color-*` names still resolve via `var(--bg)` etc. |
| STRUCTURAL_CSS has hardcoded fallback for calibre | Forbidden — Commit 1 (calibre globals.css expansion) precedes Commit 2 (STRUCTURAL_CSS migration). Calibre tokens MUST exist before STRUCTURAL_CSS consumes them. |
| Intermediate state (viewer integrated, deck still light-locked) looks broken | Two-PR phasing: PR#1 (commits 1-3) keeps viewer consistent; PR#2 (commits 4-6) lands deck rollback atomically. |
| Visual regression baselines regenerated prematurely | Hard rule: Commit 6 is LAST. No earlier baseline regen. |
| Stripe/Vercel multi-layer shadow mangled by sync script | Sync-script byte-fidelity unit test added in Commit 1. |
| Linear-app dark deck wastes printer toner | Brand-declared `@media print` block inverts to light values for print. |
| Per-brand contrast regression on `--fg-2` | R10a gate blocks merge on any (brand, theme, tier, background) failure. |
| Per-brand structural signatures drift via subjective review | R17-R20: direct CSS-rule snapshot tests (regex/extractRule), not visual regression. Block PR if signature fails. |
| Override map (`BRAND_STRUCTURAL_OVERRIDES`) creeps past 20 lines | Spec cap; reviewers reject. |
| `components.html` creeps in via "just one hero primitive" | Spec hard ban; CI fails on any markup vendored from open-design. |

## Architectural Invariants (preserved from `add-beautiful-report` + `add-open-design-styles`)

- Single-file no-external-requests artifacts (no Tailwind CDN, no Google Fonts CDN)
- Bundle budget caps: viewer ≤ 200 KB gz, deck ≤ 500 KB gz per artifact
- Reproducibility: no CI auto-sync of upstream open-design
- Vendor-only-tokens: never import `components.html` or `DESIGN.md`
- Report schema 1.0.0 FROZEN
- WCAG-AA contrast pre-gate on shipped artifacts (now expanded to 4-tier ramp)
- `@ohmyperf/design-tokens` api-extractor surface additive-only (`getDeckBrandOverlay` deprecated but signature preserved)

## Phasing

**ONE OpenSpec change, 6 commits, 2 PRs.** Each PR is independently reviewable; each commit in PR#1 keeps the viewer renderable at v1-or-better.

### PR #1 — Viewer integration (3 commits)

- **Commit 1** — Bridge strip + calibre globals.css expansion + sync-script byte-fidelity test
- **Commit 2** — STRUCTURAL_CSS rewritten to consume brand-native tokens (visually neutral for calibre by design)
- **Commit 3** — Per-brand structural overrides + `getDeckBrandOverlay` deprecated

### PR #2 — Deck rollback + tests + baselines (3 commits)

- **Commit 4** — Deck light-lock removed (R7 superseded) + per-brand print blocks
- **Commit 5** — WCAG-AA 4-tier ramp gate (R10a) + per-brand structural signature tests (R17-R20)
- **Commit 6** — Visual regression baselines regenerated (14 PNGs)

## User Confirmation State

This proposal was drafted under the following defaults per the deep-design Phase 2 checkpoint when user input was deferred via the OH-MY-OPENCODE TODO CONTINUATION directive:

- **Q1 (calibre storage)** = **(b)** Keep authored in `globals.css`, expand with full token set. (Preserves R16 "authored source.")
- **Q2 (website refactor)** = **(b)** Stay Tailwind-utility-driven. (Existing BrandStyleInjector mechanism covers brand swap; zero React component changes.)
- **Q3 (defaults)** = accepted. 6-slide deck brand-invariant; `components.html` banned; system font stack final.

**If the user disagrees with any of these defaults**, the proposal is revisable — Commit 1 scope shrinks/grows for Q1; Commits 3-6 may add `apps/website/components/` changes for Q2; deck/slide invariants for Q3. Until override, implementation proceeds under these assumptions.
