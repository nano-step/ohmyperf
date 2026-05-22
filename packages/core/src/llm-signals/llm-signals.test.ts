import { describe, expect, it } from "vitest";
import { classifyOrigin, parseOriginInfo, resolveOrgDomains } from "./origin-class.js";
import { classifyServability } from "./servability.js";
import { computeTrustScore } from "./trust-score.js";
import { buildFixPlan } from "./fix-plan.js";
import type { Report } from "../types.js";

function reportFixture(opts: Partial<Report> & { url?: string; cov?: number; runs?: number } = {}): Report {
  const url = opts.url ?? "https://example.com/";
  const cov = opts.cov ?? 0.05;
  const runs = opts.runs ?? 5;
  return {
    schemaVersion: "1.0.0",
    meta: {
      url,
      startedAt: new Date().toISOString(),
      durationMs: 1000,
      runs,
      mode: "real",
      browser: { name: "chromium", version: "0", source: "bundled" },
      host: { os: "linux", arch: "x64", nodeVersion: "v22" },
      parity: { mode: "headless", knownDeltas: {} },
      emulation: false,
      pluginCapabilityUses: [],
      measurementId: "t",
    },
    runs: [],
    aggregated: {
      lcp: { name: "lcp", median: 1000, p75: 1100, p95: 1200, mean: 1050, stdev: 50, cov, runs, droppedOutliers: 0 },
      fcp: { name: "fcp", median: 800, p75: 850, p95: 900, mean: 820, stdev: 30, cov, runs, droppedOutliers: 0 },
    },
    frames: { root: "ohmyperf:root", nodes: {} },
    audits: [],
    artifacts: {},
    pluginData: {},
    ...opts,
  } as Report;
}

describe("classifyOrigin", () => {
  it("same host = same-origin", () => {
    const primary = parseOriginInfo("https://example.com/page");
    expect(classifyOrigin("https://example.com/static/a.js", primary)).toBe("same-origin");
  });

  it("same registrable domain, different subdomain = same-site", () => {
    const primary = parseOriginInfo("https://www.example.com/");
    expect(classifyOrigin("https://cdn.example.com/a.js", primary)).toBe("same-site");
  });

  it("different registrable domain = cross-site", () => {
    const primary = parseOriginInfo("https://example.com/");
    expect(classifyOrigin("https://cdn.googletagmanager.com/gtm.js", primary)).toBe("cross-site");
  });

  it("co.uk style TLD: example.co.uk vs cdn.example.co.uk = same-site", () => {
    const primary = parseOriginInfo("https://www.example.co.uk/");
    expect(classifyOrigin("https://cdn.example.co.uk/a.js", primary)).toBe("same-site");
  });

  it("invalid URL returns unknown", () => {
    const primary = parseOriginInfo("https://example.com/");
    expect(classifyOrigin("not a url", primary)).toBe("unknown");
  });

  it("null primary returns unknown for any resource", () => {
    expect(classifyOrigin("https://example.com/a.js", null)).toBe("unknown");
  });

  it("W1: orgDomains matches github.com → githubassets.com as same-org", () => {
    const primary = parseOriginInfo("https://github.com/");
    const orgs = ["githubassets.com", "githubusercontent.com"];
    expect(classifyOrigin("https://github.githubassets.com/assets/main.css", primary, orgs)).toBe("same-org");
    expect(classifyOrigin("https://raw.githubusercontent.com/repo/file.js", primary, orgs)).toBe("same-org");
  });

  it("W1: orgDomains wildcard *.cloudfront.net catches subdomains", () => {
    const primary = parseOriginInfo("https://mysite.com/");
    const orgs = ["*.cloudfront.net"];
    expect(classifyOrigin("https://d123.cloudfront.net/a.js", primary, orgs)).toBe("same-org");
  });

  it("W1: orgDomains does NOT match unrelated hosts", () => {
    const primary = parseOriginInfo("https://github.com/");
    const orgs = ["githubassets.com"];
    expect(classifyOrigin("https://cdn.googletagmanager.com/gtm.js", primary, orgs)).toBe("cross-site");
  });

  it("Q4 fix coverage: classifyOrigin returns 'same-origin' for localhost with port", () => {
    const primary = parseOriginInfo("http://localhost:3000/");
    expect(classifyOrigin("http://localhost:3000/static/a.js", primary)).toBe("same-origin");
  });
});

