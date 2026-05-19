import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendTimeSeriesPoint,
  detectAllTrends,
  detectTrend,
  readTimeSeries,
  urlToKey,
  type TimeSeriesPoint,
} from "./timeseries.js";
import type { Report } from "@ohmyperf/core";

function fakeReport(url: string, lcpMedian: number): Report {
  return {
    schemaVersion: "1.0.0",
    meta: {
      url,
      startedAt: new Date().toISOString(),
      durationMs: 1000,
      runs: 3,
      mode: "ci-stable",
      browser: { name: "chromium", version: "147", source: "bundled" },
      host: { os: "linux", arch: "x64", nodeVersion: "v22" },
      parity: { mode: "headless", knownDeltas: {} },
      emulation: false,
      pluginCapabilityUses: [],
      measurementId: `m_${String(lcpMedian)}`,
    },
    runs: [],
    aggregated: {
      lcp: { median: lcpMedian, p75: lcpMedian, p95: lcpMedian, mean: lcpMedian, stdev: 0, cov: 0.02, runs: 3, droppedOutliers: 0 },
    },
    frames: { root: "r", nodes: {} },
    audits: [],
    artifacts: {},
    pluginData: {},
  } as unknown as Report;
}

function fakePoint(lcp: number, at = "2026-05-18T00:00:00.000Z"): TimeSeriesPoint {
  return {
    at,
    measurementId: "m",
    url: "https://example.com",
    mode: "ci-stable",
    runs: 3,
    metrics: { lcp: { median: lcp, cov: 0.02 } },
    unstable: false,
  };
}

describe("timeseries", () => {
  it("urlToKey is deterministic", () => {
    expect(urlToKey("https://example.com")).toBe(urlToKey("https://example.com"));
    expect(urlToKey("a")).not.toBe(urlToKey("b"));
  });

  it("append + read round-trip", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ohmyperf-ts-"));
    await appendTimeSeriesPoint(dir, fakeReport("https://x.com", 1000));
    await appendTimeSeriesPoint(dir, fakeReport("https://x.com", 1100));
    const points = await readTimeSeries(dir, "https://x.com");
    expect(points).toHaveLength(2);
    expect(points[0]!.metrics["lcp"]!.median).toBe(1000);
    expect(points[1]!.metrics["lcp"]!.median).toBe(1100);
  });

  it("detectTrend returns insufficient-data for n<3", () => {
    const verdict = detectTrend([fakePoint(1000), fakePoint(1100)], "lcp");
    expect(verdict.direction).toBe("insufficient-data");
  });

  it("detectTrend flags clear regression", () => {
    const points = [
      fakePoint(1000),
      fakePoint(1020),
      fakePoint(1010),
      fakePoint(1500),
      fakePoint(1550),
      fakePoint(1600),
    ];
    const v = detectTrend(points, "lcp");
    expect(v.direction).toBe("regressing");
    expect(v.relativeChange).toBeGreaterThan(0.1);
  });

  it("detectTrend flags clear improvement", () => {
    const points = [
      fakePoint(2000),
      fakePoint(2050),
      fakePoint(1950),
      fakePoint(1500),
      fakePoint(1450),
      fakePoint(1400),
    ];
    const v = detectTrend(points, "lcp");
    expect(v.direction).toBe("improving");
    expect(v.relativeChange).toBeLessThan(0);
  });

  it("detectTrend treats sub-noise-floor as stable", () => {
    const points = [
      fakePoint(1000),
      fakePoint(1010),
      fakePoint(1005),
      fakePoint(1020),
      fakePoint(1015),
      fakePoint(1010),
    ];
    const v = detectTrend(points, "lcp");
    expect(v.direction).toBe("stable");
  });

  it("detectAllTrends covers every metric seen in history", () => {
    const points = [fakePoint(1000), fakePoint(1100), fakePoint(1200)];
    const trends = detectAllTrends(points);
    const metricNames = trends.map((t) => t.metric);
    expect(metricNames).toContain("lcp");
    expect(metricNames).toContain("inp");
    expect(metricNames).toContain("cls");
  });
});
