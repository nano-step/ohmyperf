import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  diffReports,
  formatDiff,
  runEngine,
  type Opportunity,
  type Report,
} from "@ohmyperf/core";
import { createPlaywrightAdapter } from "@ohmyperf/driver-playwright";
import {
  axePlugin,
  cwvPlugin,
  customMetricExamplePlugin,
  thirdPartiesPlugin,
} from "@ohmyperf/plugins-builtin";
import { writeDeckReport } from "@ohmyperf/reporter-deck";
import { writeJsonReport } from "@ohmyperf/reporter-json";
import { renderMarkdown } from "@ohmyperf/reporter-markdown";
import {
  analyzeRegressionCause,
  type RegressionCauseReport,
} from "./regression-cause.js";
import {
  appendTimeSeriesPoint,
  detectAllTrends,
  readTimeSeries,
  type TimeSeriesPoint,
  type TrendVerdict,
} from "./timeseries.js";

export interface McpServerOptions {
  readonly reportsDir?: string;
  readonly maxReports?: number;
}

const DEFAULT_REPORTS_DIR = join(homedir(), ".ohmyperf-mcp", "reports");
const DEFAULT_MAX_REPORTS = 50;

type PluginId = "cwv" | "axe" | "third-parties" | "custom-metric-example";

const PLUGIN_IDS: readonly PluginId[] = [
  "cwv",
  "axe",
  "third-parties",
  "custom-metric-example",
] as const;

interface MeasureInput {
  url: string;
  runs?: number;
  mode?: "real" | "ci-stable";
  plugins?: ReadonlyArray<PluginId>;
  browserPath?: string;
  collectTrace?: boolean;
}

interface DiffInput {
  baseline: string;
  candidate: string;
  failOnRegression?: boolean;
}

type InsightName =
  | "lcp-breakdown"
  | "render-blocking"
  | "long-tasks"
  | "third-parties"
  | "opportunities"
  | "audits"
  | "resources"
  | "frames";

const INSIGHT_NAMES: readonly InsightName[] = [
  "lcp-breakdown",
  "render-blocking",
  "long-tasks",
  "third-parties",
  "opportunities",
  "audits",
  "resources",
  "frames",
] as const;

