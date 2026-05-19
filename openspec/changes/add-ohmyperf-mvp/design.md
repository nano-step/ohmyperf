# Design: OhMyPerf v1 MVP

## Context

OhMyPerf is greenfield. There is no prior code to evolve. The design must commit upfront to a small number of foundational decisions that downstream surfaces (CLI, Website, Chrome extension, VSCode plugin) will all consume — once those decisions are wrong, every surface inherits the bug. This document records the architecture, the top design decisions with rationale and alternatives, the risks, and the rollout plan.

The design is informed by a multi-agent deep-design pipeline:

- **Metis** (scope/risk consultant, Opus 4.7): identified hidden CDP/OOPIF complexity, the real-device reproducibility paradox, license/trademark traps, scope-creep vectors, and the realistic 9–15 month timeline for a 4-surface v1.
- **Oracle** (architecture, Opus 4.7): committed concrete picks for monorepo tool, driver layering, plugin model, OOPIF flow, website-runner architecture, share-link backend, statistical aggregation, and scenario format.

The synthesis (`.sisyphus/plans/ohmyperf-design-brief.md` outside this repo, kept as a planning artifact) reconciled their conflicts and was confirmed by the user across 7 open questions before this proposal was written.

### Constraints

- **Real machine, real browser** — synthetic CPU/network emulation off by default; opt-in via `CI Stable` mode.
- **All 4 surfaces in v1 product line** — but sequenced: engine → CLI → static viewer + Chrome extension → VSCode → hosted shareable links.
- **Apache-2.0** project license; `axe-core` MPL-2.0 linked not modified; vendored Lighthouse audits Apache-2.0.
- **Node.js ≥ 20 LTS**, macOS arm64+x64, Ubuntu 22.04+24.04, Windows Server 2022.
- **Browser binary**: Playwright's bundled Chromium for CLI/SDK; user's Chrome via `chrome.debugger` for the extension; system Chrome only for diagnostic mode.

## Goals / Non-Goals

### Goals

1. Produce CWV numbers that **match user-experienced reality on the user's machine** to within a documented variance band per mode.
2. **Deeply inspect cross-origin OOPIFs** with measurable signals on ~99% of frames and an explicit "opaque" classification for sandboxed-no-scripts and fenced frames.
3. Publish a **stable, frozen** engine API at the P0/P1 boundary so the four surfaces can develop in parallel from P2 onward without API thrash.
4. Make every metric, audit, and reporter **a plugin** so users can extend without forking.
5. Provide **automation-grade CI ergonomics** — exit codes, JUnit XML, lockfile-frozen plugins, statistical-significance diff, calibrated CI Stable mode.
6. Ship **shareable reports** that are inert JSON viewable by anyone, with sensitive data redacted by default.
7. Be **honest** about variance — reports prominently surface CoV, mode, and known-delta caveats.

### Non-Goals

- Cloud real-device farm (v2+).
- Real User Monitoring (RUM) SDK (different product category).
- Mobile-native apps (v2+ via remote debugging).
- JetBrains plugin in v1 (deferred to v1.1).
- Plugin marketplace / registry / search UI (community ecosystem in v2).
- Team accounts / SaaS dashboard (we are a tool, not a SaaS).
- AI-powered "fix this" suggestions (v2+).
- Distributed crawl / multi-runner orchestration (v2+).
- Untrusted plugin execution sandbox (v2+).
- Firefox/WebKit deep inspection (CWV-only via web-vitals polyfill in v1; deep inspection requires CDP, which only Chromium provides).

## Decisions

### D1. Monorepo: pnpm workspaces + Turborepo

**Pick**: pnpm workspaces with Turborepo as the task runner.

**Alternatives considered**:
- **Nx** — too heavy and pulls projects into its plugin world; the Nx plugin layer is a lifelong commitment for a tool that has its own plugin model.
- **Moon** — too new (2024-era), small ecosystem, integration risk.
- **Lerna** — mostly maintenance-mode now; pnpm workspaces are the modern equivalent.
- **Bolt / Yarn workspaces** — Yarn is fine, but pnpm's strict, content-addressed store is better for handling Playwright/puppeteer/Lighthouse coexistence with clean peer-dep resolution.

