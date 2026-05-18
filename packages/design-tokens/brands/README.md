# Vendored open-design brand tokens

This directory houses CSS tokens vendored from the [`nexu-io/open-design`](https://github.com/nexu-io/open-design) library (Apache-2.0). It enables `--style=<brand>` on the ohmyperf CLI, the `style` arg on MCP rendering tools, and the brand picker on the website `/report` route.

## Architecture

Each vendored brand directory contains exactly three files:

```
packages/design-tokens/brands/<id>/
├── tokens.css   ← vendored from upstream + 2 transforms (font-stripping, color-mix precompute)
├── bridge.css   ← aliases open-design (--bg, --fg, --accent, ...) onto ohmyperf (--color-*)
└── README.md    ← provenance, license, divergences, supported themes
```

The bridge layer means viewer/deck CSS keeps `var(--color-*)` references unchanged regardless of brand. Calibre stays in `../src/index.ts` (authored source); only the three vendored brands live here.

## Strict brand cap (v1.0)

The `BrandId` TypeScript union literal in `../src/brands.ts` enumerates exactly four IDs:

```ts
type BrandId = "calibre" | "linear-app" | "stripe" | "vercel"
```

**Adding a new brand requires:**

1. A new OpenSpec change proposal (no informal additions)
2. WCAG-AA contrast audit on the brand's full palette × supported themes
3. Vendoring via `pnpm sync:open-design --brand=<id>` with provenance header
4. Per-brand `README.md` documenting divergences
5. Visual regression baseline added to `tests/visual-regression/baselines/`
6. Updating `BrandId` union and `BRAND_MANIFEST` map in lockstep
7. NOTICE attribution entry

The 17-brand expansion is **not** authorised under this change; v1.0 ships exactly 4 styles.

## Sync workflow

```bash
pnpm sync:open-design --all                 # re-vendor all 3 brands from upstream
pnpm sync:open-design --brand=linear-app    # re-vendor one
```

The sync script:

- Reads from `~/.config/opencode/open-design-library/design-systems/<brand>/tokens.css`
- Applies font-stripping (replaces non-system fonts with `-apple-system, ...` system stack)
- Applies `color-mix()` precomputation (resolves `color-mix(in oklab, var(--accent), black 8%)` to static hex)
- Writes to `brands/<id>/tokens.css` with provenance header
- Asserts schema digest in `.schema-digest` matches the upstream `_schema/tokens.schema.ts`; exits non-zero on schema drift

The sync script **never** runs in CI. Sync is a manual human action recorded by a commit.

## File integrity

- `UPSTREAM_SHA` — pinned commit SHA of the open-design snapshot vendored
- `.schema-digest` — SHA-256 (truncated 16 hex chars) of the sorted A1+A2 token names in `_schema/tokens.schema.ts`

If upstream renames or removes a token, the sync script fails with a diff against the pinned digest. The decision to accept a schema change is explicit (update `.schema-digest`, file a change).

## License

Vendored brand tokens are Apache-2.0 (same as ohmyperf). Per-brand attribution lives in the repo-root `NOTICE` file under "Vendored open-design brand tokens".
