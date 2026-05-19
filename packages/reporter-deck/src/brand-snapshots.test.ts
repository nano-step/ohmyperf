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

    it(`stays light-locked for style=${style} (no prefers-color-scheme: dark)`, () => {
      const html = renderReportDeck(rich, { style });
      expect(html).not.toContain("@media (prefers-color-scheme: dark)");
      expect(html).toContain("color-scheme: light only");
    });
  }

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