**Rationale**: pnpm's strictness catches phantom dependencies early, and Turborepo is a thin task graph + remote cache that adds no architectural opinions. We get fast dev loops and a predictable CI graph for ~12 packages.

### D2. Driver layering: Playwright primary; raw CDP via `newCDPSession()` for Chromium-deep work

**Pick**: One `Driver` interface with two v1 implementations (`@ohmyperf/driver-playwright` for Chromium/Firefox/WebKit; `@ohmyperf/driver-extension` for the Chrome extension surface, using `chrome.debugger`). Drop puppeteer-core for v1 — bring back later via a third Driver if needed. For Chromium-deep work (OOPIF auto-attach, Profiler, Tracing, HeapProfiler), reach through Playwright's `context.newCDPSession(target)` to send raw CDP. Wrap raw CDP calls behind a `cdp-compat` shim so version churn touches one file.

**Alternatives considered**:
- **Pure Playwright (no raw CDP)**: insufficient — `Target.setAutoAttach`, `Profiler.startPreciseCoverage`, `HeapProfiler.takeHeapSnapshot`, and several Performance/Tracing flows aren't exposed at the high level.
- **Pure CDP via `chrome-remote-interface`**: gives up Playwright's high-quality launch + context + page lifecycle and forces us to reinvent it for 3 browsers.
- **Two drivers (Playwright + puppeteer-core)**: doubles surface area for marginal benefit (Playwright already exposes raw CDP). Deferred.

**Rationale**: Playwright is the source of truth for browser version (it pins Chromium revisions per release). Raw CDP via `newCDPSession()` is the escape hatch to do anything Playwright doesn't expose. The `Driver` abstraction means cross-browser parity gracefully degrades — Firefox/WebKit drivers return `false` from `supports('cdp-oopif')`, the engine logs a `degraded` flag, and life goes on.

### D3. OOPIF deep-inspection flow

**Pick**:

```
1. context.newCDPSession(page) → rootSession
2. rootSession.send('Target.setAutoAttach', {
     autoAttach: true,
     waitForDebuggerOnStart: true,
     flatten: true,                                     // mandatory — single WebSocket with sessionId routing
     filter: [{ type: 'iframe', exclude: false },
              { type: 'page',   exclude: false }]
   })
3. On 'Target.attachedToTarget' (sessionId, targetInfo):
     - per-frame CDPSession from sessionId
     - Enable: Page, Network, Runtime, Performance, PerformanceTimeline
       (events: 'largest-contentful-paint','layout-shift','first-input','longtask','paint'),
       DOM, CSS, Profiler (if coverage opted in), Log
     - Page.addScriptToEvaluateOnNewDocument({ source: webVitalsBundle })
     - Runtime.runIfWaitingForDebugger()                // release the wait
4. On 'Target.targetInfoChanged': re-bind frameId↔sessionId mapping
5. On 'Target.detachedFromTarget': finalize that frame's metrics, mark detached
6. On 'Target.targetDestroyed': process swap; expect a follow-up attached event for same frameId; reconcile
```

State is keyed by **frameId** (from the parent frame tree), not `targetId`, so cross-origin navigations within the same frame slot don't lose data.

**CLS attribution**:
- `clsRoot` = sum of shifts in the parent document only (Lighthouse-compatible).
- `clsAggregate` = sum across all frames, weighted by viewport intersection × time-visible.
- Parent shifts caused by iframe resize tagged via `Page.frameResized` correlation: `cause: 'iframe-resize', frameId: <child>`.

**INP attribution**: per-frame from `event-timing` PerformanceTimeline; report worst per-frame and `inpRoot` from the parent.

