import { describe, expect, it } from "vitest";
import { analyzeRegressionCause } from "./regression-cause.js";
import type { Report } from "@ohmyperf/core";

function makeReport(opts: {
  lcps?: number[];
  resources?: Array<{ url: string; mimeType?: string; transferSizeBytes?: number; responseMs?: number; renderBlocking?: boolean }>;
  longTasks?: Array<{ duration: number; attribution: string; url?: string }>;
}): Report {
  const lcps = opts.lcps ?? [1000, 1010, 990];
  const resources = (opts.resources ?? []).map((r) => ({
    url: r.url,
    mimeType: r.mimeType ?? "text/javascript",
    requestMs: 0,
    responseMs: r.responseMs ?? 100,
    transferSizeBytes: r.transferSizeBytes ?? 1000,
    encodedSizeBytes: r.transferSizeBytes ?? 1000,
    decodedSizeBytes: r.transferSizeBytes ?? 1000,
    renderBlocking: r.renderBlocking ?? false,
    cacheHit: false,
  }));
  const longTasks = (opts.longTasks ?? []).map((t) => ({
    startTime: 0,
    duration: t.duration,
    attribution: t.attribution,
    ...(t.url !== undefined ? { attributionRich: { url: t.url, frameId: "r" } } : {}),
  }));
  const median = lcps.slice().sort((a, b) => a - b)[Math.floor(lcps.length / 2)]!;
  return {
    schemaVersion: "1.0.0",
    meta: {
      url: "https://example.com",
      startedAt: "2026-05-18T00:00:00.000Z",
      durationMs: 1000,
      runs: lcps.length,
      mode: "ci-stable",
      browser: { name: "chromium", version: "147", source: "bundled" },
      host: { os: "linux", arch: "x64", nodeVersion: "v22" },
      parity: { mode: "headless", knownDeltas: {} },
      emulation: false,
      pluginCapabilityUses: [],
      measurementId: "m",
    },
    runs: lcps.map((v, i) => ({
      runIndex: i,
      cold: i === 0,
      metrics: { lcp: { name: "lcp", value: v, unit: "ms" as const } },
      resources: i === 0 ? resources : [],
      longTasks: i === 0 ? longTasks : [],
      meta: {},
    })),
    aggregated: {
      lcp: { median, p75: median, p95: median, mean: median, stdev: 0, cov: 0.02, runs: lcps.length, droppedOutliers: 0 },
    },
    frames: { root: "r", nodes: {} },
    audits: [],
    artifacts: {},
    pluginData: {},
  } as unknown as Report;
}

describe("analyzeRegressionCause", () => {
  it("returns stable verdict when no significant change", () => {
    const baseline = makeReport({ lcps: [1000, 1010, 995, 1005, 1000] });
    const candidate = makeReport({ lcps: [1010, 1015, 1005, 1000, 1008] });
    const result = analyzeRegressionCause(baseline, candidate);
    expect(result.verdict).toBe("stable");
    expect(result.hypotheses).toHaveLength(0);
  });

  it("ranks new render-blocking resource as top cause for LCP regression", () => {
    const baseline = makeReport({ lcps: [1000, 1010, 990, 1005, 995] });
    const candidate = makeReport({
      lcps: [1800, 1850, 1900, 1820, 1880],
      resources: [
        { url: "https://cdn.example.com/heavy.js", renderBlocking: true, transferSizeBytes: 200_000 },
      ],
    });
    const result = analyzeRegressionCause(baseline, candidate);
    expect(result.verdict).toBe("regressed");
    expect(result.hypotheses.length).toBeGreaterThan(0);
    const top = result.hypotheses[0]!;
    expect(top.metric).toBe("lcp");
    expect(top.evidence.newRenderBlocking).toHaveLength(1);
    expect(top.likelyCauses[0]).toMatch(/render-blocking/i);
  });

  it("attributes INP/TBT regression to new long tasks", () => {
    const baseline = makeReport({
      lcps: [1000, 1000, 1000, 1000, 1000],
    });
    const candidate = makeReport({
      lcps: [1000, 1000, 1000, 1000, 1000],
      longTasks: [
        { duration: 500, attribution: "script", url: "https://example.com/heavy-handler.js" },
      ],
    });
    expect(analyzeRegressionCause(baseline, candidate).verdict).toBe("stable");
  });
});
