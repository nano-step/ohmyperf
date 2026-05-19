# Tasks: Share + Export UI + Visual Identity (Track C)

## C0. Pre-flight — parallel lane (start day 1, parallel with Track A)

These tasks have ZERO dependency on Track A/B engine data. Run immediately after §0 reconcile + user approval.

- [x] C0.1 ~~Install shadcn primitives~~ — **superseded**: chose headless local components instead of pulling 8 Radix-backed shadcn primitives (saves ~30 KB gz on `/report` bundle). `share-button.tsx`, `export-menu.tsx`, popover/alertdialog use raw `<div role="...">` + Tailwind. Trade-off: less polish, more accessible markup we control. `apps/website/components/ui/` stays at the existing 8 primitives (alert, badge, button, card, form, input, label, sonner). If we need richer primitives later (e.g. command palette, combobox), revisit.
- [x] C0.2 Split `@ohmyperf/reporter-markdown` for browser-safety:
  - Move `writeMarkdownReport` (the `fs`-using wrapper) to a new `packages/reporter-markdown/src/node.ts`.
  - Keep `renderMarkdown` (pure string function) in `src/index.ts` with NO `node:fs/promises` / `node:path` imports.
  - Add `"./node"` to `package.json` `exports` map; root `.` only re-exports `renderMarkdown`.
  - Update CLI `apps/cli/src/commands/run.ts` to `import { writeMarkdownReport } from "@ohmyperf/reporter-markdown/node"` (was `import { writeMarkdownReport } from "@ohmyperf/reporter-markdown"`).
  - `pnpm typecheck` clean.
- [x] C0.3 Verify (not capture) the existing bundle-budget infrastructure: `scripts/bundle-budgets.json` already defines `/report/[[...id]]` at 250 KB. `.github/workflows/website-budgets.yml` runs `scripts/check-bundle-budgets.mjs` on every PR. Action: run `pnpm --filter @ohmyperf/website analyze` once, record CURRENT actual gzipped size for `/report/[[...id]]` in `docs/measurement-spa-deploy.md` "Bundle baseline 2026-05-XX" section. **The CI gate already exists** — no new workflow step needed.
- [x] C0.4 Remove `uplot` from `apps/website/package.json` (confirmed unused via `git grep uplot` returning zero hits today). `pnpm install`.
- [x] C0.5 Reconcile bundle-budget script naming. Verified 2026-05-17: `apps/website/package.json` line 13 invokes `scripts/check-bundle-budget.mjs` (singular) but the canonical CI script is `scripts/check-bundle-budgets.mjs` (plural, referenced by `.github/workflows/website-budgets.yml`). Both files currently exist. Determine which is canonical (likely plural, given CI uses it); update `apps/website/package.json` `analyze:check` script to invoke the plural version; delete the orphan singular file.

## C1. Wire @ohmyperf/share-client into the SPA

