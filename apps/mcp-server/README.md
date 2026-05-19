# `@ohmyperf/mcp-server`

[MCP](https://modelcontextprotocol.io/) server for [ohmyperf](https://github.com/hoainho/ohmyperf) — exposes real-machine, real-browser web performance measurement to AI coding agents (Claude in OpenCode, Cursor, GitHub Copilot, etc.) as **12 tools** and **7 prompts**.

`chrome-devtools-mcp` lets an agent inspect a live browser. `ohmyperf-mcp` lets the agent **measure**, **persist**, **diff**, and **enforce budgets** — capabilities `chrome-devtools-mcp` structurally does not have.

## Install

```bash
npm install -g @ohmyperf/mcp-server
# or use directly via npx
npx -y @ohmyperf/mcp-server
```

Requires Node ≥ 22. Playwright Chromium is downloaded on first measurement (~150 MB).

## Wire into your AI agent

### OpenCode (`~/.config/opencode/opencode.json`)

```jsonc
{
  "mcp": {
    "ohmyperf": {
      "command": "npx",
      "args": ["-y", "@ohmyperf/mcp-server"]
    }
  }
}
```

### Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`)

```jsonc
{
  "mcpServers": {
    "ohmyperf": {
      "command": "npx",
      "args": ["-y", "@ohmyperf/mcp-server"]
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)

```jsonc
{
  "mcpServers": {
    "ohmyperf": { "command": "npx", "args": ["-y", "@ohmyperf/mcp-server"] }
  }
}
```

## What the agent gets

### 12 MCP tools

| Tool | Purpose |
|---|---|
| `measure` | Measure a URL with Playwright + CDP. Returns full Report JSON (CWV, audits, frame tree, resources). `collectTrace=true` adds long-task / render-blocking attribution. |
| `track_url` | **Longitudinal monitoring (ohmyperf-only)**. Measure + append to local NDJSON time series; returns trend verdict per metric. |
| `find_regression_cause` | **Causal attribution (ohmyperf-only)**. Compares two reports, returns ranked hypotheses (new render-blocking, grown assets, new long-tasks, new third-parties). |
| `diff` | Mann-Whitney U significance test between two `report.json` files. |
| `diff_resources` | Same as `diff` but accepts `ohmyperf://reports/<file>.json` URIs. |
| `enforce_budget` | **Contract-as-code (ohmyperf-only)**. Measure + evaluate against budget JSON; returns `PASS`/`FAIL` + exit code. |
| `analyze_report` | Drill into one insight slice from a saved report (lcp-breakdown, long-tasks, third-parties, etc.) without dumping 50 KB JSON. |
| `list_runs` | List saved reports in `~/.ohmyperf-mcp/reports/`. |
| `list_styles` | List the 4 brand styles (calibre / linear-app / stripe / vercel) with manifest metadata. |
| `generate_html_report` | Render a saved report as a single-file HTML viewer. Writes to disk + returns path (avoids overflowing MCP response budgets). |
| `generate_deck` | Render a saved report as a multi-slide HTML presentation. |
| `generate_markdown_summary` | ~2 KB PR-comment-friendly Markdown of a saved report. |

### 7 MCP prompts

`diagnose_report`, `compare_runs`, `suggest_fixes`, `audit_third_parties`, `check_budget`, `investigate_regression`, `monitor_trend` — guided multi-tool flows for diagnosis, regression investigation, and longitudinal monitoring.

## Storage

Reports are persisted at `~/.ohmyperf-mcp/reports/<measurementId>.json` (each call to `measure` writes one). They are also exposed as MCP resources via `ohmyperf://reports/<file>.json` so `ListResources` can browse them.

Time-series points (from `track_url`) live at `~/.ohmyperf-mcp/timeseries/<sha256-of-url>.ndjson` — append-only, one JSON object per line.

## Why ohmyperf MCP and not chrome-devtools-mcp?

| Capability | chrome-devtools-mcp | ohmyperf-mcp |
|---|---|---|
| Live browser inspection | ✓ | — |
| Persistent reports as MCP resources | — | ✓ |
| Time-series tracking + trend detection | — | ✓ |
| Causal regression attribution | — | ✓ |
| Budget enforcement as exit-code primitive | — | ✓ |
| Mann-Whitney U statistical diff | — | ✓ |
| OOPIF (cross-origin iframe) coverage | partial | ✓ ~99% |
| Self-contained HTML/deck artifact | — | ✓ |
| Brand-aware reporting (calibre/linear/stripe/vercel) | — | ✓ |

The two MCP servers are complementary — run both for the strongest agent loop.

## Verify locally

```bash
npx -y @ohmyperf/mcp-server <<< '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}'
```

You should see a JSON-RPC initialize response on stdout.

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

## Links

- GitHub: <https://github.com/hoainho/ohmyperf>
- CLI: [`@ohmyperf/cli`](https://www.npmjs.com/package/@ohmyperf/cli)
- Docs: <https://github.com/hoainho/ohmyperf#readme>
