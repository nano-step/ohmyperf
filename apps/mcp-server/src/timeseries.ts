import { appendFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Report } from "@ohmyperf/core";

export interface TimeSeriesPoint {
  readonly at: string;
  readonly measurementId: string;
  readonly url: string;
  readonly mode: "real" | "ci-stable";
  readonly runs: number;
  readonly metrics: Readonly<Record<string, { median: number; cov: number }>>;
  readonly unstable: boolean;
}

export interface TrendVerdict {
  readonly metric: string;
  readonly direction: "improving" | "stable" | "regressing" | "insufficient-data";
  readonly slope: number;
  readonly recentMedian: number;
  readonly baselineMedian: number;
  readonly relativeChange: number;
  readonly confidence: "high" | "medium" | "low";
  readonly n: number;
}

const HEADLINE_METRICS = ["lcp", "fcp", "ttfb", "inp", "cls", "tbt"] as const;

export function urlToKey(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

export function timeseriesPath(rootDir: string, url: string): string {
  return join(rootDir, "timeseries", `${urlToKey(url)}.ndjson`);
}

export async function appendTimeSeriesPoint(
  rootDir: string,
  report: Report,
): Promise<TimeSeriesPoint> {
  const point: TimeSeriesPoint = {
    at: new Date().toISOString(),
    measurementId: report.meta.measurementId,
    url: report.meta.url,
    mode: report.meta.mode,
    runs: report.meta.runs,
    metrics: pickHeadline(report),
    unstable: Boolean(report.meta.unstable),
  };
  const path = timeseriesPath(rootDir, report.meta.url);
  await mkdir(join(rootDir, "timeseries"), { recursive: true });
  await appendFile(path, `${JSON.stringify(point)}\n`);
  return point;
}

export async function readTimeSeries(
  rootDir: string,
  url: string,
  limit = 100,
): Promise<TimeSeriesPoint[]> {
  const path = timeseriesPath(rootDir, url);
  let body: string;
  try {
    body = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const lines = body.split("\n").filter((l) => l.length > 0);
  const points: TimeSeriesPoint[] = [];
  for (const line of lines.slice(-limit)) {
    try {
      points.push(JSON.parse(line) as TimeSeriesPoint);
    } catch {
      // skip corrupt line — append-only, never blocks future writes
    }
  }
  return points;
}

export function detectTrend(
  points: readonly TimeSeriesPoint[],
  metric: string,
): TrendVerdict {
  const values: number[] = [];
  for (const p of points) {
    const m = p.metrics[metric];
    if (m && Number.isFinite(m.median)) values.push(m.median);
  }
  const n = values.length;
  if (n < 3) {
    return {
      metric,
      direction: "insufficient-data",
      slope: 0,
      recentMedian: values[n - 1] ?? 0,
      baselineMedian: values[0] ?? 0,
      relativeChange: 0,
      confidence: "low",
      n,
    };
  }
  const third = Math.max(1, Math.floor(n / 3));
  const baselineWindow = values.slice(0, third);
  const recentWindow = values.slice(-third);
  const baselineMedian = median(baselineWindow);
  const recentMedian = median(recentWindow);
  const relativeChange = baselineMedian === 0 ? 0 : (recentMedian - baselineMedian) / baselineMedian;
  const slope = linearSlope(values);

  // Lower-is-better for all CWV metrics (no inverted metric currently tracked)
  const noiseFloor = metric === "cls" ? 0.1 : 0.05;
  let direction: TrendVerdict["direction"];
  if (Math.abs(relativeChange) < noiseFloor) direction = "stable";
  else if (relativeChange > 0) direction = "regressing";
  else direction = "improving";

  let confidence: TrendVerdict["confidence"];
  if (n >= 10 && Math.abs(relativeChange) >= 2 * noiseFloor) confidence = "high";
  else if (n >= 5) confidence = "medium";
  else confidence = "low";

  return {
    metric,
    direction,
    slope,
    recentMedian,
    baselineMedian,
    relativeChange,
    confidence,
    n,
  };
}

export function detectAllTrends(
  points: readonly TimeSeriesPoint[],
): TrendVerdict[] {
  const metrics = new Set<string>(HEADLINE_METRICS);
  for (const p of points) for (const k of Object.keys(p.metrics)) metrics.add(k);
  return [...metrics].map((m) => detectTrend(points, m));
}

function pickHeadline(report: Report): Record<string, { median: number; cov: number }> {
  const out: Record<string, { median: number; cov: number }> = {};
  for (const [name, agg] of Object.entries(report.aggregated)) {
    out[name] = { median: agg.median, cov: agg.cov };
  }
  return out;
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function linearSlope(xs: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = xs.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (xs[i]! - yMean);
    den += (i - xMean) * (i - xMean);
  }
  return den === 0 ? 0 : num / den;
}
