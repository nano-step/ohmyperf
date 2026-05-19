# @ohmyperf/tests-visual-regression

Visual regression baselines for the 4 brand styles (`calibre`, `linear-app`, `stripe`, `vercel`) across viewer + deck surfaces.

## What this gates

- That re-syncing `pnpm sync:open-design` doesn't silently change the visual output of any brand.
- That refactors to chart palette CSS rules don't regress brand appearance.
- That a brand's `bridge.css` correctly resolves to the visual the brand README documents.

## Running

```bash
pnpm test:visual                  # run baselines (advisory on macOS / Windows; gated on ubuntu CI)
pnpm test:visual:update           # regenerate baselines from current render output
```

## Platform discipline

The tests are **gated only on ubuntu-24.04 in CI** because Playwright/Chromium font rendering differs across operating systems and would generate false-positive diffs on macOS or Windows.

When run locally (any OS that is not Linux), the tests fall back to advisory mode: they confirm the artifact renders to disk and the meta tag is correct, but do NOT diff against committed PNG baselines.

## What runs in CI

A dedicated `.github/workflows/visual-regression.yml` workflow:

- Triggers on PRs that touch `packages/design-tokens/brands`, `packages/viewer/src`, or `packages/reporter-deck/src`
- Runs on `ubuntu-24.04` only
- Installs chromium via `pnpm exec playwright install chromium`
- Runs `pnpm test:visual`
- Uploads diff artifacts on failure (configured in the workflow)

## Baseline files

```
baselines/
├── viewer/
│   ├── calibre-light.png       (1280×720, preferred theme: light)
│   ├── linear-app-dark.png     (1280×720, preferred theme: dark)
│   ├── stripe-light.png        (1280×720, preferred theme: light)
│   └── vercel-light.png        (1280×720, preferred theme: light)
└── deck/
    ├── calibre.png             (1920×1080, deck is always light-locked)
    ├── linear-app.png          (1920×1080)
    ├── stripe.png              (1920×1080)
    └── vercel.png              (1920×1080)
```

Baseline regeneration policy: any PR that intentionally updates a baseline MUST justify the visual change in the PR description; CI will refuse to land without the maintainer ACK on the diff.

## Tolerance

Pixel diff tolerance: 0.5% (Playwright `maxDiffPixelRatio: 0.005`).
