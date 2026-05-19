import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Report, RunReport, Metric } from "@ohmyperf/core";

export const REPORTER_ID = "csv" as const;
export const PACKAGE_NAME = "@ohmyperf/reporter-csv" as const;
export const PACKAGE_ROLE = "CSV reporter (long format, per-metric-per-run)." as const;

export interface CsvReporterOptions {
  readonly fileName?: string;
}

export interface CsvReporterResult {
  readonly path: string;
  readonly bytes: number;
  readonly rows: number;
}

export async function writeCsvReport(
  report: Report,
  outputDir: string,
  opts: CsvReporterOptions = {},
): Promise<CsvReporterResult> {
  const dir = resolve(outputDir);
  const fileName = opts.fileName ?? "report.csv";
  const path = join(dir, fileName);
  await mkdir(dirname(path), { recursive: true });
  const { body, rows } = renderCsv(report);
  await writeFile(path, body, "utf8");
  return { path, bytes: Buffer.byteLength(body), rows };
}

export function renderCsv(report: Report): { body: string; rows: number } {
  const lines: string[] = [];
  lines.push("url,run_index,cold,metric,value,unit");

  let rows = 0;
  for (const run of report.runs as readonly RunReport[]) {
    for (const [name, metric] of Object.entries(run.metrics)) {
      lines.push(serializeRow(report.meta.url, run.runIndex, run.cold, name, metric));
      rows++;
    }
  }

  return { body: lines.join("\n") + "\n", rows };
}

function serializeRow(
  url: string,
  runIndex: number,
  cold: boolean,
  name: string,
  metric: Metric,
): string {
  return [
    csvField(url),
    String(runIndex),
    cold ? "true" : "false",
    csvField(name),
    String(metric.value),
    csvField(metric.unit),
  ].join(",");
}

function csvField(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
