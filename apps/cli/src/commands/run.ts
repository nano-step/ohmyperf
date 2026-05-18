import { defineCommand } from "citty";
import {
  CalibrationFailedError,
  createConsoleLogger,
  PluginHookTimeout,
  PluginLoadError,
  runEngine,
  type Logger,
  type Mode,
  type Plugin,
  type Report,
} from "@ohmyperf/core";
import { createPlaywrightAdapter } from "@ohmyperf/driver-playwright";
import {
  axePlugin,
  cwvPlugin,
  customMetricExamplePlugin,
  thirdPartiesPlugin,
} from "@ohmyperf/plugins-builtin";
import { writeCsvReport } from "@ohmyperf/reporter-csv";
import { BRAND_IDS, isBrandId, type BrandId } from "@ohmyperf/design-tokens";
import { writeDeckReport } from "@ohmyperf/reporter-deck";
import { writeHtmlReport } from "@ohmyperf/reporter-html";
import { writeJsonReport } from "@ohmyperf/reporter-json";
import { writeJunitReport } from "@ohmyperf/reporter-junit";
import { writeMarkdownReport } from "@ohmyperf/reporter-markdown/node";
import { EXIT_CODES } from "../exit-codes.js";

const SUPPORTED_FORMATS = ["json", "html", "deck", "markdown", "junit", "csv"] as const;
type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

const DEFAULT_RUNS = 5;

