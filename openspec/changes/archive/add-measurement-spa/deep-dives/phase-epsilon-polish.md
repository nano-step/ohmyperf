# Phase ε — Polish + a11y + dogfood CI: code-level spec

**Bottom line**: Phase ε wraps the SPA with shippable polish (history search, cancellation, skeletons, empty states), enforces dogfood-quality bars (a11y, bundle budgets, self-measured CWV, no-tracker telemetry), and produces deploy/operator docs. **Effort: Medium (1–2d).**

Anchors:
- Bundle/dogfood thresholds: `design.md` D11/D12 (LCP<2500, INP<200, CLS<0.10; `/` ≤150KB gzipped)
- A11y: `spec.md` lines 251–264 — WCAG 2.1 AA, zero `serious`/`critical` axe violations on `/`, `/measure`, `/report/[id]`, `/viewer`, `/report`
- Telemetry: REVIEW.md R6 → new spec scenario in §J
- CI: SPA-only, Ubuntu-only (§N)

---

## A. History page (`/report`) — UX + perf

**File**: `apps/website/app/report/page.tsx` (extends γ.14 scaffold)
**Storage**: `apps/website/lib/storage.ts` — add `listReportsPage`, `deleteReports`

### A.1 Cursor pagination (20/page, newest first)

```ts
export interface ReportSummary {
  id: string; url: string; createdAt: number;
  mode: 'real' | 'ci-stable'; sizeBytes: number;
}

export async function listReportsPage(opts: {
  cursorKey?: number;
  limit?: number;
  mode?: 'real' | 'ci-stable';
  urlSubstring?: string;
}): Promise<{ items: ReportSummary[]; nextCursor: number | null }> {
  const db = await openDb();
  const tx = db.transaction('reports', 'readonly');
  const idx = tx.store.index('by-createdAt');
  const range = opts.cursorKey != null
    ? IDBKeyRange.upperBound(opts.cursorKey, true) : undefined;
  const limit = opts.limit ?? 20;
  const items: ReportSummary[] = [];
  let cursor = await idx.openCursor(range, 'prev');
  const needle = opts.urlSubstring?.toLowerCase();
  while (cursor && items.length < limit) {
    const v = cursor.value;
    const passMode = !opts.mode || v.mode === opts.mode;
    const passUrl = !needle || v.url.toLowerCase().includes(needle);
    if (passMode && passUrl) items.push({ /* ... summary ... */ });
    cursor = await cursor.continue();
  }
  return { items, nextCursor: items.length === limit ? items[items.length - 1].createdAt : null };
}

export async function deleteReports(ids: string[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('reports', 'readwrite');
  await Promise.all(ids.map(id => tx.store.delete(id)));
  await tx.done;
}
```

URL substring = client-side filter. Mode filter via post-scan (not key range). Acceptable up to ~4k reports.

### A.2 Page component contract

- State: `query` (debounced 200ms), `mode` (`'all'|'real'|'ci-stable'`), `selected: Set<string>`, `pages`, `nextCursor`
- Render: `<Toolbar>` (search + mode select + bulk-delete) → `<List>` → `<LoadMoreButton>`
- Bulk delete: shadcn `<Dialog>` confirm → `deleteReports` → refresh page 1
- Empty state: §D

---

## B. Job cancellation end-to-end

### B.1 Store

```ts
interface State {
  currentJob: { id: string; status: 'queued'|'running'|'cancelling'|'cancelled'|'done'|'error'; backend: 'extension'|'runner' } | null;
  cancelCurrentJob: () => Promise<void>;
}
```

Flow: `status='cancelling'` → abort local AbortController (closes SSE/port) → backend-specific cancel → mark IDB `jobs.status='cancelled'` → toast.

### B.2 Runner path

