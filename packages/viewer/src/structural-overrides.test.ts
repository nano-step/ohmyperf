import { describe, expect, it } from "vitest";
import { BRAND_STRUCTURAL_OVERRIDES } from "./structural-overrides.js";
import { BRAND_IDS } from "@ohmyperf/design-tokens";

describe("BRAND_STRUCTURAL_OVERRIDES", () => {
  it("has an entry for every brand", () => {
    for (const id of BRAND_IDS) {
      expect(BRAND_STRUCTURAL_OVERRIDES).toHaveProperty(id);
    }
  });

  it("override blocks stay ≤ 20 lines per brand", () => {
    for (const [brand, css] of Object.entries(BRAND_STRUCTURAL_OVERRIDES)) {
      const lines = css.split("\n").length;
      expect(lines, `${brand} override exceeds 20-line cap`).toBeLessThanOrEqual(20);
    }
  });

  it("calibre override is empty string (baseline, no overrides)", () => {
    expect(BRAND_STRUCTURAL_OVERRIDES.calibre).toBe("");
  });

  it("vercel override contains border:none rules for cards, hero, third-parties", () => {
    const css = BRAND_STRUCTURAL_OVERRIDES.vercel;
    expect(css).toMatch(/\.cwv-card\s*\{\s*border:\s*none/);
    expect(css).toMatch(/\.hero\s*\{\s*border:\s*none/);
    expect(css).toMatch(/\.third-parties\s*\{\s*border:\s*none/);
  });
});
