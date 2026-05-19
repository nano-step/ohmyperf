# Proposal: Bootstrap OhMyPerf v1 MVP

## Why

Lighthouse and PageSpeed Insights run on synthetic emulated CPUs in Google's datacenter, producing CWV numbers that are systematically inflated and don't reflect what real users experience on real hardware. Existing tools also have a long-standing blind spot: they cannot deeply inspect cross-origin iframes, which dominate modern composed pages (ads, embeds, payment widgets, third-party widgets).

OhMyPerf solves both problems in one tool: a real-machine, real-browser performance measurement platform that achieves ~99% iframe-coverage accuracy via Chrome DevTools Protocol cross-origin OOPIF attachment, and exposes its capabilities across four product surfaces (npm SDK, CLI, Website, VSCode extension) so the same engine serves dev loops, CI gates, ad-hoc browser checks, and editor integrations.

## What Changes

This is a greenfield project. The change introduces the entire v1 product line as a new repo `ohmyperf` published as a pnpm + Turborepo monorepo under Apache-2.0.

- **NEW**: A measurement engine (npm package `@ohmyperf/core`) that drives a real local browser via Playwright + raw CDP, attaches per-frame `CDPSession`s for OOPIF deep-inspection, runs in-page `web-vitals` instrumentation, and produces a versioned `Report` with median/p75/p95 aggregation across N runs.
- **NEW**: A first-class plugin system. Every metric, audit, reporter, transport, and collector is a plugin with typed lifecycle hooks (`beforeNavigate`, `onNavigate`, `onLoad`, `onIdle`, `onFrameAttached`, `onMetric`, `beforeReport`, `onReport`, `onShare`).
- **NEW**: A CLI binary `ohmyperf` (citty-based) with budgets, diff mode, scenario scripting (TypeScript files, not YAML), and ready-to-paste CI templates.
- **NEW**: A static report viewer + hosted shareable-links service at `ohmyperf.dev` (Cloudflare Workers + R2 + D1 for hosted; Hono+S3+Postgres parity for self-host).
- **NEW**: A Chrome (MV3) extension that uses `chrome.debugger` to drive CDP from the user's actual browser — the website's "real device" runner.
- **NEW**: A VSCode extension that spawns the CLI as a subprocess, embeds the viewer in a webview, and surfaces source-map-attributed perf data as inline decorations and CodeLens.
- **NEW**: Two reproducibility modes — `Real` (no throttling, dev loop) and `CI Stable` (calibrated CPU + fixed network throttle for budget gates).
- **NEW**: A redaction pipeline for shareable reports (default-redacts auth headers, secret query params, request bodies, password/credit-card input fields in screenshots; refuses upload when `process.env` secrets appear in the report).
- **NEW**: Apache-2.0 licensed; bundled `axe-core` (MPL-2.0) declared in NOTICE; Lighthouse audit modules vendored not depended on live.
- **EXPLICIT NON-GOALS for v1**: cloud real-device farm, Real User Monitoring (RUM) SDK, mobile-native apps, JetBrains plugin (deferred to v1.1), plugin marketplace/registry, team accounts/SaaS dashboard, AI-powered suggestions, distributed crawl.

## Capabilities

### New Capabilities

