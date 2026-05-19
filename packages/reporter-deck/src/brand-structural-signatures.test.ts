import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Report } from "@ohmyperf/core";
import { renderReportDeck } from "./render.js";

function loadFixture(name: string): Report {
  const path = new URL(`../../viewer/fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as Report;
}

const rich = loadFixture("rich.json");

function stripPrintBlocks(css: string): string {
  return css.replace(/@media\s+print\s*\{[\s\S]*?\n\}\s*$/gm, "");
}

function tokenValue(html: string, name: string): string | null {
  const screen = stripPrintBlocks(html);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*${escaped}:\\s*([^;\\n]+?)\\s*;`, "gm");
  const matches = [...screen.matchAll(re)];
  if (matches.length === 0) return null;
  return matches[matches.length - 1]?.[1] ?? null;
}

describe("R17 — linear-app deck structural signature", () => {
  const html = renderReportDeck(rich, { style: "linear-app" });

  it("html class is theme-dark (linear-app preferredTheme=dark)", () => {
    expect(html).toContain('class="theme-dark"');
  });

  it("--container-max is 1200px", () => {
    expect(tokenValue(html, "--container-max")).toBe("1200px");
  });

  it("--elev-raised carries luminance-stepped border layer", () => {
    expect(html).toMatch(/--elev-raised:[\s\S]*?0\s+0\s+0\s+1px\s+rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.05\s*\)/);
  });

  it("@media print redeclares --bg:#ffffff for print-safe inversion (R7a)", () => {
    expect(html).toMatch(/@media print\s*\{\s*:root\s*\{[^}]*--bg:\s*#ffffff/);
  });
});

describe("R18 — stripe deck structural signature", () => {
  const html = renderReportDeck(rich, { style: "stripe" });

  it("html class is theme-light", () => {
    expect(html).toContain('class="theme-light"');
  });

  it("--elev-raised carries Stripe's multi-layer blue-tinted shadow", () => {
    expect(html).toMatch(/--elev-raised:\s*rgba\(\s*50\s*,\s*50\s*,\s*93/);
  });

  it("--surface-warm is cool-pale #f6f9fc", () => {
    expect(tokenValue(html, "--surface-warm")).toBe("#f6f9fc");
  });

  it("--accent is Stripe Purple #533afd", () => {
    expect(tokenValue(html, "--accent")).toBe("#533afd");
  });
});

describe("R19 — vercel deck structural signature", () => {
  const html = renderReportDeck(rich, { style: "vercel" });

  it("html class is theme-light", () => {
    expect(html).toContain('class="theme-light"');
  });

  it("--elev-raised stacks 4 layers ending with #fafafa inner ring", () => {
    expect(html).toMatch(/--elev-raised:\s*0\s+0\s+0\s+1px\s+rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.08\s*\)/);
    expect(html).toMatch(/0\s+0\s+0\s+1px\s+#fafafa/);
  });

  it("--tracking-display is -0.05em", () => {
    expect(tokenValue(html, "--tracking-display")).toBe("-0.05em");
  });

  it("--border is rgba(0, 0, 0, 0.08) shadow-as-border alpha", () => {
    expect(tokenValue(html, "--border")).toMatch(/^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.08\s*\)$/);
  });
});
