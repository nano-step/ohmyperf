import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { runEngine, createSilentLogger, type Report } from "@ohmyperf/core";
import { createPlaywrightAdapter } from "@ohmyperf/driver-playwright";
import { cwvPlugin } from "@ohmyperf/plugins-builtin";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "fixtures");

const FIXTURES = [
  { name: "simple-static", file: "simple-static.html", tbt: false },
  { name: "image-heavy-lcp", file: "image-heavy-lcp.html", tbt: false },
  { name: "long-task-bomb", file: "long-task-bomb.html", tbt: true },
] as const;

const REL_TOLERANCE = { lcp: 0.1, fcp: 0.1, ttfb: 0.1, tbt: 0.15 };
const ABS_FLOOR_MS = 30;

interface LighthouseAudits {
  "largest-contentful-paint"?: { numericValue?: number };
  "first-contentful-paint"?: { numericValue?: number };
  "server-response-time"?: { numericValue?: number };
  "total-blocking-time"?: { numericValue?: number };
}

interface LighthouseResult {
  audits: LighthouseAudits;
}

interface LighthouseModule {
  default: (
    url: string,
    flags: { port?: number; output?: string; logLevel?: string; onlyCategories?: string[] },
    config?: unknown,
  ) => Promise<{ lhr: LighthouseResult } | undefined>;
}

let server: ReturnType<typeof createServer> | undefined;
let baseUrl = "";

beforeAll(async () => {
  server = createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400).end();
      return;
    }
    const safe = req.url.split("?")[0]!.replace(/^\/+/, "");
    if (safe.includes("..")) {
      res.writeHead(400).end();
      return;
    }
    const filePath = join(fixturesDir, safe || "index.html");
    try {
      const body = await readFile(filePath);
      const ct = extname(filePath) === ".html" ? "text/html" : "application/octet-stream";
      res.writeHead(200, { "content-type": ct, "cache-control": "no-store" }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const addr = server!.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${String(port)}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server?.close(() => r()));
});

describe.each(FIXTURES)("parity vs Lighthouse — $name", (fixture) => {
  const url = () => `${baseUrl}/${fixture.file}`;

  it("LCP / FCP / TTFB within ±10% of Lighthouse", async () => {
    const our = await measureWithOhMyPerf(url());
    const lh = await measureWithLighthouse(url());

    compareMs("lcp", our.lcp, lh.lcp, REL_TOLERANCE.lcp);
    compareMs("fcp", our.fcp, lh.fcp, REL_TOLERANCE.fcp);
    compareMs("ttfb", our.ttfb, lh.ttfb, REL_TOLERANCE.ttfb);

    if (fixture.tbt) {
      compareMs("tbt", our.tbt, lh.tbt, REL_TOLERANCE.tbt);
    }
  }, 90_000);
});

function compareMs(metric: string, ours: number | undefined, lh: number | undefined, tol: number) {
  expect(ours, `OhMyPerf ${metric} undefined`).toBeTypeOf("number");
  expect(lh, `Lighthouse ${metric} undefined`).toBeTypeOf("number");
  if (typeof ours !== "number" || typeof lh !== "number") return;
  if (lh < ABS_FLOOR_MS) {
    expect(Math.abs(ours - lh), `${metric}: |${ours} - ${lh}| should be < ${ABS_FLOOR_MS} ms (LH is near zero)`).toBeLessThan(ABS_FLOOR_MS);
    return;
  }
  const rel = Math.abs(ours - lh) / lh;
  expect(
    rel,
    `${metric}: ours=${ours.toFixed(1)} lh=${lh.toFixed(1)} rel=${(rel * 100).toFixed(1)}% (tolerance ${(tol * 100).toFixed(0)}%)`,
  ).toBeLessThanOrEqual(tol);
}

interface OurMetrics {
  lcp: number | undefined;
  fcp: number | undefined;
  ttfb: number | undefined;
  tbt: number | undefined;
}

async function measureWithOhMyPerf(url: string): Promise<OurMetrics> {
  const logger = createSilentLogger();
  const { driver, adapter } = createPlaywrightAdapter({
    url,
    kind: "chromium",
    headless: "headless",
    logger,
  });
  let report: Report;
  try {
    report = await runEngine({
      opts: {
        url,
        runs: 3,
        mode: "real",
        headless: "headless",
        plugins: [cwvPlugin()],
        collectTrace: true,
      },
      driver,
      adapter,
      logger,
    });
  } catch (err) {
    throw new Error(`ohmyperf engine failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return {
    lcp: report.aggregated["lcp"]?.median,
    fcp: report.aggregated["fcp"]?.median,
    ttfb: report.aggregated["ttfb"]?.median,
    tbt: report.aggregated["tbt"]?.median,
  };
}

async function measureWithLighthouse(url: string): Promise<OurMetrics> {
  const port = await pickFreePort();
  const browser = await chromium.launch({
    headless: true,
    args: [`--remote-debugging-port=${String(port)}`],
  });
  try {
    const lh = (await import("lighthouse")) as unknown as LighthouseModule;
    const runner = await lh.default(url, {
      port,
      output: "json",
      logLevel: "silent",
      onlyCategories: ["performance"],
    });
    if (!runner) throw new Error("lighthouse returned no result");
    const a = runner.lhr.audits;
    return {
      lcp: a["largest-contentful-paint"]?.numericValue,
      fcp: a["first-contentful-paint"]?.numericValue,
      ttfb: a["server-response-time"]?.numericValue,
      tbt: a["total-blocking-time"]?.numericValue,
    };
  } finally {
    await browser.close();
  }
}

async function pickFreePort(): Promise<number> {
  const { createServer: createSrv } = await import("node:net");
  return await new Promise((resolve, reject) => {
    const srv = createSrv();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}
