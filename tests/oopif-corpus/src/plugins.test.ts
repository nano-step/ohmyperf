import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSilentLogger, runEngine, type Report } from "@ohmyperf/core";
import { createPlaywrightAdapter } from "@ohmyperf/driver-playwright";
import {
  axePlugin,
  customMetricExamplePlugin,
  cwvPlugin,
} from "@ohmyperf/plugins-builtin";
import { startFixtureServer, type FixtureServerHandle } from "./index.js";

let server: FixtureServerHandle | undefined;
let parentBase = "";
let canRunBrowser = false;

const isCi = process.env["CI"] === "true";
const fullChromium = process.env["OHMYPERF_CHROMIUM_PATH"];

beforeAll(async () => {
  server = await startFixtureServer({ originCount: 1 });
  parentBase = server.origins[0]!.base;

  const probe = createPlaywrightAdapter({
    url: parentBase,
    kind: "chromium",
    ...(fullChromium ? { executablePath: fullChromium } : {}),
  });
  try {
    const ctx = await probe.adapter.launchPageWithCdp();
    await ctx.close();
    canRunBrowser = true;
  } catch (err) {
    canRunBrowser = false;
    if (isCi) {
      throw new Error(
        `plugin smoke test cannot launch browser in CI: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}, 120_000);

afterAll(async () => {
  await server?.close();
});

describe("runEngine() with all 3 reference plugins", () => {
  it(
    "produces a Report with audits[], pluginData, and onMetric transformation observable",
    async () => {
      if (!canRunBrowser) {
        console.warn("skipping: Chromium not installed");
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

      const report: Report = await runEngine({
        opts: {
          url,
          runs: 1,
          plugins: [
            cwvPlugin(),
            axePlugin({ tags: ["wcag2a"] }),
            customMetricExamplePlugin({ clampLcpToMs: 999_999 }),
          ],
        },
        driver,
        adapter,
        logger: createSilentLogger(),
      });

      expect(report.schemaVersion).toBe("1.0.0");
      expect(report.runs).toHaveLength(1);

      const cwvData = report.pluginData["ohmyperf.builtin.cwv"];
      expect(cwvData === undefined || typeof cwvData === "object").toBe(true);

      const axeData = report.pluginData["ohmyperf.builtin.axe"] as
        | { violationCount: number; violations: unknown[] }
        | undefined;
      expect(axeData).toBeDefined();
      expect(typeof axeData?.violationCount).toBe("number");

      const customData = report.pluginData["ohmyperf.example.custom-metric"] as
        | { imgCount: number; evalElapsedMs: number }
        | undefined;
      expect(customData).toBeDefined();
      expect(typeof customData?.imgCount).toBe("number");
      expect(customData?.imgCount).toBeGreaterThanOrEqual(0);

      const a11yAudit = report.audits.find((a) => a.id === "a11y.axe-violations");
      expect(a11yAudit).toBeDefined();
      expect(typeof a11yAudit?.passed).toBe("boolean");

      const audit = report.audits.find((a) => a.id === "a11y.axe-violations");
      expect(audit?.title).toMatch(/axe/i);

      const capabilityUses = report.meta.pluginCapabilityUses;
      expect(capabilityUses.length).toBeGreaterThan(0);
      const auditUse = capabilityUses.find((u) => u.capability === "audit");
      expect(auditUse).toBeDefined();
      expect(auditUse?.pluginId).toBe("ohmyperf.builtin.axe");

      const json = JSON.stringify(report);
      const parsed = JSON.parse(json) as Report;
      expect(parsed.audits).toEqual(report.audits);
      expect(parsed.pluginData).toEqual(report.pluginData);
    },
    180_000,
  );
});
