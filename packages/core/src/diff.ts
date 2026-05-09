import type { Report } from "./types.js";

export interface MetricDiff {
  readonly metric: string;
  readonly baselineN: number;
  readonly candidateN: number;
  readonly baselineMedian: number;
  readonly candidateMedian: number;
  readonly delta: number;
  readonly relativeDelta: number;
  readonly pValue: number;
  readonly significant: boolean;
  readonly direction: "improvement" | "regression" | "neutral";
}

export interface ReportDiff {
  readonly baselineUrl: string;
  readonly candidateUrl: string;
  readonly baselineRuns: number;
  readonly candidateRuns: number;
  readonly metrics: ReadonlyArray<MetricDiff>;
  readonly hasRegressions: boolean;
}

export interface DiffOptions {
  readonly significanceLevel?: number;
  readonly noiseFloor?: Readonly<Record<string, number>>;
}

const DEFAULT_NOISE_FLOOR: Readonly<Record<string, number>> = {
  lcp: 0.05,
  fcp: 0.05,
  ttfb: 0.10,
  inp: 0.10,
  cls: 0.05,
  tbt: 0.10,
  load: 0.10,
  domContentLoaded: 0.10,
};

const HIGHER_IS_BETTER = new Set<string>([]);

export function diffReports(
  baseline: Report,
  candidate: Report,
  opts: DiffOptions = {},
): ReportDiff {
  const alpha = opts.significanceLevel ?? 0.05;
  const noiseFloor = opts.noiseFloor ?? DEFAULT_NOISE_FLOOR;

  const baselineByMetric = collectRunValues(baseline);
  const candidateByMetric = collectRunValues(candidate);

  const allMetrics = new Set<string>();
  for (const k of Object.keys(baselineByMetric)) allMetrics.add(k);
  for (const k of Object.keys(candidateByMetric)) allMetrics.add(k);

  const metrics: MetricDiff[] = [];
  let hasRegressions = false;

  for (const name of [...allMetrics].sort()) {
    const a = baselineByMetric[name] ?? [];
    const b = candidateByMetric[name] ?? [];
    if (a.length === 0 || b.length === 0) continue;
    const baselineMedian = median(a);
    const candidateMedian = median(b);
    const delta = candidateMedian - baselineMedian;
    const relativeDelta = baselineMedian === 0 ? 0 : delta / baselineMedian;

    const pValue = mannWhitneyPValue(a, b);
    const noise = noiseFloor[name] ?? 0.05;
    const exceedsNoise = Math.abs(relativeDelta) > noise;
    const statisticallySignificant = pValue < alpha;
    const significant = exceedsNoise && statisticallySignificant;

    let direction: MetricDiff["direction"] = "neutral";
    if (significant) {
      if (HIGHER_IS_BETTER.has(name)) {
        direction = delta > 0 ? "improvement" : "regression";
      } else {
        direction = delta > 0 ? "regression" : "improvement";
      }
    }
    if (direction === "regression") hasRegressions = true;

    metrics.push({
      metric: name,
      baselineN: a.length,
      candidateN: b.length,
      baselineMedian,
      candidateMedian,
      delta,
      relativeDelta,
      pValue,
      significant,
      direction,
    });
  }

  return {
    baselineUrl: baseline.meta.url,
    candidateUrl: candidate.meta.url,
    baselineRuns: baseline.runs.length,
    candidateRuns: candidate.runs.length,
    metrics,
    hasRegressions,
  };
}

function collectRunValues(report: Report): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const r of report.runs) {
    for (const [name, m] of Object.entries(r.metrics)) {
      if (!Number.isFinite(m.value)) continue;
      const list = out[name];
      if (list) list.push(m.value);
      else out[name] = [m.value];
    }
  }
  return out;
}

function median(values: ReadonlyArray<number>): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2;
  return sorted[mid]!;
}

export function mannWhitneyPValue(
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number>,
): number {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 === 0 || n2 === 0) return 1;

  const combined = a.map((v) => ({ v, group: 0 as 0 | 1 })).concat(
    b.map((v) => ({ v, group: 1 as 0 | 1 })),
  );
  combined.sort((x, y) => x.v - y.v);

  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j + 1 < combined.length && combined[j + 1]!.v === combined[i]!.v) j++;
    const avgRank = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) {
      (combined[k] as unknown as { rank: number }).rank = avgRank;
    }
    i = j + 1;
  }

  let r1 = 0;
  for (const e of combined as Array<{ v: number; group: 0 | 1; rank: number }>) {
    if (e.group === 0) r1 += e.rank;
  }
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);

  if (n1 < 4 || n2 < 4) {
    return u <= 0 ? 0.05 : 1;
  }

  const meanU = (n1 * n2) / 2;
  const stdU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  if (stdU === 0) return 1;
  const z = (u - meanU) / stdU;
  const p = 2 * normalSurvival(Math.abs(z));
  return Math.min(1, Math.max(0, p));
}

function normalSurvival(z: number): number {
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp(-z * z * 0.5);
  const probApprox =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return probApprox;
}

export function formatDiff(diff: ReportDiff): string {
  const lines: string[] = [];
  lines.push(`baseline: ${diff.baselineUrl} (n=${String(diff.baselineRuns)})`);
  lines.push(`candidate: ${diff.candidateUrl} (n=${String(diff.candidateRuns)})`);
  lines.push("");
  lines.push("metric         baseline    candidate   delta       rel%     p-value  status");
  lines.push("-".repeat(80));
  for (const m of diff.metrics) {
    const baseStr = m.baselineMedian.toFixed(m.metric === "cls" ? 3 : 1).padStart(10);
    const candStr = m.candidateMedian.toFixed(m.metric === "cls" ? 3 : 1).padStart(10);
    const deltaStr = (m.delta >= 0 ? "+" : "") + m.delta.toFixed(m.metric === "cls" ? 3 : 1);
    const relStr = (m.relativeDelta * 100).toFixed(1) + "%";
    const pStr = m.pValue.toFixed(3);
    const statusStr =
      m.direction === "regression"
        ? "REGRESSION"
        : m.direction === "improvement"
        ? "improvement"
        : "neutral";
    lines.push(
      `${m.metric.padEnd(14)} ${baseStr}  ${candStr}  ${deltaStr.padStart(10)}  ${relStr.padStart(7)}  ${pStr}    ${statusStr}`,
    );
  }
  lines.push("");
  lines.push(diff.hasRegressions ? "verdict: REGRESSIONS DETECTED" : "verdict: no regressions");
  return lines.join("\n");
}
