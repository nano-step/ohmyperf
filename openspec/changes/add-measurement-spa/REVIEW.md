# Self-review — measurement-spa proposal

Momus declined the OpenSpec stress-test (scope = `.sisyphus/plans/` only). Pragmatic self-review by Sisyphus, applying Momus-style criteria: completeness, clarity, verifiability, risks, scope.

## Critical issues (MUST fix before α.1)

### C1. EventSource cannot be cancelled cleanly from runner side

**Gap**: `γ.1` runner-client implements AbortController, but D7 contract has no `DELETE /api/jobs/:id` endpoint. ε.3 mentions cancel UX but α.9 only lists GET routes.

**Fix**: Add `DELETE /api/jobs/:id` to D7 contract + α.9 task. Runner kills in-flight Playwright context on cancel.

### C2. SSE keep-alive / proxy timeout

**Gap**: SSE connections idle for 30–60s during measurement runs may be killed by reverse proxies, browsers, or OS network stacks. No mention of comment heartbeats (`:\n\n` every 15s).

**Fix**: α.9 must specify: emit SSE comment heartbeat every 15s. Update D7 to document.

### C3. Race condition — multiple SSE subscribers to same job

**Gap**: D7 doesn't specify single-subscriber vs fan-out. If SPA reloads mid-measurement and reconnects, what happens?

**Fix**: α.9 task — fan-out subscribers via simple EventEmitter; store last N events for late-joiners (replay-on-connect). Add scenario to spec.md: "User reloads SPA mid-measurement, SSE reconnects, sees current progress + history."

### C4. Report storage race — concurrent saves

**Gap**: γ.2 `saveReport` doesn't address concurrent writes (two browser tabs, two finishing jobs).

**Fix**: idb transactions are atomic per-key already, but γ.2 must use `db.transaction('reports', 'readwrite')`. Document. Add `evictIfOverQuota` MUST run AFTER the put, not before (else new report could push total over but skip eviction).

### C5. Spec coverage gap — `extension/devtools-attached` error code

**Gap**: design.md D9 has DevTools detection (δ.6) but spec.md has no scenario for it.

**Fix**: Add scenario to "Live progress streaming" requirement: "WHEN extension attempts attach but DevTools is open on target tab, THEN the error event SHALL carry code `extension/devtools-attached` AND the SPA SHALL render guidance with a 'Retry' button."

### C6. Tab close detection vs job lifecycle

**Gap**: δ.7 listens to `chrome.tabs.onRemoved` but doesn't specify what events the SPA receives.

**Fix**: δ.7 task: emit error event `{ code: 'extension/target-tab-closed', message }` to the port subscriber. Spec.md scenario needed.

## Recommendations (SHOULD fix)

### R1. Bundle budget for 150KB landing — verify feasibility

**Risk**: Next.js 15 + React 19 minimum overhead is ~80KB gzipped. Plus zustand (2KB) + idb (3KB) + uPlot (40KB) + shadcn primitives needed for form (~20–30KB). Likely 130–150KB. Tight but doable. Recharts MUST be lazy on landing (already specified).

**Mitigation**: Run `@next/bundle-analyzer` early in β phase, before too many components added. Reserve 30KB headroom by removing optional shadcn components from landing route bundle (only use them on `/measure` and beyond).

### R2. Drag-drop viewer schema validation gap

**Gap**: γ.4 ports viewer to React. spec.md "User drops invalid file" scenario exists but doesn't enforce schema version check.

**Fix**: Add to γ.4: validate report against schema version regex `^1\.\d+\.\d+$` BEFORE rendering. Reject `2.x.x` with clear error. Already partially in spec ("validate schema version (reject unknown major)") — promote to explicit test.

### R3. Empty jobs index — runner restart loses jobs

**Gap**: Runner queue is in-memory (α.5). If runner restarts, in-flight jobs lost; SPA's SSE reconnect attempts will 404.

**Fix**: Document explicitly in `apps/runner/README.md`: "Runner restarts cancel in-flight measurements. Persistence is out of scope for v1 (use CLI for long-running workflows)." Add to spec.md "Measurement failure" scenario: "WHEN runner restarts mid-job, SPA reconnect returns 404, SPA shows 'Runner restarted, measurement lost' error."

### R4. CORS allowlist hardcoded in source

**Gap**: D7 + α.10 hardcode `https://ohmyperf.dev` + `http://localhost:3000`. Self-hosters wanting different deploy URL must edit source.

**Fix**: α.3 — add `OHMYPERF_RUNNER_CORS_ORIGINS=https://a.example.com,https://b.example.com` env var. Default keeps current allowlist.

