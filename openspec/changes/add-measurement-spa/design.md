# Design — Interactive Measurement SPA + Local Runner

## Goals

1. **Zero-friction first measurement** on landing page: user enters URL → sees CWV results without leaving the site.
2. **Zero cloud cost** for production deployment (`ohmyperf.dev` = static export on CF Pages).
3. **Two measurement paths** with identical `Report` output: (a) Chrome extension via `chrome.debugger` for instant zero-infra path; (b) Docker-self-host Node runner via Playwright for users who prefer not to install extension OR are on Firefox/Safari.
4. **Reuse frozen engine** (`@ohmyperf/core` 1.0) without modification.
5. **Dogfood**: SPA itself must pass OhMyPerf's own CWV gate on its landing page.

## Architecture overview

```
User browser (Chromium-based, Chrome/Edge ideal)
│
├── apps/website (Next.js 15 static export)
│   │
│   ├── Landing /  ──┐
│   ├── /measure  ───┤── URL form ──► BackendDetector ──┐
│   ├── /report/[id] ┤                                   │
│   ├── /viewer  ────┤                                   ▼
│   └── /report  ────┘                          ┌──────────────────┐
│                                               │ Which backend?   │
│                                               └─┬──────────────┬─┘
│                                          ext ▼              ▼ runner
│                              ┌────────────────────┐  ┌──────────────────┐
│                              │ extension-bridge   │  │ runner-client    │
│                              │ chrome.runtime     │  │ fetch + SSE      │
│                              │   .sendMessage     │  │ http://localhost │
│                              │ chrome.runtime     │  │   :5174          │
│                              │   .connect (port)  │  │                  │
│                              └────────┬───────────┘  └────────┬─────────┘
│                                       │                       │
└───────────────────────────────────────┼───────────────────────┼────────
                                        │                       │
                                        ▼                       ▼
                          ┌──────────────────────┐    ┌──────────────────────┐
                          │ apps/extension-chrome│    │ apps/runner          │
                          │ (MV3, chrome.debugger│    │ (Hono + Node 20      │
                          │  driver)             │    │  + Playwright,       │
                          │                      │    │  Docker self-host)   │
                          │ onMessageExternal:   │    │                      │
                          │  ping/measure/cancel │    │ POST /api/measure    │
                          │ port-based progress  │    │ GET  /api/jobs/:id/  │
                          │ stream back to SPA   │    │      events (SSE)    │
                          │                      │    │ GET  /api/health     │
                          │ Uses                 │    │                      │
                          │  @ohmyperf/core      │    │ Uses                 │
                          │  @ohmyperf/driver-   │    │  @ohmyperf/core      │
                          │  extension           │    │  @ohmyperf/driver-   │
                          └──────────┬───────────┘    │  playwright          │
                                     │                └──────────┬───────────┘
                                     │                           │
                                     ▼                           ▼
                              CDP (chrome.debugger)         CDP (Playwright)
                                     │                           │
                                     ▼                           ▼
                              Target page + OOPIFs        Target page + OOPIFs
                              (in a NEW tab spawned       (in Playwright-managed
                               by extension)               Chromium in container)
                                     │                           │
                                     └─────────┬─────────────────┘
                                               ▼
                                          Report (frozen 1.0 schema)
                                               │
                                               ▼
                                       IndexedDB via idb
                                               │
                                               ▼
                                    /report/[id] dashboard render
```

## Component-level decisions

### D1 — Same-tab UX (Q1 user decision = new-tab + stream back)

When user submits URL form on landing:

1. SPA calls `extensionBridge.measure(url, options)` → bridge sends `chrome.runtime.sendMessage(EXT_ID, { type: 'ohmyperf/measure', url })`.
2. Extension background opens NEW tab via `chrome.tabs.create({ url, active: false })`.
3. Extension attaches `chrome.debugger` to the new tab, runs engine, streams progress events back via `chrome.runtime.connect`-style port to SPA.
4. On completion, extension closes the new tab (or leaves open per user preference).
5. SPA receives final Report, saves to IndexedDB, routes to `/report/[id]`.

If using local runner path, runner spawns its OWN Playwright Chromium (no tab needed on user side).

### D2 — Backend detection (Q2 default mode = real, 5 runs)

`apps/website/lib/backend-detector.ts` runs both pings in parallel with 800ms timeout:

```ts
export type Backend =
  | { kind: 'extension'; extensionId: string; version: string }
  | { kind: 'runner'; baseUrl: string; version: string }
  | { kind: 'none' };
```

Order of preference: extension > runner > none. UI surfaces detected backend with clear CTAs:

- `extension` → green badge "Chrome extension v0.x.x ready"
- `runner` → green badge "Local runner at localhost:5174"
- `none` → call-to-action card: "Install Chrome extension" + "Or run `docker-compose up` from [GitHub link]"

### D3 — Default measurement options (Q2)

