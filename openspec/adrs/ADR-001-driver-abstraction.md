# ADR-001: Driver abstraction with Playwright primary; raw CDP via `newCDPSession()`; puppeteer-core deferred

- **Status**: Accepted
- **Date**: 2026-05-09
- **Deciders**: Sisyphus (orchestrator), Oracle (architecture review), Metis (scope/risk review)
- **Related design section**: `design.md` D2

## Context

OhMyPerf must drive a real browser to collect measurements. Three orchestration libraries are candidates: Playwright (multi-browser, official Chromium revision pinning), Puppeteer-core (Chrome-only, lower-level), raw CDP via `chrome-remote-interface` (no orchestration). The engine also needs deep CDP access (OOPIF auto-attach, Profiler, Tracing, HeapProfiler) that the high-level Playwright API does not fully expose.

## Decision

Define a `Driver` interface in `@ohmyperf/core/types`. Ship two v1 implementations:

1. `@ohmyperf/driver-playwright` — wraps Playwright. The default driver for CLI/SDK/IDE. For Chromium-deep work, calls `context.newCDPSession(target)` to send raw CDP. All raw CDP goes through a single `cdp-compat.ts` shim.
2. `@ohmyperf/driver-extension` — wraps `chrome.debugger`. The driver for the Chrome extension surface.

Drop `puppeteer-core` from v1 entirely. The `Driver` interface keeps the door open for it as a third implementation later.

The Driver's `browserVersion` field is **the source of truth** for the browser revision recorded in every report.

## Alternatives considered

- **Pure Playwright (no raw CDP)**: insufficient — `Target.setAutoAttach`, `Profiler.startPreciseCoverage`, `HeapProfiler.takeHeapSnapshot`, and several Performance/Tracing flows are not exposed at the high level.
- **Pure CDP via `chrome-remote-interface`**: gives up Playwright's launch + context + page lifecycle, forces us to reinvent it for 3 browsers, increases maintenance.
- **Two drivers (Playwright + puppeteer-core)**: doubles surface area for marginal benefit (Playwright already exposes raw CDP via `newCDPSession()`). The plugin author who wants puppeteer-style API can build their own Driver if needed.

## Consequences

- (+) Single place (`cdp-compat.ts`) to absorb Chrome-version churn.
- (+) Cross-browser parity gracefully degrades via `driver.supports(capability)` — Firefox/WebKit drivers return `false` for OOPIF/Profiler/HeapProfiler, the engine emits `degraded: true` flags.
- (+) Browser version drift is tracked deterministically (Playwright pins per release).
- (-) Lock-in to Playwright's release cadence; Chromium bumps require coordination.
- (-) Driver abstraction adds a layer of indirection; plugins requesting `lowLevel` capability must be explicit.

## Compliance / Validation

- Lint rule: `Protocol.*` types from `playwright/types/protocol` MUST NOT appear in `@ohmyperf/core` public exports. Enforced via `api-extractor` snapshot in CI.
- Acceptance test: `report.meta.browser.version` always equals `driver.browserVersion`.
- The OOPIF synthetic test corpus runs against both drivers (Playwright + Extension) in CI to guard against drift.