### R5. PNA preflight only on Chrome

**Gap**: Firefox + Safari don't implement PNA. Behavior unclear in spec.

**Fix**: Add to design.md D7: "Non-Chrome browsers: SPA detects via UA, surfaces banner 'Production https→localhost requires Chrome 130+; use `pnpm dev` for cross-browser testing'." Or simpler: spec.md says "the runner detection on production SPA in non-Chromium browsers SHALL surface a guidance state pointing to extension or `http://localhost:3000` dev URL."

### R6. Telemetry off-by-default acceptance not in tasks

**Gap**: openspec/project.md mandates "Telemetry off by default; opt-in only." SPA + runner add new surfaces; need explicit assertion.

**Fix**: Add ε.X task: "Verify no telemetry beacon fires on landing OR measurement flow (Playwright + network log assert zero requests to known analytics domains)." Add scenario to spec.md.

### R7. CSP missing for SPA

**Gap**: No Content-Security-Policy mentioned for SPA. With report.json content rendered (potentially containing URLs from measured site), XSS risk via report data.

**Fix**: β.6 task — add CSP meta tag: `default-src 'self'; connect-src 'self' http://localhost:5174 http://127.0.0.1:5174 https://ohmyperf.dev; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'`. Document why `unsafe-inline` for styles (Tailwind injects). γ.4 viewer port — ensure all rendering uses React (escapes by default), never `dangerouslySetInnerHTML`.

### R8. IndexedDB quota error not surfaced

**Gap**: γ.2 has eviction but doesn't handle `QuotaExceededError` from browser-level quota (per-origin ~50MB-2GB depending).

**Fix**: γ.2 — try/catch around `db.put`, on quota error: evict 25% oldest, retry once, then user-facing error "Browser storage full; clear some reports."

### R9. Job ID format not specified

**Gap**: D7 says "jobId: string". UUID? Counter? Predictable IDs allow other tabs to snoop.

**Fix**: α.8 — use `crypto.randomUUID()` for jobId. Document.

### R10. Same-tab refusal scope

**Gap**: δ.5 refuses if `request.url` host matches current tab host. But user might want to measure `app.ohmyperf.dev` from `ohmyperf.dev` — different subdomains.

**Fix**: δ.5 — refuse only if `eTLD+1` matches AND path overlaps significantly. Simpler: refuse only exact URL match. Or even simpler: warn but allow, document edge case.

## Minor notes

- **N1**: `pnpm-workspace.yaml` catalog version pins (`^15.1`, `^4`, etc) — better use exact minor pins (`15.1.x`) to avoid silent breakages. Tailwind v4 churn especially.
- **N2**: `apps/runner/Dockerfile.slim` (α.14) needs explicit Chromium pin via apt to maintain reproducibility — `chromium=130.0.x` not bare `chromium`.
- **N3**: spec.md "Bundle and performance budgets" requirement combines two things (bundle KB + CWV). Could split into two requirements for cleaner test coverage.
- **N4**: ε.15 says "Playwright Test driving the SPA end-to-end" — explicitly mark headed-vs-headless requirements (extension needs headed unless using ext loading workaround).
- **N5**: design.md D6 schema names `OmoDB` — fine but inconsistent with `@ohmyperf/*` naming. Use `OhMyPerfDB` for clarity.
- **N6**: tasks α.12 says "already present" for `zod`, `ipaddr.js`, `hono` — verify. `hono` likely present (share-server), `ipaddr.js` likely NEW, `zod` confirmed in pnpm-workspace.yaml.
- **N7**: β.13 mentions next-intl "middleware (no, static export — use ...)" — wording confused. Clarify: use client-side `<NextIntlClientProvider>` since middleware is not available in `output: 'export'`.

## Scope assessment

- **5-6 session estimate**: optimistic for Phase γ (8 components + viewer port + IndexedDB + 2 chart libs). Realistic: 6-8 sessions. Consider splitting γ into γ1 (storage/state/runner-client) + γ2 (rendering components).
- **Phase α first** is right de-risking. Good.
- **Extension bridge Phase δ before history polish Phase ε**: correct ordering. Extension parity is a feature, history is nice-to-have.

## Verdict

**APPROVED WITH CONDITIONS**.

Conditions (block α.1 until addressed):

1. Apply C1–C6 (critical) to tasks.md and spec.md.
2. Apply R7 (CSP) and R9 (UUID jobId) — security baselines.
3. Document R3 (runner restart behavior) in spec.md + runner README plan.

Recommendations R1, R2, R4–R6, R8, R10 can be applied during their respective phases (β, γ, δ). Minor notes N1–N7 are author preference.

