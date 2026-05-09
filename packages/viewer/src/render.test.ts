import { describe, expect, it } from "vitest";
import { renderReportHtml } from "./render.js";
import { escapeHtml, escapeJsonForHtml } from "./escape.js";
import type { Report } from "@ohmyperf/core";

function makeReport(overrides: Partial<Report> = {}): Report {
  const base: Report = {
    schemaVersion: "1.0.0",
    meta: {
      url: "https://example.com/path",
      startedAt: "2026-05-09T00:00:00.000Z",
      durationMs: 1234,
      runs: 3,
      mode: "real",
      browser: { name: "chromium", version: "147.0.7727.0", source: "bundled" },
      host: { os: "linux 6.5.0", arch: "x64", nodeVersion: "v22.10.0" },
      parity: { mode: "headless", knownDeltas: { inp: "synthetic-input" } },
      emulation: false,
      pluginCapabilityUses: [],
      measurementId: "m_abcdef0123456789",
    },
    runs: [
      {
        runIndex: 0,
        cold: true,
        metrics: {
          lcp: { name: "lcp", value: 38, unit: "ms" },
          cls: { name: "cls", value: 0.0024, unit: "score" },
        },
        resources: [],
        longTasks: [],
        meta: {},
      },
      {
        runIndex: 1,
        cold: false,
        metrics: { lcp: { name: "lcp", value: 41, unit: "ms" } },
        resources: [],
        longTasks: [],
        meta: {},
      },
    ],
    aggregated: {
      lcp: { median: 39, p75: 40.5, p95: 41, mean: 39.5, stdev: 1.5, cov: 0.038, runs: 2, droppedOutliers: 0 },
      cls: { median: 0.0024, p75: 0.0024, p95: 0.0024, mean: 0.0024, stdev: 0, cov: 0, runs: 1, droppedOutliers: 0 },
    },
    frames: {
      root: "ohmyperf:root",
      nodes: {
        "ohmyperf:root": {
          frameId: "ohmyperf:root",
          url: "https://example.com/path",
          origin: "https://example.com",
          parentFrameId: null,
          isOOPIF: false,
          isCrossOrigin: false,
          attachedAt: 0,
          metrics: {},
          children: ["frame-1"],
        },
        "frame-1": {
          frameId: "frame-1",
          url: "https://ads.example.test/banner",
          origin: "https://ads.example.test",
          parentFrameId: "ohmyperf:root",
          isOOPIF: true,
          isCrossOrigin: true,
          attachedAt: 0,
          metrics: {},
          children: [],
        },
      },
    },
    audits: [
      { id: "a11y.axe-violations", title: "Accessibility violations", score: 0, passed: false, details: { count: 1 } },
    ],
    artifacts: {},
    pluginData: {
      "ohmyperf.builtin.axe": { violationCount: 1, violations: [{ id: "html-has-lang" }] },
    },
  };
  return { ...base, ...overrides };
}

describe("escape utilities", () => {
  it("escapes the 5 dangerous HTML characters", () => {
    expect(escapeHtml("<script>alert(\"x\")</script>")).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(escapeHtml("a&b'c")).toBe("a&amp;b&#39;c");
  });

  it("escapeJsonForHtml protects against </script> in payloads", () => {
    const input = { x: "</script><img src=x onerror=alert(1)>" };
    const out = escapeJsonForHtml(input);
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c");
  });
});

describe("renderReportHtml()", () => {
  it("produces a self-contained <!doctype html> document", () => {
    const html = renderReportHtml(makeReport());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>OhMyPerf — example.com/path</title>");
    expect(html).toContain("<style>");
    expect(html).toContain("@ohmyperf/viewer");
  });

  it("makes no external network requests", () => {
    const html = renderReportHtml(makeReport());
    expect(html).not.toMatch(/<link\b[^>]+rel\s*=\s*["']stylesheet["']/i);
    expect(html).not.toMatch(/<script[^>]+src\s*=/i);
    expect(html).not.toMatch(/<img\b[^>]+src\s*=\s*["']https?:/i);
  });

  it("escapes user-controlled fields", () => {
    const evil = makeReport({
      meta: {
        ...makeReport().meta,
        url: '<script>alert("pwn")</script>',
      },
    });
    const html = renderReportHtml(evil);
    expect(html).not.toContain('<script>alert("pwn")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders CWV tiles for known headline metrics", () => {
    const html = renderReportHtml(makeReport());
    expect(html).toContain('class="tile');
    expect(html).toContain(">LCP<");
    expect(html).toContain(">CLS<");
  });

  it("flags an unstable run when CoV > 20%", () => {
    const r = makeReport();
    const a = r.aggregated["lcp"]!;
    const unstable = makeReport({
      aggregated: { ...r.aggregated, lcp: { ...a, cov: 0.45 } },
    });
    const html = renderReportHtml(unstable);
    expect(html).toContain("Unstable run");
    expect(html).toContain('class="tile unstable"');
  });

  it("renders the audits table including failing audits", () => {
    const html = renderReportHtml(makeReport());
    expect(html).toContain("a11y.axe-violations");
    expect(html).toContain("FAIL");
  });

  it("renders the frame tree with cross-origin OOPIF marker", () => {
    const html = renderReportHtml(makeReport());
    expect(html).toContain("ohmyperf:root");
    expect(html).toContain("frame-1");
    expect(html).toContain("OOPIF");
    expect(html).toContain("cross-origin");
  });

  it("embeds an inert JSON payload by default and sanitizes </script>", () => {
    const r = makeReport({
      pluginData: { evil: "</script><img src=x onerror=alert(1)>" },
    });
    const html = renderReportHtml(r);
    expect(html).toContain('id="ohmyperf-report-payload"');
    const payloadStart = html.indexOf('id="ohmyperf-report-payload">') + 'id="ohmyperf-report-payload">'.length;
    const payloadEnd = html.indexOf("</script>", payloadStart);
    const payload = html.slice(payloadStart, payloadEnd);
    expect(payload).not.toContain("</script>");
    expect(payload).toContain("\\u003c/script\\u003e");
  });

  it("can omit the embedded payload via opts.embedReportPayload=false", () => {
    const html = renderReportHtml(makeReport(), { embedReportPayload: false });
    expect(html).not.toContain('id="ohmyperf-report-payload"');
  });
});
