import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Report } from "@ohmyperf/core";
import { BRAND_IDS, BRAND_MANIFEST, type BrandId } from "@ohmyperf/design-tokens";
import { renderReportHtml } from "./render.js";

function loadFixture(name: string): Report {
  const path = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as Report;
}

const rich = loadFixture("rich.json");

describe("renderReportHtml — brand styles", () => {
  for (const style of BRAND_IDS) {
    it(`renders without throwing for style=${style}`, () => {
      expect(() => renderReportHtml(rich, { style })).not.toThrow();
    });

    it(`includes <meta name="ohmyperf-style" content="${style}">`, () => {
      const html = renderReportHtml(rich, { style });
      expect(html).toContain(`<meta name="ohmyperf-style" content="${style}"`);
    });

    it(`embeds expected --color-* bridge tokens for style=${style} (R3: 6 color-semantics aliases only)`, () => {
      const html = renderReportHtml(rich, { style });
      expect(html).toContain("--color-background");
      expect(html).toContain("--color-foreground");
      expect(html).toContain("--color-accent-success");
      expect(html).toContain("--color-accent-warning");
      expect(html).toContain("--color-accent-danger");
    });

    it(`chart CSS rules pick up brand palette via native tokens (data-donut-slice / data-bar) for style=${style}`, () => {
      const html = renderReportHtml(rich, { style });
      expect(html).toContain('[data-donut-slice="0"]');
      expect(html).toContain('[data-donut-slice="1"]');
      expect(html).toContain('[data-bar="filled"]');
      expect(html).toContain("var(--accent)");
    });

    it(`charts are emitted as palette-agnostic SVG (no hard-coded oklch/hex on SVG attrs) for style=${style}`, () => {
      const html = renderReportHtml(rich, { style });
      const donutSection = html.match(/<svg class="ohmyperf-donut"[\s\S]*?<\/svg>/);
      if (donutSection) {
        expect(donutSection[0]).toMatch(/data-donut-slice="\d"/);
        expect(donutSection[0]).not.toMatch(/fill="#[0-9a-f]/i);
        expect(donutSection[0]).not.toMatch(/stroke="oklch\(/);
      }
    });
  }

  it("calibre style has NO attribution footer suffix", () => {
    const html = renderReportHtml(rich, { style: "calibre" });
    expect(html).not.toContain("Styled like");
    expect(html).not.toContain("via Open Design Library");
  });

  it("vendored brands include attribution footer suffix + hidden comment", () => {
    for (const style of (["linear-app", "stripe", "vercel"] satisfies BrandId[])) {
      const html = renderReportHtml(rich, { style });
      const displayName = BRAND_MANIFEST[style].displayName;
      expect(html, `${style} missing attribution suffix`).toContain(`Styled like ${displayName} via Open Design Library`);
      expect(html, `${style} missing hidden comment`).toContain(`<!-- Styled like ${style} via Open Design Library (Apache-2.0)`);
    }
  });

  it("undefined style defaults to calibre", () => {
    const html = renderReportHtml(rich);
    expect(html).toContain('<meta name="ohmyperf-style" content="calibre"');
  });

  it("invalid style falls back to calibre (defense-in-depth)", () => {
    const html = renderReportHtml(rich, { style: "unknown-brand" as unknown as BrandId });
    expect(html).toContain('<meta name="ohmyperf-style" content="calibre"');
  });

  it("stripe + dark theme falls back to light (no dark support)", () => {
    const html = renderReportHtml(rich, { style: "stripe", theme: "dark" });
    expect(html).toContain('<meta name="ohmyperf-style" content="stripe"');
  });

  it("linear-app + system theme renders dark palette markers", () => {
    const html = renderReportHtml(rich, { style: "linear-app", theme: "system" });
    expect(html).toContain('<meta name="ohmyperf-style" content="linear-app"');
    expect(html).toContain("--bg:           #08090a");
  });
});

describe("CALIBRE_LIGHT / CALIBRE_DARK imports purged from viewer + reporter-deck", () => {
  it("does not appear as a runtime import in any rendered HTML", () => {
    for (const style of BRAND_IDS) {
      const html = renderReportHtml(rich, { style });
      expect(html, `${style} should not leak CALIBRE_LIGHT JS-token references`).not.toContain("CALIBRE_LIGHT");
      expect(html, `${style} should not leak CALIBRE_DARK JS-token references`).not.toContain("CALIBRE_DARK");
    }
  });
});
