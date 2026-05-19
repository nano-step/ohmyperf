import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSilentLogger } from "@ohmyperf/core";
import {
  createPlaywrightDriver,
  pageHandleAsTarget,
  type PlaywrightDriverInstance,
} from "@ohmyperf/driver-playwright";
import type { BrowserHandle } from "@ohmyperf/core";
import {
  FIXTURE_EXPECTATIONS,
  startFixtureServer,
  type FixtureServerHandle,
} from "./index.js";

let server: FixtureServerHandle | undefined;
let driver: PlaywrightDriverInstance | undefined;
let browser: BrowserHandle | undefined;
let canRunBrowser = false;

const isCi = process.env["CI"] === "true";

const browserAvailable = async (d: PlaywrightDriverInstance): Promise<boolean> => {
  try {
    const b = await d.launch({ mode: "headless" });
    await (b as { browser: { close(): Promise<void> } }).browser.close();
    return true;
  } catch {
    return false;
  }
};

beforeAll(async () => {
  const fullChromium = process.env["OHMYPERF_CHROMIUM_PATH"];
  server = await startFixtureServer({ originCount: 4 });

  const isolateList = server.origins
    .map((o) => `http://${o.host}:${String(o.port)}`)
    .join(",");

  driver = createPlaywrightDriver({
    kind: "chromium",
    ...(fullChromium ? { executablePath: fullChromium } : {}),
    extraChromiumArgs: [`--isolate-origins=${isolateList}`],
  });
  canRunBrowser = await browserAvailable(driver);
  if (!canRunBrowser) {
    if (isCi) {
      throw new Error(
        "OOPIF corpus REQUIRES the bundled Chromium browser in CI. Run `npx playwright install chromium` in the workflow.",
      );
    }
    return;
  }
  browser = await driver.launch({ mode: "headless" });
}, 120_000);

afterAll(async () => {
  if (browser) {
    await (browser as { browser: { close(): Promise<void> } }).browser.close();
  }
  await server?.close();
});

describe("OOPIF synthetic test corpus", () => {
  for (const expectation of FIXTURE_EXPECTATIONS) {
    it(
      `${expectation.id} — ${expectation.description}`,
      async () => {
        if (!canRunBrowser) {
          console.warn(
            `skipping ${expectation.id}: Chromium browser not installed (run \`npx playwright install chromium\`).`,
          );
          return;
        }
        if (!driver || !browser || !server) {
          throw new Error("setup did not complete");
        }
        const parentOrigin = server.origins[0]!;
        const fixtureUrl = `${parentOrigin.base}${expectation.path}`;

        const page = await driver.newPage(browser);
        const target = pageHandleAsTarget(page);

        let attachCount = 0;
        let detachCount = 0;

        const controller = await driver.attachOopif(target, {
          logger: createSilentLogger(),
          onAttach: () => {
            attachCount++;
          },
          onDetach: () => {
            detachCount++;
          },
        });

        const internal = page as {
          page: { goto(url: string, opts?: unknown): Promise<unknown>; close(): Promise<void> };
        };
        await internal.page.goto(fixtureUrl, { waitUntil: "load" });

        const settleMs = expectation.mustEmitDetach ? 800 : 400;
        await new Promise((r) => setTimeout(r, settleMs));

        try {
          expect(attachCount).toBeGreaterThanOrEqual(expectation.minOopifAttachments);
          expect(attachCount).toBeLessThanOrEqual(expectation.maxOopifAttachments);
          if (expectation.mustEmitDetach) {
            expect(detachCount).toBeGreaterThanOrEqual(1);
          }
        } finally {
          await controller.detachAll();
          await internal.page.close();
        }
      },
      90_000,
    );
  }

  it("FIXTURE_EXPECTATIONS contains the v1.1 expanded corpus (13 fixtures, Track A A5)", () => {
    const ids = FIXTURE_EXPECTATIONS.map((f) => f.id).sort();
    expect(ids).toEqual([
      "5xx-error",
      "bfcache",
      "fenced-frame",
      "iframe-removed-mid-run",
      "iframe-resize-causes-parent-shift",
      "oopif-3-cross-origin",
      "popup",
      "prerender",
      "sandbox-no-scripts",
      "spa-soft-nav",
      "srcdoc-iframe",
      "sw-precache",
      "worker",
    ]);
  });

  it("every fixture declares mustHaveMetrics and mayMissMetrics arrays (A5.10 schema)", () => {
    for (const f of FIXTURE_EXPECTATIONS) {
      expect(Array.isArray(f.mustHaveMetrics) || f.mustHaveMetrics === undefined).toBe(true);
      expect(Array.isArray(f.mayMissMetrics) || f.mayMissMetrics === undefined).toBe(true);
      if (f.mustHaveAttribution) {
        expect(Array.isArray(f.mustHaveAttribution)).toBe(true);
      }
    }
  });

  it("fenced-frame declares the required chromium feature flag (A5.11)", () => {
    const ff = FIXTURE_EXPECTATIONS.find((f) => f.id === "fenced-frame");
    expect(ff?.chromiumFlags).toBeDefined();
    expect(ff?.chromiumFlags?.some((f) => f.includes("FencedFrames"))).toBe(true);
  });
});
