# `@ohmyperf/cli`

Real-machine, real-browser web performance measurement CLI. Measures Core Web Vitals (LCP / INP / CLS / TBT / FCP / TTFB) on your hardware, captures cross-origin iframe metrics via CDP OOPIF, and produces self-contained HTML reports + slide decks.

```
ohmyperf run https://example.com
```

## Install

```bash
# one-off
npx -y @ohmyperf/cli run https://example.com

# global
npm install -g @ohmyperf/cli
ohmyperf run https://example.com
```

Requires Node ≥ 22. Playwright Chromium is downloaded on first run (~150 MB).

## Quick start

```bash
# Measure 5 runs, output HTML + JSON + deck
ohmyperf run https://shop.example.com

# CI-stable mode: CPU calibration + Fast 4G throttle
ohmyperf run https://shop.example.com --mode=ci-stable --runs=5

# Brand-styled deck for stakeholders
ohmyperf run https://shop.example.com --style=stripe --format=deck

# Diff two runs with Mann-Whitney U significance test
ohmyperf diff baseline/report.json candidate/report.json
```

Outputs land in `./ohmyperf-output/` by default (configurable via `--output-dir`).

## Commands

| Command | Description |
|---|---|
| `ohmyperf run <url>` | Measure a URL. Omit URL in a TTY to launch interactive prompt. |
| `ohmyperf diff <baseline> <candidate>` | Mann-Whitney U significance test between two reports. Exit 1 on regression. |
| `ohmyperf share <file>` | Upload to a share-server with env-secret scrubber + optional password + expiry. |
| `ohmyperf doctor` | Diagnose Node / OS / browser / plugin set; non-zero on broken setup. |
| `ohmyperf init --ci <provider>` | Scaffold CI templates (GitHub Actions / GitLab CI / CircleCI). |
| `ohmyperf list-plugins` | List built-in plugins with version + capabilities. |
| `ohmyperf list-styles` | List the 4 brand styles (calibre / linear-app / stripe / vercel). |
| `ohmyperf install-browser` | Idempotent Playwright Chromium install. |

Use `ohmyperf <command> --help` for flags.

## What you get

- **Real machine, real Chromium** — not synthetic cloud, not Lighthouse's simulated lantern model.
- **OOPIF coverage ~99%** — `Target.setAutoAttach({ flatten: true })` gets a real CDPSession per cross-origin iframe (Stripe Elements, Intercom, YouTube embed, ad iframes…).
- **Mann-Whitney U significance** — N runs (default 5), non-parametric diff with per-metric noise floors. Distinguishes real regressions from variance.
- **CPU calibration** — `--mode=ci-stable` runs a JS benchmark before measurement, normalizes to a reference hardware profile (mid-range-2024-laptop, 250 ms). Cross-machine CI comparisons stop lying.
- **Self-contained HTML + deck artifacts** — 1 file, zero CDN, zero tracking. Open in 5 years, still works.
- **Brand-aware reporting** — `--style=calibre|linear-app|stripe|vercel`. WCAG-AA gate enforced in CI.

## Why ohmyperf vs Lighthouse / DevTools / WebPageTest / SpeedCurve

OhMyPerf is the only tool that combines:

1. Local lab measurement on your hardware
2. A portable, single-file shareable artifact
3. An MCP server surface ([`@ohmyperf/mcp-server`](https://www.npmjs.com/package/@ohmyperf/mcp-server)) for AI coding agents

See [the project README](https://github.com/hoainho/ohmyperf#readme) for the full positioning matrix.

## AI agent integration

Use the companion [`@ohmyperf/mcp-server`](https://www.npmjs.com/package/@ohmyperf/mcp-server) to expose measurement, regression analysis, and budget enforcement as MCP tools (Claude, Cursor, OpenCode, Copilot).

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

## Links

- GitHub: <https://github.com/hoainho/ohmyperf>
- MCP server: [`@ohmyperf/mcp-server`](https://www.npmjs.com/package/@ohmyperf/mcp-server)
- Issues: <https://github.com/hoainho/ohmyperf/issues>
