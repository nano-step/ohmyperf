# OhMyPerf

> **Status**: P0 + P2 + P3 + P4 + v1.1 (MCP) all working MVPs across **5 surfaces**.
> **License**: Apache-2.0
> **Plan**: see [`openspec/changes/add-ohmyperf-mvp/`](./openspec/changes/add-ohmyperf-mvp/) and [`openspec/project.md`](./openspec/project.md).

## Surfaces

| # | Surface | Package | Status |
|---|---|---|---|
| 1 | **CLI** | [`@ohmyperf/cli`](apps/cli/) | ✅ `ohmyperf run/diff/share/doctor/list-plugins/install-browser` |
| 2 | **npm SDK** | [`@ohmyperf/core`](packages/core/) + drivers + plugins + reporters | ✅ 45-export API contract, frozen |
| 3 | **Chrome extension** | [`apps/extension-chrome/`](apps/extension-chrome/) | ✅ MV3, `chrome.debugger`, Load-Unpacked ready |
| 4 | **Website** | [`apps/website/`](apps/website/) | ✅ landing + drag-drop `/viewer` (static deploy ready) |
| 5 | **VSCode extension** | [`apps/ide-vscode/`](apps/ide-vscode/) | ✅ command palette + webview |
| 6 | **MCP server** | [`apps/mcp-server/`](apps/mcp-server/) | ✅ `measure` + `diff` tools (replaces v1.1 JetBrains) |
| 7 | **Share-server** | [`packages/share-server/`](packages/share-server/) | ✅ Hono on Cloudflare Workers or Node + filesystem |

A next-generation, plugin-driven web performance measurement platform that measures **real machines via real browsers** and achieves **~99% iframe-coverage accuracy** via Chrome DevTools Protocol cross-origin OOPIF attachment.

## Why?

Lighthouse and PageSpeed Insights run on synthetic emulated CPUs in Google's datacenter. The numbers are systematically inflated and don't reflect what your real users experience on real hardware. They also can't deeply inspect cross-origin iframes (ads, embeds, payment widgets) — the long-standing blind spot of web-perf tooling.

OhMyPerf solves both problems in one tool, exposed across four surfaces:

```
┌──────────────────────────────────────────────────────────────────┐
│                          @ohmyperf/core                          │
│       (engine, plugin runtime, frozen API at v1.0.0-stable)      │
├──────────────────────────────────────────────────────────────────┤
│   driver-playwright   |   driver-extension (chrome.debugger)     │
└──────────────────────────────────────────────────────────────────┘
              │                                  │
              ▼                                  ▼
    ┌─────────────────┐                ┌─────────────────────┐
    │  CLI / IDE /    │                │ Chrome extension    │
    │  npm SDK        │                │ (website real-device│
    │                 │                │  runner)            │
    └─────────────────┘                └─────────────────────┘
              │                                  │
              └──────────────┬───────────────────┘
                             ▼
               ┌──────────────────────────┐
               │   ohmyperf.dev           │
               │   - landing              │
               │   - drag-drop viewer     │
               │   - hosted shareable     │
               │     links (P4)           │
               └──────────────────────────┘
```

## Quickstart (planned — not yet implemented)

### CLI

```bash
npm i -D @ohmyperf/cli
npx ohmyperf install-browser
npx ohmyperf https://example.com --runs 5 --format json,html
```

### npm SDK

```ts
import { measure } from '@ohmyperf/core';
const report = await measure({
  url: 'https://example.com',
  runs: 5,
  mode: 'real',
  plugins: ['@ohmyperf/plugin-cwv', '@ohmyperf/plugin-axe'],
});
console.log(report.aggregated.lcp);
```

### Scenario (TypeScript)

```ts
// scenarios/checkout.ts
import { defineScenario } from '@ohmyperf/core';
export default defineScenario({
  name: 'checkout',
  steps: [
    { name: 'login', run: async ({ page }) => { /* setup */ } },
    { name: 'add-to-cart', measure: true, run: async ({ page }) => { /* ... */ } },
    { name: 'checkout', measure: true, run: async ({ page }) => { /* ... */ } },
  ],
});
```

```bash
npx ohmyperf scenario ./scenarios/checkout.ts --runs 5
```

### CI (GitHub Actions, planned)

```yaml
- run: npx ohmyperf https://example.com --mode ci-stable --frozen-lockfile \
       --output ./ohmyperf-out --format json,html,junit \
       --budget lcp=2500 --budget cls=0.1 --budget inp=200
```

### Chrome extension (planned)

Install from Chrome Web Store → click the "Measure this page" button → results open in the viewer.

### VSCode

