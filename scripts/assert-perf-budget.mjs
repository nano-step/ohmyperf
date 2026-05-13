#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const BUDGETS = {
  lcp: { max: 2500, unit: 'ms' },
  inp: { max: 200, unit: 'ms' },
  cls: { max: 0.10, unit: '' },
};

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('Usage: node scripts/assert-perf-budget.mjs <path/to/report.json>');
  process.exit(2);
}

const report = JSON.parse(await readFile(reportPath, 'utf8'));

function getMedian(report, key) {
  const upper = key.toUpperCase();
  if (report.metrics) {
    const entry = Object.values(report.metrics).find(
      (m) => m?.name?.toUpperCase() === upper || m?.id?.toUpperCase() === upper,
    );
    if (entry?.median != null) return entry.median;
  }
  if (report.aggregate) {
    const v = report.aggregate[key]?.median;
    if (v != null) return v;
  }
  if (report.runs?.aggregate) {
    const v = report.runs.aggregate[key]?.median;
    if (v != null) return v;
  }
  return null;
}

let failed = false;

for (const [key, budget] of Object.entries(BUDGETS)) {
  const median = getMedian(report, key);
  if (median == null) {
    console.warn(`⚠  ${key.toUpperCase()} — not found in report; skipping.`);
    continue;
  }
  const ok = median <= budget.max;
  const status = ok ? '✅' : '❌';
  console.log(
    `${status} ${key.toUpperCase().padEnd(5)} median ${String(median)}${budget.unit}  (budget ≤ ${budget.max}${budget.unit})`,
  );
  if (!ok) failed = true;
}

if (failed) {
  console.error('\nPerformance budget exceeded.');
  process.exit(1);
}
console.log('\nAll perf budgets OK.');
