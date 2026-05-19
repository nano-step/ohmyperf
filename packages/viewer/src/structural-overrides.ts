import type { BrandId } from "@ohmyperf/design-tokens";

/**
 * Per-brand structural CSS overrides concatenated after STRUCTURAL_CSS.
 *
 * Cap: ≤ 20 lines per brand (enforced by structural-overrides.test.ts).
 * Use only for true structural rules (border presence, custom layout).
 * Color identity and spacing live in the brand's token layer; do NOT repeat them here.
 *
 * R20 invariant: calibre is always "" (baseline; no overrides).
 * R20 invariant: linear-app shadow is handled via var(--elev-flat) in token layer; no override needed.
 */
export const BRAND_STRUCTURAL_OVERRIDES: Readonly<Record<BrandId, string>> = {
  calibre: "",
  "linear-app":
    "/* tokens carry no-shadow via var(--elev-flat); no structural overrides needed */",
  stripe: "",
  vercel: `
.cwv-card { border: none; }
.hero { border: none; }
.third-parties { border: none; }
`,
};
