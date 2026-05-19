import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Report } from "@ohmyperf/core";
import { renderReportHtml, type RenderViewerOptions } from "@ohmyperf/viewer";

export const REPORTER_ID = "html" as const;

export interface HtmlReporterOptions extends RenderViewerOptions {
  readonly fileName?: string;
}

export interface HtmlReporterResult {
  readonly path: string;
  readonly bytes: number;
}

export async function writeHtmlReport(
  report: Report,
  outputDir: string,
  opts: HtmlReporterOptions = {},
): Promise<HtmlReporterResult> {
  const dir = resolve(outputDir);
  const fileName = opts.fileName ?? "report.html";
  const path = join(dir, fileName);
  await mkdir(dirname(path), { recursive: true });
  const html = renderReportToString(report, opts);
  await writeFile(path, html, "utf8");
  return { path, bytes: Buffer.byteLength(html) };
}

export function renderReportToString(
  report: Report,
  opts: RenderViewerOptions = {},
): string {
  return renderReportHtml(report, opts);
}