```ts
async function cancelJob(baseUrl: string, jobId: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${baseUrl}/api/jobs/${jobId}`, { method: 'DELETE', signal });
  if (!res.ok && res.status !== 404) throw new Error(`cancel failed: ${res.status}`);
}
```

Runner-side: `playwrightContext.close({ reason: 'cancelled' })`, emit SSE `{ type: 'cancelled' }`, close stream, 204.

### B.3 Extension path

```ts
export async function cancelJob(extensionId: string, jobId: string): Promise<void> {
  await chrome.runtime.sendMessage(extensionId, { type: 'ohmyperf/cancel', jobId });
}
```

Background: find job → `chrome.debugger.detach` → `chrome.tabs.remove(targetTabId)` → post `{ type: 'cancelled' }` → close port.

### B.4 IDB markers

Cancelled jobs without partial report don't appear in `/report` (keyed off reports store, not jobs). Defer "Failed/cancelled attempts" tab to v1.5.

---

## C. Skeleton loading inventory

Use shadcn `<Skeleton>`. Show after 200ms (avoid flash for fast paths). Custom hook `lib/use-delayed.ts`.

| Where | Trigger | Component | Budget |
|---|---|---|---|
| `app/page.tsx` hero | Backend detector pending | `<BackendCardSkeleton>` | ≤800ms |
| `app/measure/page.tsx` post-submit | Job not yet running | `<ProgressStreamSkeleton>` | until first SSE event |
| `app/measure/page.tsx` SSE connecting | After 202, before first event | inline spinner | 0–2s |
| `app/report/[[...id]]/page.tsx` | IDB read | `<ReportSkeleton>` | 100–500ms |
| `app/report/page.tsx` | First load | `<HistorySkeleton rows={5}>` | 50–200ms |

---

## D. Empty states inventory

| Route / Condition | Component | Copy | CTA |
|---|---|---|---|
| `/report` zero rows | `<EmptyState>` | "No reports yet — measure your first URL." | Link to /measure |
| `/measure` backend=none | `<BackendCard kind="none">` | "No backend detected." | Install extension + docker-compose buttons |
| `/viewer` no file | `<DropZone empty>` | "Drop a `report.json` file to view." | (drop target = affordance) |
| `/viewer` invalid JSON | `<DropZone error>` | "That doesn't look like an OhMyPerf report." + `<details>` | "Try another file" |
| `/report/[id]` not found | full-page `<EmptyState>` | "Report not found." | Back to /report |
| `/measure` runs>1 + extension | `<Alert>` (not empty state) | "Multi-run requires local runner." | (auto-clamps to 1) |

Reusable: `components/empty-state.tsx`.

---

## E. a11y CI integration

### E.1 Install

```bash
pnpm --filter @ohmyperf/website add -D @axe-core/playwright @playwright/test
```

### E.2 `tests/a11y.spec.ts`

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = [
  { path: '/', name: 'landing' },
  { path: '/measure', name: 'measure' },
  { path: '/viewer', name: 'viewer' },
  { path: '/report', name: 'history' },
  { path: '/report/sample-fixture-id/', name: 'report-detail' },
];

const DISABLED_RULES: string[] = []; // re-enable color-contrast if FPs hit

test.beforeAll(async () => {
  // Seed IDB with fixture report via page.addInitScript before each test
});

for (const route of ROUTES) {
  test(`a11y: ${route.name} (${route.path})`, async ({ page }) => {
    await page.goto(route.path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(DISABLED_RULES)
      .analyze();
    const blocking = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}
```

