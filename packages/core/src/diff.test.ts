import { describe, expect, it } from "vitest";
import { diffReports, mannWhitneyPValue } from "./diff.js";
import type { Report, RunReport } from "./types.js";

function run(index: number, metrics: Record<string, number>): RunReport {
  const m: Record<string, { name: string; value: number; unit: "ms" | "score" }> = {};
  for (const [k, v] of Object.entries(metrics)) {
    m[k] = { name: k, value: v, unit: k === "cls" ? "score" : "ms" };
  }
  return { runIndex: index, cold: index === 0, metrics: m, resources: [], longTasks: [], meta: {} };
}

function makeReport(url: string, runs: RunReport[]): Report {
  return {
    schemaVersion: "1.0.0",
    meta: {
      url,
      startedAt: "2026-05-09T00:00:00.000Z",
      durationMs: 0,
      runs: runs.length,
      mode: "real",
      browser: { name: "chromium", version: "147.0", source: "bundled" },
      host: { os: "linux", arch: "x64", nodeVersion: "v22.0" },
      parity: { mode: "headless", knownDeltas: {} },
      emulation: false,
      pluginCapabilityUses: [],
      measurementId: "test",
    },
    runs,
    aggregated: {},
    frames: { root: "r", nodes: { r: { frameId: "r", url, origin: url, parentFrameId: null, isOOPIF: false, isCrossOrigin: false, attachedAt: 0, metrics: {}, children: [] } } },
    audits: [],
    artifacts: {},
    pluginData: {},
  };
}

describe("mannWhitneyPValue", () => {
  it("returns ~1 for identical samples", () => {
    const p = mannWhitneyPValue([100, 100, 100, 100, 100], [100, 100, 100, 100, 100]);
    expect(p).toBeGreaterThan(0.9);
  });

  it("returns very small p when distributions are clearly different", () => {
    const p = mannWhitneyPValue([100, 102, 99, 101, 100, 103], [200, 205, 195, 210, 198, 207]);
    expect(p).toBeLessThan(0.05);
  });

  it("handles small samples without throwing", () => {
    const p = mannWhitneyPValue([1, 2], [3, 4]);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe("diffReports", () => {
  it("flags a real regression when median delta exceeds noise floor AND p<alpha", () => {
    const baseline = makeReport("https://x", [
      run(0, { lcp: 100 }),
      run(1, { lcp: 102 }),
      run(2, { lcp: 99 }),
      run(3, { lcp: 101 }),
      run(4, { lcp: 100 }),
      run(5, { lcp: 103 }),
    ]);
    const candidate = makeReport("https://x", [
      run(0, { lcp: 200 }),
      run(1, { lcp: 195 }),
      run(2, { lcp: 210 }),
      run(3, { lcp: 205 }),
      run(4, { lcp: 198 }),
      run(5, { lcp: 207 }),
    ]);
    const diff = diffReports(baseline, candidate);
    const lcp = diff.metrics.find((m) => m.metric === "lcp")!;
    expect(lcp.direction).toBe("regression");
    expect(lcp.significant).toBe(true);
    expect(diff.hasRegressions).toBe(true);
  });

  it("does NOT flag a regression when delta is within noise floor", () => {
    const baseline = makeReport("https://x", [
      run(0, { lcp: 100 }),
      run(1, { lcp: 102 }),
      run(2, { lcp: 99 }),
      run(3, { lcp: 101 }),
      run(4, { lcp: 100 }),
    ]);
    const candidate = makeReport("https://x", [
      run(0, { lcp: 102 }),
      run(1, { lcp: 100 }),
      run(2, { lcp: 103 }),
      run(3, { lcp: 99 }),
      run(4, { lcp: 101 }),
    ]);
    const diff = diffReports(baseline, candidate);
    expect(diff.hasRegressions).toBe(false);
  });

  it("flags an improvement (negative direction = lower-is-better)", () => {
    const baseline = makeReport("https://x", [
      run(0, { lcp: 200 }),
      run(1, { lcp: 198 }),
      run(2, { lcp: 205 }),
      run(3, { lcp: 202 }),
      run(4, { lcp: 199 }),
      run(5, { lcp: 201 }),
    ]);
    const candidate = makeReport("https://x", [
      run(0, { lcp: 100 }),
      run(1, { lcp: 102 }),
      run(2, { lcp: 99 }),
      run(3, { lcp: 101 }),
      run(4, { lcp: 100 }),
      run(5, { lcp: 103 }),
    ]);
    const diff = diffReports(baseline, candidate);
    const lcp = diff.metrics.find((m) => m.metric === "lcp")!;
    expect(lcp.direction).toBe("improvement");
    expect(diff.hasRegressions).toBe(false);
  });

  it("includes baselineN, candidateN, baselineMedian, candidateMedian per metric", () => {
    const baseline = makeReport("https://x", [run(0, { lcp: 100 }), run(1, { lcp: 100 })]);
    const candidate = makeReport("https://x", [run(0, { lcp: 110 }), run(1, { lcp: 110 })]);
    const diff = diffReports(baseline, candidate);
    const lcp = diff.metrics.find((m) => m.metric === "lcp")!;
    expect(lcp.baselineN).toBe(2);
    expect(lcp.candidateN).toBe(2);
    expect(lcp.baselineMedian).toBe(100);
    expect(lcp.candidateMedian).toBe(110);
    expect(lcp.delta).toBe(10);
  });
});