export function createOhmyperfMcpServer(opts: McpServerOptions = {}): Server {
  const reportsDir = resolve(opts.reportsDir ?? DEFAULT_REPORTS_DIR);
  const maxReports = opts.maxReports ?? DEFAULT_MAX_REPORTS;

  const server = new Server(
    { name: "ohmyperf", version: "0.0.0-pre" },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: "measure",
        description:
          "Measure a URL with the OhMyPerf engine on a real Chromium browser. Returns the full Report JSON with CWV (LCP/FCP/TTFB/CLS/TBT), audits, frame tree, and per-resource timing. The report is also saved to the MCP server's reports dir and exposed as a resource. Set collectTrace=true to enable trace-based diagnostics (long-tasks, render-blocking, INP attribution).",
        inputSchema: {
          type: "object",
          required: ["url"],
          properties: {
            url: {
              type: "string",
              description: "HTTP(S) URL to measure",
            },
            runs: {
              type: "integer",
              minimum: 1,
              maximum: 30,
              default: 3,
              description: "Number of measurement runs (default 3)",
            },
            mode: {
              type: "string",
              enum: ["real", "ci-stable"],
              default: "real",
              description:
                "real = no throttling (dev loop); ci-stable = pre-flight CPU calibration + Fast 4G network",
            },
            plugins: {
              type: "array",
              items: { type: "string", enum: PLUGIN_IDS as unknown as string[] },
              default: ["cwv", "axe"],
              description:
                "Built-in plugins to enable. 'third-parties' classifies resources by vendor (gtm, analytics, ads, etc.).",
            },
            browserPath: {
              type: "string",
              description:
                "Override the Chromium binary path (e.g. for full Chromium vs headless-shell)",
            },
            collectTrace: {
              type: "boolean",
              default: false,
              description:
                "Capture Chrome DevTools trace for diagnostic insights (render-blocking, long-tasks, INP breakdown). Adds ~5-20MB per run.",
            },
          },
        },
      },
      {
        name: "diff",
        description:
          "Compare two report.json files using Mann-Whitney U significance test. Returns per-metric regression/improvement/neutral status + p-values + median deltas. Useful for AB-comparing 'main' vs a feature branch.",
        inputSchema: {
          type: "object",
          required: ["baseline", "candidate"],
          properties: {
            baseline: { type: "string", description: "Path to baseline report.json" },
            candidate: { type: "string", description: "Path to candidate report.json" },
            failOnRegression: {
              type: "boolean",
              default: true,
              description: "If true, surface 'verdict: regression detected' prominently",
            },
          },
        },
      },
      {
        name: "analyze_report",
        description:
          "Drill into a specific insight from a saved report WITHOUT returning the full 50KB+ JSON. Provide insightName to scope the response (e.g. 'lcp-breakdown', 'long-tasks', 'third-parties'). Token-efficient — only the requested slice is returned.",
        inputSchema: {
          type: "object",
          required: ["insightName"],
          properties: {
            reportPath: {
              type: "string",
              description: "Filesystem path to report.json (alternative to 'uri')",
            },
            uri: {
              type: "string",
              description:
                "Resource URI like 'ohmyperf://reports/<file>.json' (alternative to 'reportPath')",
            },
            insightName: {
              type: "string",
              enum: INSIGHT_NAMES as unknown as string[],
              description: "Which slice of the report to return",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 200,
              default: 20,
              description: "Max items for list-shaped insights (resources, long-tasks, etc.)",
            },
          },
        },
      },
      {
        name: "generate_markdown_summary",
        description:
          "Render a saved report as a human-readable Markdown summary (same format used by `ohmyperf run --reporter markdown`). Returns a compact ~2KB string suitable for PR comments or chat output.",
        inputSchema: {
          type: "object",
          properties: {
            reportPath: {
              type: "string",
              description: "Filesystem path to report.json (alternative to 'uri')",
            },
            uri: {
              type: "string",
              description: "Resource URI like 'ohmyperf://reports/<file>.json'",
            },
            title: {
              type: "string",
              description: "Override the H2 title (default: 'OhMyPerf report')",
            },
          },
        },
      },
      {
        name: "generate_deck",
        description:
          "Render a saved report as a multi-slide HTML presentation (Calibre palette, Swiss-grid layout, light-locked, print-to-PDF first-class). WRITES THE DECK TO DISK AND RETURNS THE FILE PATH — does NOT return the body inline (decks are ~30-500KB, would overflow MCP response budgets). The file lives at <reportsDir>/decks/<measurementId>.html. Open in a browser, navigate with arrow keys, ⌘P to PDF for stakeholder distribution.",
        inputSchema: {
          type: "object",
          properties: {
            reportPath: {
              type: "string",
              description: "Filesystem path to report.json (alternative to 'uri')",
            },
            uri: {
              type: "string",
              description: "Resource URI like 'ohmyperf://reports/<file>.json'",
            },
            outputDir: {
              type: "string",
              description: "Override the output directory (default: <reportsDir>/decks/).",
            },
            title: {
              type: "string",
              description: "Override the deck title (default: 'OhMyPerf — <hostname>').",
            },
          },
        },
      },
      {
        name: "list_runs",
        description:
          "List all saved reports in the MCP server's reports dir, with measurementId, URL, mode, started timestamp, and size. Equivalent to ListResources but available as a tool for clients that don't browse resources.",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 200,
              default: 25,
              description: "Max number of reports to list (most recent first)",
            },
          },
        },
      },
      {
        name: "diff_resources",
        description:
          "Same as 'diff' but accepts resource URIs ('ohmyperf://reports/<file>.json') instead of filesystem paths. Lets you compare reports the agent already saw via ListResources.",
        inputSchema: {
          type: "object",
          required: ["baselineUri", "candidateUri"],
          properties: {
            baselineUri: { type: "string", description: "Baseline resource URI" },
            candidateUri: { type: "string", description: "Candidate resource URI" },
            failOnRegression: {
              type: "boolean",
              default: true,
              description: "If true, surface 'verdict: regression detected' prominently",
            },
          },
        },
      },
      {
        name: "track_url",
        description:
          "Longitudinal monitoring — measure a URL AND append the result to a time-series log at ~/.ohmyperf-mcp/timeseries/<sha256-url>.ndjson. Returns the new point + a trend verdict (improving/stable/regressing) per CWV metric over the full history. Use this instead of 'measure' when you want the agent to reason about performance changes over time. ohmyperf-only — chrome-devtools-mcp has no persistence layer.",
        inputSchema: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string", description: "HTTP(S) URL to measure and track" },
            runs: {
              type: "integer",
              minimum: 1,
              maximum: 30,
              default: 3,
              description: "Number of measurement runs (default 3)",
            },
            mode: {
              type: "string",
              enum: ["real", "ci-stable"],
              default: "ci-stable",
              description:
                "ci-stable recommended for tracking: pre-flight CPU calibration + Fast 4G ensures comparability across runs.",
            },
            plugins: {
              type: "array",
              items: { type: "string", enum: PLUGIN_IDS as unknown as string[] },
              default: ["cwv"],
              description: "Built-in plugins to enable during the tracked measurement",
            },
            collectTrace: {
              type: "boolean",
              default: false,
              description: "Capture trace for the new point (adds ~5-20MB).",
            },
            browserPath: {
              type: "string",
              description: "Override the Chromium binary path (same as 'measure').",
            },
            historyLimit: {
              type: "integer",
              minimum: 5,
              maximum: 500,
              default: 100,
              description: "Max history points to consider when computing the trend.",
            },
          },
        },
      },
      {
        name: "find_regression_cause",
        description:
          "Beyond raw diff — given two reports where a metric regressed, this tool produces RANKED HYPOTHESES with evidence: new render-blocking resources, grown/slowed assets, new long tasks attributed to scripts, and new third-party vendors. Each hypothesis lists likely causes prioritized by the regressed metric (LCP/INP/CLS heuristics). ohmyperf-only — devtools-mcp has no diff engine.",
        inputSchema: {
          type: "object",
          properties: {
            baseline: { type: "string", description: "Baseline filesystem path OR resource URI" },
            candidate: { type: "string", description: "Candidate filesystem path OR resource URI" },
          },
          required: ["baseline", "candidate"],
        },
      },
      {
        name: "enforce_budget",
        description:
          "Contract-as-code — measure a URL and evaluate it against a perf budget JSON. Returns structured pass/fail per metric with exit-code-style verdict (status='PASS'|'FAIL', exitCode=0|12). Defaults: lcp ≤ 2500ms, inp ≤ 200ms, cls ≤ 0.1, tbt ≤ 200ms, fcp ≤ 1800ms, ttfb ≤ 800ms. Pair this with CI to gate PRs. ohmyperf-only — devtools-mcp has no budget primitive.",
        inputSchema: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string", description: "HTTP(S) URL to measure" },
            budget: {
              type: "object",
              description:
                "Per-metric budget in metric units. Missing metrics use defaults. Example: { lcp: 2000, inp: 150 }",
              additionalProperties: { type: "number" },
            },
            runs: {
              type: "integer",
              minimum: 1,
              maximum: 30,
              default: 3,
              description: "Number of measurement runs (default 3)",
            },
            mode: {
              type: "string",
              enum: ["real", "ci-stable"],
              default: "ci-stable",
              description: "ci-stable recommended for budget enforcement",
            },
            plugins: {
              type: "array",
              items: { type: "string", enum: PLUGIN_IDS as unknown as string[] },
              default: ["cwv"],
            },
            browserPath: {
              type: "string",
              description: "Override the Chromium binary path (same as 'measure').",
            },
            track: {
              type: "boolean",
              default: false,
              description: "If true, also append this measurement to the time-series log.",
            },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    if (name === "measure") {
      const input = parseMeasureInput(args);
      const report = await measure(input);
      const path = await saveReport(reportsDir, report);
      await trimReports(reportsDir, maxReports);
      return {
        content: [
          { type: "text", text: summarize(report, path) },
          { type: "text", text: JSON.stringify(report.aggregated, null, 2) },
        ],
      };
    }

    if (name === "diff") {
      const input = parseDiffInput(args);
      const baseline = await loadReport(input.baseline);
      const candidate = await loadReport(input.candidate);
      const diff = diffReports(baseline, candidate);
      return {
        content: [
          { type: "text", text: formatDiff(diff) },
          {
            type: "text",
            text: JSON.stringify(
              {
                hasRegressions: diff.hasRegressions,
                metrics: diff.metrics,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    if (name === "analyze_report") {
      const path = resolveReportRef(reportsDir, args);
      const insightName = parseInsightName(args["insightName"]);
      const limit = parseLimit(args["limit"], 20);
      const report = await loadReport(path);
      const slice = extractInsight(report, insightName, limit);
      return {
        content: [
          { type: "text", text: slice.summary },
          { type: "text", text: JSON.stringify(slice.data, null, 2) },
        ],
      };
    }

    if (name === "generate_markdown_summary") {
      const path = resolveReportRef(reportsDir, args);
      const report = await loadReport(path);
      const title = typeof args["title"] === "string" ? args["title"] : undefined;
      const md = renderMarkdown(report, title ? { title } : {});
      return { content: [{ type: "text", text: md }] };
    }

    if (name === "generate_deck") {
      const path = resolveReportRef(reportsDir, args);
      const report = await loadReport(path);
      const outputDir = typeof args["outputDir"] === "string" && args["outputDir"]
        ? resolve(args["outputDir"])
        : join(reportsDir, "decks");
      const title = typeof args["title"] === "string" ? args["title"] : undefined;
      const fileName = `${report.meta.measurementId}.html`;
      const result = await writeDeckReport(report, outputDir, {
        fileName,
        ...(title ? { title } : {}),
      });
      return {
        content: [
          {
            type: "text",
            text: `Wrote deck to ${result.path} (${String(result.bytes)} bytes). Open in a browser, navigate via ArrowLeft/Right, ⌘P → Save as PDF for stakeholder distribution.`,
          },
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    }

    if (name === "list_runs") {
      const limit = parseLimit(args["limit"], 25);
      const files = await listReportFiles(reportsDir);
      const limited = files.slice(0, limit);
      const rows = await Promise.all(
        limited.map(async (f) => {
          try {
            const r = await loadReport(join(reportsDir, f.name));
            return {
              file: f.name,
              uri: `ohmyperf://reports/${f.name}`,
              url: r.meta.url,
              mode: r.meta.mode,
              runs: r.meta.runs,
              startedAt: r.meta.startedAt,
              measurementId: r.meta.measurementId,
              sizeBytes: f.sizeBytes,
            };
          } catch {
            return {
              file: f.name,
              uri: `ohmyperf://reports/${f.name}`,
              url: "(unreadable)",
              mode: "(unknown)",
              runs: 0,
              startedAt: new Date(f.mtimeMs).toISOString(),
              measurementId: "",
              sizeBytes: f.sizeBytes,
            };
          }
        }),
      );
      const summary = [
        `${String(rows.length)} of ${String(files.length)} reports (most recent first):`,
        ...rows.map(
          (r) =>
            `  ${r.startedAt} · ${r.mode} · runs=${String(r.runs)} · ${r.url} → ${r.uri}`,
        ),
      ].join("\n");
      return {
        content: [
          { type: "text", text: summary },
          { type: "text", text: JSON.stringify(rows, null, 2) },
        ],
      };
    }

    if (name === "diff_resources") {
      const baselinePath = resolveResourceUri(reportsDir, args["baselineUri"]);
      const candidatePath = resolveResourceUri(reportsDir, args["candidateUri"]);
      const baseline = await loadReport(baselinePath);
      const candidate = await loadReport(candidatePath);
      const diff = diffReports(baseline, candidate);
      return {
        content: [
          { type: "text", text: formatDiff(diff) },
          {
            type: "text",
            text: JSON.stringify(
              { hasRegressions: diff.hasRegressions, metrics: diff.metrics },
              null,
              2,
            ),
          },
        ],
      };
    }

    if (name === "track_url") {
      const input = parseMeasureInput({ ...args, mode: args["mode"] ?? "ci-stable" });
      const report = await measure(input);
      const savedPath = await saveReport(reportsDir, report);
      await trimReports(reportsDir, maxReports);
      const point = await appendTimeSeriesPoint(reportsDir, report);
      const historyLimit = parseLimit(args["historyLimit"], 100);
      const history = await readTimeSeries(reportsDir, input.url, historyLimit);
      const trends = detectAllTrends(history);
      return {
        content: [
          { type: "text", text: formatTrendSummary(point, history, trends, savedPath) },
          { type: "text", text: JSON.stringify({ point, trends, historyN: history.length }, null, 2) },
        ],
      };
    }

    if (name === "find_regression_cause") {
      const baseline = await loadReport(
        resolveReportRef(reportsDir, { reportPath: args["baseline"], uri: args["baseline"] }),
      );
      const candidate = await loadReport(
        resolveReportRef(reportsDir, { reportPath: args["candidate"], uri: args["candidate"] }),
      );
      const analysis = analyzeRegressionCause(baseline, candidate);
      return {
        content: [
          { type: "text", text: analysis.summary },
          { type: "text", text: JSON.stringify(toCompactCause(analysis), null, 2) },
        ],
      };
    }

    if (name === "enforce_budget") {
      const input = parseMeasureInput({ ...args, mode: args["mode"] ?? "ci-stable" });
      const report = await measure(input);
      const savedPath = await saveReport(reportsDir, report);
      await trimReports(reportsDir, maxReports);
      if (args["track"] === true) {
        await appendTimeSeriesPoint(reportsDir, report);
      }
      const budget = parseBudget(args["budget"]);
      const verdict = evaluateBudget(report, budget);
      return {
        content: [
          { type: "text", text: formatBudgetVerdict(verdict, savedPath) },
          { type: "text", text: JSON.stringify(verdict, null, 2) },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const files = await listReportFiles(reportsDir);
    return {
      resources: files.map((f) => ({
        uri: `ohmyperf://reports/${f.name}`,
        name: f.name,
        description: `Saved report (${new Date(f.mtimeMs).toISOString()}, ${String(f.sizeBytes)} bytes)`,
        mimeType: "application/json",
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const path = resolveResourceUri(reportsDir, uri);
    const body = await readFile(path, "utf8");
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: body,
        },
      ],
    };
  });

  server.setRequestHandler(ListPromptsRequestSchema, () => ({
    prompts: [
      {
        name: "diagnose_report",
        description:
          "Walk through a saved report end-to-end: CWV verdict, top opportunities, long-tasks, render-blocking resources, third-party impact. Produces an actionable investigation plan.",
        arguments: [
          { name: "reportPath", description: "Path or URI to report.json", required: true },
        ],
      },
      {
        name: "compare_runs",
        description:
          "Compare a baseline and candidate report. Identify regressions, attribute them to specific metrics, suggest likely causes.",
        arguments: [
          { name: "baseline", description: "Baseline path or URI", required: true },
          { name: "candidate", description: "Candidate path or URI", required: true },
        ],
      },
      {
        name: "suggest_fixes",
        description:
          "Given a saved report, propose concrete code-level fixes prioritized by metric impact (LCP > INP > CLS) and effort.",
        arguments: [
          { name: "reportPath", description: "Path or URI to report.json", required: true },
        ],
      },
      {
        name: "audit_third_parties",
        description:
          "Surface third-party scripts dragging down the page. Requires a report measured with the 'third-parties' plugin enabled.",
        arguments: [
          { name: "reportPath", description: "Path or URI to report.json", required: true },
        ],
      },
      {
        name: "check_budget",
        description:
          "Evaluate the saved report against the project's perf budget (lcp ≤ 2500ms, inp ≤ 200ms, cls ≤ 0.1, tbt ≤ 200ms by default). Pass/fail each metric with delta.",
        arguments: [
          { name: "reportPath", description: "Path or URI to report.json", required: true },
          {
            name: "budget",
            description:
              "Optional JSON budget object, e.g. '{\"lcp\":2500,\"inp\":200,\"cls\":0.1,\"tbt\":200}'",
            required: false,
          },
        ],
      },
      {
        name: "investigate_regression",
        description:
          "Causal investigation flow — call find_regression_cause to get ranked hypotheses, then drill into the top-1 hypothesis with analyze_report. Returns an actionable root-cause narrative, not raw data.",
        arguments: [
          { name: "baseline", description: "Baseline report path or URI", required: true },
          { name: "candidate", description: "Candidate report path or URI", required: true },
        ],
      },
      {
        name: "monitor_trend",
        description:
          "Longitudinal monitoring flow — call track_url to append a new measurement, inspect the per-metric trend verdict, escalate to find_regression_cause if a metric is regressing with high confidence.",
        arguments: [
          { name: "url", description: "URL to monitor", required: true },
        ],
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, (request) => {
    const promptName = request.params.name;
    const args = request.params.arguments ?? {};
    const messages = buildPromptMessages(promptName, args);
    return { messages };
  });

  return server;
}

function parseMeasureInput(args: Record<string, unknown>): MeasureInput {
  const url = typeof args["url"] === "string" ? args["url"] : "";
  if (!url || !/^https?:\/\//.test(url)) {
    throw new Error("measure: 'url' must be an http(s) URL");
  }
  const runs = typeof args["runs"] === "number" && Number.isInteger(args["runs"]) ? args["runs"] : 3;
  if (runs < 1 || runs > 30) {
    throw new Error("measure: 'runs' must be 1..30");
  }
  const mode = args["mode"] === "ci-stable" ? "ci-stable" : "real";
  const plugins = Array.isArray(args["plugins"])
    ? args["plugins"].filter((p): p is PluginId =>
        (PLUGIN_IDS as readonly string[]).includes(p as string),
      )
    : (["cwv", "axe"] as const);
  const browserPath = typeof args["browserPath"] === "string" ? args["browserPath"] : undefined;
  const collectTrace = args["collectTrace"] === true;
  return {
    url,
    runs,
    mode,
    plugins,
    ...(browserPath !== undefined ? { browserPath } : {}),
    ...(collectTrace ? { collectTrace: true } : {}),
  };
}

function parseDiffInput(args: Record<string, unknown>): DiffInput {
  const baseline = typeof args["baseline"] === "string" ? args["baseline"] : "";
  const candidate = typeof args["candidate"] === "string" ? args["candidate"] : "";
  if (!baseline || !candidate) {
    throw new Error("diff: 'baseline' and 'candidate' must be filesystem paths");
  }
  return {
    baseline,
    candidate,
    failOnRegression: args["failOnRegression"] !== false,
  };
}

function parseInsightName(raw: unknown): InsightName {
  if (typeof raw !== "string" || !(INSIGHT_NAMES as readonly string[]).includes(raw)) {
    throw new Error(
      `analyze_report: 'insightName' must be one of: ${INSIGHT_NAMES.join(", ")}`,
    );
  }
  return raw as InsightName;
}

function parseLimit(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 200) return raw;
  return fallback;
}

function resolveReportRef(reportsDir: string, args: Record<string, unknown>): string {
  if (typeof args["reportPath"] === "string" && args["reportPath"]) {
    return resolve(args["reportPath"]);
  }
  if (typeof args["uri"] === "string" && args["uri"]) {
    return resolveResourceUri(reportsDir, args["uri"]);
  }
  throw new Error("Provide either 'reportPath' (filesystem) or 'uri' (ohmyperf://reports/...)");
}

function resolveResourceUri(reportsDir: string, uri: unknown): string {
  if (typeof uri !== "string") {
    throw new Error("Resource URI must be a string");
  }
  const m = /^ohmyperf:\/\/reports\/([\w.-]+)$/.exec(uri);
  if (!m) throw new Error(`Unknown resource URI: ${uri}`);
  const name = m[1]!;
  if (name.includes("..") || name.includes("/")) {
    throw new Error(`Refusing path-traversal in resource name: ${name}`);
  }
  return join(reportsDir, name);
}

interface InsightSlice {
  summary: string;
  data: unknown;
}

function extractInsight(report: Report, name: InsightName, limit: number): InsightSlice {
  switch (name) {
    case "lcp-breakdown": {
      const lcp = report.aggregated["lcp"];
      const attribution = report.runs[0]?.metrics["lcp"]?.attribution;
      return {
        summary: lcp
          ? `LCP: median=${lcp.median.toFixed(0)}ms p75=${lcp.p75.toFixed(0)}ms cov=${(lcp.cov * 100).toFixed(1)}% (${String(lcp.runs)} runs)`
          : "LCP not measured.",
        data: { aggregated: lcp ?? null, attribution: attribution ?? null },
      };
    }
    case "render-blocking": {
      const blocking = report.runs[0]?.resources.filter((r) => r.renderBlocking) ?? [];
      const top = blocking.slice(0, limit).map((r) => ({
        url: r.url,
        mimeType: r.mimeType,
        responseMs: r.responseMs,
        transferSizeBytes: r.transferSizeBytes,
      }));
      return {
        summary: `${String(blocking.length)} render-blocking resource(s); showing top ${String(top.length)}.`,
        data: top,
      };
    }
    case "long-tasks": {
      const tasks = report.runs[0]?.longTasks ?? [];
      const sorted = [...tasks].sort((a, b) => b.duration - a.duration).slice(0, limit);
      return {
        summary: `${String(tasks.length)} long task(s) ≥ 50ms; showing top ${String(sorted.length)} by duration.`,
        data: sorted,
      };
    }
    case "third-parties": {
      const tp = (report.pluginData as Record<string, unknown>)["thirdParties"];
      return {
        summary: tp
          ? "Third-party breakdown from `third-parties` plugin."
          : "No third-party data — measure with plugins=['third-parties'] to populate.",
        data: tp ?? null,
      };
    }
    case "opportunities": {
      const opps: ReadonlyArray<Opportunity> = report.opportunities ?? [];
      const top = [...opps]
        .sort((a, b) => (b.wastedMs ?? 0) - (a.wastedMs ?? 0))
        .slice(0, limit);
      return {
        summary: `${String(opps.length)} opportunity/opportunities; showing top ${String(top.length)}.`,
        data: top,
      };
    }
    case "audits": {
      const audits = report.audits;
      const failed = audits.filter((a) => !a.passed);
      return {
        summary: `${String(audits.length)} audit(s), ${String(failed.length)} failed.`,
        data: audits,
      };
    }
    case "resources": {
      const all = report.runs[0]?.resources ?? [];
      const top = [...all]
        .sort((a, b) => b.transferSizeBytes - a.transferSizeBytes)
        .slice(0, limit)
        .map((r) => ({
          url: r.url,
          mimeType: r.mimeType,
          transferSizeBytes: r.transferSizeBytes,
          responseMs: r.responseMs,
          renderBlocking: r.renderBlocking,
        }));
      return {
        summary: `${String(all.length)} resource(s); showing top ${String(top.length)} by transfer size.`,
        data: top,
      };
    }
    case "frames": {
      const frames = report.frames;
      const nodes = Object.values(frames.nodes).map((n) => ({
        frameId: n.frameId,
        url: n.url,
        isOOPIF: n.isOOPIF,
        isCrossOrigin: n.isCrossOrigin,
      }));
      return {
        summary: `Frame tree: ${String(nodes.length)} frame(s), root=${frames.root}.`,
        data: { root: frames.root, frames: nodes },
      };
    }
  }
}

interface PromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

function buildPromptMessages(
  name: string,
  args: Record<string, string | undefined>,
): PromptMessage[] {
  const reportPath = args["reportPath"] ?? "<reportPath>";
  const baseline = args["baseline"] ?? "<baseline>";
  const candidate = args["candidate"] ?? "<candidate>";
  const budget = args["budget"] ?? "{}";
  const url = args["url"] ?? "<url>";

  switch (name) {
    case "diagnose_report":
      return [
        msg(
          "user",
          [
            `Diagnose the OhMyPerf report at \`${reportPath}\`.`,
            "",
            "Use these MCP tools in order:",
            "1. `analyze_report` with insightName=\"lcp-breakdown\" → state the LCP verdict (good/needs-improvement/poor: <2.5s/<4s/≥4s).",
            "2. `analyze_report` with insightName=\"opportunities\" → list top 3 by wastedMs.",
            "3. `analyze_report` with insightName=\"render-blocking\" → top 5.",
            "4. `analyze_report` with insightName=\"long-tasks\" → tasks > 200ms.",
            "5. `analyze_report` with insightName=\"third-parties\" → top vendors (if plugin enabled).",
            "",
            "Then produce a concise investigation plan: root-cause hypothesis + 3 verification steps.",
          ].join("\n"),
        ),
      ];
    case "compare_runs":
      return [
        msg(
          "user",
          [
            `Compare baseline \`${baseline}\` vs candidate \`${candidate}\`.`,
            "",
            "Steps:",
            "1. Call `diff_resources` (or `diff`) on the two reports.",
            "2. For each regressed metric, call `analyze_report` on both reports for the matching insight (e.g. lcp-breakdown for LCP regression).",
            "3. State the most likely cause based on resource diff, long-task diff, render-blocking diff.",
            "4. Suggest the minimal change that would reverse the regression.",
          ].join("\n"),
        ),
      ];
    case "suggest_fixes":
      return [
        msg(
          "user",
          [
            `For the report at \`${reportPath}\`, propose concrete code-level fixes.`,
            "",
            "Priority order: LCP > INP > CLS > TBT > TTFB.",
            "Use `analyze_report` with insightName=\"opportunities\" and \"render-blocking\" to ground every suggestion in actual data.",
            "",
            "For each fix:",
            "- File/area to change",
            "- Expected metric impact (ms saved)",
            "- Effort (S/M/L)",
            "- Validation step (rerun `measure` with the same URL)",
          ].join("\n"),
        ),
      ];
    case "audit_third_parties":
      return [
        msg(
          "user",
          [
            `Audit third-party impact for the report at \`${reportPath}\`.`,
            "",
            "1. Call `analyze_report` with insightName=\"third-parties\".",
            "2. If the data is null, instruct the user to rerun `measure` with plugins=['cwv','axe','third-parties'].",
            "3. Otherwise, list top vendors by main-thread time AND by transfer size.",
            "4. Flag any vendor that blocks LCP (cross-reference with render-blocking insight).",
            "5. Recommend defer/async/remove for each, with rationale.",
          ].join("\n"),
        ),
      ];
    case "check_budget":
      return [
        msg(
          "user",
          [
            `Check the report at \`${reportPath}\` against this performance budget:`,
            "",
            `\`\`\`json\n${budget}\n\`\`\``,
            "",
            "If the budget arg is `{}` or missing, use the defaults: { lcp: 2500, inp: 200, cls: 0.1, tbt: 200 }.",
            "",
            "1. Use `analyze_report` with insightName=\"lcp-breakdown\" (and similar for other metrics if needed).",
            "2. For each metric, compare median against the budget. Report pass/fail + Δ (observed − budget).",
            "3. End with a verdict line: 'PASS' or 'FAIL (N metric(s) over budget)'.",
          ].join("\n"),
        ),
      ];
    case "investigate_regression":
      return [
        msg(
          "user",
          [
            `Investigate the regression between baseline \`${baseline}\` and candidate \`${candidate}\`.`,
            "",
            "Steps:",
            "1. Call `find_regression_cause` with both reports — it returns ranked hypotheses with evidence (new render-blocking, grown resources, new long-tasks, new third-parties).",
            "2. Take the top-1 hypothesis. State its metric, relative delta, and the strongest piece of evidence.",
            "3. For the regressed metric, call `analyze_report` on the CANDIDATE with the matching insightName (e.g. lcp-breakdown for LCP, long-tasks for INP/TBT, opportunities for general guidance).",
            "4. Cross-check whether the analyze_report data confirms or weakens the hypothesis.",
            "5. Produce a final root-cause narrative: (a) the change, (b) why it impacts the metric, (c) the smallest reversal/mitigation.",
          ].join("\n"),
        ),
      ];
    case "monitor_trend":
      return [
        msg(
          "user",
          [
            `Monitor the performance trend for \`${url}\`.`,
            "",
            "Steps:",
            "1. Call `track_url` with the URL — it measures + appends to the time-series log and returns per-metric trend verdicts.",
            "2. For each metric, state direction (improving/stable/regressing), confidence, and Δ vs the baseline window.",
            "3. If any metric is 'regressing' with confidence 'high' or 'medium' AND there are ≥ 2 historical points, escalate: identify the two most-recent saved reports for this URL via `list_runs`, then call `find_regression_cause` on them.",
            "4. If trend is stable/improving, end with: 'No action needed — N points monitored, trend stable.'",
          ].join("\n"),
        ),
      ];
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

function msg(role: "user" | "assistant", text: string): PromptMessage {
  return { role, content: { type: "text", text } };
}

async function measure(input: MeasureInput): Promise<Report> {
  const { driver, adapter } = createPlaywrightAdapter({
    url: input.url,
    kind: "chromium",
    ...(input.browserPath ? { executablePath: input.browserPath } : {}),
  });
  const plugins = (input.plugins ?? []).map((id) => {
    if (id === "cwv") return cwvPlugin();
    if (id === "axe") return axePlugin();
    if (id === "third-parties") return thirdPartiesPlugin();
    return customMetricExamplePlugin();
  });
  return await runEngine({
    opts: {
      url: input.url,
      runs: input.runs ?? 3,
      mode: input.mode ?? "real",
      plugins,
      ...(input.collectTrace ? { collectTrace: true } : {}),
    },
    driver,
    adapter,
  });
}

async function loadReport(path: string): Promise<Report> {
  const body = await readFile(resolve(path), "utf8");
  const parsed = JSON.parse(body) as Report;
  if (parsed.schemaVersion !== "1.0.0") {
    throw new Error(`Unsupported schemaVersion: ${String(parsed.schemaVersion)}`);
  }
  return parsed;
}

async function saveReport(dir: string, report: Report): Promise<string> {
  await mkdir(dir, { recursive: true });
  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${report.meta.measurementId.slice(0, 8)}.json`;
  const path = join(dir, fileName);
  const result = await writeJsonReport(report, dirname(path), { fileName });
  return result.path;
}

interface ReportFileInfo {
  name: string;
  mtimeMs: number;
  sizeBytes: number;
}

async function listReportFiles(dir: string): Promise<ReportFileInfo[]> {
  try {
    const names = await readdir(dir);
    const stats: ReportFileInfo[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const s = await stat(join(dir, name));
      stats.push({ name, mtimeMs: s.mtimeMs, sizeBytes: s.size });
    }
    stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return stats;
  } catch {
    return [];
  }
}

async function trimReports(dir: string, max: number): Promise<void> {
  const files = await listReportFiles(dir);
  if (files.length <= max) return;
  const { unlink } = await import("node:fs/promises");
  for (const f of files.slice(max)) {
    await unlink(join(dir, f.name)).catch(() => undefined);
  }
}

function summarize(report: Report, savedPath: string): string {
  const lines: string[] = [];
  lines.push(`Measured ${report.meta.url}`);
  lines.push(
    `Mode: ${report.meta.mode}; runs: ${String(report.meta.runs)}; duration: ${String(report.meta.durationMs)}ms; measurementId: ${report.meta.measurementId}`,
  );
  lines.push(
    `Browser: ${report.meta.browser.name} ${report.meta.browser.version} (${report.meta.browser.source})`,
  );
  if (report.meta.calibration) {
    lines.push(
      `Calibration: throttle ${String(report.meta.calibration.throttleRate)}x, network ${report.meta.calibration.networkProfile}`,
    );
  }
  if (report.meta.unstable) {
    lines.push("⚠ Unstable run (CoV > 20% on at least one CWV).");
  }
  for (const [name, agg] of Object.entries(report.aggregated)) {
    const digits = name === "cls" ? 3 : 1;
    lines.push(
      `  ${name.toUpperCase().padEnd(5)} median=${agg.median.toFixed(digits)} cov=${(agg.cov * 100).toFixed(1)}% n=${String(agg.runs)}`,
    );
  }
  if (report.audits.length > 0) {
    lines.push(`Audits: ${String(report.audits.length)}`);
    for (const a of report.audits) {
      lines.push(`  [${a.passed ? "PASS" : "FAIL"}] ${a.id} — ${a.title}`);
    }
  }
  lines.push(`Saved: ${savedPath}`);
  return lines.join("\n");
}

function formatTrendSummary(
  point: TimeSeriesPoint,
  history: readonly TimeSeriesPoint[],
  trends: readonly TrendVerdict[],
  savedPath: string,
): string {
  const lines: string[] = [];
  lines.push(`Tracked ${point.url}`);
  lines.push(`History: ${String(history.length)} point(s) (this run: ${point.at})`);
  lines.push("");
  lines.push("Trend per metric:");
  for (const t of trends) {
    if (t.direction === "insufficient-data") {
      lines.push(`  ${t.metric.toUpperCase().padEnd(5)} insufficient-data (n=${String(t.n)})`);
      continue;
    }
    const pct = (t.relativeChange * 100).toFixed(1);
    const sign = t.relativeChange > 0 ? "+" : "";
    const tag =
      t.direction === "regressing" ? "❌" : t.direction === "improving" ? "✅" : "·";
    lines.push(
      `  ${tag} ${t.metric.toUpperCase().padEnd(5)} ${t.direction.padEnd(11)} ${sign}${pct}% (baseline=${t.baselineMedian.toFixed(1)}, recent=${t.recentMedian.toFixed(1)}, n=${String(t.n)}, confidence=${t.confidence})`,
    );
  }
  lines.push(`Saved: ${savedPath}`);
  return lines.join("\n");
}

interface CompactCause {
  verdict: RegressionCauseReport["verdict"];
  hypotheses: ReadonlyArray<{
    rank: number;
    metric: string;
    relativeDelta: number;
    likelyCauses: ReadonlyArray<string>;
    evidence: {
      newRenderBlockingCount: number;
      grownResourcesCount: number;
      newLongTasksCount: number;
      newThirdParties: ReadonlyArray<string>;
      topNewRenderBlocking: ReadonlyArray<{ url: string; mimeType: string; transferBytesDelta: number }>;
      topGrownResources: ReadonlyArray<{ url: string; transferBytesDelta: number; responseMsDelta: number }>;
      topNewLongTasks: ReadonlyArray<{ attribution: string; url?: string; durationMsDelta: number }>;
    };
  }>;
}

function toCompactCause(analysis: RegressionCauseReport): CompactCause {
  return {
    verdict: analysis.verdict,
    hypotheses: analysis.hypotheses.map((h) => ({
      rank: h.rank,
      metric: h.metric,
      relativeDelta: h.relativeDelta,
      likelyCauses: h.likelyCauses,
      evidence: {
        newRenderBlockingCount: h.evidence.newRenderBlocking.length,
        grownResourcesCount: h.evidence.grownResources.length,
        newLongTasksCount: h.evidence.newLongTasks.length,
        newThirdParties: h.evidence.newThirdParties,
        topNewRenderBlocking: h.evidence.newRenderBlocking.slice(0, 5).map((r) => ({
          url: r.url,
          mimeType: r.mimeType,
          transferBytesDelta: r.transferBytesDelta,
        })),
        topGrownResources: h.evidence.grownResources.slice(0, 5).map((r) => ({
          url: r.url,
          transferBytesDelta: r.transferBytesDelta,
          responseMsDelta: r.responseMsDelta,
        })),
        topNewLongTasks: h.evidence.newLongTasks.slice(0, 5).map((t) => ({
          attribution: t.attribution,
          ...(t.url !== undefined ? { url: t.url } : {}),
          durationMsDelta: t.durationMsDelta,
        })),
      },
    })),
  };
}

const DEFAULT_BUDGET: Readonly<Record<string, number>> = {
  lcp: 2500,
  inp: 200,
  cls: 0.1,
  tbt: 200,
  fcp: 1800,
  ttfb: 800,
};

function parseBudget(raw: unknown): Record<string, number> {
  const out: Record<string, number> = { ...DEFAULT_BUDGET };
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k.toLowerCase()] = v;
    }
  }
  return out;
}

interface BudgetMetricResult {
  metric: string;
  observed: number;
  threshold: number;
  delta: number;
  relativeDelta: number;
  passed: boolean;
}

interface BudgetVerdict {
  status: "PASS" | "FAIL";
  exitCode: 0 | 12;
  url: string;
  mode: string;
  unstable: boolean;
  metrics: ReadonlyArray<BudgetMetricResult>;
  failedCount: number;
}

function evaluateBudget(report: Report, budget: Record<string, number>): BudgetVerdict {
  const results: BudgetMetricResult[] = [];
  for (const [metric, threshold] of Object.entries(budget)) {
    const agg = report.aggregated[metric];
    if (!agg) continue;
    const observed = agg.median;
    const delta = observed - threshold;
    const relativeDelta = threshold === 0 ? 0 : delta / threshold;
    results.push({
      metric,
      observed,
      threshold,
      delta,
      relativeDelta,
      passed: observed <= threshold,
    });
  }
  const failedCount = results.filter((r) => !r.passed).length;
  return {
    status: failedCount === 0 ? "PASS" : "FAIL",
    exitCode: failedCount === 0 ? 0 : 12,
    url: report.meta.url,
    mode: report.meta.mode,
    unstable: Boolean(report.meta.unstable),
    metrics: results,
    failedCount,
  };
}

function formatBudgetVerdict(verdict: BudgetVerdict, savedPath: string): string {
  const lines: string[] = [];
  lines.push(`Budget check for ${verdict.url} (mode=${verdict.mode})`);
  lines.push(`Status: ${verdict.status} · exitCode=${String(verdict.exitCode)}`);
  if (verdict.unstable) lines.push("⚠ Run was unstable (CoV > 20% on at least one CWV).");
  lines.push("");
  for (const m of verdict.metrics) {
    const digits = m.metric === "cls" ? 3 : 1;
    const tag = m.passed ? "✅" : "❌";
    const pct = (m.relativeDelta * 100).toFixed(1);
    const sign = m.delta >= 0 ? "+" : "";
    lines.push(
      `  ${tag} ${m.metric.toUpperCase().padEnd(5)} observed=${m.observed.toFixed(digits)} ≤ budget=${m.threshold.toFixed(digits)} · Δ=${sign}${m.delta.toFixed(digits)} (${sign}${pct}%)`,
    );
  }
  if (verdict.failedCount > 0) {
    lines.push("");
    lines.push(`Verdict: FAIL — ${String(verdict.failedCount)} metric(s) over budget.`);
  } else {
    lines.push("");
    lines.push("Verdict: PASS — all metrics within budget.");
  }
  lines.push(`Saved: ${savedPath}`);
  return lines.join("\n");
}

export async function ensureReportsDir(dir?: string): Promise<string> {
  const target = resolve(dir ?? DEFAULT_REPORTS_DIR);
  await mkdir(target, { recursive: true });
  return target;
}

export async function readReportFromDisk(path: string): Promise<Report> {
  return loadReport(path);
}

export async function writeReportToDisk(path: string, report: Report): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2));
}
