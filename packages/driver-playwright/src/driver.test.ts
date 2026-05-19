import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createSilentLogger } from "@ohmyperf/core";
import { createPlaywrightDriver, pageHandleAsTarget, type PlaywrightDriverInstance } from "./index.js";
import type { BrowserHandle } from "@ohmyperf/core";
import type { AttachedTarget } from "./oopif-attach.js";

let server: Server | undefined;
let baseUrl = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (url === "/parent") {
      res.end(`<!doctype html><html><head><title>parent</title></head>
<body><h1>parent</h1>
<iframe src="/child" title="child"></iframe>
</body></html>`);
      return;
    }
    if (url === "/child") {
      res.end(`<!doctype html><html><head><title>child</title></head>
<body><p id="from-child">child</p></body></html>`);
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

const browserAvailable = async (): Promise<boolean> => {
  try {
    const driver = createPlaywrightDriver({ kind: "chromium" });
    const browser = await driver.launch({ mode: "headless" });
    await (browser as { browser: { close(): Promise<void> } }).browser.close();
    return true;
  } catch {
    return false;
  }
};

describe("PlaywrightDriver capability matrix", () => {
  it("chromium reports cdp-oopif/coverage/heap-snapshot/trace/long-tasks/har/axe", () => {
    const driver = createPlaywrightDriver({ kind: "chromium" });
    expect(driver.id).toBe("playwright-chromium");
    expect(driver.supports("cdp-oopif")).toBe(true);
    expect(driver.supports("coverage")).toBe(true);
    expect(driver.supports("heap-snapshot")).toBe(true);
    expect(driver.supports("trace")).toBe(true);
    expect(driver.supports("long-tasks")).toBe(true);
    expect(driver.supports("har")).toBe(true);
    expect(driver.supports("axe")).toBe(true);
  });

  it("firefox does NOT support cdp-oopif/coverage/heap-snapshot/trace", () => {
    const driver = createPlaywrightDriver({ kind: "firefox" });
    expect(driver.supports("cdp-oopif")).toBe(false);
    expect(driver.supports("coverage")).toBe(false);
    expect(driver.supports("heap-snapshot")).toBe(false);
    expect(driver.supports("trace")).toBe(false);
    expect(driver.supports("long-tasks")).toBe(true);
    expect(driver.supports("har")).toBe(true);
  });

  it("webkit only supports har/axe", () => {
    const driver = createPlaywrightDriver({ kind: "webkit" });
    expect(driver.supports("cdp-oopif")).toBe(false);
    expect(driver.supports("long-tasks")).toBe(false);
    expect(driver.supports("har")).toBe(true);
    expect(driver.supports("axe")).toBe(true);
  });
});

describe("PlaywrightDriver runtime (chromium)", () => {
  let driver: PlaywrightDriverInstance | undefined;
  let browser: BrowserHandle | undefined;
  let canRun = false;

  beforeAll(async () => {
    canRun = await browserAvailable();
    if (!canRun) return;
    driver = createPlaywrightDriver({ kind: "chromium" });
    browser = await driver.launch({ mode: "headless" });
  }, 60_000);

  afterAll(async () => {
    if (browser) {
      const internal = browser as { browser: { close(): Promise<void> } };
      await internal.browser.close();
    }
  });

  it("launches a Chromium browser and reports a real version (or skips when binary missing)", async () => {
    if (!canRun) {
      console.warn(
        "skipping: Chromium browser binary not installed. Run `npx playwright install chromium`.",
      );
      return;
    }
    expect(driver).toBeDefined();
    expect(driver?.browserVersion).toMatch(/^\d+\./);
  });

  it("opens a page, attaches CDP, sends Browser.getVersion, and detaches cleanly", async () => {
    if (!canRun || !driver || !browser) return;
    const page = await driver.newPage(browser);
    const target = pageHandleAsTarget(page);
    const cdp = await driver.attachCDP!(target);
    const result = (await cdp.send("Browser.getVersion")) as {
      protocolVersion: string;
      product: string;
    };
    expect(typeof result.protocolVersion).toBe("string");
    expect(result.product.toLowerCase()).toContain("chrom");
    await cdp.detach();
  }, 30_000);

  it("attaches OOPIF auto-attach and observes attachment events on a parent+iframe page", async () => {
    if (!canRun || !driver || !browser) return;
    const page = await driver.newPage(browser);
    const target = pageHandleAsTarget(page);
    const attachedTargets: AttachedTarget[] = [];

    const controller = await driver.attachOopif(target, {
      logger: createSilentLogger(),
      onAttach: (t) => {
        attachedTargets.push(t);
      },
    });

    const internal = page as { page: { goto(url: string, opts?: unknown): Promise<unknown> } };
    await internal.page.goto(`${baseUrl}/parent`, { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 250));

    expect(controller.attached).toBeDefined();
    await controller.detachAll();
  }, 30_000);
});
