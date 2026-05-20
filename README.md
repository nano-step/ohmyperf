# OhMyPerf

> Real-machine, real-browser web performance measurement — with a closed agent fix loop.
> Lighthouse and PageSpeed Insights run on synthetic CPUs in a Google datacenter.
> OhMyPerf runs on **your hardware** with **your browser** and reports what your users actually experience.
> An AI agent can call `measure → propose_patch → verify_fix` in one conversation turn.

**v0.1.0** (v0.2.0 in flight — see [issue #7](https://github.com/hoainho/ohmyperf/issues/7)) · **License**: Apache-2.0 · **npm**: [`@ohmyperf/cli`](https://www.npmjs.com/package/@ohmyperf/cli) + [`@ohmyperf/mcp-server`](https://www.npmjs.com/package/@ohmyperf/mcp-server) · **Repo**: [`hoainho/ohmyperf`](https://github.com/hoainho/ohmyperf)

## What's new in v0.2.0

- **`measure → propose_patch → verify_fix` agent fix loop.** The only perf tool where an AI agent can both fix a CWV regression AND statistically prove the fix improved metrics (Mann-Whitney U), in one conversation turn.
- **`@ohmyperf/eslint-plugin`** — 7 CWV-linked ESLint rules catch performance anti-patterns at editor-save time (`no-document-write`, `no-sync-xhr`, `prefer-loading-lazy`, `prefer-fetchpriority`, `no-render-blocking-script-in-head`, `no-large-inline-data-url`, `no-passive-event-violation`).
- **Real cross-origin OOPIF inspection.** Each cross-origin iframe gets its own CDP session via Playwright `context.newCDPSession(frame)`. Verified on real-world MDN pages (mdnplay.dev, example.org, openstreetmap.org).
- **INP measurable in CI** via synthetic `Input.dispatchMouseEvent`. Pass `--synthetic-interaction=auto-click` and ohmyperf finds a click target + fires a trusted-event pipeline so INP attribution lands.
- **Source-map detection.** `longestScript.sourceLocation` now exposes `{ file, sourceMapUrl, resolved }` so agents can lift script URLs back to repo paths.

## Install

```bash
# CLI for humans + CI
npm install -g @ohmyperf/cli
ohmyperf run https://your-site.com

# MCP server for AI coding agents (Claude in OpenCode, Cursor, Copilot)
npm install -g @ohmyperf/mcp-server

# v0.2.0: ESLint plugin for editor-save-time CWV linting
# (available after v0.2.0 publishes — see issue #7)
npm install --save-dev @ohmyperf/eslint-plugin
```

Or use `npx -y @ohmyperf/cli run https://your-site.com` for a zero-install one-off.

Requires Node ≥ 22. Playwright Chromium auto-downloads on first run (~150 MB).

```
┌─────────────────────────────────────────────────────────────────┐
│  Engine: @ohmyperf/core (45-export API, frozen)                 │
│  · Playwright + raw CDP (Target.setAutoAttach for cross-origin) │
│  · Plugin runtime · Calibration · Outlier rejection · Diff      │
└─────────────────────────────────────────────────────────────────┘
        │
        ├──► CLI                 npx ohmyperf run <url>
        ├──► npm SDK             import { runEngine } from "@ohmyperf/core"
        ├──► Chrome extension    chrome.debugger driver, click → measure
        ├──► Website             ohmyperf.dev landing + drag-drop /viewer
        ├──► VSCode extension    OhMyPerf: Measure URL (command palette)
        ├──► MCP server          AI agents call measure/diff tools
        └──► Share-server        Hono on Cloudflare Workers or Node
```

## Why OhMyPerf

| Concern | Lighthouse / PageSpeed | OhMyPerf |
|---|---|---|
| **Where measurement runs** | Synthetic emulated CPU in a datacenter | The user's actual machine |
| **CWV numbers** | Inflated by synthetic throttle | Match what users actually experience |
| **Cross-origin iframes** | Network-only — opaque inside | Per-frame `CDPSession` via `Target.setAutoAttach({flatten:true})` |
| **CI reproducibility** | Lighthouse-CI exists but synthetic | Two modes: `real` (honest variance) + `ci-stable` (CPU calibration + Fast 4G throttle) |
| **Accuracy** | Authoritative, internal | LCP/FCP/TTFB ±10% vs Lighthouse 13.x ([validated](docs/accuracy.md)); INP/CLS via official `web-vitals/attribution` |
| **Diagnostics** | Audit list with savings estimates | LCP/INP sub-parts bar, CLS culprit + rect, long-task → JS URL, render-blocking with wastedMs, third-party impact ([details](docs/diagnostics.md)) |
| **Regression detection** | Threshold gates (flake-prone) | Mann-Whitney U significance test with per-metric noise floors |
| **Plugin model** | Audit-API only, internal | Every metric, audit, reporter is a plugin |
| **Sharing** | PSI URL (public, ephemeral) | Hosted shareable links + static viewer + self-host backend |
| **AI agent access** | None | First-class MCP server (Claude / OpenCode / Cursor / Cline) |

## Surfaces

| # | Surface | Package | Quickstart |
|---|---|---|---|
| 1 | **CLI** | [`@ohmyperf/cli`](apps/cli/) | `ohmyperf run https://example.com` |
| 2 | **npm SDK** | [`@ohmyperf/core`](packages/core/) | `import { runEngine, measure } from "@ohmyperf/core"` |
| 3 | **Chrome extension** | [`apps/extension-chrome/`](apps/extension-chrome/) | Load unpacked → click toolbar icon |
| 4 | **Website (SPA)** | [`apps/website/`](apps/website/) · spec [`measurement-spa`](openspec/specs/measurement-spa/spec.md) | `pnpm --filter @ohmyperf/website dev` → measure at `/measure`, view at `/viewer`, history at `/report`. Static export to CF Pages. |
| 5 | **VSCode extension** | [`apps/ide-vscode/`](apps/ide-vscode/) | `Cmd+Shift+P` → `OhMyPerf: Measure URL` |
| 6 | **MCP server** | [`apps/mcp-server/`](apps/mcp-server/) | 14 tools incl. `measure`, `propose_patch` (v0.2.0), `verify_fix` (v0.2.0) |
| 7 | **Share-server** | [`packages/share-server/`](packages/share-server/) | Cloudflare Workers or `node dist/node.js` |
| 8 | **ESLint plugin** *(v0.2.0)* | [`@ohmyperf/eslint-plugin`](packages/eslint-plugin/) | `npm i -D @ohmyperf/eslint-plugin` + `extends: ['plugin:ohmyperf/recommended']` |
| 9 | **Fixer SDK** *(v0.2.0)* | [`@ohmyperf/fixers`](packages/fixers/) | `import { proposePatches } from "@ohmyperf/fixers"` |

## CLI quickstart

```bash
# Install
npm install -g @ohmyperf/cli
ohmyperf install-browser

# Measure
ohmyperf run https://example.com --runs 5 --format json,html

# CI-gating mode (calibrated CPU + Fast 4G)
ohmyperf run https://example.com --mode ci-stable --runs 5

# Compare two reports with Mann-Whitney significance (exit 1 on regression)
ohmyperf diff baseline.json candidate.json

# Share a report to a hosted endpoint
export OHMYPERF_SHARE_ENDPOINT=https://ohmyperf.dev
ohmyperf share ./ohmyperf-out/report.json

# Diagnostics
ohmyperf doctor
ohmyperf list-plugins --json
```

Subcommands: `run`, `diff`, `share`, `doctor`, `list-plugins`, `install-browser`.
Exit codes 0–12 documented per the [`cli-surface`](openspec/changes/add-ohmyperf-mvp/specs/cli-surface/spec.md) capability spec.

## Example output

```
[ohmyperf] INFO OhMyPerf v1.0.0 report
[ohmyperf] INFO url:     https://example.com
[ohmyperf] INFO browser: chromium 147.0.7727.0 (bundled)
[ohmyperf] INFO mode:    real; runs=5; duration=4823ms
[ohmyperf] INFO aggregated:
[ohmyperf] INFO   lcp        median=  44.0  cov=4.3%  n=5
[ohmyperf] INFO   fcp        median=  44.0  cov=4.3%  n=5
[ohmyperf] INFO   ttfb       median=   6.5  cov=12.3% n=5
[ohmyperf] INFO   cls        median=  0.000 cov=0.0%  n=5
[ohmyperf] INFO   tbt        median=   0.0  cov=0.0%  n=5
[ohmyperf] INFO audits: 1
[ohmyperf] INFO   [PASS] a11y.axe-violations
[ohmyperf] INFO wrote ./ohmyperf-out/report.json (9 KB)
[ohmyperf] INFO wrote ./ohmyperf-out/report.html (28 KB)
```

## npm SDK quickstart

```ts
import { runEngine, createSilentLogger } from "@ohmyperf/core";
import { createPlaywrightAdapter } from "@ohmyperf/driver-playwright";
import { cwvPlugin, axePlugin } from "@ohmyperf/plugins-builtin";
import { writeJsonReport } from "@ohmyperf/reporter-json";

const { driver, adapter } = createPlaywrightAdapter({
  url: "https://example.com",
  kind: "chromium",
});

const report = await runEngine({
  opts: {
    url: "https://example.com",
    runs: 5,
    mode: "real",
    plugins: [cwvPlugin(), axePlugin({ tags: ["wcag2aa"] })],
  },
  driver,
  adapter,
  logger: createSilentLogger(),
});

console.log(report.aggregated.lcp);
// { median: 44, p75: 45, p95: 47, mean: 44.5, stdev: 1.2, cov: 0.027,
//   runs: 5, droppedOutliers: 0 }

await writeJsonReport(report, "./out");
```

The public API (`@ohmyperf/core`) is frozen at `1.0.0-stable` and enforced by `api-extractor` in CI. See [`packages/core/etc/core.api.md`](packages/core/etc/core.api.md) for the 45-export contract.

## Chrome extension

```bash
cd apps/extension-chrome
pnpm build
# Chrome → chrome://extensions → Developer mode → Load unpacked
# Point at apps/extension-chrome/extension-dist/
```

Click the toolbar icon on any tab. A "measuring…" badge appears, then opens a viewer tab with the full HTML report when done. Uses `chrome.debugger` directly — no companion app, no localhost relay.

Chrome Web Store submission is documented as deferred (requires publisher account + privacy policy URL + review cycle).

## VSCode extension

```bash
cd apps/ide-vscode
pnpm build
# Code → Extensions → ⋯ → Install from VSIX
# Or develop: F5 in this folder launches an Extension Development Host.
```

Commands:

- `OhMyPerf: Measure URL` — prompts for URL, runs the CLI, opens result in a webview.
- `OhMyPerf: Open Report File…` — file picker for replaying saved reports.

Settings: `ohmyperf.cliPath`, `ohmyperf.defaultUrl`, `ohmyperf.defaultRuns`, `ohmyperf.defaultMode`.

VSCode Marketplace submission is documented as deferred.

## MCP server (for AI agents)

OhMyPerf ships an MCP (Model Context Protocol) server so AI agents like **Claude Desktop**, **OpenCode**, **Cursor**, **Cline**, and **Continue** can call `measure` and `diff` as first-class tools.

### Register with OpenCode

`~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "ohmyperf": {
      "type": "local",
      "command": ["npx", "ohmyperf-mcp"]
    }
  }
}
```

### Register with Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "ohmyperf": {
      "command": "npx",
      "args": ["ohmyperf-mcp"]
    }
  }
}
```

### Tools exposed

> **What's available where**: `@ohmyperf/mcp-server@0.1.0` currently on npm exposes the 12 tools NOT marked `(v0.2.0)`. The 2 v0.2.0-tagged tools (`propose_patch`, `verify_fix`) are committed on `main` and will land when v0.2.0 publishes — track at [issue #7](https://github.com/hoainho/ohmyperf/issues/7).

| Tool | Input | Output |
|---|---|---|
| `measure` | `{ url, runs?, mode?, plugins?, browserPath?, collectTrace? }` | Human summary + `Saved to: <path>` + `aggregated` JSON; full report saved + exposed as resource |
| `diff` | `{ baseline, candidate, failOnRegression? }` | Mann-Whitney significance table + `{ hasRegressions, metrics }` |
| `analyze_report` | `{ reportPath \| uri, insightName, limit? }` | Slice for one insight (lcp-breakdown / render-blocking / long-tasks / third-parties / opportunities / audits / resources / frames) |
| `generate_markdown_summary` | `{ reportPath \| uri, title? }` | PR-comment-ready Markdown summary with 🟢/🟡/🔴 verdict block |
| `generate_html_report` | `{ reportPath \| uri, outputDir?, theme?, style? }` | Single-file HTML viewer written to disk |
| `generate_deck` | `{ reportPath \| uri, outputDir?, style?, title? }` | Multi-slide HTML presentation (⌘P → PDF for stakeholder distribution) |
| `find_regression_cause` | `{ baseline, candidate }` | Ranked hypotheses (new render-blocking, grown assets, new long tasks, new third-parties) with evidence |
| `enforce_budget` | `{ url, budget, mode?, runs? }` | CI-style pass/fail per metric with exit-code-style verdict |
| `track_url` | `{ url, runs?, mode?, ... }` | Measure + append to time-series + return improving/stable/regressing trend |
| **`propose_patch`** *(v0.2.0)* | `{ reportPath \| uri, opportunityId?, url?, maxPatches? }` | Structured `{ archetype, url, search, replace, rationale, expectedImpactMs, confidence }[]` patches an agent can apply |
| **`verify_fix`** *(v0.2.0)* | `{ baselineReportPath \| baselineUri, candidateUrl, runs?, mode? }` | Re-measures candidate + Mann-Whitney U diff vs baseline; verdict `✅ no regression` / `❌ REGRESSION DETECTED` |
| `list_runs` / `list_styles` / `diff_resources` | various | Resource browsing + brand catalog + URI-based diff |

Saved reports surface as resources at `ohmyperf://reports/<timestamp>-<id>.json` so the agent can read them back later without re-measuring.

