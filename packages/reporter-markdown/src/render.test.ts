import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./index.js";
import type { Report } from "@ohmyperf/core";

function makeReport(overrides: Partial<Report> = {}): Report {
  const base: Report = {
    schemaVersion: "1.0.0",
    meta: {
      url: "https://example.com/",
      startedAt: "2026-05-09T00:00:00.000Z",
      durationMs: 1000,
      runs: 3,
      mode: "real",
      browser: { name: "chromium", version: "147.0", source: "bundled" },
      host: { os: "linux", arch: "x64", nodeVersion: "v22.0" },
      parity: { mode: "headless", knownDeltas: {} },
      emulation: false,
      pluginCapabilityUses: [],
      measurementId: "m_test",
    },
    runs: [],
    aggregated: {
      lcp: {
        median: 100,
        p75: 110,
        p95: 120,
        mean: 105,
        stdev: 8,
        cov: 0.076,
        runs: 3,
        droppedOutliers: 0,
      },
      cls: {
        median: 0.005,
        p75: 0.005,
        p95: 0.005,
        mean: 0.005,
        stdev: 0,
        cov: 0,
        runs: 3,
        droppedOutliers: 0,
      },
    },
    frames: { root: "r", nodes: { r: { frameId: "r", url: "https://x", origin: "https://x", parentFrameId: null, isOOPIF: false, isCrossOrigin: false, attachedAt: 0, metrics: {}, children: [] } } },
    audits: [
      { id: "a11y.axe-violations", title: "Accessibility", score: 0, passed: false },
    ],
    artifacts: {},
    pluginData: { foo: { bar: 1 } },
  };
  return { ...base, ...overrides };
}

describe("renderMarkdown()", () => {
  it("includes URL, mode, runs, browser", () => {
    const md = renderMarkdown(makeReport());
    expect(md).toContain("`https://example.com/`");
    expect(md).toContain("**Mode**: `real`");
    expect(md).toContain("**Runs**: 3");
    expect(md).toContain("chromium 147.0");
  });

  it("renders the CWV table with median/p75/p95/CoV/n columns", () => {
    const md = renderMarkdown(makeReport());
    expect(md).toContain("| Metric | Median | p75 | p95 | CoV | n |");
    expect(md).toMatch(/\*\*LCP\*\* \| 100\.0 ms \| 110\.0 ms/);
    expect(md).toMatch(/\*\*CLS\*\* \| 0\.005 \| 0\.005/);
  });

  it("renders the audits table with PASS/FAIL emoji", () => {
    const md = renderMarkdown(makeReport());
    expect(md).toContain("### Audits");
    expect(md).toContain("❌ FAIL");
    expect(md).toContain("a11y.axe-violations");
  });

  it("flags unstable metrics with ⚠️ in the CoV column", () => {
    const r = makeReport();
    r.aggregated.lcp = { ...r.aggregated.lcp!, cov: 0.45 };
    const md = renderMarkdown(r);
    expect(md).toMatch(/45\.0%.*⚠️/);
  });

  it("includes calibration when present", () => {
    const r = makeReport();
    (r.meta as { calibration?: unknown }).calibration = {
      reference: "mid-range-2024-laptop",
      observedScore: 8,
      throttleRate: 4,
      networkProfile: "fast-4g",
      cacheHit: true,
    };
    const md = renderMarkdown(r);
    expect(md).toContain("**Calibration**");
    expect(md).toContain("throttle 4×");
    expect(md).toContain("fast-4g");
    expect(md).toContain("cached");
  });

  it("escapes pipes inside audit titles to keep table valid", () => {
    const r = makeReport();
    r.audits = [
      { id: "x|y", title: "danger | here", score: 1, passed: true },
    ];
    const md = renderMarkdown(r);
    expect(md).toContain("\\|");
  });

  it("opt-in pluginData block when includePluginData=true", () => {
    const md = renderMarkdown(makeReport(), { includePluginData: true });
    expect(md).toContain("### Plugin data");
    expect(md).toContain("```json");
  });

  it("default omits pluginData (PR comments stay short)", () => {
    const md = renderMarkdown(makeReport());
    expect(md).not.toContain("### Plugin data");
  });
});