describe("resolveOrgDomains (Q3: env-var integration)", () => {
  it("fromOpts wins when non-empty", () => {
    const result = resolveOrgDomains(["githubassets.com"], { OHMYPERF_ORG_DOMAINS: "other.com" });
    expect(result).toEqual(["githubassets.com"]);
  });

  it("falls back to OHMYPERF_ORG_DOMAINS env var", () => {
    const result = resolveOrgDomains(undefined, { OHMYPERF_ORG_DOMAINS: "a.com,b.com,c.com" });
    expect(result).toEqual(["a.com", "b.com", "c.com"]);
  });

  it("returns undefined when both opts and env are unset", () => {
    expect(resolveOrgDomains(undefined, {})).toBeUndefined();
  });

  it("returns undefined when env var is whitespace-only", () => {
    expect(resolveOrgDomains(undefined, { OHMYPERF_ORG_DOMAINS: "  ,  ,  " })).toBeUndefined();
  });

  it("trims whitespace around each comma-separated value", () => {
    const result = resolveOrgDomains(undefined, { OHMYPERF_ORG_DOMAINS: " a.com , b.com " });
    expect(result).toEqual(["a.com", "b.com"]);
  });

  it("empty array fromOpts falls through to env", () => {
    const result = resolveOrgDomains([], { OHMYPERF_ORG_DOMAINS: "fallback.com" });
    expect(result).toEqual(["fallback.com"]);
  });
});

