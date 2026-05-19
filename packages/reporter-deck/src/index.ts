import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Report } from "@ohmyperf/core";
import { renderReportDeck, type RenderDeckOptions } from "./render.js";

export const REPORTER_ID = "deck" as const;

export interface DeckReporterOptions extends RenderDeckOptions {
  readonly fileName?: string;
}

export interface DeckReporterResult {
  readonly path: string;
  readonly bytes: number;
}

export async function writeDeckReport(
  report: Report,
  outputDir: string,
  opts: DeckReporterOptions = {},
): Promise<DeckReporterResult> {
  const dir = resolve(outputDir);
  const fileName = opts.fileName ?? "report-deck.html";
  const path = join(dir, fileName);
  await mkdir(dirname(path), { recursive: true });
  const html = renderToString(report, opts);
  await writeFile(path, html, "utf8");
  return { path, bytes: Buffer.byteLength(html) };
}

export function renderToString(report: Report, opts: RenderDeckOptions = {}): string {
  return renderReportDeck(report, opts);
}

export { renderReportDeck, type RenderDeckOptions } from "./render.js";