- `metric-collection`: Real-browser, real-machine collection of CWV (CLS/INP/LCP/FCP/TTFB), loading metrics (DCL, Load, TBT, TTI, Speed Index), per-resource timing, long tasks, JS/layout/paint/composite costs, JS heap, DOM nodes, listeners, code coverage (unused JS/CSS bytes), and HTTP-protocol observations. Emits a versioned `Report` with median/p75/p95 + CoV across N≥5 runs.
- `iframe-deep-inspection`: CDP `Target.setAutoAttach({flatten:true})` cross-origin OOPIF attachment with per-frame `CDPSession`s, frame-tree representation, dual CLS reporting (root vs aggregate), per-frame INP/LCP attribution, and explicit handling of detached/sandboxed/srcdoc/fenced/BFCache/prerender/SW/SPA-soft-nav/popup/worker edge cases.
- `plugin-system`: Typed `Plugin` interface with reverse-DNS `id`, `apiVersion`, declared `capabilities`, lifecycle hooks, per-hook timeouts, in-process execution model (trust = npm trust), `ohmyperf.lock.json` SRI integrity, and a guarantee that shared reports never re-execute plugin code.
- `npm-sdk-surface`: The `@ohmyperf/core` public API — `measure(opts) → Report`, `defineScenario`, `definePlugin`, `Driver` interface, frozen at the P0/P1 boundary as a stable contract for all downstream surfaces.
- `cli-surface`: The `ohmyperf` binary — single-URL measurement, multi-run aggregation, scenarios, budgets, diff, share, all reporters (JSON/HTML/MD/JUnit/CSV/HAR/Trace/Lighthouse-compat), watch mode (alpha), CI templates.
- `website-surface`: The static report viewer + landing site at `ohmyperf.dev`, including the Chrome extension download, drag-drop JSON viewer, and the hosted shareable-link UI.
- `chrome-extension-surface`: The MV3 Chrome extension — "Measure this page" via `chrome.debugger` → CDP → `@ohmyperf/core` (browser build) → results in viewer. Chrome/Edge only on website v1. MVP scope: button → measure → viewer, no scenario recorder, no plugin UI.
- `ide-vscode-surface`: The VSCode extension — command-palette "Measure URL", spawns CLI as subprocess, renders the viewer in a webview, exposes `editor.decorations` and `CodeLens` on source-map-attributed lines (unused-bytes, eval-time, long-task attribution).
- `reporting-and-sharing`: Reporters (JSON canonical + HTML self-contained single-file + Markdown + JUnit XML + CSV + HAR + Chrome trace JSON gz + Lighthouse-compat JSON), the redaction pipeline, the hosted Cloudflare Workers + R2 + D1 backend with `POST /api/share` and `GET /r/:id` (and `GET /r/:id/trace` for opt-in trace artifacts), Argon2id passwords, configurable expiry (default 30d, max 1yr), private mode, GDPR-aware data residency.
- `automation-testing`: Scenario scripting (TS `defineScenario`), budgets with pass/fail exit codes, diff mode with Mann-Whitney significance tests, statistical aggregation (modified Z-score outlier rejection, cold-vs-warm distinction, `unstable` flag at CoV>0.20), CI templates (GitHub Actions, GitLab CI, CircleCI), JUnit XML output, lockfile-frozen plugin integrity, single-run-no-budget guard.
- `reproducibility-and-calibration`: The two-mode runtime (Real / CI Stable), the calibration pre-flight micro-benchmark that scores the runner's CPU vs a fixed reference, the network throttle profile, the per-mode variance documentation, and the `parity` block in every report.

### Modified Capabilities

(none — greenfield)

## Impact

- **New repo**: `/Users/nhonh/Documents/personal/ohmyperf` (pnpm workspaces + Turborepo).
- **New npm packages** under `@ohmyperf/*` org: `core`, `driver-playwright`, `driver-extension`, `plugins-{cwv,coverage,a11y,seo,lh-audits,best-practices}`, `reporter-{json,html,md,junit,csv,har,trace}`, `viewer`, `share-client`, `share-server`, `trace-utils`, plus `apps/*` not published.
- **New domain**: `ohmyperf.dev` (Day-1 audit required for trademark / domain availability across `.dev`, `.com`, npm `@ohmyperf` org, GitHub `ohmyperf` org, VSCode + JetBrains marketplace publisher names, EUIPO + USPTO trademark search).
- **Hosting**: Cloudflare Workers + R2 + D1 (free tier covers indie launch). EU residency via R2 EU. Self-host via Hono + S3-compatible + Postgres Docker image.
- **Dependencies**: Playwright (pinned minor), `web-vitals/attribution`, `axe-core` (MPL-2.0, NOTICE attribution), Mozilla `source-map`, vendored Lighthouse audit modules (specific subset), vendored tracium-equivalent under `@ohmyperf/trace-utils`, citty CLI, Hono backend, React + Vite + Tailwind viewer.
- **Browser binary**: Playwright's bundled Chromium is the default for CLI/SDK/IDE; user's Chrome/Edge is the runtime for the extension surface. System Chrome opt-in only for diagnostic mode (explicitly unsupported for budget gates).
- **OS support**: macOS arm64 + x64, Ubuntu 22.04 + 24.04, Windows Server 2022. CI runs full acceptance suite on all 5.
- **Node.js**: ≥20 LTS.
- **License**: Apache-2.0 (project); MPL-2.0 (axe-core, link not modify, NOTICE); Apache-2.0 (Playwright, vendored Lighthouse audits).
- **Telemetry**: opt-in only, Sentry self-hostable, allow-list of fields, off-by-default with first-run banner.
- **Compliance**: GDPR data-controller status for hosted shares (P4); Privacy Policy + DPA + DSAR endpoint + retention policy + DMCA process required before P4 GA.