Install the `OhMyPerf` extension → command palette → `OhMyPerf: Measure URL` → results in a webview with source-map-attributed CodeLens on your `.ts/.tsx/.vue/.svelte` files.

## Differentiators

- **Real machine, real browser** — no synthetic CPU/network emulation by default.
- **~99% iframe coverage** — CDP `Target.setAutoAttach({flatten:true})` cross-origin OOPIF attachment with per-frame `CDPSession`s. Sandboxed-no-scripts and fenced frames are documented opaque (see `docs/iframe-coverage.md`).
- **CI ergonomics** — two-mode runtime (`real` + `ci-stable` with calibration), Mann-Whitney diff with statistical significance, lockfile-frozen plugins, structured exit codes.
- **Plugin-first** — every metric, audit, reporter, transport, and collector is a plugin. Same hook model as ESLint/Vite.
- **Honest variance** — every report carries CoV; unstable runs (CoV>20%) are visibly flagged.
- **Inert shared reports** — public `/r/:id` viewers never re-execute plugin code.

## Capability matrix

| Metric | Chromium | Firefox | WebKit |
|---|---|---|---|
| LCP / CLS / FCP / TTFB | ✅ | ✅ web-vitals | ✅ web-vitals |
| INP | ✅ | ⚠️ partial | ⚠️ partial |
| Cross-origin OOPIF deep inspect | ✅ CDP | ❌ | ❌ |
| Coverage (unused JS/CSS) | ✅ Profiler | ❌ | ❌ |
| Trace / heap snapshot | ✅ | ❌ | ❌ |
| HAR / network waterfall | ✅ | ✅ | ✅ |
| axe-core a11y | ✅ | ✅ | ✅ |

Deep inspection is Chromium-only. Firefox/WebKit get CWV via the `web-vitals` polyfill + standard PerformanceObserver. Documented in [`docs/capability-matrix.md`](./docs/capability-matrix.md) once published.

## Project status

This repo is in **deep design**. The OpenSpec proposal at [`openspec/changes/add-ohmyperf-mvp/`](./openspec/changes/add-ohmyperf-mvp/) defines:

- [`proposal.md`](./openspec/changes/add-ohmyperf-mvp/proposal.md) — why and what
- [`design.md`](./openspec/changes/add-ohmyperf-mvp/design.md) — architecture and decisions
- [`tasks.md`](./openspec/changes/add-ohmyperf-mvp/tasks.md) — phased implementation checklist
- [`specs/`](./openspec/changes/add-ohmyperf-mvp/specs/) — 11 capability specs with WHEN/THEN scenarios
- [`../adrs/`](./openspec/adrs/) — 5 ADRs for the foundational decisions

Validate with `openspec validate add-ohmyperf-mvp --strict --no-interactive`.

## Phased delivery

| Phase | Months (cumulative) | What ships |
|---|---|---|
| **P0** | 0–5 | Engine foundation: CDP/OOPIF auto-attach, per-frame collectors, plugin lifecycle, calibration + CI Stable, JSON+HTML reporters. **Engine API frozen at end of P0.** |
| **P1** | 5–7 | CLI hardening: scenarios, budgets, diff, CI templates, all reporters. |
| **P2** | 7–9 | Static website + Chrome extension MVP. |
| **P3** | 9–12 | VSCode plugin MVP. |
| **P4** | 11–14 | Hosted shareable links (CF Workers + R2 + D1; self-host Docker). |
| **GA** | end of P4 | All 4 surfaces shipped. |
| **v1.1** | post-GA | JetBrains plugin (Kotlin). |

## Hard non-goals (v1)

- Cloud real-device farm.
- Real User Monitoring (RUM) SDK.
- Mobile-native apps.
- JetBrains plugin (deferred to v1.1).
- Plugin marketplace / registry.
- Team accounts / SaaS dashboard.
- AI-powered "fix this" suggestions.
- Distributed crawl / multi-runner orchestration.

## License

Apache-2.0. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).

Vendored / linked dependencies and their licenses:

- [`web-vitals`](https://github.com/GoogleChrome/web-vitals) — Apache-2.0
- [`axe-core`](https://github.com/dequelabs/axe-core) — MPL-2.0 (linked, not modified)
- [`playwright`](https://github.com/microsoft/playwright) — Apache-2.0
- Vendored Lighthouse audit modules — Apache-2.0
- Vendored tracium-equivalent — Apache-2.0

## Contributing

Pre-1.0.0: design proposals only. Code contributions accepted once the OpenSpec proposal is implemented through P0. See `CONTRIBUTING.md` (TBD) and `SECURITY.md` (TBD).