**Edge cases**:
- `srcdoc` iframes — same-origin same-process, no OOPIF target, fold metrics into parent session via the parent's frame-tree events.
- Sandboxed-no-`allow-scripts` — Runtime gives no execution context; `web-vitals` cannot run; document `inFrameMetrics: { available: false, reason: 'sandboxed-no-scripts' }`. Network/timing from parent still works.
- Fenced frames — target type `iframe` with `subtype: 'fenced-frame'`. Attempt attach; expect partial/none. Mark `available: false, reason: 'fenced-frame-opaque'`.
- Detached frames mid-collection — every CDP send is wrapped in idempotent error handling; "Session is detached" / "Target closed" → swallow + finalize.
- BFCache restores — `Page.lifecycleEvent` with `reason: 'bfcache'`; reset LCP semantics per `web-vitals` v4; document divergence from CrUX is intentional.
- Prerender — `subtype: 'prerender'` target; do NOT measure activation timing as initial nav; emit `Activation` metric separately.
- Service Worker fetch — `Network.requestServedFromCache` + SW `Fetch` events; if entire navigation served by SW, `ttfb` annotated `served-by-sw: true`.
- SPA soft-nav — `Page.navigatedWithinDocument` event; CWV windows do NOT reset by default (matches `web-vitals` opinion); plugins can override.
- Popups — new `page` target with `openerId`; auto-attach applies; cross-target metric attribution emits a separate "popup" sub-report.
- Workers / SharedWorkers — attached as targets; long tasks attributed to `worker:<scope>` not main-thread.

### D4. Website surface — Chrome extension via `chrome.debugger`

**Pick**: An MV3 Chrome/Edge extension that uses `chrome.debugger` to drive CDP from the user's actual browser. The website (`ohmyperf.dev`) is a thin UI that postMessages with the extension's content script.

**Alternatives considered**:
- **WASM browser-in-browser** — defeats the entire "real machine" pitch; cannot use real CDP.
- **Localhost companion agent + paired-token WebSocket** — works, but install friction (Gatekeeper / SmartScreen / corp-Linux) loses the casual user. Adds Apple notarization ($99/yr) and Windows code signing ($300–500/yr EV cert).
- **Hybrid (extension + agent)** — two implementations, twice the maintenance, deferred.

**Rationale**: 2-click install from Chrome Web Store, `chrome.debugger` IS real CDP including `Target.setAutoAttach` for cross-origin OOPIFs. Trade-offs accepted: Chrome/Edge only on website v1; the yellow "DevTools is debugging…" infobar is always visible (cannot hide); runs in user's current profile (with extensions installed) — document this and recommend a clean-profile window for repeatable measurements.

The extension's CDP capabilities differ subtly from CDP-over-WebSocket; the `@ohmyperf/driver-extension` package owns the differences, with a synthetic-page test corpus shared with the Playwright driver to keep parity in check.

### D5. Plugin runtime — in-process, trust = npm trust; reports never re-execute plugin code

**Pick**: Plugins run in-process in the same Node/Browser context as the engine. `ohmyperf.lock.json` records each plugin's version + SRI integrity hash (`sha384-…`); CI uses `--frozen-lockfile`. Built-in plugins ship with the engine; third-party plugins prompt a one-time confirmation in interactive mode. **Shared reports are inert JSON** — when a viewer renders a shared report, no plugin code executes; only the recorded `pluginData` is rendered through known-safe React components. v1 ships **zero third-party viewer plugins**; only built-ins render custom UI.

**Alternatives considered**:
- **`worker_threads` per plugin** — adds 50ms × N plugin startup, doesn't actually contain a malicious npm package (which can read `~/.ssh/`), poor cost/benefit.
- **`vm` contexts** — light isolation, escapable, often trapped by JIT bugs.
- **Subprocess per plugin** — robust, slow (~100ms+ per spawn), heavy IPC for hot hooks.
- **Allow plugins on shared reports** — would let attackers ship a "report" that pwns the viewer. Hard non-goal.

**Rationale**: Same trust model as ESLint, Vite, Webpack — proven in industry. Sandboxing is a v2 problem with `worker_threads` + `resourceLimits`. The hard line that shared reports are inert protects every web/extension/IDE viewer and is non-negotiable.

### D6. Reproducibility — two modes (Real / CI Stable) with calibration

**Pick**:

