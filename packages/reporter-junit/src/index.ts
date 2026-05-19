import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Report, BudgetEvaluation } from "@ohmyperf/core";

export const REPORTER_ID = "junit" as const;
export const PACKAGE_NAME = "@ohmyperf/reporter-junit" as const;
export const PACKAGE_ROLE = "JUnit XML reporter; one testcase per budget threshold." as const;

export interface JunitReporterOptions {
  readonly fileName?: string;
  readonly suiteName?: string;
}

export interface JunitReporterResult {
  readonly path: string;
  readonly bytes: number;
}

export async function writeJunitReport(
  report: Report,
  outputDir: string,
  opts: JunitReporterOptions = {},
): Promise<JunitReporterResult> {
  const dir = resolve(outputDir);
  const fileName = opts.fileName ?? "report.junit.xml";
  const path = join(dir, fileName);
  await mkdir(dirname(path), { recursive: true });
  const body = renderJunit(report, opts.suiteName);
  await writeFile(path, body, "utf8");
  return { path, bytes: Buffer.byteLength(body) };
}

export function renderJunit(report: Report, suiteName?: string): string {
  const budgets: readonly BudgetEvaluation[] = report.budgets ?? [];
  const name = suiteName ?? `OhMyPerf — ${report.meta.url}`;
  const tests = budgets.length;
  const failures = budgets.filter((b) => !b.passed).length;
  const timestamp = report.meta.startedAt;
  const time = (report.meta.durationMs / 1000).toFixed(3);

  const cases = budgets.map((b) => renderTestcase(b)).join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuites name=${attr(name)} tests="${tests}" failures="${failures}" time="${time}">`,
    `  <testsuite name=${attr(name)} tests="${tests}" failures="${failures}" timestamp=${attr(timestamp)} time="${time}">`,
    cases,
    `  </testsuite>`,
    `</testsuites>`,
    ``,
  ].join("\n");
}

function renderTestcase(b: BudgetEvaluation): string {
  const caseName = `budget:${b.metric}`;
  const head = `    <testcase classname="ohmyperf.budget" name=${attr(caseName)} time="0">`;
  if (b.passed) {
    return `${head}</testcase>`;
  }
  const msg = `${b.metric} = ${b.observed} (threshold ${b.threshold})`;
  return [
    head,
    `      <failure type="BudgetExceeded" message=${attr(msg)}>${esc(msg)}</failure>`,
    `    </testcase>`,
  ].join("\n");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function attr(s: string): string {
  return `"${esc(s)}"`;
}
