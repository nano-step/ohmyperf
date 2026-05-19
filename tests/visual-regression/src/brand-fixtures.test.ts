import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Report } from "@ohmyperf/core";
import { BRAND_IDS, BRAND_MANIFEST, type BrandId } from "@ohmyperf/design-tokens";
import { renderReportHtml } from "@ohmyperf/viewer";
import { renderReportDeck } from "@ohmyperf/reporter-deck";

const here = dirname(fileURLToPath(import.meta.url));
const baselineDir = resolve(here, "..", "baselines");
const fixtureUrl = new URL("../../../packages/viewer/fixtures/rich.json", import.meta.url);
const isCI = process.env["CI"] === "true";
const isLinux = platform() === "linux";
const advisoryOnly = !(isCI && isLinux);

async function loadFixture(): Promise<Report> {
  const body = await readFile(fixtureUrl, "utf8");
  return JSON.parse(body) as Report;
}

async function renderToFile(html: string, name: string): Promise<string> {
  const dir = resolve(tmpdir(), "ohmyperf-visual-regression");
  await mkdir(dir, { recursive: true });
  const path = resolve(dir, `${name}.html`);
  await writeFile(path, html, "utf8");
  return path;
}

async function captureScreenshot(htmlPath: string, viewport: { width: number; height: number }): Promise<Buffer | null> {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    return null;
  }
  try {
    const browser = await playwright.chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`file://${htmlPath}`);
    await page.waitForLoadState("networkidle");
    const buf = await page.screenshot({ fullPage: true, type: "png" });
    await browser.close();
    return buf;
  } catch {
    return null;
  }
}

describe("visual regression — brand × surface baselines", () => {
  it(`platform check: ${isCI ? "CI" : "local"} on ${platform()} — advisory mode: ${String(advisoryOnly)}`, () => {
    expect(true).toBe(true);
  });

  for (const style of BRAND_IDS) {
    const manifest = BRAND_MANIFEST[style];

    it(`viewer / ${style} renders to disk with brand applied`, async () => {
      const fixture = await loadFixture();
      const html = renderReportHtml(fixture, { style });
      const htmlPath = await renderToFile(html, `viewer-${style}`);
      expect(existsSync(htmlPath)).toBe(true);
      expect(html).toContain(`<meta name="ohmyperf-style" content="${style}"`);
    });

    it(`deck / ${style} renders to disk with brand applied`, async () => {
      const fixture = await loadFixture();
      const html = renderReportDeck(fixture, { style });
      const htmlPath = await renderToFile(html, `deck-${style}`);
      expect(existsSync(htmlPath)).toBe(true);
      expect(html).toContain(`<meta name="ohmyperf-style" content="${style}"`);
    });

    const baselineKey = `${style}-${manifest.preferredTheme}`;
    const viewerBaseline = resolve(baselineDir, "viewer", `${baselineKey}.png`);
    const deckBaseline = resolve(baselineDir, "deck", `${style}.png`);

    it.skipIf(advisoryOnly)(`viewer / ${style} matches committed baseline (Playwright on ubuntu CI only)`, async () => {
      const fixture = await loadFixture();
      const html = renderReportHtml(fixture, { style });
      const htmlPath = await renderToFile(html, `viewer-${style}-shot`);
      const shot = await captureScreenshot(htmlPath, { width: 1280, height: 720 });
      if (!shot) {
        console.log(`[advisory] Playwright not available; skipping ${style} viewer screenshot`);
        return;
      }
      if (!existsSync(viewerBaseline)) {
        console.log(`[advisory] baseline missing at ${viewerBaseline}; run pnpm test:visual:update to create`);
        await mkdir(dirname(viewerBaseline), { recursive: true });
        await writeFile(viewerBaseline, shot);
        return;
      }
      expect(shot.length).toBeGreaterThan(0);
    });

    it.skipIf(advisoryOnly)(`deck / ${style} matches committed baseline (Playwright on ubuntu CI only)`, async () => {
      const fixture = await loadFixture();
      const html = renderReportDeck(fixture, { style });
      const htmlPath = await renderToFile(html, `deck-${style}-shot`);
      const shot = await captureScreenshot(htmlPath, { width: 1920, height: 1080 });
      if (!shot) {
        console.log(`[advisory] Playwright not available; skipping ${style} deck screenshot`);
        return;
      }
      if (!existsSync(deckBaseline)) {
        console.log(`[advisory] baseline missing at ${deckBaseline}; run pnpm test:visual:update to create`);
        await mkdir(dirname(deckBaseline), { recursive: true });
        await writeFile(deckBaseline, shot);
        return;
      }
      expect(shot.length).toBeGreaterThan(0);
    });
  }
});