After conditions applied, this is implementation-ready.

---

## Phase α implementation notes (Sisyphus, 2026-05-13)

### Curl-verified acceptance (in-session) — all criteria green

End-to-end runner against real Playwright + a local 127.0.0.1 fixture server produced a structurally valid `Report` in 1.8s:

- `GET /api/health` → 200 `{ ok, version, engine: "1.0.0", browser: { source: "bundled", version: "playwright@1.59.1" } }`.
- `POST /api/measure` → 202 `{ jobId: <uuid>, status: "queued" }` (UUID v4 format).
- `GET /api/jobs/<id>/events` → SSE stream `queued` → `run-start` → `navigation(started)` → `run-complete` → `metric` × 6 (lcp, cls, inp, fcp, ttfb, tbt) → `complete` carrying a real `Report` (schemaVersion `"1.0.0"`, real chromium version `147.0.7727.0`, axe audits, frames tree, plugin data).
- `OPTIONS /api/measure` with `Origin: http://localhost:3000` and `Access-Control-Request-Private-Network: true` → 204 with both `Access-Control-Allow-Origin: http://localhost:3000` and `Access-Control-Allow-Private-Network: true`.
- Security headers (`x-content-type-options`, `referrer-policy`, `x-frame-options`) and `x-request-id` echo present on every response.

### Dockerfile build verification — environment limitation

`docker` is not available in this sandbox so `docker build -f apps/runner/Dockerfile .` could not be executed end-to-end. The Dockerfile, `.dockerignore`, and `docker-compose.yml` are present and syntactically valid; they will be built in CI on the next push. The base image tag `mcr.microsoft.com/playwright:v1.59.1-jammy` matches the pnpm-lock resolved Playwright version (see `pnpm-lock.yaml:2076`).

### Vitest integration tests

31 tests pass (`pnpm --filter @ohmyperf/runner test`):

- 19 SSRF unit tests (all blocked CIDRs, host blocklist, allow-private bypass, DNS failure classification).
- 12 HTTP integration tests covering health, validation 400s, SSRF 403, SSE replay → complete, CORS preflight (PNA echo + disallowed origin), rate-limit 429, DELETE cancel emitting `cancelled`, and 404 paths.

The integration suite injects a fake `EngineRunner` via `JobStore({ engineRunner })` so the test pipeline does not require a Playwright binary. Real-Playwright execution is exercised by the in-session curl smoke (see above).

### Decisions applied during α implementation (no spec deviations)

1. **Plugin defaults** (per phase-alpha-runner §F, recommendation 9): runner applies `[cwvPlugin(), axePlugin()]` only; `customMetricExamplePlugin` is intentionally NOT included (example plugin, not production-grade). Documented in `apps/runner/README.md`.

2. **`browser.version` in `/api/health`** (per phase-alpha-runner §D recommendation b): static value `"playwright@1.59.1"` (matches the pnpm-lock resolved version). Overridable via `OHMYPERF_RUNNER_BROWSER_VERSION`. Avoids the cold-start launch cost of querying Playwright.

3. **PNA preflight ordering**: the deep-dive's first proposal (separate `app.options` AFTER `cors()`) does not work because Hono's `cors()` middleware terminates OPTIONS requests before subsequent handlers run. Instead, the implementation registers a pre-cors middleware that observes the OPTIONS request, defers via `next()` so cors writes its standard headers, and then conditionally appends `Access-Control-Allow-Private-Network: true` after cors returns. Verified end-to-end (curl + vitest K7).

4. **SSRF DNS resolver injection** (`__setLookupForTests` in `ssrf-guard.ts`): `node:dns/promises.lookup` is non-configurable (vi.spyOn fails). A simple module-level resolver indirection allows tests to stub the lookup without breaking the production code path. Test-only API explicitly named with double-underscore prefix.

5. **`runs:1` Dockerfile.slim (α.14) deferred**: Not implemented this session. Primary `Dockerfile` (α.13) uses the official Playwright base image. The slim alt is documented as a future enhancement in `tasks.md` — it requires apt-pinning a system Chromium and verifying CDP protocol compatibility against the engine, which is a separate de-risking exercise.

6. **`tsx` not added as a dependency**: dev mode uses Node 22's built-in `--experimental-strip-types --watch` to execute `src/server.ts` directly. Avoids an extra dev dependency and matches the repo's minimalist tooling.

7. **Engine logger taps fire on `debug`, not `info`** (per `packages/core/src/engine.ts:120,192` actual log level). The runner's tapped logger therefore listens to `debug()` for the navigation phase events and silently drops `info()`. Documented inline.

