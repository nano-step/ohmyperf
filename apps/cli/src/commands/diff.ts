import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineCommand } from "citty";
import {
  createConsoleLogger,
  diffReports,
  formatDiff,
  type Report,
} from "@ohmyperf/core";
import { EXIT_CODES } from "../exit-codes.js";

export const diffCommand = defineCommand({
  meta: {
    name: "diff",
    description:
      "Compare two report.json files using Mann-Whitney U significance test. Exit 1 on regression.",
  },
  args: {
    baseline: {
      type: "positional",
      description: "Path to baseline report.json",
      required: true,
    },
    candidate: {
      type: "positional",
      description: "Path to candidate report.json",
      required: true,
    },
    "fail-on-regression": {
      type: "boolean",
      description: "Exit 1 when at least one metric is flagged as regression (default: true)",
      default: true,
    },
    "significance-level": {
      type: "string",
      description: "Significance level (alpha) for Mann-Whitney; default 0.05",
      default: "0.05",
    },
    json: {
      type: "boolean",
      description: "Print machine-readable JSON to stdout",
      default: false,
    },
  },
  async run({ args }): Promise<void> {
    const logger = createConsoleLogger({ level: "info", prefix: "ohmyperf:diff" });

    const alpha = Number(args["significance-level"]);
    if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) {
      logger.error("--significance-level must be in (0, 1)", { value: args["significance-level"] });
      process.exit(EXIT_CODES.invalidUsage);
    }

    let baseline: Report;
    let candidate: Report;
    try {
      baseline = await loadReport(String(args.baseline));
    } catch (err) {
      logger.error(`failed to load baseline: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(EXIT_CODES.invalidUsage);
    }
    try {
      candidate = await loadReport(String(args.candidate));
    } catch (err) {
      logger.error(`failed to load candidate: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(EXIT_CODES.invalidUsage);
    }

    const diff = diffReports(baseline, candidate, { significanceLevel: alpha });

    if (args.json) {
      process.stdout.write(`${JSON.stringify(diff, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatDiff(diff)}\n`);
    }

    if (diff.hasRegressions && args["fail-on-regression"]) {
      process.exit(EXIT_CODES.budgetFailure);
    }
  },
});

async function loadReport(path: string): Promise<Report> {
  const body = await readFile(resolve(path), "utf8");
  const parsed = JSON.parse(body) as Report;
  if (typeof parsed.schemaVersion !== "string" || !Array.isArray(parsed.runs)) {
    throw new Error(`${path} is not a valid OhMyPerf report`);
  }
  return parsed;
}