- **Real mode** (default for CLI / IDE / extension): no throttling, no emulation. Reports surface CoV prominently. For dev loop and "actual user reality" measurement.
- **CI Stable mode** (default in CI templates): runs a pre-flight JS micro-benchmark (JetStream-style fixed loop, ~2s) → computes a CPU score for the runner → applies CDP `Emulation.setCPUThrottlingRate` to match a reference CPU score (default reference = "median 2024 mid-range laptop CPU"). Network throttle = fixed profile (4G default — `Fast 4G` per Lighthouse). Same calibration → comparable across runners.
- **Statistical aggregation**: `runs: 5` default; modified Z-score outlier rejection (threshold 3.5, Iglewicz-Hoaglin); cold (run 1) reported separately from warm (runs 2–5); `unstable: true` flag when `CoV > 0.20` for any CWV; budget gates require N≥5 runs in CI Stable mode. Single-run-no-budget guard: refusing to evaluate budgets on N=1 unless `--allow-single-run`.
- **Diff mode**: Mann-Whitney U significance test on N runs; reports difference + p-value; "regression" only flagged at p<0.05.
- **Honest reporting**: every report carries `meta.mode = 'real' | 'ci-stable'`, `meta.calibration = { reference: 'mid-range-2024', actualScore, throttleApplied }`, `meta.parity = { mode: 'headful'|'headless', knownDeltas: {…} }`.

**Alternatives considered**:
- **Real-only** with N≥10 + significance — pure but raises CI cost (10 runs × 30s per page = 5 min per gate). Rejected as default; available via flag.
- **CI Stable as global default** — undermines "real machine" branding. Rejected.

**Rationale**: The "real device + ±5% reproducibility for CI gates" tension is irreconcilable on consumer hardware. Splitting into two modes resolves the tension honestly: dev loop gets reality, CI gets comparability.

### D7. Statistical aggregation defaults

| Knob | Default | Notes |
|---|---|---|
| `runs` | 5 | Lower bound for outlier rejection. 3 too noisy on INP. |
| Cold-vs-warm | run 1 = cold, 2–5 = warm; aggregates use warm | Configurable: `--cold-only`, `--warm-only`, `--include-cold`. |
| Outlier rejection | Modified Z-score, threshold 3.5 | Per-metric independent; never on N<5. |
| Headline aggregator | Median | Plus p75, p95, mean, stdev, CoV. |
| `unstable` flag | `CoV > 0.20` on any CWV | Surfaced prominently in HTML report. |
| Significance test (diff) | Mann-Whitney U | Flag regression at p < 0.05. |

### D8. Shareable-link backend — Cloudflare Workers + R2 + D1; Hono+S3+Postgres for self-host

**Pick**:

```
POST /api/share          → Worker validates schema, gzips, R2 PUT (key = uuid)
                            D1 INSERT (id, r2Key, expiresAt, password_hash?, owner?)
GET  /r/:id              → D1 SELECT → R2 GET stream (auth/expiry/password checks in Worker)
GET  /r/:id/trace        → presigned R2 URL for the trace artifact (separate object, opt-in upload)
DELETE /r/:id            → owner-only; soft-delete + tombstone for DSAR
GET  /api/dsar/:email    → enqueue DSAR scan; out-of-band response
```

**Self-host**: same Hono code on Node + S3-compatible (MinIO) + Postgres. ~200 LOC of adapter code abstracts R2↔S3 and D1↔Postgres.

**Alternatives considered**:
- **Postgres + Fly.io as primary**: overkill for blob storage; costs more; not edge-distributed.
- **Pure presigned URL + object storage, no DB**: no auth/expiry/password/DSAR enforcement; viewer-readable URLs leak via referrer.
- **Vercel + KV**: more expensive at scale; tighter vendor lock-in than CF.

**Rationale**: Reports are immutable blobs; relational DB only holds the index. CF's free tier covers indie launch; edge latency is global. Self-host parity is a must for enterprise users who refuse cloud sharing.

**Data residency**: EU users → R2 EU jurisdiction. Default TTL 30d (configurable, max 1y). Argon2id for password hashes. DSAR endpoint exists pre-GA. Privacy Policy + DPA reviewed pre-P4 GA.

### D9. Redaction pipeline for shared reports

Default-redact (allow-list extensible via `share.redact` config):

