import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Report } from "@ohmyperf/core";
import { BRAND_IDS, BRAND_MANIFEST, type BrandId } from "@ohmyperf/design-tokens";
import { renderReportDeck } from "./render.js";

function loadFixture(name: string): Report {
  const path = new URL(`../../viewer/fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as Report;
}

const rich = loadFixture("rich.json");

describe("renderReportDeck — brand styles", () => {
  for (const style of BRAND_IDS) {
    it(`renders without throwing for style=${style}`, () => {
      expect(() => renderReportDeck(rich, { style })).not.toThrow();
    });

    it(`includes <meta name="ohmyperf-style" content="${style}">`, () => {
      const html = renderReportDeck(rich, { style });
      expect(html).toContain(`<meta name="ohmyperf-style" content="${style}"`);
    });

    it(`emits exactly 6 slides regardless of brand for style=${style}`, () => {
      const html = renderReportDeck(rich, { style });
      const slideCount = (html.match(/<section class="slide"/g) ?? []).length;
      expect(slideCount).toBe(6);
    });
  }

  // R7 superseded: deck now honors brand.preferredTheme instead of being light-locked
  describe("theme resolution per brand (R7 superseded)", () => {
    it("linear-app deck HTML contains <html class=\"theme-dark\"> (dark-native brand)", () => {
      const html = renderReportDeck(rich, { style: "linear-app" });
      expect(html).toContain('<html lang="en" class="theme-dark"');
    });

    it("stripe deck HTML contains <html class=\"theme-light\">", () => {
      const html = renderReportDeck(rich, { style: "stripe" });
      expect(html).toContain('<html lang="en" class="theme-light"');
    });

    it("vercel deck HTML contains <html class=\"theme-light\"> (preferredTheme=light)", () => {
      const html = renderReportDeck(rich, { style: "vercel" });
      expect(html).toContain('<html lang="en" class="theme-light"');
    });

    it("calibre deck HTML contains <html class=\"theme-light\">", () => {
      const html = renderReportDeck(rich, { style: "calibre" });
      expect(html).toContain('<html lang="en" class="theme-light"');
    });

    it("deck CSS now contains @media (prefers-color-scheme: dark) for auto-resolution path", () => {
      const html = renderReportDeck(rich, { style: "calibre" });
      expect(html).toContain("@media (prefers-color-scheme: dark)");
    });

    it("deck CSS no longer emits color-scheme: light only", () => {
      for (const style of BRAND_IDS) {
        const html = renderReportDeck(rich, { style });
        expect(html, `${style} should not have light-only lock`).not.toContain("color-scheme: light only");
      }
    });
  });

  // R7a: dark-native brand must expose print-safe tokens
  describe("print-safe overrides (R7a)", () => {
    it("linear-app deck HTML redeclares --bg: #ffffff inside @media print > :root (print-safe inversion for dark-native brand)", () => {
      const html = renderReportDeck(rich, { style: "linear-app" });
      expect(html).toMatch(/@media print\s*\{\s*:root\s*\{[^}]*--bg:\s*#ffffff/);
    });

    it("stripe deck HTML does NOT redeclare --bg inside @media print (light brand, no inversion needed)", () => {
      const html = renderReportDeck(rich, { style: "stripe" });
      expect(html).not.toMatch(/@media print\s*\{\s*:root\s*\{[^}]*--bg:/);
    });

    it("vercel deck HTML does NOT redeclare --bg inside @media print", () => {
      const html = renderReportDeck(rich, { style: "vercel" });
      expect(html).not.toMatch(/@media print\s*\{\s*:root\s*\{[^}]*--bg:/);
    });

    it("calibre deck HTML does NOT redeclare --bg inside @media print", () => {
      const html = renderReportDeck(rich, { style: "calibre" });
      expect(html).not.toMatch(/@media print\s*\{\s*:root\s*\{[^}]*--bg:/);
    });
  });

  it("calibre style emits NO brand overlay block", () => {
    const html = renderReportDeck(rich, { style: "calibre" });
    expect(html).not.toContain("<!-- Styled like");
  });

  it("linear-app brand CSS includes brand --accent token (#5e6ad2)", () => {
    const html = renderReportDeck(rich, { style: "linear-app" });
    expect(html).toMatch(/--accent:\s*#5e6ad2/);
  });

  it("stripe brand CSS includes brand --accent token (#533afd)", () => {
    const html = renderReportDeck(rich, { style: "stripe" });
    expect(html).toMatch(/--accent:\s*#533afd/);
  });

  it("vercel brand CSS includes brand --accent token (#0070f3)", () => {
    const html = renderReportDeck(rich, { style: "vercel" });
    expect(html).toMatch(/--accent:\s*#0070f3/);
  });

  it("non-calibre brands include hidden attribution comment", () => {
    for (const style of (["linear-app", "stripe", "vercel"] satisfies BrandId[])) {
      const html = renderReportDeck(rich, { style });
      expect(html, `${style} missing attribution comment`).toContain(`<!-- Styled like ${style} via Open Design Library (Apache-2.0)`);
    }
  });

  it("undefined style defaults to calibre", () => {
    const html = renderReportDeck(rich);
    expect(html).toContain('<meta name="ohmyperf-style" content="calibre"');
  });
});
