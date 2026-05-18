import { describe, expect, it } from "vitest";
import {
  CALIBRE_DARK,
  CALIBRE_LIGHT,
  PALETTE_CSS,
  PALETTE_CSS_LIGHT_ONLY,
  TOKEN_NAMES,
  paletteCssVars,
} from "./index.js";

describe("design-tokens palette", () => {
  it("CALIBRE_LIGHT has all 16 tokens", () => {
    const keys = Object.keys(CALIBRE_LIGHT).filter((k) => k !== "hex");
    expect(keys.length).toBe(16);
  });

  it("CALIBRE_LIGHT.hex has parallel hex fallbacks for every OKLCH token", () => {
    const oklchKeys = Object.keys(CALIBRE_LIGHT).filter((k) => k !== "hex").sort();
    const hexKeys = Object.keys(CALIBRE_LIGHT.hex).sort();
    expect(hexKeys).toEqual(oklchKeys);
  });

  it("CALIBRE_DARK has same token shape as LIGHT", () => {
    const lightKeys = Object.keys(CALIBRE_LIGHT).filter((k) => k !== "hex").sort();
    const darkKeys = Object.keys(CALIBRE_DARK).filter((k) => k !== "hex").sort();
    expect(darkKeys).toEqual(lightKeys);
  });

  it("every CALIBRE_LIGHT value is a valid OKLCH triple", () => {
    const keys = Object.keys(CALIBRE_LIGHT).filter((k) => k !== "hex") as Array<keyof typeof CALIBRE_LIGHT>;
    for (const k of keys) {
      const v = CALIBRE_LIGHT[k];
      expect(typeof v).toBe("string");
      expect(v).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
    }
  });

  it("every hex fallback is a valid 6-digit hex code", () => {
    const keys = Object.keys(CALIBRE_LIGHT.hex) as Array<keyof typeof CALIBRE_LIGHT.hex>;
    for (const k of keys) {
      expect(CALIBRE_LIGHT.hex[k]).toMatch(/^#[0-9a-f]{6}$/);
      expect(CALIBRE_DARK.hex[k]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("paletteCssVars emits hex BEFORE oklch for each token (browser fallback order)", () => {
    const css = paletteCssVars(CALIBRE_LIGHT);
    const primaryLines = css
      .split("\n")
      .filter((l) => l.includes("--color-primary:"));
    expect(primaryLines.length).toBe(2);
    expect(primaryLines[0]).toContain("#");
    expect(primaryLines[1]).toContain("oklch(");
  });

  it("PALETTE_CSS includes hex AND oklch literals for every token", () => {
    for (const tokenName of TOKEN_NAMES) {
      const hexMatch = new RegExp(`${tokenName}:\\s*#[0-9a-f]{6}`).test(PALETTE_CSS);
      const oklchMatch = new RegExp(`${tokenName}:\\s*oklch\\(`).test(PALETTE_CSS);
      expect(hexMatch, `${tokenName} missing hex fallback`).toBe(true);
      expect(oklchMatch, `${tokenName} missing oklch declaration`).toBe(true);
    }
  });

  it("PALETTE_CSS includes both :root and prefers-color-scheme: dark blocks", () => {
    expect(PALETTE_CSS).toContain(":root");
    expect(PALETTE_CSS).toContain("@media (prefers-color-scheme: dark)");
    expect(PALETTE_CSS).toContain(".theme-light");
    expect(PALETTE_CSS).toContain(".theme-dark");
  });

  it("PALETTE_CSS_LIGHT_ONLY excludes dark mode block", () => {
    expect(PALETTE_CSS_LIGHT_ONLY).not.toContain("prefers-color-scheme: dark");
    expect(PALETTE_CSS_LIGHT_ONLY).toContain("color-scheme: light only");
  });

  it("TOKEN_NAMES exposes 16 unique CSS variable names", () => {
    expect(TOKEN_NAMES.length).toBe(16);
    expect(new Set(TOKEN_NAMES).size).toBe(16);
    for (const n of TOKEN_NAMES) {
      expect(n).toMatch(/^--color-[a-z-]+$/);
    }
  });
});
