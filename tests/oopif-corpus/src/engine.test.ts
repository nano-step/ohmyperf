import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSilentLogger, runEngine, type Report } from "@ohmyperf/core";
import { createPlaywrightAdapter } from "@ohmyperf/driver-playwright";
import { startFixtureServer, type FixtureServerHandle } from "./index.js";

let server: FixtureServerHandle | undefined;
let parentBase = "";
let canRunBrowser = false;

const isCi = process.env["CI"] === "true";
const fullChromium = process.env["OHMYPERF_CHROMIUM_PATH"];

beforeAll(async () => {
  server = await startFixtureServer({ originCount: 1 });
  parentBase = server.origins[0]!.base;

  const probeBundle = createPlaywrightAdapter({
    url: parentBase,
    kind: "chromium",
    ...(fullChromium ? { executablePath: fullChromium } : {}),
  });
  try {
    const ctx = await probeBundle.adapter.launchPageWithCdp();
    await ctx.close();
    canRunBrowser = true;
  } catch (err) {
    canRunBrowser = false;
    if (isCi) {
      throw new Error(
        `engine smoke test cannot launch a browser in CI: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}, 120_000);

afterAll(async () => {
  await server?.close();
});

describe("runEngine() end-to-end", () => {
  it(
    "produces a Report with finite CWV values that round-trip through JSON",
    async () => {
      if (!canRunBrowser) {
        console.warn("skipping: Chromium browser not installed");
        return;
      }
      if (!server) throw new Error("fixture server not started");

      const url = `${parentBase}/oopif-3-cross-origin`;
      const isolateList = `http://${server.origins[0]!.host}:${String(server.origins[0]!.port)}`;

      const { driver, adapter } = createPlaywrightAdapter({
        url,
        kind: "chromium",
        ...(fullChromium ? { executablePath: fullChromium } : {}),
        extraChromiumArgs: [`--isolate-origins=${isolateList}`],
      });

      const report = await runEngine({
        opts: { url, runs: 2 },
        driver,
        adapter,
        logger: createSilentLogger(),
      });

      expect(report.schemaVersion).toBe("1.0.0");
      expect(report.meta.url).toBe(url);
      expect(report.meta.runs).toBe(2);
      expect(report.meta.mode).toBe("real");
      expect(report.meta.browser.name).toBe("chromium");
      expect(report.meta.browser.version).toMatch(/^\d+\./);
      expect(report.meta.browser.source).toBe("bundled");
      expect(report.meta.measurementId).toBeTypeOf("string");
      expect(report.meta.measurementId.length).toBeGreaterThan(8);

      expect(report.runs).toHaveLength(2);
      for (const run of report.runs) {
        expect(run.metrics).toBeDefined();
      }

      expect(report.frames).toBeDefined();
      expect(report.frames.root).toBe("ohmyperf:root");

      const totalResources = report.runs.reduce((acc, r) => acc + r.resources.length, 0);
      expect(
        totalResources,
        "expected resourceCollector to record at least 1 resource across the runs",
      ).toBeGreaterThan(0);
      const docResource = report.runs
        .flatMap((r) => r.resources)
        .find((r) => r.url === url);
      expect(docResource, "expected the parent document URL in resources").toBeDefined();
      if (docResource) {
        expect(Number.isFinite(docResource.requestMs)).toBe(true);
        expect(Number.isFinite(docResource.responseMs)).toBe(true);
        expect(docResource.encodedSizeBytes).toBeGreaterThan(0);
        expect(typeof docResource.cacheHit).toBe("boolean");
        expect(typeof docResource.renderBlocking).toBe("boolean");
      }

      const fcpRunValues = report.runs
        .map((r) => r.metrics["fcp"]?.value)
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      expect(fcpRunValues.length, "FCP should be present in at least one run").toBeGreaterThan(0);

      const aggregated = report.aggregated;
      const knownAggregated = ["lcp", "fcp", "ttfb", "cls"].filter((m) => aggregated[m]);
      expect(
        knownAggregated.length,
        `expected at least one CWV-family metric in aggregated; got keys ${JSON.stringify(Object.keys(aggregated))}`,
      ).toBeGreaterThan(0);

      for (const name of knownAggregated) {
        const m = aggregated[name]!;
        expect(Number.isFinite(m.median), `${name}.median finite`).toBe(true);
        expect(Number.isFinite(m.p75), `${name}.p75 finite`).toBe(true);
        expect(Number.isFinite(m.cov), `${name}.cov finite`).toBe(true);
        expect(m.runs).toBeGreaterThan(0);
      }

      const json = JSON.stringify(report);
      const parsed = JSON.parse(json) as Report;
      expect(parsed.schemaVersion).toBe(report.schemaVersion);
      expect(parsed.meta.measurementId).toBe(report.meta.measurementId);
      expect(parsed.runs).toHaveLength(report.runs.length);
      expect(parsed.aggregated).toEqual(report.aggregated);
    },
    120_000,
  );

  it(
    "rejects measure-options-invalid URL before any browser launch",
    async () => {
      const { measure } = await import("@ohmyperf/core");
      await expect(measure({ url: "not-a-url" })).rejects.toMatchObject({
        name: "MeasureOptionsError",
        field: "url",
      });
    },
  );
});