- **Headers** (request and response): `authorization`, `cookie`, `set-cookie`, `proxy-authorization`, `x-api-key`, `x-auth-*`.
- **URL query params** matching: `token`, `key`, `secret`, `password`, `api_key`, `auth`, `session`, `sid`, `access_token`, `refresh_token`, `code`, `state` (case-insensitive).
- **Request bodies**: redact entirely from HAR by default; opt-in `--include-bodies`.
- **Screenshots**: blur `<input type="password">`, `<input type="email">`, `[autocomplete=cc-*]`, `[data-private]` via CDP `DOM.getNodeForLocation` + box redaction at composite step.
- **Cookies**: redact all values; keep names + paths for debugging context (configurable).
- **Pre-share scrubber**: scans the report for substring matches against `process.env` values (allow-listing `OHMYPERF_*` env keys to skip). Refuses upload on hit, emitting a structured list of locations. Bypassable only with `--unsafe-share-with-secrets` and a banner in the report.

A confirmation preview is shown before upload: "12 headers redacted, 3 query params redacted, 2 input fields blurred. 0 secrets detected. [Confirm upload]."

### D10. Scenario scripting — TypeScript files, NOT YAML

**Pick**:

```ts
// scenarios/checkout.ts
import { defineScenario } from '@ohmyperf/core';

export default defineScenario({
  name: 'checkout-flow',
  steps: [
    {
      name: 'login',
      run: async ({ page }) => {
        await page.goto('https://shop.example/login');
        await page.fill('#email', process.env.OHMYPERF_USER!);
        await page.fill('#password', process.env.OHMYPERF_PASS!);
        await page.click('button[type=submit]');
        await page.waitForURL('**/dashboard');
      },
    },
    {
      name: 'add-to-cart',
      measure: true,
      run: async ({ page }) => {
        await page.goto('https://shop.example/product/123');
        await page.click('text=Add to cart');
      },
    },
    {
      name: 'checkout',
      measure: true,
      run: async ({ page }) => {
        await page.click('text=Checkout');
        await page.waitForLoadState('networkidle');
      },
    },
  ],
});
```

Run: `ohmyperf scenario ./scenarios/checkout.ts --runs 5`.

**Alternatives considered**:
- **YAML** — grows a DSL that always falls short on conditionals/loops/retries.
- **JavaScript** — no type safety, no autocomplete; we live in TS.

**Rationale**: `page` is the Playwright Page object — users already know the API. `measure: true` flag marks which steps' metrics enter the report (others are setup/teardown). Type safety, autocomplete, real conditionals/loops/retries, real env-var injection, no DSL invention.

`ohmyperf.config.ts` (the global tool config, not scenarios) is also TS:

```ts
import { defineConfig } from '@ohmyperf/core';
export default defineConfig({
  plugins: ['@ohmyperf/plugin-cwv', '@ohmyperf/plugin-axe', './my-plugin'],
  runs: 5,
  mode: 'ci-stable',
  budgets: { lcp: 2500, cls: 0.1, inp: 200 },
  redact: { extraHeaders: ['x-internal-trace'], extraQueryParams: ['cf_clearance'] },
});
```

### D11. Source-map attribution for IDE plugin

**Pick**:

1. CDP `Profiler.startPreciseCoverage` collects unused-JS coverage with byte ranges per scriptUrl.
2. Engine fetches source maps for each script (network, with auth/origin handling; or filesystem given a `--project-root`).
3. Use Mozilla `source-map` library: `(scriptUrl, line, col) → (originalSource, line, col)`.
4. Aggregate per-original-file: `{ unusedBytes, longTaskTimeMs, evalTimeMs }`.
5. Report includes a `sourceAttribution` section keyed by file path (relative to user-provided `--project-root`).
6. VSCode extension reads `sourceAttribution`, places `editor.decorations` (gutter/inline) and `CodeLens` ("47KB unused", "3.2s eval time", "blocking long task at ms=1240").

**Long-task attribution**: trace events `FunctionCall` carry `data.url + lineNumber + columnNumber`. Map those through the same pipeline.

**Caveats**: Bundler-format-specific quirks (Vite, Webpack 5 dev vs prod, esbuild, Rolldown, swc) are documented per-bundler. Inline maps, multi-source-root maps, missing-map-in-prod scenarios are best-effort, not perfect.

### D12. Browser binary management