Form defaults:
- `mode: 'real'`
- `runs: 5`
- `cacheMode: 'cold-then-warm'` (run 1 cold, runs 2..5 warm)

Advanced collapse exposes:
- mode toggle (real / ci-stable)
- runs slider (1–10)
- cacheMode select
- includeTrace checkbox
- pluginConfig text input (advanced users only)

### D4 — Multi-run on extension (Q3 = v1 single-run only)

Extension `onMessageExternal` handler validates `request.runs <= 1` (else return error `"Extension supports single-run only; install local runner for multi-run statistics"`).

SPA UI:
- Backend detected as `extension` → form's `runs` slider clamped to 1, shows tooltip "Multi-run requires local runner."
- Backend detected as `runner` → slider unrestricted (1–10).

Document trade-off in `/docs` or runner README.

### D5 — Drag-drop viewer port to React (Q4)

`packages/viewer/` currently exports `renderReportHtml(report: Report): string`. We add:

- NEW: `packages/viewer/src/react/ReportViewer.tsx` — full React component tree mirroring HTML output (CWV summary tiles, waterfall, frame tree, audits list, redaction badges, schema version gate).
- PRESERVE: `renderReportHtml` for `@ohmyperf/reporter-html` (used by CLI).
- Both share `packages/viewer/src/format.ts` for ms/bytes/threshold formatters.

SPA imports `@ohmyperf/viewer` for `<ReportViewer report={...} />` on `/viewer` and `/report/[id]`.

Implementation: extract render logic into framework-agnostic functions, then thin React wrapper. Maintain test parity (`render.test.ts` covers both outputs).

### D6 — IndexedDB schema (D5 + storage)

```ts
interface OmoDB extends DBSchema {
  reports: {
    key: string;            // report.id (uuid)
    value: { id: string; url: string; createdAt: number; mode: 'real'|'ci-stable'; sizeBytes: number; report: Report };
    indexes: { 'by-createdAt': number; 'by-url': string };
  };
  jobs: {
    key: string;
    value: { id: string; url: string; status: JobStatus; startedAt: number; finishedAt?: number; reportId?: string; error?: string };
  };
}
```

Quota policy: total `sum(sizeBytes) <= 200MB`. When new report exceeds budget, evict oldest by `by-createdAt` index until under. Toast notification: "Removed N old reports to make room."

### D7 — Runner HTTP contract

```
POST /api/measure
  body: { url: string; runs?: number; mode?: 'real'|'ci-stable'; cacheMode?: string; plugins?: PluginConfig[] }
  response 202: { jobId: string }
  errors: 400 (validation), 403 (SSRF blocked), 429 (rate limit), 500

GET /api/jobs/:id/events  (SSE, text/event-stream)
  events:
    - { type: 'queued' }
    - { type: 'run-start', runIndex: 0, totalRuns: 5 }
    - { type: 'navigation', runIndex: 0, phase: 'started' | 'committed' | 'loaded' | 'idle' }
    - { type: 'metric', runIndex: 0, name: 'lcp', value: 1234 }
    - { type: 'run-complete', runIndex: 0 }
    - { type: 'complete', report: Report }
    - { type: 'error', code: string, message: string }

GET /api/jobs/:id
  response 200: { id, status: 'queued'|'running'|'done'|'error', report?: Report, error?: string }
  (poll fallback when SSE unavailable)

GET /api/health
  response 200: { ok: true, version: string, engine: string, browser: { source: "bundled" | "system" | "extension-host", version: string } }
```

`browser.source` literals are pinned to `packages/core/src/types.ts:135` BrowserInfo union. Runner path emits `"bundled"` (Playwright bundled Chromium); extension path emits `"extension-host"` (chrome.debugger driver). NEVER use `"extension"` or `"playwright"` — those are NOT in the union and will fail typecheck.

```
```

CORS allowlist (echoed Origin, not `*`):
- `https://ohmyperf.dev`
- `http://localhost:3000` (SPA dev)

Private Network Access preflight: respond `Access-Control-Allow-Private-Network: true` for allowlisted origins. Apply to all `/api/*` routes.

Bind to `127.0.0.1` only by default. Env `OHMYPERF_RUNNER_BIND=0.0.0.0` for explicit LAN exposure.

### D8 — SSRF guard

`apps/runner/src/ssrf-guard.ts`:

