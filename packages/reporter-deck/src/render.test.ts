import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Report } from "@ohmyperf/core";
import { renderReportDeck } from "./render.js";

function loadFixture(name: string): Report {
  const path = new URL(`../../viewer/fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as Report;
}

describe("renderReportDeck — rich fixture", () => {
  const html = renderReportDeck(loadFixture("rich.json"));

  it("emits exactly 6 slides", () => {
    const slideCount = (html.match(/<section class="slide"/g) ?? []).length;
    expect(slideCount).toBe(6);
  });

  it("each slide has a unique id slide-N", () => {
    for (let i = 1; i <= 6; i++) {
      expect(html).toContain(`id="slide-${String(i)}"`);
    }
  });

  it("includes the inline navigation script + counter", () => {
    expect(html).toContain('<script>');
    expect(html).toContain("ArrowRight");
    expect(html).toContain("ArrowLeft");
    expect(html).toContain('class="deck-nav"');
    expect(html).toContain('class="counter"');
  });

  it("honors brand preferredTheme (R7 superseded): default calibre resolves to light", () => {
    expect(html).toContain('class="theme-light"');
    expect(html).not.toContain("color-scheme: light only");
    expect(html).toContain("@media (prefers-color-scheme: dark)");
  });

  it("includes print stylesheet with 1920x1080 landscape @page", () => {
    expect(html).toContain("@page");
    expect(html).toContain("1920px 1080px landscape");
    expect(html).toContain("@media print");
    expect(html).toContain("page-break-after: always");
  });

  it("emits hex fallback before oklch for every design token", () => {
    const lines = html.split("\n").filter((l) => l.includes("--color-"));
    const tokensWithOklch = new Set<string>();
    for (const line of lines) {
      const match = line.match(/--color-([\w-]+):\s*oklch\(/);
      if (match) tokensWithOklch.add(match[1]!);
    }
    for (const name of tokensWithOklch) {
      const hexLine = lines.find((l) => l.includes(`--color-${name}:`) && l.includes("#"));
      expect(hexLine, `--color-${name} missing hex fallback`).toBeDefined();
    }
    expect(tokensWithOklch.size).toBeGreaterThanOrEqual(16);
  });

  it("CWV slide renders all three verdict states from the rich fixture", () => {
    expect(html).toMatch(/data-cwv-status="good"/);
    expect(html).toMatch(/data-cwv-status="needs-improvement"/);
    expect(html).toMatch(/data-cwv-status="poor"/);
  });

  it("third-parties slide renders donut + legend with vendor names", () => {
    expect(html).toContain("Google Tag Manager");
    expect(html).toContain('class="legend"');
  });

  it("opportunities slide renders top items via horizontal bars", () => {
    expect(html).toContain("Eliminate render-blocking resources");
    expect(html).toContain("ms saved");
  });

  it("long-tasks slide renders task labels (hostname/path) for tasks with rich attribution", () => {
    expect(html).toContain("cdn.example.com");
  });

  it("methodology slide includes mode + browser + parity rows", () => {
    expect(html).toContain("Methodology");
    expect(html).toContain("ci-stable");
    expect(html).toContain("chromium");
  });

  it("embeds Report JSON payload by default", () => {
    expect(html).toContain('id="ohmyperf-report-payload"');
  });

  it("escapes user-controlled URLs from rendered slides (no raw <script> in slide bodies)", () => {
    const slideMatches = html.match(/<section class="slide"[\s\S]*?<\/section>/g) ?? [];
    expect(slideMatches.length).toBe(6);
    for (const slide of slideMatches) {
      expect(slide.toLowerCase()).not.toContain("<script");
    }
  });

  it("emits doctype + lang + theme-light class on <html>", () => {
    expect(html).toMatch(/^<!doctype html>\s*<html lang="en" class="theme-light">/);
  });
});

describe("renderReportDeck — good fixture (empty-state slides)", () => {
  const html = renderReportDeck(loadFixture("good.json"));

  it("opportunities slide renders empty-state when no opportunities", () => {
    expect(html).toContain("No opportunities detected");
  });

  it("third-parties slide renders empty-state when plugin data missing", () => {
    expect(html).toContain("Third-party scripts were not measured");
  });

  it("long-tasks slide renders empty-state when no long tasks", () => {
    expect(html).toContain("No long tasks recorded");
  });

  it("CWV slide still rendered (all good verdicts)", () => {
    expect(html).toMatch(/<div class="cwv-tile" data-cwv-status="good"/);
    expect(html).not.toMatch(/<div class="cwv-tile" data-cwv-status="poor"/);
  });
});

describe("renderReportDeck — broken fixture", () => {
  it("renders without throwing when aggregated/runs/pluginData are empty", () => {
    expect(() => renderReportDeck(loadFixture("broken.json"))).not.toThrow();
    const html = renderReportDeck(loadFixture("broken.json"));
    expect(html).toContain("Performance Report");
    expect(html).toContain('id="slide-1"');
    expect(html).toContain('id="slide-6"');
  });
});