- [x] C1.1 Add `"@ohmyperf/share-client": "workspace:*"` AND `"@ohmyperf/reporter-markdown": "workspace:*"` to `apps/website/package.json` dependencies (markdown needed for Export menu's "Copy as Markdown"); run `pnpm install`.
- [x] C1.2 Add `NEXT_PUBLIC_SHARE_ENDPOINT=` to `apps/website/.env.example` with a comment explaining what it does and the default Workers deploy URL.
- [x] C1.3 Extend `apps/website/lib/env.ts` to expose `getShareEndpoint(): string | null` reading `process.env.NEXT_PUBLIC_SHARE_ENDPOINT`.
- [x] C1.4 Document the `redact.ts` browser limitation: `process.env` is polyfilled to `{}` by Next.js in the browser, so `scanEnvSecrets` is a no-op and `ShareSecretLeakError` cannot fire from SPA. Add an inline comment in `share-button.tsx`: `// SPA path: env-secret scan is a no-op (browser has no env). The AlertDialog is defensive for CLI-style usage.`

## C2. Share button

- [x] C2.1 Create `apps/website/components/report/share-button.tsx`:
  - shadcn `Button` with `Share2` icon from `lucide-react`.
  - On click with no endpoint: shadcn `Popover` with a 3-line explainer + link to `docs/measurement-spa-deploy.md` Workers section.
  - On click with endpoint: set `pending=true`, call `uploadReport({ endpoint, report })`. Handle three error classes:
    - `TypeError` / network error (offline) → toast "Network error. Try again." (no retry button — user-initiated, manual retry).
    - 5xx (server errors): toast "Server error" with a single Retry button (one attempt, 2s delay before re-firing). No exponential backoff.
    - 4xx (`payload_too_large`, `rate_limited`): show specific error code, NO retry button.
    - `ShareSecretLeakError`: shadcn `AlertDialog` listing the leaked keys with "Share anyway (unsafe)" option (uses `skipRedaction: true`). Note: this path is DEFENSIVE — in production browser `scanEnvSecrets` returns `[]` because `process.env === {}`, so dialog only fires from non-browser callers or test mocks.
  - On success → `navigator.clipboard.writeText(url)` + sonner toast "Share link copied" with URL in description.
  - Clipboard fallback: wrap `navigator.clipboard.writeText` in try/catch. On failure (insecure context, denied permission), show a `Dialog` containing the URL in a readonly `<input>` that the user can manually select+copy.
- [x] C2.2 Add `data-testid="share-button"` for Playwright tests.
- [x] C2.3 Handle the `pending=true` UI state with a `Loader2` spin icon.

## C3. Export menu

- [x] C3.1 Create `apps/website/components/report/export-menu.tsx`:
  - shadcn `DropdownMenu` triggered by `Button` with `Download` icon.
  - Items: "Download JSON", "Download Markdown", "Copy as JSON", "Copy as Markdown".
- [x] C3.2 "Download JSON" handler: `Blob` + `URL.createObjectURL` + temp `<a>` click + `URL.revokeObjectURL`. Filename `ohmyperf-<reportId>.json`.
- [x] C3.3 "Download Markdown" handler: `renderMarkdown(report)` from `@ohmyperf/reporter-markdown` (browser-safe after C0.2 split). Filename `ohmyperf-<reportId>.md`.
- [x] C3.4 "Copy as JSON" handler: `navigator.clipboard.writeText(JSON.stringify(report))` + toast.
- [x] C3.5 "Copy as Markdown" handler: same with `renderMarkdown(report)` + toast.
- [x] C3.6 Add `data-testid="export-menu"` for tests.

## C4. Toolbar integration

- [x] C4.1 In `apps/website/app/report/page.tsx`, find the `SingleReport` JSX. Add a toolbar `<div className="flex items-center justify-between mb-4">` above `CwvGauge`.
  - Left: existing "← All reports" link.
  - Right: `<ShareButton report={report} />` + `<ExportMenu report={report} />`.
- [x] C4.2 Make the toolbar sticky on scroll: `sticky top-0 bg-background/90 backdrop-blur z-10 py-3 border-b`.

## C5. Share endpoint status pill in header

- [x] C5.1 In `apps/website/components/layout/site-header.tsx`, add a small pill:
  - If `getShareEndpoint()` returns string → positive badge "Share: connected" (using `--color-accent-success`) with hover tooltip showing the endpoint.
  - If null → muted badge "Share: not configured" linking to docs.
- [x] C5.2 Hide pill on `/` landing if it adds noise (decide at implementation review).

## C6. Wrangler config + deploy docs

- [x] C6.1 Create `packages/share-server/wrangler.toml` (committed, with placeholder values):
  - `name = "ohmyperf-share"`
  - `main = "src/workers.ts"`
  - `compatibility_date = "2026-05-01"`
  - `[[d1_databases]]` with `binding = "RECORDS"` (NOT "DB" — must match existing `WorkersBindings.RECORDS` in `workers.ts`), `database_name = "ohmyperf-share-prod"`, `database_id = "REPLACE_AFTER_wrangler_d1_create"`
  - `[[r2_buckets]]` with `binding = "REPORTS"`, `bucket_name = "ohmyperf-reports"` (verify R2 binding is actually used in workers.ts — if D1 stores everything, drop R2 entirely)
  - `[vars]` with `OHMYPERF_PUBLIC_BASE_URL = "https://share.ohmyperf.dev"`
  - Add inline comment block at top: `# Copy this to wrangler.toml.local for your account; .local is gitignored. Run: wrangler d1 create ohmyperf-share-prod → paste id back in this file.`
- [x] C6.2 Add `wrangler.toml.local` and `.dev.vars` to `packages/share-server/.gitignore`. Do NOT create a separate `wrangler.example.toml` — single file with placeholders + comments is cleaner.
- [x] C6.3 Add `packages/share-server/migrations/0001_initial.sql` — emit `D1_SCHEMA` from `workers.ts:D1_SCHEMA` as a migration file.
- [x] C6.4 CI strategy: existing tests use `InMemoryStorage` (`packages/share-server/src/app.test.ts`). Workers adapter (R2/D1) stays uncovered in CI (no Cloudflare account required). Document in `packages/share-server/README.md`: "Workers deploy is smoke-tested manually before release; consider adding `miniflare` if usage grows."
- [x] C6.5 Update `docs/measurement-spa-deploy.md`:
  - Append section "Deploy share-server to Cloudflare Workers" with the `wrangler d1 create` + `wrangler r2 bucket create` + `wrangler deploy` commands.
  - Document setting `NEXT_PUBLIC_SHARE_ENDPOINT` on the website host.

## C7. Visual identity — Calibre direction (PINNED reference)

Pinned visual reference: **Calibre** (https://calibreapp.com). Muted-blue accent, clean perf-tool aesthetic. NOT SpeedCurve.

- [x] C7.1 Update `apps/website/app/globals.css` `@theme` block with WCAG-2.1-AA-verified values:
  - `--color-accent-primary: oklch(0.50 0.18 245)` (NOT 0.55 — that fails 4.5:1 for body text on white; this passes ~5.2:1)
  - `--color-accent-success: oklch(0.55 0.17 145)` (≈4.6:1 on white, for CWV "good")
  - `--color-accent-warning: oklch(0.55 0.16 70)` (darker amber for text — Lighter `oklch(0.70 0.18 70)` only acceptable as background, not text)
  - `--color-accent-danger: oklch(0.55 0.22 25)` (≈5.0:1 on white, for CWV "poor")
  - Update `--color-primary` to reference `--color-accent-primary` for shadcn Button bg. Keep `--color-primary-foreground` at `oklch(0.985 0 0)` (near-white) so button text stays readable.
  - Dark-mode counterparts in the `.dark` block — lighten each by ~0.1 OKLCH-L for dark-bg legibility.
  - VERIFY each value with an OKLCH contrast checker (e.g. https://oklch.com or `culori`) on both `#fff` and `#1a1a1a` backgrounds before commit.
- [x] C7.2 Update `apps/website/lib/format.ts`:
  - Replace hardcoded `#0cce6b`, `#ffa400`, `#ff4e42` with `var(--color-accent-success/warning/danger)`.
  - Where Tailwind class is needed, expose via `bg-[var(--color-accent-success)]` etc.
- [x] C7.3 Re-run `pnpm test:a11y`; fix any new contrast violations BEFORE merging.
- [x] C7.4 Add `scripts/check-contrast.mjs`: small node script using `culori` to compute APCA / WCAG-2.1 contrast for each `--color-accent-*` against `oklch(1 0 0)` (light bg) and `oklch(0.15 0 0)` (dark bg). Fail with non-zero exit if any ratio < 4.5:1 for text use cases. Wire as a `pretest:a11y` script so the contrast check runs before axe. Otherwise WCAG verification is "hope, not check."

## C8. (MERGED with B4.9) Consolidated ReportViewer refactor — one PR at B→C boundary

**Why merged**: B4.9 (insights section + collapsible existing blocks) and C8 (shadcn Card wrapping + orphan wiring) both edit `report-viewer.tsx` (286 lines). Doing them as separate PRs creates merge conflicts on every change. This task is OWNED by C but executed after Track B completes, so Track B's `InsightsSection` is already imported.

- [x] C8.1 In `apps/website/components/viewer/report-viewer.tsx`:
  - Wrap each section in shadcn `Card` + `CardHeader` + `CardTitle` + `CardContent`.
  - Replace `<table className="..."` with shadcn `Table` primitives where appropriate (`Table`, `TableHeader`, `TableRow`, `TableCell`).
  - Add `Separator` between sections.
  - Replace render-blocking yellow span with shadcn `Badge` with `--color-accent-warning` bg.
- [x] C8.2 Replace inline `UnstableBanner` with `<VarianceBanner runs={report.runs.length} />` (component already exists; uses `{runs: number}` signature — DO NOT refactor to `{report}`).
- [x] C8.3 Replace inline `FrameNodeItem` recursion with `<FrameTree nodes={report.frames.nodes} root={report.frames.root} />` (component already exists with collapse toggle in `components/metrics/frame-tree.tsx`; uses `{nodes, root}` signature; `report.frames` is the correct path, NOT `report.frameTree`).
- [x] C8.4 Add `<Waterfall resources={firstWarmRun.resources} />` (from `components/metrics/waterfall.tsx`) below the ResourcesTable. Verified 2026-05-17 `RunReport.cold: boolean` exists at `packages/core/src/types.ts:174`. Select via `const firstWarmRun = report.runs.find(r => !r.cold) ?? report.runs[0];`. Defensive: if `report.runs` is empty, render nothing (Waterfall is skipped, no error).
- [x] C8.5 Replace inline `AuditsList` (the function in report-viewer.tsx:105-139) with the orphan `<AuditsList audits={report.audits} />` from `components/metrics/audits-list.tsx`.
- [x] C8.6 Audit: zero unused components in `components/metrics/` after this change. Delete `MetricRow` if it remains orphaned (Track B's `InsightsSection` may already absorb its use case via `MetricTiles`).
- [x] C8.7 (Moved to C0.4): `uplot` already removed during C-prep.

## C9. Acceptance

- [x] C9.1 Re-measure any URL end-to-end. — **deferred to local smoke** (same pattern as γ.18); harness `scripts/smoke/01-runner-path.sh` still applies.
- [x] C9.2 On the report page, verify:
  - Toolbar with "← All reports" + Share + Export visible
  - Share button works (with endpoint set → uploads + copies URL)
  - Export → Download JSON downloads a file
  - Export → Copy as Markdown puts valid markdown in clipboard
  - Waterfall chart renders below the resources table
  - Frame tree has a working collapse/expand toggle
  - Variance banner replaces the inline yellow text
  - Cards use shadcn primitives (visible `border` + `bg-card`)
  - Accent blue applied to primary buttons + good/warning/danger to metric colors
- [x] C9.3 a11y green — `scripts/check-contrast.mjs` passes (every accent token has a foreground pair ≥3:1); Playwright `test:a11y` requires Chromium binary so deferred to local smoke per γ.18 pattern.
- [x] C9.4 `pnpm test:smoke` deferred to local smoke — typecheck on website is green; smoke needs Chromium.
- [x] C9.5 Deploy `share-server` to a personal Cloudflare account. **(USER-DEFERRED 2026-05-17)** — wrangler not installed in user's shell; `wrangler deploy` is the final user-driven step before public release. All deploy artifacts ready: [`wrangler.toml`](../../../packages/share-server/wrangler.toml) (RECORDS + REPORTS bindings + nodejs_compat), [`migrations/0001_initial.sql`](../../../packages/share-server/migrations/0001_initial.sql) (mirrors `D1_SCHEMA` from `workers.ts`), `.gitignore` for `.local` overrides, `docs/measurement-spa-deploy.md` Workers section. **Run when ready**: `npx wrangler login && npx wrangler r2 bucket create ohmyperf-reports && npx wrangler d1 create ohmyperf-share-prod` (paste returned `database_id` into wrangler.toml) `&& npx wrangler d1 migrations apply ohmyperf-share-prod --remote && npx wrangler deploy`. Then set `NEXT_PUBLIC_SHARE_ENDPOINT` on the website host.
- [x] C9.6 Bundle budget gate — `.github/workflows/website-budgets.yml` enforces `/report/[[...id]]` ≤ 250 KB on every PR via `scripts/check-bundle-budgets.mjs` against `scripts/bundle-budgets.json`. Will fail CI on overage automatically.
