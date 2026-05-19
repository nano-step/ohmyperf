import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Report } from "@ohmyperf/core";
import { renderReportHtml } from "./render.js";

function loadFixture(name: string): Report {
  const path = new URL(`../fixtures/${name}`, import.meta.url);
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

describe("R17 — linear-app structural signature", () => {
  const html = renderReportHtml(rich, { style: "linear-app" });

  it("--container-max is 1200px (wider than calibre's 1100px)", () => {
    expect(tokenValue(html, "--container-max")).toBe("1200px");
  });

  it("--tracking-display is -0.022em (Linear's signature negative tracking)", () => {
    expect(tokenValue(html, "--tracking-display")).toBe("-0.022em");
  });

  it("--elev-raised carries luminance-stepped border layer (0 0 0 1px rgba(255,255,255,0.05))", () => {
    expect(html).toMatch(/--elev-raised:[\s\S]*?0\s+0\s+0\s+1px\s+rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.05\s*\)/);
  });

  it("--bg is #08090a (Linear marketing black, dark-native canvas)", () => {
    expect(tokenValue(html, "--bg")).toBe("#08090a");
  });

  it("--section-y-desktop is 80px (taller rhythm than calibre's 64px)", () => {
    expect(tokenValue(html, "--section-y-desktop")).toBe("80px");
  });
});

describe("R18 — stripe structural signature", () => {
  const html = renderReportHtml(rich, { style: "stripe" });

  it("--elev-raised carries Stripe's signature multi-layer blue-tinted shadow", () => {
    expect(html).toMatch(/--elev-raised:\s*rgba\(\s*50\s*,\s*50\s*,\s*93/);
    expect(html).toMatch(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.10?\s*\)/);
  });

  it("--surface-warm is cool-pale #f6f9fc (Stripe nested-panel background)", () => {
    expect(tokenValue(html, "--surface-warm")).toBe("#f6f9fc");
  });

  it("--section-y-desktop is 96px (taller than calibre's 64px)", () => {
    expect(tokenValue(html, "--section-y-desktop")).toBe("96px");
  });

  it("--accent is #533afd (Stripe Purple, not the generic schema blue)", () => {
    expect(tokenValue(html, "--accent")).toBe("#533afd");
  });
});

describe("R19 — vercel structural signature", () => {
  const html = renderReportHtml(rich, { style: "vercel" });

  it("BRAND_STRUCTURAL_OVERRIDES adds .cwv-card { border: none } (Vercel shadow-as-border)", () => {
    expect(html).toMatch(/\.cwv-card\s*\{\s*border:\s*none/);
  });

  it("--elev-raised stacks 4 layers ending with #fafafa inner-ring glow", () => {
    expect(html).toMatch(/--elev-raised:\s*0\s+0\s+0\s+1px\s+rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.08\s*\)/);
    expect(html).toMatch(/0\s+0\s+0\s+1px\s+#fafafa/);
  });

  it("--text-3xl is 40px (Vercel's tighter display scale)", () => {
    expect(tokenValue(html, "--text-3xl")).toBe("40px");
  });

  it("--tracking-display is -0.05em (Vercel's aggressive display tracking)", () => {
    expect(tokenValue(html, "--tracking-display")).toBe("-0.05em");
  });

  it("--section-y-desktop is 96px", () => {
    expect(tokenValue(html, "--section-y-desktop")).toBe("96px");
  });

  it("--border is rgba(0, 0, 0, 0.08) — Vercel's shadow-as-border alpha, not a solid hex", () => {
    expect(tokenValue(html, "--border")).toMatch(/^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.08\s*\)$/);
  });
});

describe("R20 — calibre token-surface parity (R23)", () => {
  const html = renderReportHtml(rich, { style: "calibre" });

  it("emits the full open-design token surface (--space-1..--container-max), not just --color-*", () => {
    expect(html).toMatch(/--space-1:\s*4px/);
    expect(html).toMatch(/--space-6:\s*24px/);
    expect(html).toMatch(/--text-base:\s*16px/);
    expect(html).toMatch(/--container-max:\s*1100px/);
    expect(html).toMatch(/--radius-lg:\s*12px/);
    expect(html).toMatch(/--elev-raised:/);
    expect(html).toMatch(/--motion-base:\s*200ms/);
  });
});