```ts
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

const BLOCKED_RANGES = [
  '10.0.0.0/8','172.16.0.0/12','192.168.0.0/16',
  '127.0.0.0/8','169.254.0.0/16',
  '::1/128','fc00::/7','fe80::/10'
];
const BLOCKED_HOSTS = ['localhost','metadata.google.internal','metadata.googleapis.com'];

export async function assertSafeUrl(raw: string): Promise<void> {
  const u = new URL(raw);
  if (!['http:','https:'].includes(u.protocol)) throw new Error('Only http/https');
  if (BLOCKED_HOSTS.includes(u.hostname)) throw new Error(`Blocked host: ${u.hostname}`);
  if (process.env.OHMYPERF_RUNNER_ALLOW_PRIVATE === '1') return;
  const { address } = await lookup(u.hostname);
  const addr = ipaddr.parse(address);
  for (const r of BLOCKED_RANGES) {
    const [net, bits] = r.split('/');
    const range = ipaddr.parse(net);
    if (addr.kind() === range.kind() && (addr as any).match(range, Number(bits))) {
      throw new Error(`Refusing to measure private/loopback address ${address} (set OHMYPERF_RUNNER_ALLOW_PRIVATE=1 to override)`);
    }
  }
}
```

### D9 — Extension manifest update

```jsonc
{
  "manifest_version": 3,
  "name": "OhMyPerf",
  "version": "0.0.0",
  "permissions": ["debugger", "storage", "activeTab", "tabs"],
  "host_permissions": ["<all_urls>"],
  "externally_connectable": {
    "matches": [
      "https://ohmyperf.dev/*",
      "https://*.ohmyperf.dev/*",
      "http://localhost:3000/*",
      "http://127.0.0.1:3000/*"
    ]
  },
  "background": { "service_worker": "background.bundle.js", "type": "module" },
  "action": { "default_title": "Measure performance on this tab" },
  "web_accessible_resources": [{ "resources": ["viewer.html","viewer.bundle.js"], "matches": ["<all_urls>"] }],
  "minimum_chrome_version": "116"
}
```

Note: `"tabs"` permission added so extension can spawn new tab for same-tab UX (D1).

### D10 — Static export + dynamic routes

`apps/website/next.config.mjs`:
```js
export default { output: 'export', trailingSlash: true, images: { unoptimized: true } };
```

For `/report/[id]`:
- Use catch-all: `app/report/[[...id]]/page.tsx`
- `export const dynamic = 'force-static'` + `export const dynamicParams = false`
- `generateStaticParams` returns `[]`
- Page reads `useParams()` client-side, hydrates from IndexedDB

Fallback if Next.js 15 misbehaves: drop dynamic routes, use `/report?id=...` with `useSearchParams()`. Test in Phase β.

### D11 — Bundle budgets (CI-enforced)

Add `@next/bundle-analyzer` to CI. Fail PR if any of:
- Landing `/` first-load JS > 150KB gzipped
- `/measure` first-load JS > 200KB gzipped
- `/report/[[...id]]` first-load JS > 250KB gzipped

Recharts is dynamic-imported via `next/dynamic({ ssr: false })` so it never enters the landing bundle.

### D12 — Dogfood gate (CI)

Weekly cron in GitHub Actions:
```yaml
- run: pnpm --filter @ohmyperf/cli build
- run: ./apps/cli/bin/ohmyperf run https://ohmyperf.dev --mode ci-stable --runs 5 --format json
- run: node scripts/assert-perf-budget.mjs ohmyperf-out/report.json
```

`scripts/assert-perf-budget.mjs` asserts:
- LCP median < 2500ms
- INP median < 200ms
- CLS median < 0.10
- Bundle JS gzipped < 150KB

## Risk mitigations

| Risk (from Brief) | Mitigation |
|---|---|
| MV3 SW dies mid-measurement | v1: extension single-run only (D4). Document. |
| PNA blocks https → localhost | Runner sets `Access-Control-Allow-Private-Network: true` (D7). Surface specific error UX. |
| `chrome.debugger` + DevTools conflict | Extension detects via `chrome.debugger.attach` error; SPA shows "Close DevTools on target page" guidance. |
| Same-tab measure not possible | New-tab spawn pattern (D1). |
| externally_connectable CWS re-review | Schedule submission early in Phase δ; document in release plan. |
| Reports too big for localStorage | IndexedDB via idb (D6). Quota eviction. |
| Next.js 15 static + dynamic routes churn | Fallback to `/report?id=...` (D10). Prototype in Phase β. |
| Playwright Docker 1.4GB | Document honestly; provide `Dockerfile.slim` alt using system Chromium. |
| Tailwind v4 + shadcn/ui compat | Pin Tailwind v4 minor; use latest shadcn CLI. |
| Bundle bloat ruins own CWV | CI-enforced budgets (D11) + dogfood gate (D12). |
| CORS/PNA error opacity | Custom error parser in `runner-client.ts` → specific remediation messages. |
| Extension measuring same tab impossible | New-tab pattern + refuse self-measurement (D1). |

## Out-of-scope for this change

- Cloud-hosted runner (user rejected)
- Comparison/diff UI in SPA (CLI exists, defer to v1.5)
- Mobile-first responsive dashboard (desktop ≥1024px target, toast on smaller)
- VI translation copy (next-intl scaffold ready, copy = TODO v1.5)
- Authenticated page scenario uploads from SPA
- Print/PDF export
- Cross-device sync
- Telemetry instrumentation
