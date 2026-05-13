# OhMyPerf

> Real-machine, real-browser web performance measurement.
> Lighthouse and PageSpeed Insights run on synthetic CPUs in a Google datacenter.
> OhMyPerf runs on **your hardware** with **your browser** and reports what your users actually experience.

**License**: Apache-2.0 · **Status**: MVP across 7 surfaces · **Repo**: `ohmyperf/ohmyperf`

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
| **Regression detection** | Threshold gates (flake-prone) | Mann-Whitney U significance test with per-metric noise floors |
| **Plugin model** | Audit-API only, internal | Every metric, audit, reporter is a plugin |
| **Sharing** | PSI URL (public, ephemeral) | Hosted shareable links + static viewer + self-host backend |
| **AI agent access** | None | First-class MCP server (Claude / OpenCode / Cursor / Cline) |

## Surfaces

| # | Surface | Package | Quickstart |
|---|---|---|---|
| 1 | **CLI** | [`@ohmyperf/cli`](apps/cli/) | `ohmyperf run https://example.com` |
| 2 | **npm SDK** | [`@ohmyperf/core`](packages/core/) | `import { runEngine } from "@ohmyperf/core"` |
| 3 | **Chrome extension** | [`apps/extension-chrome/`](apps/extension-chrome/) | Load unpacked → click toolbar icon |
| 4 | **Website (SPA)** | [`apps/website/`](apps/website/) | `pnpm --filter @ohmyperf/website dev` → measure at `/measure`, view at `/viewer`, history at `/report`. Static export to CF Pages. _(Legacy static landing superseded by this Next.js SPA.)_ |
| 5 | **VSCode extension** | [`apps/ide-vscode/`](apps/ide-vscode/) | `Cmd+Shift+P` → `OhMyPerf: Measure URL` |
| 6 | **MCP server** | [`apps/mcp-server/`](apps/mcp-server/) | `tools/measure({ url })` from any MCP client |
| 7 | **Share-server** | [`packages/share-server/`](packages/share-server/) | Cloudflare Workers or `node dist/node.js` |

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

| Tool | Input | Output |
|---|---|---|
| `measure` | `{ url, runs?, mode?, plugins?, browserPath? }` | Human summary + `aggregated` JSON; full report saved + exposed as resource |
| `diff` | `{ baseline, candidate, failOnRegression? }` | Mann-Whitney significance table + `{ hasRegressions, metrics }` |

Saved reports surface as resources at `ohmyperf://reports/<timestamp>-<id>.json` so the agent can read them back later without re-measuring.

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

- Chrome Web Store + VSCode Marketplace + JetBrains Marketplace submissions (require publisher accounts + review cycles)
- GDPR / Privacy Policy / DPA / Terms / DSAR endpoint (require legal review)
- Argon2id password hashing in share-server (v0 uses SHA-256; Workers doesn't expose Argon2id natively)
- Source-map decorations + CodeLens in VSCode extension (v1.x)
- Per-frame collector support in Chrome extension's measurement path (v1.x)
- Scenario user-flow files in CLI (v1.x — engine assumes single-URL goto)
- TypeScript loader for `.ts` scenario files (v1.x; v0 supports `.mjs` only)
- Cloud real-device farm (explicit non-goal per ADR-002)
- RUM SDK (different product category, explicit non-goal)
- Mobile-native apps (Android/iOS WebView remote debugging is v2+)

## Repository state

109 tests across 11 workspaces, all passing against real Chromium + real Hono server + mocked `chrome.debugger`/`vscode` APIs:

```
@ohmyperf/core                39
@ohmyperf/driver-playwright    6
@ohmyperf/driver-extension     6
@ohmyperf/viewer              11
@ohmyperf/reporter-markdown    8
@ohmyperf/share-server        10
@ohmyperf/website              2
ohmyperf-vscode                2
@ohmyperf/extension-chrome     2
@ohmyperf/mcp-server           3
@ohmyperf/tests-oopif-corpus  20
                          ──────
                             109
```

Quality gates wired in CI:

- `pnpm typecheck` across 27 workspaces (strict TS, exactOptionalPropertyTypes, noUncheckedIndexedAccess)
- `pnpm lint` with import-layering rules (plugins can't import core internals, viewer can't import drivers, CDP types stay inside driver packages)
- `pnpm test` (Vitest) with `OHMYPERF_CHROMIUM_PATH` for real-browser tests
- `pnpm license:audit` — 396 packages scanned, allow-list of Apache-2.0 / MIT / ISC / BSD / MPL-2.0
- `pnpm --filter @ohmyperf/core api:check` — api-extractor enforces the frozen 1.0.0 public surface

## Contributing

This project follows OpenSpec conventions. Architecture changes go through the multi-agent deep-design pipeline (Metis scope + Oracle architecture + Momus review) before code. See [`openspec/`](openspec/) for the proposal and ADRs.

Pull requests must:

- Pass `pnpm typecheck && pnpm lint && pnpm test && pnpm license:audit`
- Update the API contract (`packages/core/etc/core.api.md`) when changing public exports
- Match existing ESLint layering rules — no CDP types in `@ohmyperf/core`, no driver imports in `@ohmyperf/viewer`

## License

Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) for third-party attributions (axe-core is MPL-2.0; web-vitals, Playwright, Lighthouse audit modules, tracium-equivalent are Apache-2.0).