| Surface | Default browser | User override |
|---|---|---|
| npm SDK | Playwright's bundled Chromium (auto-download on `postinstall`; skip via `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`) | `executablePath` option |
| CLI | Same as SDK; `ohmyperf install-browser` for explicit fetch; `ohmyperf doctor` to verify | `--browser-path` flag, `OHMYPERF_BROWSER_PATH` env |
| IDE plugin | Reuses CLI/SDK install; first-run prompt to install via VSCode notification | Settings UI |
| Website (extension) | User's actual Chrome/Edge — no binary management |  |

**Reports record `browser.source: 'bundled' \| 'system' \| 'extension-host'`**. Diff tool refuses cross-source compare without `--allow-cross-source`.

### D13. Apache-2.0 license

Apache-2.0 over MIT (patent grant matters for perf-measurement IP) and over MPL-2.0 (file-level copyleft annoys plugin authors). Standard for serious open infra (Playwright, Lighthouse, Chromium).

`axe-core` is MPL-2.0; we link rather than modify, attribute via NOTICE file. Vendored Lighthouse audit modules are Apache-2.0 — also NOTICE attribution.

## ADRs (top 5)

The five ADRs are recorded in `openspec/adrs/` and are referenced from the relevant specs. Brief summaries:

1. **ADR-001: Driver abstraction with Playwright primary; raw CDP via `newCDPSession()`; puppeteer-core deferred.** (D2)
2. **ADR-002: OOPIF deep-inspection via `Target.setAutoAttach({flatten:true})` with per-frame `CDPSession`; CLS dual reporting (root vs aggregate).** (D3)
3. **ADR-003: Plugins run in-process, trust = npm trust; shared reports are inert JSON, never re-execute plugin code; viewer plugins deferred.** (D5)
4. **ADR-004: Website surface uses a Chrome extension with `chrome.debugger`; no WASM, no companion agent; Chrome/Edge only on Web v1.** (D4)
5. **ADR-005: Report `schemaVersion`-versioned; shareable links via Cloudflare Workers + R2 + D1; Hono+S3+Postgres parity for self-host.** (D8 + R-schema)

## Risks / Trade-offs

