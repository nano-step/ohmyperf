import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Report } from "@ohmyperf/core";

export const REPORTER_ID = "json" as const;

export interface JsonReporterOptions {
  readonly pretty?: boolean;
  readonly fileName?: string;
}

export interface JsonReporterResult {
  readonly path: string;
  readonly bytes: number;
}

export async function writeJsonReport(
  report: Report,
  outputDir: string,
  opts: JsonReporterOptions = {},
): Promise<JsonReporterResult> {
  const dir = resolve(outputDir);
  const fileName = opts.fileName ?? "report.json";
  const path = join(dir, fileName);
  await mkdir(dirname(path), { recursive: true });
  const indent = opts.pretty === false ? undefined : 2;
  const body = JSON.stringify(report, null, indent);
  await writeFile(path, body + "\n", "utf8");
  return { path, bytes: Buffer.byteLength(body) + 1 };
}

export function serializeReport(report: Report, pretty = true): string {
  return JSON.stringify(report, null, pretty ? 2 : undefined);
}
