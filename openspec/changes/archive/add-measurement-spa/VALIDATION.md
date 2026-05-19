# Phase ζ — Validation Report

**Date**: 2026-05-13
**Performed by**: Sisyphus (manual validation; openspec CLI not installed in environment)

## OpenSpec CLI status

- `openspec` binary NOT installed in this repo (`node_modules/.bin/openspec` absent)
- `@fivetwofive/openspec`, `openspec` packages return 404 on npm registry
- The `openspec/` directory is a project-local convention; no official CLI tooling found in this codebase
- Validation performed manually against OpenSpec conventions

## Manual structural validation — all PASS

### Artifacts present

| File | Lines | Status |
|---|---|---|
| `openspec/changes/add-measurement-spa/proposal.md` | 61 | ✓ |
| `openspec/changes/add-measurement-spa/design.md` | 320 | ✓ |
| `openspec/changes/add-measurement-spa/tasks.md` | 105 | ✓ |
| `openspec/changes/add-measurement-spa/specs/measurement-spa/spec.md` | 276 | ✓ |
| `openspec/changes/add-measurement-spa/REVIEW.md` | 133 | ✓ (self-review with conditions applied) |
| `openspec/changes/add-measurement-spa/deep-dives/README.md` + 5 phase specs | 5,357 | ✓ |

### Proposal.md structure

- `## What changes` section present
- `### Added` (line 19) ✓
- `### Modified` (line 38) ✓
- `### Removed` (line 45) ✓

### Spec.md structure

- `## ADDED Requirements` header present (line 3) ✓
- **12** `### Requirement:` blocks ✓
- **32** `#### Scenario:` blocks with WHEN/THEN format ✓
- All requirements have at least one scenario ✓
- Telemetry requirement added in Phase ε ✓

### Tasks.md status

- **73** tasks marked `[x]` complete
- **11** tasks marked `[ ]` (deferred to manual local verification)
- Deferred tasks documented with reasons in REVIEW.md:
  - α.14 `Dockerfile.slim` (alternative variant, not blocking)
  - β.17.c/d/e Playwright smoke run (no browser binary in sandbox)
  - δ.9 Extension parity test live run (no Chromium for `--load-extension` in sandbox)
  - δ.11 Live extension smoke (CWS deployment is a future event)
  - ε.15 Playwright E2E execution (sandbox limitation)
  - ε.16 a11y CI execution (sandbox limitation)
  - ζ.1–ζ.4 (THIS PHASE — archive deferred per user instruction "ζ archive sau")

### TypeScript regression check

```
✓ pnpm --filter @ohmyperf/website typecheck      → clean (tsc --noEmit)
✓ pnpm --filter @ohmyperf/runner typecheck       → clean (tsc -b)
✓ pnpm --filter @ohmyperf/extension-chrome typecheck → clean (tsc -b)
```

### Build artifacts present

```
✓ apps/website/out/index.html              (landing)
✓ apps/website/out/measure/index.html
✓ apps/website/out/report/index.html
✓ apps/website/out/viewer/index.html
✓ apps/website/out/_next/                  (chunks + assets)
✓ apps/runner/dist/                        (compiled JS)
✓ apps/extension-chrome/extension-dist/    (background.bundle.js)
✓ packages/shared-types/dist/
✓ packages/viewer/dist/                    (preserved CLI HTML renderer + new ./react export)
```

## Archive decision — deferred to user

`openspec archive add-measurement-spa` would:
1. Move `openspec/changes/add-measurement-spa/specs/measurement-spa/` → `openspec/specs/measurement-spa/`
2. Move the change folder → `openspec/changes/archive/add-measurement-spa/`
3. Lock the spec as the canonical 1.0 contract for this capability

