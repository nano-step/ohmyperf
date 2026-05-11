# OhMyPerf

A next-generation, plugin-driven web performance measurement platform that measures **real machines via real browsers** and achieves **~99% iframe-coverage accuracy** via Chrome DevTools Protocol cross-origin OOPIF attachment.

## Differentiators vs Lighthouse / PageSpeed Insights

| Aspect | Lighthouse / PageSpeed | OhMyPerf |
|---|---|---|
| **Where measurement runs** | Synthetic emulated CPU in Google's datacenter | The user's actual machine (or self-hosted runner) |
| **CWV numbers** | Systematically inflated (synthetic throttle) | Reflect the user's real experience |
| **Cross-origin iframe inspection** | Network-only — black box inside | Per-frame `CDPSession` via `Target.setAutoAttach({flatten:true})`, full CWV/runtime/coverage attribution |
| **CI ergonomics** | Lighthouse-CI exists but synthetic | Two-mode runtime: `real` (variance honest) + `ci-stable` (calibrated CPU + fixed network) |
| **Scenario flows** | Custom userflows (limited DSL) | Full TypeScript scenarios using Playwright `page` API |
| **Plugin model** | Audit-API only, internal | Plugins for metrics, audits, reporters, transports, collectors |
| **Surfaces** | Web only (PSI), CLI (LH), DevTools panel | npm SDK, CLI, Website, Chrome extension, VSCode extension, MCP server (AI agents) |
| **Sharing** | PSI URL (public, ephemeral) | Hosted shareable links + static viewer + self-host backend |

## Architecture (one-line)

A pnpm-workspaces + Turborepo monorepo. `@ohmyperf/core` is a small reentrant engine driving any object that satisfies the `Driver` interface; `@ohmyperf/driver-playwright` wraps Playwright + raw CDP via `newCDPSession()` for Chromium-deep work; `@ohmyperf/driver-extension` wraps `chrome.debugger` for the Chrome extension surface. Plugins (built-in + third-party) attach lifecycle hooks. Reporters serialize a frozen `Report` (schema-versioned). The hosted backend is Cloudflare Workers + R2 + D1, with Hono + S3 + Postgres for self-host.

## v1 scope

- **All 4 surfaces** delivered as a v1 product line, sequenced over P0–P4 (~9–14 months small-team estimate).
- **Full Lighthouse parity** for metrics + audits (CWV, loading, resources, runtime, memory, coverage, a11y, SEO, best practices) + plugin-defined custom metrics.
- **Reproducibility**: two modes (Real / CI Stable) + calibration micro-benchmark + statistical aggregation (median, p75, p95, CoV, outlier rejection, Mann-Whitney diff).
- **Sharing**: redaction defaults + env-secret scrubber + static viewer + hosted backend.
- **License**: Apache-2.0.

## v1 non-goals

- Cloud real-device farm.
- Real User Monitoring (RUM) SDK.
- Mobile-native apps.
- JetBrains plugin (deferred to v1.1).
- Plugin marketplace / registry.
- Team accounts / SaaS dashboard.
- AI-powered "fix this" suggestions.
- Distributed crawl / multi-runner orchestration.

## Repository layout

```
ohmyperf/
├── packages/
│   ├── core/                   # @ohmyperf/core — engine, types, plugin runtime
│   ├── driver-playwright/      # @ohmyperf/driver-playwright
│   ├── driver-extension/       # @ohmyperf/driver-extension (chrome.debugger)
│   ├── plugins-builtin/        # @ohmyperf/plugins-{cwv,coverage,a11y,seo,lh-audits,...}
│   ├── reporters/              # @ohmyperf/reporter-{json,html,md,junit,csv,har,trace}
│   ├── viewer/                 # @ohmyperf/viewer — static React/Vite SPA
│   ├── share-client/           # upload/fetch shareable reports
│   ├── share-server/           # backend (Hono on CF Workers + R2 + D1; Docker self-host)
│   └── trace-utils/            # vendored tracium-equivalent
├── apps/
│   ├── cli/                    # ohmyperf bin (citty)
│   ├── website/                # ohmyperf.dev (Next.js or Astro)
│   ├── extension-chrome/       # MV3 extension for the website surface
│   └── ide-vscode/             # VSCode extension
├── tests/oopif-corpus/         # synthetic OOPIF / iframe / SW / SPA / popup test fixtures
├── docs/
└── openspec/                   # spec-driven development workspace
```

## Key conventions

- **TypeScript** everywhere except where platform forces otherwise (Kotlin for v1.1 JetBrains plugin).
- **Apache-2.0** for our code; **MPL-2.0** for axe-core (link, don't modify; NOTICE attribution); **Apache-2.0** for vendored Lighthouse audits.
- **No CDP types in public API** — neutral domain types at the engine boundary.
- **No globals / singletons in `@ohmyperf/core`** — engine is reentrant.
- **Lockfile-frozen plugin integrity** via `ohmyperf.lock.json` with SRI hashes.
- **Engine API frozen at end of P0**; subsequent additions are additive only within the `1.x` major.
- **Cross-platform CI** on macOS arm64+x64, Ubuntu 22.04+24.04, Windows Server 2022.
- **Telemetry off by default**; opt-in only.

## Hard non-goals (do not propose without a v2 conversation)

- Re-executing plugin code on shared/exported reports.
- Promising "99% iframe coverage" without the conditioning ("for measurable signals; sandboxed-no-scripts and fenced frames are documented opaque").
- Promising deep inspection on Firefox/WebKit (CWV-only via web-vitals polyfill is the contract there).
- Allowing system Chrome via `executablePath` for budget gates (system Chrome version drift breaks reproducibility — diagnostic mode only).
- Bundling untrusted third-party React components into the viewer.
