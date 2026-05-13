# Phase Deep-Dives — Code-Level Specs

5 Oracle agents fired in parallel, one per phase. Each output contains concrete TypeScript code, file paths, line citations, error envelopes, and implementation gotchas.

## Index

| Phase | File | Duration | Scope |
|---|---|---|---|
| α Runner backend | [phase-alpha-runner.md](./phase-alpha-runner.md) | 6m 24s | Hono server, SSE w/ heartbeat+replay+cancel, SSRF guard, Dockerfile, vitest plan, error envelope. Includes **DELETE /api/jobs/:id** cancel route, 15s SSE heartbeat, fan-out EventBus, full ssrf-guard test suite. |
| β SPA shell | [phase-beta-spa.md](./phase-beta-spa.md) | 4m 32s | Next.js 15 static export, exact `package.json` deps, Tailwind v4 + shadcn init, CSP meta tag, i18n with next-intl (client-only provider), bundle budget script, dynamic routes fallback. |
| γ Metrics + Viewer port | [phase-gamma-metrics.md](./phase-gamma-metrics.md) | 5m 24s | `runner-client.ts` with SSE parse + Last-Event-ID resume, `extension-bridge.ts` with port AsyncIterable, `storage.ts` with atomic IDB + quota retry, zustand store with partialize, viewer React port (extract format helpers), uPlot gauge, Recharts waterfall, frame tree, error state component. |
| δ Extension bridge | [phase-delta-extension.md](./phase-delta-extension.md) | 4m 21s | manifest diff with `externally_connectable`, full message envelope schema with `protocolVersion`, `onMessageExternal` + `onConnectExternal` handlers, port keep-alive, DevTools-conflict detection, target-tab-close handling, CWS re-review timeline. **Correction**: `browser.source` literals are `"extension-host"` vs `"bundled"`, NOT `"extension"` vs `"playwright"`. |
| ε Polish + a11y + dogfood CI | [phase-epsilon-polish.md](./phase-epsilon-polish.md) | 3m 50s | History page with cursor pagination, cancellation end-to-end, skeleton/empty state inventory, axe-core CI integration, keyboard manual test, bundle budget enforcement workflow, dogfood self-measurement workflow, telemetry verification, deploy docs (CF Pages canonical). |

## How to use during implementation

For each phase α/β/γ/δ/ε:

1. Open the corresponding deep-dive file
2. Reconcile concrete code with current `tasks.md` checkboxes
3. Implement task-by-task, marking checkboxes as you go
4. Re-read REVIEW.md conditions (C1–C6, R1–R10, N1–N7) — they're already applied to tasks.md and spec.md but the deep-dives may add additional context

## Critical corrections found during deep-dive

| # | Source | Correction |
|---|---|---|
| 1 | δ phase | `Report.meta.browser.source` literals are `"bundled" | "system" | "extension-host"`, NOT `"extension"` vs `"playwright"`. Parity test must use actual values from `packages/core/src/types.ts:135`. |
| 2 | α phase | `runEngine` returns Report synchronously — **no progress callbacks**. We synthesize coarse navigation events around it. `metric` events NOT emitted in v1 (engine doesn't surface them mid-run). Document trade-off in spec. |
| 3 | α phase | Playwright lockfile version (1.59.1) drifts from pnpm-workspace.yaml catalog (^1.49.1). Pin Docker base image tag to lockfile-resolved version, not catalog. Add CI check for drift. |
| 4 | β phase | `tsconfig.base.json` has `composite: true` for project refs. Website `tsconfig.json` must override `composite: false` because Next manages its own build graph. |
| 5 | γ phase | `packages/viewer` is a **string-renderer**, not React. Port strategy = extract format helpers + add `./react` export, preserve `renderReportHtml` for CLI. Parity test asserts semantic anchors, NOT byte-exact HTML. |
| 6 | γ phase | `Report.frames` uses ID-based recursion (`children: readonly string[]`), not embedded objects. Frame tree component must lookup by ID. |
| 7 | δ phase | `onMessageExternal` listener MUST return `true` for async `sendResponse`. Easy to miss in review. |
| 8 | ε phase | Next.js 15 manifest path drift possible — verify `.next/app-build-manifest.json` on first build before merging bundle-budget script. |
| 9 | ε phase | `runEngine` Report schema accessor for median CWV — verify against frozen 1.0 types (`metrics[*].median` vs `runs.aggregate.{lcp,inp,cls}.median`) before merging dogfood workflow. |

## Effort totals from deep-dives

| Phase | Estimate | Notes |
|---|---|---|
| α | ~1 session | Curl-testable by end |
| β | 1–2d (Medium) | Tailwind v4 beta risk; bundle budget very tight at 150KB |
| γ | 2 sessions (γ1 + γ2 split natural) | Viewer port is mechanical; metrics components numerous |
| δ | 3d+ (Large) | + 7-day CWS re-review wait |
| ε | 1–2d (Medium) | Many small deliverables; mostly mechanical |
| **Total** | **6–8 sessions** | Realistic; MVA 2–3 sessions |