export const runCommand = defineCommand({
  meta: {
    name: "run",
    description: "Measure a URL with the OhMyPerf engine and emit a JSON Report.",
  },
  args: {
    url: {
      type: "positional",
      description: "URL to measure (http or https)",
      required: true,
    },
    mode: {
      type: "string",
      description: "Measurement mode: real | ci-stable",
      default: "real",
    },
    runs: {
      type: "string",
      description: "Number of repetitions",
      default: String(DEFAULT_RUNS),
    },
    headless: {
      type: "boolean",
      description: "Run Chromium headless (default: true)",
      default: true,
    },
    output: {
      type: "string",
      description: "Output directory",
      default: "./ohmyperf-out",
    },
    format: {
      type: "string",
      description: "Comma-separated formats (json, html, deck, markdown, junit, csv)",
      default: "json,html,deck",
    },
    style: {
      type: "string",
      description: "Visual style for HTML + deck artifacts: calibre (default), linear-app, stripe, vercel",
      default: "calibre",
    },
    "browser-path": {
      type: "string",
      description: "Path to a Chromium binary (default: Playwright bundled)",
      required: false,
    },
    plugins: {
      type: "string",
      description: "Plugin set: 'all' (cwv+axe+example), 'cwv', 'cwv+axe', or 'none'",
      default: "all",
    },
    "isolate-origins": {
      type: "string",
      description: "Comma-separated origins to pass to --isolate-origins (advanced)",
      required: false,
    },
    quiet: {
      type: "boolean",
      description: "Suppress human-readable summary; only print structured info",
      default: false,
    },
    json: {
      type: "boolean",
      description: "Print final JSON status line to stdout",
      default: false,
    },
    "allow-single-run": {
      type: "boolean",
      description: "Allow runs=1 (variance disclaimer; budget eval still refused)",
      default: false,
    },
    "frozen-lockfile": {
      type: "boolean",
      description: "Refuse to start if plugin set drifts from ohmyperf.lock.json (no-op in v0)",
      default: false,
    },
    recalibrate: {
      type: "boolean",
      description: "Force re-run of the calibration benchmark (ignores 24h cache). Only meaningful with --mode ci-stable.",
      default: false,
    },
    "collect-trace": {
      type: "boolean",
      description: "Capture a CDP Tracing.start trace and use it for long-task attribution. Disabled by default in CLI to keep runs lean; SPA + extension enable by default.",
      default: false,
    },
    budget: {
      type: "string",
      description: "Repeatable budget metric=threshold (e.g. lcp=2500); reserved for v0 acceptance",
      required: false,
    },
  },
  async run({ args }): Promise<void> {
    const logger = createConsoleLogger({
      level: args.quiet ? "warn" : "info",
      prefix: "ohmyperf",
    });

    const url = String(args.url ?? "");
    if (!isValidHttpUrl(url)) {
      logger.error("invalid url; expected http(s) URL", { url });
      process.exit(EXIT_CODES.invalidUsage);
    }

    const runs = parseRuns(String(args.runs));
    if (runs === undefined) {
      logger.error("invalid --runs; expected positive integer", { runs: args.runs });
      process.exit(EXIT_CODES.invalidUsage);
    }

    const mode = parseMode(String(args.mode));
    if (mode === undefined) {
      logger.error("invalid --mode; expected 'real' or 'ci-stable'", { mode: args.mode });
      process.exit(EXIT_CODES.invalidUsage);
    }

    if (mode === "ci-stable") {
      logger.info(
        "--mode ci-stable: pre-flight CPU calibration + Fast 4G network throttle will be applied",
      );
    }

    const formats = String(args.format)
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.length > 0) as ReadonlyArray<SupportedFormat>;
    const unsupported = formats.filter(
      (f) => !(SUPPORTED_FORMATS as ReadonlyArray<string>).includes(f),
    );
    if (unsupported.length > 0) {
      logger.error(
        `format(s) not supported in v0: ${unsupported.join(", ")} (supported: ${SUPPORTED_FORMATS.join(", ")})`,
      );
      process.exit(EXIT_CODES.invalidUsage);
    }

    const styleArg = String(args.style ?? "calibre");
    if (!isBrandId(styleArg)) {
      logger.error(
        `--style not valid: '${styleArg}' (valid: ${BRAND_IDS.join(", ")})`,
      );
      process.exit(EXIT_CODES.invalidUsage);
    }
    const style: BrandId = styleArg;
    const hasHtmlReporter = formats.includes("html") || formats.includes("deck");
    if (!hasHtmlReporter && style !== "calibre") {
      logger.warn(
        `--style=${style} is a no-op when no HTML reporter is selected (formats: ${formats.join(",")})`,
      );
    }

    if (args.budget !== undefined && runs === 1 && !args["allow-single-run"]) {
      logger.error(
        "--budget refused with --runs=1 (variance flake risk). Pass --allow-single-run to override.",
      );
      process.exit(EXIT_CODES.invalidUsage);
    }

    const plugins = resolvePluginSet(String(args.plugins), logger);

    const browserPath = optString(args["browser-path"]);
    const isolateOrigins = optString(args["isolate-origins"]);

    let report: Report;
    try {
      const { driver, adapter } = createPlaywrightAdapter({
        url,
        kind: "chromium",
        ...(browserPath !== undefined ? { executablePath: browserPath } : {}),
        ...(isolateOrigins !== undefined
          ? { extraChromiumArgs: [`--isolate-origins=${isolateOrigins}`] }
          : {}),
        headless: args.headless ? "headless" : "headful",
        logger,
      });

      report = await runEngine({
        opts: {
          url,
          runs,
          mode,
          headless: args.headless ? "headless" : "headful",
          plugins,
          ...(args.recalibrate ? { calibration: { recalibrate: true } } : {}),
          ...(args["collect-trace"] ? { collectTrace: true } : {}),
        },
        driver,
        adapter,
        logger,
      });
    } catch (err) {
      const code = mapErrorToExitCode(err);
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`measurement failed (${code}): ${msg}`);
      if (code === EXIT_CODES.browserBinaryMissing) {
        logger.error("hint: run `ohmyperf install-browser` or set --browser-path");
      }
      process.exit(code);
    }

    const written: Record<SupportedFormat, { path: string; bytes: number } | undefined> = {
      json: undefined,
      html: undefined,
      deck: undefined,
      markdown: undefined,
      junit: undefined,
      csv: undefined,
    };
    if (formats.includes("json")) {
      written.json = await writeJsonReport(report, String(args.output));
    }
    if (formats.includes("html")) {
      written.html = await writeHtmlReport(report, String(args.output), { style });
    }
    if (formats.includes("deck")) {
      try {
        written.deck = await writeDeckReport(report, String(args.output), { style });
      } catch (deckErr) {
        const msg = deckErr instanceof Error ? deckErr.message : String(deckErr);
        logger.warn(`deck reporter failed (non-fatal): ${msg}`);
      }
    }
    if (formats.includes("markdown")) {
      written.markdown = await writeMarkdownReport(report, String(args.output));
    }
    if (formats.includes("junit")) {
      written.junit = await writeJunitReport(report, String(args.output));
    }
    if (formats.includes("csv")) {
      written.csv = await writeCsvReport(report, String(args.output));
    }

    if (!args.quiet) {
      printHumanSummary(report, logger);
      for (const fmt of SUPPORTED_FORMATS) {
        const info = written[fmt];
        if (info) logger.info(`wrote ${info.path} (${String(info.bytes)} bytes)`);
      }
    }

    if (args.json) {
      process.stdout.write(
        `${JSON.stringify({
          schemaVersion: report.schemaVersion,
          measurementId: report.meta.measurementId,
          aggregatedKeys: Object.keys(report.aggregated),
          auditCount: report.audits.length,
          outputPath: written.json?.path ?? null,
          htmlPath: written.html?.path ?? null,
          markdownPath: written.markdown?.path ?? null,
        })}\n`,
      );
    }
  },
});

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function parseRuns(value: string): number | undefined {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return undefined;
  return n;
}