| ID | Risk | Mitigation |
|---|---|---|
| R1 | 4-surface API thrash slows everything | Engine API frozen at P0/P1 boundary; cross-surface impact review on any change. |
| R2 | Real-device variance vs ±5% CI gates | Two-mode model (Real / CI Stable + calibration). Honest variance reporting. N≥5 default. |
| R3 | OOPIF edge cases (sandboxed/srcdoc/fenced/BFCache/prerender/SW/SPA/popup/worker) | Synthetic test corpus in `tests/oopif-corpus/`; collector framework idempotent on detach; explicit "opaque" classifications. |
| R4 | Cross-browser parity overpromise | Capability matrix in docs; Firefox/WebKit = CWV-only via web-vitals + observers. |
| R5 | Hosted backend scope creep → SaaS | Hard line: anonymous, ephemeral, single-report; no team accounts; static viewer fallback always exists. |
| R6 | Source-map attribution complexity (bundler zoo) | Best-effort; bundler-specific quirks documented; target source-map v3 only. |
| R7 | `lighthouse` library API churn | Vendor specific audit modules into `@ohmyperf/plugins-lh-audits`; pin LH version; update on our schedule. |
| R8 | Browser binary version drift | Bundle Playwright's Chromium; system Chrome opt-in only for diagnostic mode; report `browser.source`. |
| R9 | Plugin sandboxing absence | In-process v1 + lockfile SRI; reports never re-execute plugins; sandboxing v2. |
| R10 | Trademark / domain / npm name conflicts | Day-1 P0 audit (ohmyperf.dev/.com, npm `@ohmyperf`, GitHub org, VSCode/JetBrains marketplaces, EUIPO+USPTO trademark search). Pause if conflict. |
| R11 | GDPR exposure via shared reports | Defer hosted backend to P4; EU residency on R2 EU; redaction default-on; DSAR endpoint; Privacy Policy + DPA before P4 GA. |
| R12 | Variance gaslighting users ("worked yesterday") | Prominent variance disclosure in every report; multi-run median default; per-mode variance bands documented. |
| R13 | JetBrains plugin needs Kotlin team lacks | Deferred to v1.1+. |
| R14 | axe-core MPL-2.0 NOTICE missed | NOTICE file in repo + npm package; CI license-audit step. |
| R15 | `chrome.debugger` API limitations (chrome:// URLs blocked, profile contamination, infobar visible) | Document; recommend CLI for power users; clean-profile guidance. |
| R16 | Share-link data leakage (tokens / PII) | D9 redaction defaults + env-secret scrubber + pre-upload preview + opt-in `--unsafe-share-with-secrets` only. |
| R17 | CSP-blocked probe injection | `Page.addScriptToEvaluateOnNewDocument` (CDP context bypasses CSP); `--strip-csp` flag via CDP `Fetch.fulfillRequest`. |
| R18 | Heap snapshot OOM | Default off; stream to disk via chunked HeapProfiler; configurable cap (warn 50MB, refuse >500MB without flag). |
| R19 | Race conditions in OOPIF auto-attach | `setAutoAttach` MUST be set on the root target BEFORE `Page.navigate`; explicit `runIfWaitingForDebugger` per attached child; integration test in OOPIF corpus. |
| R20 | Lighthouse-as-library "vendoring" creates a fork burden | Vendor only the audits we use (SEO, best-practices, HTTPS, manifest, robots); accept vendor maintenance; document upgrade path. |

## Migration Plan

This is greenfield — no migration. The "rollout" is the phased delivery plan:

| Phase | Months (cumulative, 3-eng team) | Deliverables |
|---|---|---|
| **P0** | 0–5 | Engine foundation: CDP/OOPIF auto-attach (with synthetic corpus passing); per-frame collector framework; plugin lifecycle (3 reference plugins); reproducibility calibration + CI Stable mode; Lighthouse-parity vendored audits; JSON+HTML reporters. **Engine API frozen at end of P0.** |
| **P1** | 5–7 | CLI hardening: citty CLI; scenario scripting; budgets; diff (Mann-Whitney); CI templates; all reporters (JUnit/CSV/HAR/Trace/LH-compat). |
| **P2** | 7–9 | Static website + Chrome extension MVP: ohmyperf.dev landing + drag-drop viewer + extension download. MV3 extension with `chrome.debugger`, "Measure this page" → opens viewer. |
| **P3** | 9–12 | VSCode plugin MVP: command-palette, webview viewer, source-map decorations + CodeLens. |
| **P4** | 11–14 | Hosted shareable links: CF Workers + R2 + D1; share-client lib; redaction + confirmation preview; password/expiry/private; self-host Docker. |
| **GA** | end of P4 | All 4 surfaces shipped within v1 product line. |
| **v1.1** | post-GA | JetBrains plugin (Kotlin); plus other deferrals as user demand drives. |

**Rollback**: Each phase merges behind a feature flag where applicable. P4 (hosted backend) ships with a kill switch on the share endpoint; if abuse appears, we disable new uploads while existing reports remain readable.

## Open Questions

(All major decisions resolved in Phase 2. Remaining tactical questions to address during P0 implementation.)

1. **Reference CPU score for CI Stable calibration**: which exact 2024 mid-range laptop CPU do we benchmark against? Decide before P0 calibration code starts. Candidate: Apple M2 (single-thread) or Intel i5-1240P. Document in `meta.calibration.referenceCPU`.
2. **Default network throttle profile in CI Stable**: Lighthouse "Slow 4G" or "Fast 4G" or fixed kbps profile? Default to `Fast 4G` (matches modern reality), document explicitly.
3. **Trace artifact retention in shared backend**: 7d default, 30d max? Trace files dominate storage cost; need a separate TTL from the report itself. Decide in P4.
4. **Extension Chrome Web Store publisher account ownership**: human individual vs the `ohmyperf` GitHub org's verified org? Decide in Day-1 P0 trademark/marketplace audit.
5. **CWV for SPA soft-nav**: do we ship a plugin that resets CWV windows on `Page.navigatedWithinDocument` for users who want per-route CWV? Default off (matches `web-vitals` opinion); ship plugin in P0 plugin examples; gather feedback.