### E.3 `playwright.config.ts`

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: { baseURL: process.env.OMO_TEST_URL ?? 'http://127.0.0.1:3000' },
  webServer: process.env.OMO_TEST_URL ? undefined : {
    command: 'pnpm --filter @ohmyperf/website start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

---

## F. Keyboard navigation manual test plan

`apps/website/tests/MANUAL-keyboard.md` — run before each release. Tests:

- `/` Tab order: skip-link → logo → nav → URL input → Measure → secondary CTAs; visible focus ring; Enter submits when filled
- `/measure` autofocus; backend card reachable; Cancel via Tab+Enter; Esc no-op
- `/report/[id]` CWV gauges aria-label="LCP 1.2s, Good"; role="img"; Tab order: back → tiles → waterfall → frame tree → audits
- `/viewer` drop zone Tab+Enter opens file picker; post-drop focus moves to content
- `/report` search autofocus; row Open/Delete reachable; dialogs Esc cancel/Enter confirm/focus restore
- Dialogs: Esc closes, Tab cycles inside (focus trap), initial focus on primary action
- CWV gauge ARIA:
  ```tsx
  <div role="img" aria-label={`${metricName} ${formatValue(median, unit)}, ${rating}`}>
    <canvas ref={canvasRef} />
    <p className="sr-only">{/* full description */}</p>
  </div>
  ```

---

## G. Bundle budget enforcement

### G.1 `next.config.mjs`

```js
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
  analyzerMode: 'json',
});

export default withBundleAnalyzer({
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
});
```

### G.2 `scripts/bundle-budgets.json` (single source of truth)

```json
{
  "budgets": [
    { "route": "/", "maxGzipKB": 150 },
    { "route": "/measure", "maxGzipKB": 200 },
    { "route": "/report/[[...id]]", "maxGzipKB": 250 },
    { "route": "/viewer", "maxGzipKB": 250 },
    { "route": "/report", "maxGzipKB": 100 }
  ]
}
```

### G.3 `scripts/check-bundle-budgets.mjs`

Parses `.next/app-build-manifest.json`, computes gzip size of each route's chunks, fails on overage. Uses `zlib.gzipSync(level=9)`. Verify manifest path on first build.

### G.4 GitHub Actions

`.github/workflows/website-budgets.yml`:

```yaml
name: website-budgets
on:
  pull_request:
    paths: ['apps/website/**', 'packages/viewer/**', 'scripts/bundle-budgets.json', 'scripts/check-bundle-budgets.mjs']
  push: { branches: [main] }
jobs:
  budget:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22.x, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @ohmyperf/website build
      - run: node scripts/check-bundle-budgets.mjs
```

---

## H. Dogfood CI gate

`.github/workflows/dogfood.yml`:

```yaml
name: dogfood
on:
  schedule: [{ cron: '0 6 * * 1' }]
  workflow_dispatch:
    inputs:
      target_url: { description: 'Override target URL', required: false }
  pull_request:
    paths: ['apps/website/**', 'packages/viewer/**', 'packages/core/**']

concurrency:
  group: dogfood-${{ github.ref }}
  cancel-in-progress: true

jobs:
  measure-self:
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22.x, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec turbo run build --filter=@ohmyperf/website --filter=@ohmyperf/cli

      - name: Serve static SPA on :4173
        run: |
          npx --yes http-server apps/website/out -p 4173 -a 127.0.0.1 --silent &
          echo "SPA_PID=$!" >> "$GITHUB_ENV"
          for i in {1..20}; do
            curl -fsS http://127.0.0.1:4173/ > /dev/null && break
            sleep 0.5
          done

      - run: node apps/cli/bin/ohmyperf.mjs install-browser

      - name: Measure SPA against itself
        env:
          TARGET_URL: ${{ github.event.inputs.target_url || 'http://127.0.0.1:4173/' }}
        run: |
          node apps/cli/bin/ohmyperf.mjs run "$TARGET_URL" \
            --runs 5 --mode ci-stable \
            --output ./dogfood-out --format json,markdown --plugins all

      - run: node scripts/assert-perf-budget.mjs dogfood-out/report.json
      - if: always()
        run: kill "$SPA_PID" || true
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: dogfood-report
          path: dogfood-out/
```

### H.2 `scripts/assert-perf-budget.mjs`

```js
const BUDGETS = {
  lcp: { max: 2500, unit: 'ms' },
  inp: { max: 200, unit: 'ms' },
  cls: { max: 0.10, unit: '' },
};
// Walk report.metrics (or report.runs.aggregate.{lcp,inp,cls}.median per frozen schema)
// Fail if any median > budget.max.
```

Verify accessor against `@ohmyperf/core` 1.0 frozen Report schema before merging workflow.

---

## I. Self-measurement caveat

**Risk**: HMR dev server payload skew + same-tab recursion.

**Mitigation**: CI builds static export → `http-server` on `127.0.0.1:4173` → CLI measures via Playwright (separate process). No recursion path exists.

**Production dogfood** (optional): weekly cron measures `https://ohmyperf.dev` directly. Keep CI version pinned to localhost build to isolate regressions to PR's bundle, not CF Pages caching.

---

## J. Telemetry verification (REVIEW.md R6)

### J.1 `tests/no-telemetry.spec.ts`

Maintained tracker domain list (Google Analytics, Segment, Mixpanel, Hotjar, Sentry, Datadog, Posthog, Facebook, TikTok, Vercel/CF Insights, Plausible, Umami, …). Iterates 4 flows (landing-only, submit-form, viewer-route, history-route). Asserts zero requests to any tracker domain.

```ts
const TRACKER_DOMAINS = [/* … see full content */];
const FLOWS = [/* … */];

for (const flow of FLOWS) {
  test(`no telemetry: ${flow.name}`, async ({ page }) => {
    const tracker: Request[] = [];
    page.on('request', req => {
      const host = new URL(req.url()).hostname;
      if (TRACKER_DOMAINS.some(d => host === d || host.endsWith(`.${d}`))) tracker.push(req);
    });
    await flow.steps(page);
    await page.waitForLoadState('networkidle');
    expect(tracker.map(r => r.url())).toEqual([]);
  });
}
```

### J.2 Spec.md addition

Append to `openspec/changes/add-measurement-spa/specs/measurement-spa/spec.md`:

```markdown
### Requirement: No third-party telemetry

The SPA SHALL make zero network requests to known analytics or tracking
domains during any user-facing flow on `/`, `/measure`, `/viewer`, or `/report`.

#### Scenario: Telemetry-free landing and flows

- **WHEN** a Playwright test loads `/`, `/measure`, `/viewer`, and `/report`,
  and submits the URL form
- **THEN** zero requests SHALL be made to hostnames in the maintained
  tracker-domain list (`apps/website/tests/no-telemetry.spec.ts`)
```

---

## K. Documentation deliverables

### K.1 `apps/website/README.md`

Quickstart, env vars, deploy targets, testing & dogfood policy, troubleshooting (No backend detected, IDB quota, PNA/CORS).

### K.2 `apps/runner/README.md`

Quickstart (docker compose up), env reference table, security model (SSRF + CORS + PNA + rate limit + bind-to-loopback), opt-out flags, troubleshooting.

### K.3 `docs/measurement-spa-deploy.md`

- Static SPA on Cloudflare Pages (canonical) — build cmd, output, env, headers
- GitHub Pages (alternative) — workflow yaml example
- Vercel (alternative) — vercel.json with rewrites for /report/[id]
- Local runner via docker-compose — health check
- Self-host runner on a server — bind 0.0.0.0, reverse proxy + TLS, CORS allowlist, SSRF caveat

### K.4 Root README updates

Replace surface row 4: `**Website (SPA)**` → Next.js SPA. Add note: legacy static landing superseded.

### K.5 `add-ohmyperf-mvp/tasks.md` §10.1 superseded

```
- [x] 10.1 ~~Static landing at apps/website/static/index.html~~ — **SUPERSEDED** by `add-measurement-spa`.
```

---

## L. E2E test plan (ε.15)

### Files
- `apps/website/tests/e2e/landing.spec.ts`
- `apps/website/tests/e2e/measure-runner.spec.ts` (mocked runner via `page.route()` + SSE body)
- `apps/website/tests/e2e/viewer.spec.ts`
- `apps/website/tests/e2e/history.spec.ts`
- `apps/website/tests/fixtures/sample-report.json` (from `@ohmyperf/core` fixtures)

### Cases

- Landing: heading + form visible
- Backend detector "none" without extension/runner
- Mock runner: form → SSE → progress → final metrics at `/report/:id`
- Viewer: drop sample JSON → dashboard renders LCP
- History: seeded IDB → list shows 3 fixture reports

### Extension E2E — skipped in v1

Playwright `--load-extension` flaky for MV3 in CI. Document manual smoke test in `apps/extension-chrome/MANUAL-smoke.md`. Revisit v1.5.

---

## M. openspec validate + archive

```bash
pnpm exec openspec validate add-measurement-spa --strict --no-interactive
# Fix any issues; repeat.

pnpm exec openspec archive add-measurement-spa --no-interactive

ls openspec/specs/measurement-spa/  # verify promotion
```

Update root README post-archive to point to `openspec/specs/measurement-spa/`.

---

## N. Open questions answered

### Q1: 5-platform matrix for SPA tests?

**Ubuntu-only.** SPA is static export; build artifact platform-independent. Playwright in Chromium behaves identically across hosts for SPA routes. The 5-platform matrix exists for engine/CLI where filesystem/process differs. Saves ~5× CI minutes for ≈ 0 added signal. Document asymmetry in `templates/ci/README.md`.

### Q2: Vercel or CF Pages for production guide?

**Cloudflare Pages canonical**, GitHub Pages + Vercel as alternatives in same doc. Zero cloud cost goal; CF free tier generous; `ohmyperf.dev` runs on CF Pages.

---

## Watch out for

- **Next.js 15 manifest path drift** — verify `.next/app-build-manifest.json` on first build; lock path in script comment.
- **Frozen Report schema path** in `assert-perf-budget.mjs` — confirm `metrics[*].median` vs `runs.aggregate.lcp.median` against types.
- **Tracker domain list staleness** — quarterly review; CODEOWNERS on `no-telemetry.spec.ts` to force review on edits.

## Future (out of scope)

1. Extension E2E via Playwright MV3 once stable (v1.5)
2. "Failed/cancelled attempts" tab in `/report`