function parseMode(value: string): Mode | undefined {
  if (value === "real" || value === "ci-stable") return value;
  return undefined;
}

function optString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length === 0) return undefined;
  return value;
}

function resolvePluginSet(name: string, logger: Logger): ReadonlyArray<Plugin> {
  switch (name) {
    case "none":
      return [];
    case "cwv":
      return [cwvPlugin()];
    case "cwv+axe":
      return [cwvPlugin(), axePlugin()];
    case "all":
      return [cwvPlugin(), axePlugin(), thirdPartiesPlugin(), customMetricExamplePlugin()];
    default:
      logger.warn(`unknown --plugins value '${name}'; defaulting to 'all'`);
      return [cwvPlugin(), axePlugin(), thirdPartiesPlugin(), customMetricExamplePlugin()];
  }
}

function mapErrorToExitCode(err: unknown): number {
  if (err instanceof CalibrationFailedError) return EXIT_CODES.calibrationFailed;
  if (err instanceof PluginLoadError) return EXIT_CODES.pluginLoadError;
  if (err instanceof PluginHookTimeout) return EXIT_CODES.pluginHookTimeout;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (
    msg.includes("executable doesn't exist") ||
    msg.includes("browser was not installed") ||
    msg.includes("looks like playwright was just installed")
  ) {
    return EXIT_CODES.browserBinaryMissing;
  }
  if (msg.includes("oopif_autoattach_order_violation")) {
    return EXIT_CODES.oopifAttachOrderViolation;
  }
  if (
    msg.includes("net::err_") ||
    msg.includes("dns") ||
    msg.includes("navigation timeout") ||
    msg.includes("err_too_many_redirects")
  ) {
    return EXIT_CODES.navigationFailure;
  }
  if (msg.includes("targetcrashed") || msg.includes("renderer crashed")) {
    return EXIT_CODES.measurementRuntimeError;
  }
  if (msg.includes("browserlaunchfailure") || msg.includes("failed to launch")) {
    return EXIT_CODES.browserLaunchFailure;
  }
  return EXIT_CODES.measurementRuntimeError;
}

function printHumanSummary(report: Report, logger: Logger): void {
  logger.info(`OhMyPerf v${report.schemaVersion} report`);
  logger.info(`url:     ${report.meta.url}`);
  logger.info(`browser: ${report.meta.browser.name} ${report.meta.browser.version} (${report.meta.browser.source})`);
  logger.info(`mode:    ${report.meta.mode}; runs=${String(report.meta.runs)}; duration=${String(report.meta.durationMs)}ms`);

  const lines: string[] = [];
  for (const [name, agg] of Object.entries(report.aggregated)) {
    const median = agg.median.toFixed(name === "cls" ? 3 : 1);
    const cov = (agg.cov * 100).toFixed(1);
    lines.push(`  ${name.padEnd(10)} median=${median.padStart(7)}  cov=${cov}%  n=${String(agg.runs)}`);
  }
  if (lines.length > 0) {
    logger.info("aggregated:");
    for (const line of lines) {
      logger.info(line);
    }
  }
  if (report.audits.length > 0) {
    logger.info(`audits: ${String(report.audits.length)}`);
    for (const audit of report.audits) {
      const status = audit.passed ? "PASS" : "FAIL";
      logger.info(`  [${status}] ${audit.id} — ${audit.title}`);
    }
  }
}