This is an **irreversible** operation (per Sisyphus's autonomy/safety rules, irreversible actions require explicit user confirmation). User's prior answer to the implementation gate was "Start Phase ε ngay (..., ζ archive sau)" — explicitly deferring archive.

**Action**: Validation complete. Archive operation **NOT performed**. User can run archive whenever ready:

```bash
# When openspec CLI is installed/available:
pnpm exec openspec validate add-measurement-spa --strict --no-interactive
pnpm exec openspec archive add-measurement-spa --no-interactive

# Or manually (without CLI):
mv openspec/changes/add-measurement-spa/specs/measurement-spa openspec/specs/measurement-spa
mkdir -p openspec/changes/archive
mv openspec/changes/add-measurement-spa openspec/changes/archive/
```

## Final progress: 6/6 phases complete

| Phase | Status | Commit | Highlights |
|---|---|---|---|
| α Runner | ✅ DONE | `06fb2aa` | Hono + SSE + SSRF, 31 vitest pass, real E2E 1.8s |
| β SPA shell | ✅ DONE | `a8c7b17` | Next.js 15 static export, 112KB gz landing |
| γ Metrics + IDB | ✅ DONE | `6ddc39a` | runner-client + zustand + viewer React port + waterfall |
| δ Extension bridge | ✅ DONE | `84c0ba1` + `ab8e8d0` + `18c63c3` + `d484f79` | externally_connectable + port streaming |
| ε Polish + CI | ✅ DONE + smoke `2036524` | a11y + bundle budgets + 14/14 Playwright green + 2 a11y regressions fixed (`9b5652f`) |
| ζ Validate + archive | ✅ DONE — γ.18 verified, ready to archive | (this file + smoke `78707c5` + `a4a2ede`) | — |

**Totals**: 9 + 6 commits, 132 files changed, +13,047 / -1,297 lines, 77/84 tasks done.

## Phase ζ — Smoke validation 2026-05-17 (γ.18 runner path)

Backend smoke executed via [`scripts/smoke/01-runner-path.sh`](../../../scripts/smoke/01-runner-path.sh):

| Step | Status |
|---|---|
| Pre-flight (docker, ports, pnpm, curl) | ✅ |
| Runner `docker compose up --build -d` | ✅ |
| `/api/health` green | ✅ in 4s |
| Website static build + `npx serve` | ✅ |
| `POST /api/measure` → jobId returned | ✅ |
| Polled job status to `done` | ✅ |
| Report JSON has `lcp` + `frameTree` | ✅ |
| **Manual browser**: SPA landing → enter URL → live progress → Report screen | ✅ tested on https://blog.thnkandgrow.com/ (5 runs, 156s, CWV+axe+frame+waterfall present, zero red console errors) |

### Regressions discovered + fixed during smoke

| # | Symptom | Root cause | Fix commit |
|---|---|---|---|
| 1 | `ε.15` Playwright `a11y: landing (/)` fail, `a11y: viewer (/viewer)` fail | `<code>` inside `<p className='text-muted-foreground'>` inherited muted color → 4.34:1 contrast (need 4.5:1); `<pre overflow-x-auto>` without `tabIndex` failed `scrollable-region-focusable` | `9b5652f` — add `text-foreground` to inline code; add `tabIndex={0}` + `role="region"` + `aria-label` to `<pre>` |
| 2 | `γ.18` Docker compose fail at `pnpm install --frozen-lockfile` with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` | Lockfile's top-level `catalogs:` block had stale `playwright: ^1.49.1` while `pnpm-workspace.yaml` was already pinned to `1.60.0` (from `d8d0dc7`) | `a4a2ede` — regenerate lockfile |
| 3 | `γ.18` First measurement returned `{ status: 'error', code: 'runner/browser-missing' }` | Dockerfile runtime base image `mcr.microsoft.com/playwright:v1.59.1-jammy` pre-bundles Chromium for Playwright 1.59.1; the catalog-pinned client 1.60.0 looks for a different binary path → ENOENT (`81693d8`'s actionable mapping surfaces it cleanly) | `78707c5` — bump base image to `v1.60.0-jammy` (verified present on MCR) |

### δ.11 — Extension path acceptance (DEFERRED to user follow-up)

Per user decision 2026-05-17: γ.18 alone is sufficient to unlock Phase ζ archive. Extension parity acceptance (δ.11) requires unpacked-extension load + cross-flow report comparison; deferred as a separate smoke task whenever user resumes extension QA.

The extension's wire protocol (Phase δ code) is unchanged since commit `d484f79` and remains fully built (`extension-dist/` committed at `74a5926` with deterministic dev-key). The acceptance is the only outstanding item — code-level validation already passed manual review.

## Archive — APPROVED 2026-05-17

User explicitly approved Phase ζ archive on 2026-05-17. Archive performed manually (no openspec CLI available):

```bash
mkdir -p openspec/changes/archive
mkdir -p openspec/specs
mv openspec/changes/add-measurement-spa/specs/measurement-spa openspec/specs/measurement-spa
mv openspec/changes/add-measurement-spa openspec/changes/archive/
```
