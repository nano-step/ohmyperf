import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Report } from "@ohmyperf/core";
import {
  renderMarkdown,
  type MarkdownReporterOptions,
  type MarkdownReporterResult,
} from "./index.js";

export async function writeMarkdownReport(
  report: Report,
  outputDir: string,
  opts: MarkdownReporterOptions = {},
): Promise<MarkdownReporterResult> {
  const dir = resolve(outputDir);
  const fileName = opts.fileName ?? "report.md";
  const path = join(dir, fileName);
  await mkdir(dirname(path), { recursive: true });
  const body = renderMarkdown(report, opts);
  await writeFile(path, body, "utf8");
  return { path, bytes: Buffer.byteLength(body) };
}
