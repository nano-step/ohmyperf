import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  diffReports,
  formatDiff,
  runEngine,
  type Report,
} from "@ohmyperf/core";
import { createPlaywrightAdapter } from "@ohmyperf/driver-playwright";
import {
  axePlugin,
  cwvPlugin,
  customMetricExamplePlugin,
} from "@ohmyperf/plugins-builtin";
import { writeJsonReport } from "@ohmyperf/reporter-json";

export interface McpServerOptions {
  readonly reportsDir?: string;
  readonly maxReports?: number;
}

const DEFAULT_REPORTS_DIR = join(homedir(), ".ohmyperf-mcp", "reports");
const DEFAULT_MAX_REPORTS = 50;

interface MeasureInput {
  url: string;
  runs?: number;
  mode?: "real" | "ci-stable";
  plugins?: ReadonlyArray<"cwv" | "axe" | "custom-metric-example">;
  browserPath?: string;
}

interface DiffInput {
  baseline: string;
  candidate: string;
  failOnRegression?: boolean;
}

export function createOhmyperfMcpServer(opts: McpServerOptions = {}): Server {
  const reportsDir = resolve(opts.reportsDir ?? DEFAULT_REPORTS_DIR);
  const maxReports = opts.maxReports ?? DEFAULT_MAX_REPORTS;

  const server = new Server(
    { name: "ohmyperf", version: "0.0.0-pre" },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: "measure",
        description:
          "Measure a URL with the OhMyPerf engine on a real Chromium browser. Returns the full Report JSON with CWV (LCP/FCP/TTFB/CLS/TBT), audits, frame tree, and per-resource timing. The report is also saved to the MCP server's reports dir and exposed as a resource.",
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
              items: { type: "string", enum: ["cwv", "axe", "custom-metric-example"] },
              default: ["cwv", "axe"],
              description: "Built-in plugins to enable",
            },
            browserPath: {
              type: "string",
              description:
                "Override the Chromium binary path (e.g. for full Chromium vs headless-shell)",
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
    const m = /^ohmyperf:\/\/reports\/([\w.-]+)$/.exec(uri);
    if (!m) throw new Error(`Unknown resource URI: ${uri}`);
    const name = m[1]!;
    if (name.includes("..") || name.includes("/")) {
      throw new Error(`Refusing path-traversal in resource name: ${name}`);
    }
    const path = join(reportsDir, name);
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
    ? (args["plugins"].filter(
        (p): p is "cwv" | "axe" | "custom-metric-example" =>
          p === "cwv" || p === "axe" || p === "custom-metric-example",
      ))
    : (["cwv", "axe"] as const);
  const browserPath = typeof args["browserPath"] === "string" ? args["browserPath"] : undefined;
  return { url, runs, mode, plugins, ...(browserPath !== undefined ? { browserPath } : {}) };
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

async function measure(input: MeasureInput): Promise<Report> {
  const { driver, adapter } = createPlaywrightAdapter({
    url: input.url,
    kind: "chromium",
    ...(input.browserPath ? { executablePath: input.browserPath } : {}),
  });
  const plugins = input.plugins?.map((id) => {
    if (id === "cwv") return cwvPlugin();
    if (id === "axe") return axePlugin();
    return customMetricExamplePlugin();
  }) ?? [];
  return await runEngine({
    opts: {
      url: input.url,
      runs: input.runs ?? 3,
      mode: input.mode ?? "real",
      plugins,
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
