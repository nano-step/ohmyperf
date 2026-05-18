# @ohmyperf/design-tokens

Canonical TypeScript + CSS interface to the OhMyPerf Calibre OKLCH palette.

## Canonical source

`apps/website/app/globals.css` remains the single source of truth for OKLCH values. This package reflects those values so non-Next.js consumers (the standalone HTML viewer at `packages/viewer/` and the slide-deck reporter at `packages/reporter-deck/`) can stay in sync without importing Tailwind v4.

A CI gate (`scripts/check-design-tokens.mjs`) asserts that every OKLCH value in:

- `apps/website/app/globals.css`
- `packages/design-tokens/dist/index.js`
- `packages/viewer/dist/styles.js` (after Commit 2)
- `packages/reporter-deck/dist/styles.js` (after Commit 3)

is identical. The build fails on any drift.

## Usage

```ts
import { PALETTE_CSS, CALIBRE_LIGHT } from "@ohmyperf/design-tokens";

// Embed the full palette (with hex fallbacks + dark mode) into a static HTML <style> tag:
const html = `<style>${PALETTE_CSS}</style>`;

// Or reference TypeScript constants when emitting inline SVG colour attrs:
const stroke = CALIBRE_LIGHT.accentSuccess;       // "oklch(0.55 0.17 145)"
const fallbackStroke = CALIBRE_LIGHT.hex.accentSuccess; // "#377f3d"
```

For slide decks (no dark mode), use the light-only variant:

```ts
import { PALETTE_CSS_LIGHT_ONLY } from "@ohmyperf/design-tokens";
```

## Why hex fallbacks?

Every OKLCH declaration is preceded by a hex declaration:

```css
--color-primary: #1855b8;
--color-primary: oklch(0.50 0.18 245);
```

Browsers ignore unknown values and keep the last valid one. Newer browsers see both, take OKLCH. Stale browsers (Safari < 15.4, archived viewers) see only hex.

## Adding a new token

1. Add the OKLCH value to `apps/website/app/globals.css` first (canonical source).
2. Add matching `OKLCH` value to `CALIBRE_LIGHT` and `CALIBRE_DARK` in `src/index.ts`.
3. Add matching `hex` fallback to both palettes' `hex` sub-object.
4. Add the `--color-*` name to `PROP_TO_CSS_VAR` map in `src/index.ts`.
5. Run `node scripts/check-design-tokens.mjs` — must exit 0.
6. Run `pnpm --filter @ohmyperf/design-tokens test` — all tests pass.

## License

Apache-2.0.