describe("classifyServability", () => {
  it("normal page returns real-page", () => {
    const r = reportFixture({
      runs: [
        {
          runIndex: 0,
          cold: true,
          metrics: {},
          resources: Array.from({ length: 10 }, (_, i) => ({
            url: `https://example.com/r${String(i)}.js`,
            mimeType: "application/javascript",
            requestMs: 10,
            responseMs: 20,
            transferSizeBytes: 5000,
            encodedSizeBytes: 4000,
            decodedSizeBytes: 12000,
            renderBlocking: false,
            cacheHit: false,
          })),
          longTasks: [],
          meta: {},
        },
      ],
    });
    const s = classifyServability(r);
    expect(s.classification).toBe("real-page");
  });

  it("Cloudflare turnstile URL flags bot-challenge", () => {
    const r = reportFixture({
      runs: [
        {
          runIndex: 0,
          cold: true,
          metrics: {},
          resources: [
            {
              url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/turnstile/f/ov2",
              mimeType: "text/html",
              requestMs: 10,
              responseMs: 20,
              transferSizeBytes: 1408,
              encodedSizeBytes: 1408,
              decodedSizeBytes: 2800,
              renderBlocking: true,
              cacheHit: false,
            },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    const s = classifyServability(r);
    expect(s.classification).toBe("bot-challenge-suspected");
    expect(s.signals.some((sig) => sig.includes("cloudflare_challenge_url"))).toBe(true);
    expect(s.recommendedAction).toBeTruthy();
  });

  it("1 resource < 10KB no JS = bot-challenge-suspected", () => {
    const r = reportFixture({
      runs: [
        {
          runIndex: 0,
          cold: true,
          metrics: {},
          resources: [
            {
              url: "https://example.com/",
              mimeType: "text/html",
              requestMs: 1,
              responseMs: 2,
              transferSizeBytes: 618,
              encodedSizeBytes: 618,
              decodedSizeBytes: 800,
              renderBlocking: true,
              cacheHit: false,
            },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    const s = classifyServability(r);
    expect(s.classification).toBe("bot-challenge-suspected");
  });

  it("no runs returns unknown", () => {
    const r = reportFixture({ runs: [] });
    const s = classifyServability(r);
    expect(s.classification).toBe("unknown");
  });

  it("zero resources returns error-page", () => {
    const r = reportFixture({
      runs: [{ runIndex: 0, cold: true, metrics: {}, resources: [], longTasks: [], meta: {} }],
    });
    const s = classifyServability(r);
    expect(s.classification).toBe("error-page");
  });

  it("Q6: layoutCount<3 + few resources → bot-challenge-suspected with low_layout_count signal", () => {
    const r = reportFixture({
      runs: [
        {
          runIndex: 0,
          cold: true,
          metrics: {},
          resources: [
            { url: "https://example.com/", mimeType: "text/html", requestMs: 1, responseMs: 2, transferSizeBytes: 50000, encodedSizeBytes: 50000, decodedSizeBytes: 80000, renderBlocking: true, cacheHit: false },
            { url: "https://example.com/app.js", mimeType: "application/javascript", requestMs: 1, responseMs: 2, transferSizeBytes: 100000, encodedSizeBytes: 100000, decodedSizeBytes: 200000, renderBlocking: false, cacheHit: false },
          ],
          runtime: { layoutCount: 2 },
          longTasks: [],
          meta: {},
        },
      ],
    });
    const s = classifyServability(r);
    expect(s.classification).toBe("bot-challenge-suspected");
    expect(s.signals.some((sig) => sig.startsWith("low_layout_count"))).toBe(true);
  });

  it("Q6: only text/html + no JS, multiple resources → bot-challenge-suspected with only_html_no_js_no_css signal", () => {
    const r = reportFixture({
      runs: [
        {
          runIndex: 0,
          cold: true,
          metrics: {},
          resources: [
            { url: "https://example.com/a.html", mimeType: "text/html", requestMs: 1, responseMs: 2, transferSizeBytes: 30000, encodedSizeBytes: 30000, decodedSizeBytes: 30000, renderBlocking: true, cacheHit: false },
            { url: "https://example.com/b.html", mimeType: "text/html", requestMs: 1, responseMs: 2, transferSizeBytes: 20000, encodedSizeBytes: 20000, decodedSizeBytes: 20000, renderBlocking: false, cacheHit: false },
            { url: "https://example.com/c.html", mimeType: "text/html", requestMs: 1, responseMs: 2, transferSizeBytes: 15000, encodedSizeBytes: 15000, decodedSizeBytes: 15000, renderBlocking: false, cacheHit: false },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    const s = classifyServability(r);
    expect(s.classification).toBe("bot-challenge-suspected");
    expect(s.signals).toContain("only_html_no_js_no_css");
  });

  it("Q6: suspicious page-title audit (Just a moment...) → bot-challenge-suspected", () => {
    const r = reportFixture({
      runs: [
        {
          runIndex: 0,
          cold: true,
          metrics: {},
          resources: Array.from({ length: 10 }, (_, i) => ({
            url: `https://example.com/r${String(i)}.js`,
            mimeType: "application/javascript",
            requestMs: 10,
            responseMs: 20,
            transferSizeBytes: 5000,
            encodedSizeBytes: 4000,
            decodedSizeBytes: 12000,
            renderBlocking: false,
            cacheHit: false,
          })),
          longTasks: [],
          meta: {},
        },
      ],
      audits: [{ id: "page-title", title: "Page title", score: null, passed: false, details: { value: "Just a moment..." } }],
    });
    const s = classifyServability(r);
    expect(s.classification).toBe("bot-challenge-suspected");
    expect(s.signals.some((sig) => sig.startsWith("suspicious_title:"))).toBe(true);
  });

  it("Q2: 25-35s duration + few resources → timeout-partial classification", () => {
    const r = reportFixture({
      runs: [
        {
          runIndex: 0,
          cold: true,
          metrics: {},
          resources: [
            { url: "https://slow.example.com/", mimeType: "text/html", requestMs: 100, responseMs: 200, transferSizeBytes: 5000, encodedSizeBytes: 5000, decodedSizeBytes: 10000, renderBlocking: true, cacheHit: false },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    (r.meta as { durationMs: number }).durationMs = 30_000;
    const s = classifyServability(r);
    expect(s.classification).toBe("timeout-partial");
    expect(s.signals.some((sig) => sig.startsWith("possible_navigation_timeout_durationMs"))).toBe(true);
  });
});

describe("computeTrustScore", () => {
  it("n=5 cov=5% returns high overall + high sample + high effect", () => {
    const r = reportFixture({ runs: 5, cov: 0.05 });
    const t = computeTrustScore(r);
    expect(t.overall).toBe("high");
    expect(t.perMetric["lcp"]?.sampleConfidence).toBe("high");
    expect(t.perMetric["lcp"]?.effectConfidence).toBe("high");
  });

  it("W2: n=3 cov=5% → medium sample, high effect, overall medium", () => {
    const r = reportFixture({ runs: 3, cov: 0.05 });
    const t = computeTrustScore(r);
    expect(t.perMetric["lcp"]?.sampleConfidence).toBe("medium");
    expect(t.perMetric["lcp"]?.effectConfidence).toBe("high");
    expect(t.perMetric["lcp"]?.level).toBe("medium");
  });

  it("W2: n=5 cov=30% → high sample, low effect, overall low", () => {
    const r = reportFixture({ runs: 5, cov: 0.30 });
    const t = computeTrustScore(r);
    expect(t.perMetric["lcp"]?.sampleConfidence).toBe("high");
    expect(t.perMetric["lcp"]?.effectConfidence).toBe("low");
    expect(t.perMetric["lcp"]?.level).toBe("low");
  });

  it("n=2 returns low (cant reach significance)", () => {
    const r = reportFixture({ runs: 2, cov: 0.05 });
    const t = computeTrustScore(r);
    expect(t.overall).toBe("low");
  });

  it("n=1 returns unreliable", () => {
    const r = reportFixture({ runs: 1, cov: 0.0 });
    const t = computeTrustScore(r);
    expect(t.overall).toBe("unreliable");
  });

  it("cov=60% returns unreliable even with n=5", () => {
    const r = reportFixture({ runs: 5, cov: 0.60 });
    const t = computeTrustScore(r);
    expect(t.overall).toBe("unreliable");
  });

  it("no metrics returns unreliable with no_cwv_metrics", () => {
    const r = reportFixture();
    (r as { aggregated: Record<string, unknown> }).aggregated = {};
    const t = computeTrustScore(r);
    expect(t.overall).toBe("unreliable");
    expect(t.reasons).toContain("no_cwv_metrics_in_report");
  });

  it("Q5: n=1 produces recommendedAction mentioning --runs", () => {
    const r = reportFixture({ runs: 1, cov: 0.0 });
    const t = computeTrustScore(r);
    expect(t.perMetric["lcp"]?.recommendedAction).toContain("--runs");
  });

  it("Q5: cov=60% produces recommendedAction mentioning ci-stable", () => {
    const r = reportFixture({ runs: 5, cov: 0.60 });
    const t = computeTrustScore(r);
    expect(t.perMetric["lcp"]?.recommendedAction).toContain("ci-stable");
  });

  it("Q5: n=3 cov=5% produces recommendedAction mentioning Mann-Whitney", () => {
    const r = reportFixture({ runs: 3, cov: 0.05 });
    const t = computeTrustScore(r);
    expect(t.perMetric["lcp"]?.recommendedAction).toMatch(/Mann-Whitney|verify_fix/);
  });

  it("Q5: n=5 cov=30% produces recommendedAction mentioning ci-stable", () => {
    const r = reportFixture({ runs: 5, cov: 0.30 });
    const t = computeTrustScore(r);
    expect(t.perMetric["lcp"]?.recommendedAction).toContain("ci-stable");
  });

  it("Q5: overall recommendedAction triggers when overall is unreliable", () => {
    const r = reportFixture({ runs: 1, cov: 0.0 });
    const t = computeTrustScore(r);
    expect(t.overall).toBe("unreliable");
    expect(t.recommendedAction).toMatch(/runs|noisy|ci-stable/i);
  });

  it("Q5: report.meta.calibration sets calibrated_throttle reason", () => {
    const r = reportFixture({ runs: 5, cov: 0.05 });
    (r.meta as { calibration?: { reference: string; observedScore: number; throttleRate: number; networkProfile: string; cacheHit: boolean } }).calibration = {
      reference: "ref",
      observedScore: 250,
      throttleRate: 2,
      networkProfile: "fast-4g",
      cacheHit: false,
    };
    const t = computeTrustScore(r);
    expect(t.reasons.some((s) => s.includes("calibrated_throttle"))).toBe(true);
  });

  it("Q5: meta.unstable=true appends unstable_flag_set reason", () => {
    const r = reportFixture({ runs: 5, cov: 0.05 });
    (r.meta as { unstable?: boolean }).unstable = true;
    const t = computeTrustScore(r);
    expect(t.reasons).toContain("unstable_flag_set");
  });

  it("Q5: NaN cov classifies as unreliable effectConfidence", () => {
    const r = reportFixture({ runs: 5, cov: Number.NaN });
    const t = computeTrustScore(r);
    expect(t.perMetric["lcp"]?.effectConfidence).toBe("unreliable");
  });
});

describe("buildFixPlan", () => {
  it("empty opportunities = empty fix plan", () => {
    const plan = buildFixPlan(reportFixture());
    expect(plan).toEqual([]);
  });

  it("first-party render-blocking script gets defer archetype + first-party applicability", () => {
    const r = reportFixture({
      opportunities: [
        {
          id: "render-blocking-resources",
          title: "Eliminate render-blocking",
          metric: "fcp",
          items: [{ url: "https://example.com/static/main.js", wastedMs: 320 }],
        },
      ],
      runs: [
        {
          runIndex: 0,
          cold: true,
          metrics: {},
          resources: [
            {
              url: "https://example.com/static/main.js",
              mimeType: "application/javascript",
              requestMs: 5,
              responseMs: 10,
              transferSizeBytes: 50000,
              encodedSizeBytes: 12000,
              decodedSizeBytes: 50000,
              renderBlocking: true,
              cacheHit: false,
              originClass: "same-origin",
            },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    const plan = buildFixPlan(r);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.archetype).toBe("render-blocking-script-add-defer");
    expect(plan[0]?.applicability).toBe("first-party");
    expect(plan[0]?.confidence).toBe("high");
    expect(plan[0]?.rank).toBe(1);
    expect(plan[0]?.expectedImpactMs).toBe(320);
  });

  it("cross-site render-blocking is ranked LOWER than first-party", () => {
    const r = reportFixture({
      opportunities: [
        {
          id: "render-blocking-resources",
          title: "Eliminate render-blocking",
          metric: "fcp",
          items: [
            { url: "https://cdn.googletagmanager.com/gtm.js", wastedMs: 500 },
            { url: "https://example.com/local.js", wastedMs: 100 },
          ],
        },
      ],
      runs: [
        {
          runIndex: 0,
          cold: true,
          metrics: {},
          resources: [
            {
              url: "https://cdn.googletagmanager.com/gtm.js",
              mimeType: "application/javascript",
              requestMs: 5, responseMs: 10, transferSizeBytes: 70000, encodedSizeBytes: 20000, decodedSizeBytes: 70000,
              renderBlocking: true, cacheHit: false,
              originClass: "cross-site",
            },
            {
              url: "https://example.com/local.js",
              mimeType: "application/javascript",
              requestMs: 5, responseMs: 10, transferSizeBytes: 5000, encodedSizeBytes: 1500, decodedSizeBytes: 5000,
              renderBlocking: true, cacheHit: false,
              originClass: "same-origin",
            },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    const plan = buildFixPlan(r);
    expect(plan).toHaveLength(2);
    expect(plan[0]?.applicability).toBe("first-party");
    expect(plan[0]?.target.url).toBe("https://example.com/local.js");
    expect(plan[1]?.applicability).toBe("third-party-cannot-apply");
  });

  it("dedupes identical (archetype, url) pairs", () => {
    const r = reportFixture({
      opportunities: [
        {
          id: "render-blocking-resources",
          title: "x",
          metric: "fcp",
          items: [{ url: "https://example.com/a.js", wastedMs: 100 }],
        },
      ],
      runs: [
        {
          runIndex: 0,
          cold: true,
          metrics: {},
          opportunities: [
            {
              id: "render-blocking-resources",
              title: "x",
              metric: "fcp",
              items: [{ url: "https://example.com/a.js", wastedMs: 100 }],
            },
          ],
          resources: [
            { url: "https://example.com/a.js", mimeType: "application/javascript", requestMs: 0, responseMs: 0, transferSizeBytes: 1000, encodedSizeBytes: 500, decodedSizeBytes: 1000, renderBlocking: true, cacheHit: false, originClass: "same-origin" },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    const plan = buildFixPlan(r);
    expect(plan).toHaveLength(1);
  });

  it("W4: items with repeated wastedMs (estimation artifact) get confidence downgraded", () => {
    const r = reportFixture({
      opportunities: [
        {
          id: "render-blocking-resources",
          title: "x",
          metric: "fcp",
          items: [
            { url: "https://example.com/a.js", wastedMs: 117 },
            { url: "https://example.com/b.js", wastedMs: 117 },
            { url: "https://example.com/c.js", wastedMs: 117 },
            { url: "https://example.com/d.js", wastedMs: 117 },
          ],
        },
      ],
      runs: [
        {
          runIndex: 0,
          cold: true,
          metrics: {},
          resources: [
            { url: "https://example.com/a.js", mimeType: "application/javascript", requestMs: 0, responseMs: 0, transferSizeBytes: 1, encodedSizeBytes: 1, decodedSizeBytes: 1, renderBlocking: true, cacheHit: false, originClass: "same-origin" },
            { url: "https://example.com/b.js", mimeType: "application/javascript", requestMs: 0, responseMs: 0, transferSizeBytes: 1, encodedSizeBytes: 1, decodedSizeBytes: 1, renderBlocking: true, cacheHit: false, originClass: "same-origin" },
            { url: "https://example.com/c.js", mimeType: "application/javascript", requestMs: 0, responseMs: 0, transferSizeBytes: 1, encodedSizeBytes: 1, decodedSizeBytes: 1, renderBlocking: true, cacheHit: false, originClass: "same-origin" },
            { url: "https://example.com/d.js", mimeType: "application/javascript", requestMs: 0, responseMs: 0, transferSizeBytes: 1, encodedSizeBytes: 1, decodedSizeBytes: 1, renderBlocking: true, cacheHit: false, originClass: "same-origin" },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    const plan = buildFixPlan(r);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.confidence).toBe("medium");
    expect(plan[0]!.targets).toHaveLength(4);
    expect(plan[0]!.expectedImpactMs).toBeCloseTo(117 * 4, 1);
    for (const t of plan[0]!.targets!) {
      expect(t.originClass).toBe("same-origin");
    }
  });

  it("W5: tradeit.gg fixture — 4 nuxt CSS chunks, all same-origin → 1 grouped first-party stylesheet patch with 4 targets (Q10: confidence downgrade asserted)", () => {
    const r = reportFixture({
      url: "https://tradeit.gg/",
      opportunities: [
        {
          id: "render-blocking-resources",
          title: "Eliminate render-blocking",
          metric: "fcp",
          items: [
            { url: "https://tradeit.gg/_nuxt/Confirm.zQ5b604N.css", wastedMs: 117 },
            { url: "https://tradeit.gg/_nuxt/LoginButton.DVfW5dYf.css", wastedMs: 117 },
            { url: "https://tradeit.gg/_nuxt/TextField.C8Qy0XBT.css", wastedMs: 117 },
            { url: "https://tradeit.gg/_nuxt/entry.D8e8F2nM.css", wastedMs: 117 },
          ],
        },
      ],
      runs: [
        {
          runIndex: 0,
          cold: true,
          metrics: {},
          resources: [
            { url: "https://tradeit.gg/_nuxt/Confirm.zQ5b604N.css", mimeType: "text/css", requestMs: 5, responseMs: 10, transferSizeBytes: 1000, encodedSizeBytes: 500, decodedSizeBytes: 1500, renderBlocking: true, cacheHit: false, originClass: "same-origin" },
            { url: "https://tradeit.gg/_nuxt/LoginButton.DVfW5dYf.css", mimeType: "text/css", requestMs: 5, responseMs: 10, transferSizeBytes: 800, encodedSizeBytes: 400, decodedSizeBytes: 1200, renderBlocking: true, cacheHit: false, originClass: "same-origin" },
            { url: "https://tradeit.gg/_nuxt/TextField.C8Qy0XBT.css", mimeType: "text/css", requestMs: 5, responseMs: 10, transferSizeBytes: 600, encodedSizeBytes: 300, decodedSizeBytes: 900, renderBlocking: true, cacheHit: false, originClass: "same-origin" },
            { url: "https://tradeit.gg/_nuxt/entry.D8e8F2nM.css", mimeType: "text/css", requestMs: 5, responseMs: 10, transferSizeBytes: 4000, encodedSizeBytes: 2000, decodedSizeBytes: 6000, renderBlocking: true, cacheHit: false, originClass: "same-origin" },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    const plan = buildFixPlan(r);
    expect(plan).toHaveLength(1);
    const entry = plan[0]!;
    expect(entry.archetype).toBe("render-blocking-stylesheet-media-print");
    expect(entry.applicability).toBe("first-party");
    expect(entry.target.originClass).toBe("same-origin");
    expect(entry.confidence).toBe("low");
    expect(entry.patchPreview).toContain('media="print"');
    expect(entry.targets).toHaveLength(4);
    expect(entry.expectedImpactMs).toBeCloseTo(117 * 4, 1);
    const urls = entry.targets!.map((t) => t.url).sort();
    expect(urls).toEqual([
      "https://tradeit.gg/_nuxt/Confirm.zQ5b604N.css",
      "https://tradeit.gg/_nuxt/LoginButton.DVfW5dYf.css",
      "https://tradeit.gg/_nuxt/TextField.C8Qy0XBT.css",
      "https://tradeit.gg/_nuxt/entry.D8e8F2nM.css",
    ]);
    expect(plan[0]?.rank).toBe(1);
  });

  it("Q4: LCP image opportunity + image resource → lcp-image-fetchpriority-high archetype", () => {
    const r = reportFixture({
      url: "https://example.com/",
      opportunities: [
        {
          id: "largest-contentful-paint-image",
          title: "LCP image",
          metric: "lcp",
          items: [{ url: "https://example.com/hero.webp", wastedMs: 600 }],
        },
      ],
      runs: [
        {
          runIndex: 0,
          cold: true,
          metrics: {},
          resources: [
            { url: "https://example.com/hero.webp", mimeType: "image/webp", requestMs: 10, responseMs: 30, transferSizeBytes: 80000, encodedSizeBytes: 80000, decodedSizeBytes: 80000, renderBlocking: false, cacheHit: false, originClass: "same-origin" },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    const plan = buildFixPlan(r);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.archetype).toBe("lcp-image-fetchpriority-high");
    expect(plan[0]?.expectedMetric).toBe("lcp");
    expect(plan[0]?.applicability).toBe("first-party");
    expect(plan[0]?.patchPreview).toContain('fetchpriority="high"');
    expect(plan[0]?.patchPreview).toContain('loading="eager"');
  });

  it("Q4: preload-lcp-image opp alias also produces lcp-image archetype", () => {
    const r = reportFixture({
      opportunities: [
        {
          id: "preload-lcp-image",
          title: "Preload LCP",
          metric: "lcp",
          items: [{ url: "https://example.com/hero.jpg", wastedMs: 400 }],
        },
      ],
      runs: [
        {
          runIndex: 0, cold: true, metrics: {},
          resources: [
            { url: "https://example.com/hero.jpg", mimeType: "image/jpeg", requestMs: 10, responseMs: 30, transferSizeBytes: 50000, encodedSizeBytes: 50000, decodedSizeBytes: 50000, renderBlocking: false, cacheHit: false, originClass: "same-origin" },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    const plan = buildFixPlan(r);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.archetype).toBe("lcp-image-fetchpriority-high");
  });

  it("Q13: same-org originClass classifies as first-party applicability", () => {
    const r = reportFixture({
      url: "https://github.com/",
      opportunities: [
        {
          id: "render-blocking-resources",
          title: "x",
          metric: "fcp",
          items: [{ url: "https://github.githubassets.com/main.css", wastedMs: 300 }],
        },
      ],
      runs: [
        {
          runIndex: 0, cold: true, metrics: {},
          resources: [
            { url: "https://github.githubassets.com/main.css", mimeType: "text/css", requestMs: 5, responseMs: 10, transferSizeBytes: 50000, encodedSizeBytes: 20000, decodedSizeBytes: 80000, renderBlocking: true, cacheHit: false, originClass: "same-org" },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    const plan = buildFixPlan(r);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.applicability).toBe("first-party");
    expect(plan[0]?.target.originClass).toBe("same-org");
  });

  it("Q13: same-site originClass classifies as first-party applicability", () => {
    const r = reportFixture({
      opportunities: [
        {
          id: "render-blocking-resources",
          title: "x",
          metric: "fcp",
          items: [{ url: "https://cdn.example.com/a.js", wastedMs: 100 }],
        },
      ],
      runs: [
        {
          runIndex: 0, cold: true, metrics: {},
          resources: [
            { url: "https://cdn.example.com/a.js", mimeType: "application/javascript", requestMs: 0, responseMs: 0, transferSizeBytes: 1000, encodedSizeBytes: 500, decodedSizeBytes: 1000, renderBlocking: true, cacheHit: false, originClass: "same-site" },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    const plan = buildFixPlan(r);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.applicability).toBe("first-party");
  });

  it("Q4: image url ending in .webp via classifyByUrl extension match", () => {
    const r = reportFixture({
      opportunities: [
        { id: "largest-contentful-paint-image", title: "x", metric: "lcp", items: [{ url: "https://example.com/path/to/img.webp", wastedMs: 200 }] },
      ],
      runs: [
        {
          runIndex: 0, cold: true, metrics: {},
          resources: [
            { url: "https://example.com/path/to/img.webp", mimeType: "application/octet-stream", requestMs: 0, responseMs: 0, transferSizeBytes: 1, encodedSizeBytes: 1, decodedSizeBytes: 1, renderBlocking: false, cacheHit: false, originClass: "same-origin" },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    const plan = buildFixPlan(r);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.archetype).toBe("lcp-image-fetchpriority-high");
  });

  it("Q12: integration — applicability=first-party requires originClass to be threaded through", () => {
    const r = reportFixture({
      url: "https://tradeit.gg/",
      opportunities: [
        {
          id: "render-blocking-resources",
          title: "x",
          metric: "fcp",
          items: [
            { url: "https://tradeit.gg/_nuxt/main.css", wastedMs: 200 },
            { url: "https://googletagmanager.com/gtm.js", wastedMs: 600 },
          ],
        },
      ],
      runs: [
        {
          runIndex: 0, cold: true, metrics: {},
          resources: [
            { url: "https://tradeit.gg/_nuxt/main.css", mimeType: "text/css", requestMs: 0, responseMs: 0, transferSizeBytes: 1, encodedSizeBytes: 1, decodedSizeBytes: 1, renderBlocking: true, cacheHit: false, originClass: "same-origin" },
            { url: "https://googletagmanager.com/gtm.js", mimeType: "application/javascript", requestMs: 0, responseMs: 0, transferSizeBytes: 1, encodedSizeBytes: 1, decodedSizeBytes: 1, renderBlocking: true, cacheHit: false, originClass: "cross-site" },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    const plan = buildFixPlan(r);
    expect(plan).toHaveLength(2);
    expect(plan[0]?.applicability).toBe("first-party");
    expect(plan[0]?.target.url).toBe("https://tradeit.gg/_nuxt/main.css");
    expect(plan[1]?.applicability).toBe("third-party-cannot-apply");
    expect(plan[1]?.target.url).toBe("https://googletagmanager.com/gtm.js");
  });

  it("Q12: unknown originClass → unknown applicability", () => {
    const r = reportFixture({
      opportunities: [
        { id: "render-blocking-resources", title: "x", metric: "fcp", items: [{ url: "https://unknown-host.example/a.js", wastedMs: 100 }] },
      ],
      runs: [
        {
          runIndex: 0, cold: true, metrics: {},
          resources: [
            { url: "https://unknown-host.example/a.js", mimeType: "application/javascript", requestMs: 0, responseMs: 0, transferSizeBytes: 1, encodedSizeBytes: 1, decodedSizeBytes: 1, renderBlocking: true, cacheHit: false },
          ],
          longTasks: [],
          meta: {},
        },
      ],
    });
    const plan = buildFixPlan(r);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.applicability).toBe("unknown");
  });
});