### Killer flow: closed agent fix loop (v0.2.0)

```
1. measure(url)              → report.json + opportunities
2. propose_patch(reportPath) → { archetype: "render-blocking-script-add-defer",
                                  search: '<script src="vendor.js"',
                                  replace: '<script src="vendor.js" defer',
                                  expectedImpactMs: 320,
                                  confidence: "high" }
3. (agent applies patch + deploys to preview)
4. verify_fix(baseline, candidateUrl) → ✅ no regression / ❌ REGRESSION
```

End-to-end loop time: ~5.5s against a real public URL ([commit `a41301f`](https://github.com/hoainho/ohmyperf/commit/a41301f) verified composition). Patches archetypes covering ~80% of typical opportunities (render-blocking scripts/stylesheets, LCP image fetchpriority + preload).

## Website (`ohmyperf.dev`)

```bash
cd apps/website
pnpm build
# site-dist/ ready for static deploy:
#   wrangler pages publish site-dist
#   netlify deploy --dir=site-dist
#   gh-pages -d site-dist
```

Routes:

- `/` — landing page (light/dark theme, no external network requests)
- `/viewer.html` — drag-drop `report.json` to render in browser (no upload)
- `/r/:id` — served by the share-server when deployed alongside

Cloudflare Pages + Workers production deployment defers to a separate ops project.

## Share-server (hosted shareable links)

Two deployment targets from the same Hono codebase:

### Cloudflare Workers + R2 + D1 (production)

```bash
cd packages/share-server
# wrangler.toml + D1 schema (D1_SCHEMA export)
wrangler d1 execute ohmyperf-db --file=schema.sql
wrangler deploy
```

### Node + filesystem (self-host)

```bash
cd packages/share-server
pnpm build
PORT=4170 OHMYPERF_SHARE_DATA_DIR=./data node dist/node.js
# listening on http://127.0.0.1:4170
```

API:

```
POST /api/share          { report, password?, expiresInMs?, private? } → { id, url, expiresAt }
GET  /api/r/:id          → raw report JSON (with optional password gate)
GET  /r/:id              → rendered HTML (uses @ohmyperf/viewer)
DELETE /api/r/:id        → 204
```

Per-IP rate limit (10/hour default), 10 MB body cap, mandatory security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`), env-secret scrubber in the upload client.

GDPR / Privacy Policy / DPA / DSAR endpoint defer to legal review.

## CI integration

Drop-in [`templates/ci/github-actions.yml`](templates/ci/github-actions.yml):

```yaml
- run: npx ohmyperf run "$OHMYPERF_URL" --mode ci-stable --runs 5 \
       --format json,html,markdown --output ./perf
- uses: actions/upload-artifact@v4
  with: { name: ohmyperf-reports, path: perf/ }
- if: github.event_name == 'pull_request'
  run: ohmyperf diff .ohmyperf-baseline/report.json perf/report.json
```

Auto-posts the Markdown summary as a PR comment via `actions/github-script@v7`. Mann-Whitney significance gates the merge.

## Architecture

Monorepo: pnpm workspaces + Turborepo.

```
ohmyperf/
├── packages/
│   ├── core/                     # Engine, plugin runtime, calibration, diff
│   ├── driver-playwright/        # Playwright + raw CDP (newCDPSession)
│   ├── driver-extension/         # chrome.debugger driver
│   ├── plugins-builtin/          # cwv, axe, custom-metric-example
│   ├── reporter-{json,html,markdown}/
│   ├── viewer/                   # Pure-TS HTML report renderer
│   ├── share-client/             # Upload + redaction pipeline
│   ├── share-server/             # Hono backend (Workers + Node)
│   └── tests-oopif-corpus/       # Synthetic cross-origin iframe fixtures
├── apps/
│   ├── cli/                      # ohmyperf binary (citty)
│   ├── website/                  # Static landing + drag-drop viewer
│   ├── extension-chrome/         # MV3 + chrome.debugger
│   ├── ide-vscode/               # Command palette + webview
│   └── mcp-server/               # @modelcontextprotocol/sdk stdio server
└── openspec/                     # OpenSpec proposal + ADRs
```

ADRs:

- [ADR-001](openspec/adrs/ADR-001-driver-abstraction.md) Driver abstraction; Playwright primary; raw CDP via `newCDPSession()`
- [ADR-002](openspec/adrs/ADR-002-oopif-deep-inspection.md) OOPIF via `Target.setAutoAttach({flatten:true})`; CLS dual reporting
- [ADR-003](openspec/adrs/ADR-003-plugin-runtime.md) Plugins in-process; npm trust; shared reports are inert JSON
- [ADR-004](openspec/adrs/ADR-004-website-chrome-extension.md) Chrome extension via `chrome.debugger`
- [ADR-005](openspec/adrs/ADR-005-share-backend.md) Cloudflare Workers + R2 + D1; Hono + S3 + Postgres self-host parity

## Capability matrix

Cross-browser deep-inspection is Chromium-only. Firefox and WebKit get CWV via the `web-vitals` polyfill + standard PerformanceObserver.

| Metric | Chromium | Firefox | WebKit |
|---|---|---|---|
| LCP / CLS / FCP / TTFB | ✅ | ✅ web-vitals | ✅ web-vitals |
| INP | ✅ | ⚠️ partial | ⚠️ partial |
| Cross-origin OOPIF deep inspect | ✅ CDP | ❌ | ❌ |
| Coverage (unused JS/CSS) | ✅ Profiler | ❌ | ❌ |
| Trace / heap snapshot | ✅ | ❌ | ❌ |
| HAR / network waterfall | ✅ | ✅ | ✅ |
| axe-core a11y | ✅ | ✅ | ✅ |

## Honest defer list

Documented per surface in each commit message. Not blockers for v0 dogfood:

- ~~Per-frame collector support in Chrome extension's measurement path~~ **Done (v0.2.0)**: cross-origin OOPIFs get real CDP sessions via `context.newCDPSession(frame)`.
- ~~Source-map detection on `longestScript`~~ **Done stage-1 (v0.2.0)**: schema slot + `sourceMappingURL` regex detection. Stage 2 (VLQ decode + fetch + repo-root mapping) deferred to v0.3 — depends on adding `@jridgewell/sourcemap-codec`.
- VSCode Marketplace publish **engineering ready (v0.2.0)** — `.github/workflows/publish-vscode.yml` + `vsce package` verified locally produces valid .vsix; needs anh's `VSCE_PAT` secret. See [`docs/PUBLISH-VSCODE.md`](docs/PUBLISH-VSCODE.md).
- Cloudflare Pages website deploy **engineering ready (v0.2.0)** — `.github/workflows/deploy-website.yml` ready; needs anh's `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets. See [`docs/DEPLOY-WEBSITE.md`](docs/DEPLOY-WEBSITE.md).
- smithery.ai + glama.ai MCP listings **engineering ready (v0.2.0)** — `smithery.yaml` configured for stdio runtime. See [`docs/PUBLISH-MCP-LISTINGS.md`](docs/PUBLISH-MCP-LISTINGS.md).
- Chrome Web Store extension publish (requires publisher account + privacy policy URL + review cycle)
- JetBrains Marketplace + IntelliJ plugin (v0.3+)
- GDPR / Privacy Policy / DPA / Terms / DSAR endpoint (require legal review)
- Argon2id password hashing in share-server (v0 uses SHA-256; Workers doesn't expose Argon2id natively)
- Source-map decorations + CodeLens in VSCode extension (v0.3+)
- Scenario user-flow files in CLI (v0.3+ — engine assumes single-URL goto)
- TypeScript loader for `.ts` scenario files (v0.3+; v0 supports `.mjs` only)
- Cloud real-device farm (explicit non-goal per ADR-002)
- RUM SDK (different product category, explicit non-goal)
- Mobile-native apps (Android/iOS WebView remote debugging is v0.4+)

## Repository state

365 tests across 13 workspaces, all passing on Node 22 and Node 24, against real Chromium + real Hono server + mocked `chrome.debugger`/`vscode` APIs:

```
@ohmyperf/core                 38
@ohmyperf/driver-playwright     6
@ohmyperf/driver-extension      6
@ohmyperf/viewer               98
@ohmyperf/reporter-markdown     8
@ohmyperf/share-server         10
@ohmyperf/website               0  (Playwright specs run via `test:smoke`)
ohmyperf-vscode                 2
@ohmyperf/extension-chrome      1  (+ 4 deferred-skip integration tests)
@ohmyperf/mcp-server            3
@ohmyperf/tests-oopif-corpus   31  (+ 1 skipped, real CLI dependency)
@ohmyperf/eslint-plugin         7  (v0.2.0 — RuleTester)
@ohmyperf/fixers                7  (v0.2.0 — proposePatches)
                            ──────
                              365
```

Quality gates wired in CI:

- `pnpm typecheck` across 31 workspaces (strict TS, exactOptionalPropertyTypes, noUncheckedIndexedAccess)
- `pnpm lint` with import-layering rules (plugins can't import core internals, viewer can't import drivers, CDP types stay inside driver packages)
- `pnpm test` (Vitest) with `OHMYPERF_CHROMIUM_PATH` for real-browser tests
- `pnpm license:audit` — 396+ packages scanned, allow-list of Apache-2.0 / MIT / ISC / BSD / MPL-2.0
- `pnpm --filter @ohmyperf/core api:check` — api-extractor enforces the frozen 1.0.0 public surface
- `actionlint v1.7.12` across all 7 workflows (0 warnings)
- `publish-stable.yml` preflight: `npm whoami` + `npm access list packages @ohmyperf` to catch misconfigured tokens before pipeline cost (skips itself in OIDC-only mode)

## Contributing

This project follows OpenSpec conventions. Architecture changes go through the multi-agent deep-design pipeline (Metis scope + Oracle architecture + Momus review) before code. See [`openspec/`](openspec/) for the proposal and ADRs.

Pull requests must:

- Pass `pnpm typecheck && pnpm lint && pnpm test && pnpm license:audit`
- Update the API contract (`packages/core/etc/core.api.md`) when changing public exports
- Match existing ESLint layering rules — no CDP types in `@ohmyperf/core`, no driver imports in `@ohmyperf/viewer`

## License

Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) for third-party attributions (axe-core is MPL-2.0; web-vitals, Playwright, Lighthouse audit modules, tracium-equivalent are Apache-2.0).
