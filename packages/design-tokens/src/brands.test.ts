import { describe, expect, it } from "vitest";
import {
  BRAND_IDS,
  BRAND_MANIFEST,
  getBrandCss,
  isBrandId,
  resolveTheme,
  type BrandId,
} from "./brands.js";

describe("BRAND_IDS", () => {
  it("exposes exactly 4 brand IDs in stable order", () => {
    expect(BRAND_IDS).toEqual(["calibre", "linear-app", "stripe", "vercel"]);
  });
});

describe("BRAND_MANIFEST", () => {
  it("has a manifest entry for every BrandId", () => {
    for (const id of BRAND_IDS) {
      expect(BRAND_MANIFEST[id]).toBeDefined();
      expect(BRAND_MANIFEST[id].id).toBe(id);
    }
  });

  it("vendored brands carry an upstreamSha", () => {
    expect(BRAND_MANIFEST["linear-app"].upstreamSha).toBeTruthy();
    expect(BRAND_MANIFEST["stripe"].upstreamSha).toBeTruthy();
    expect(BRAND_MANIFEST["vercel"].upstreamSha).toBeTruthy();
  });

  it("calibre has no upstreamSha (authored source)", () => {
    expect(BRAND_MANIFEST["calibre"].upstreamSha).toBeUndefined();
  });

  it("every brand supports at least one theme", () => {
    for (const id of BRAND_IDS) {
      const m = BRAND_MANIFEST[id];
      expect(m.supportsLight || m.supportsDark).toBe(true);
    }
  });

  it("preferredTheme is one the brand supports", () => {
    for (const id of BRAND_IDS) {
      const m = BRAND_MANIFEST[id];
      if (m.preferredTheme === "light") expect(m.supportsLight).toBe(true);
      else expect(m.supportsDark).toBe(true);
    }
  });

  it("stripe has no dark theme", () => {
    expect(BRAND_MANIFEST["stripe"].supportsDark).toBe(false);
  });

  it("linear-app prefers dark", () => {
    expect(BRAND_MANIFEST["linear-app"].preferredTheme).toBe("dark");
  });
});

describe("resolveTheme", () => {
  it("system → brand preferredTheme", () => {
    expect(resolveTheme("calibre", { theme: "system" })).toBe("light");
    expect(resolveTheme("linear-app", { theme: "system" })).toBe("dark");
    expect(resolveTheme("stripe", { theme: "system" })).toBe("light");
    expect(resolveTheme("vercel", { theme: "system" })).toBe("light");
  });

  it("undefined theme → brand preferredTheme", () => {
    expect(resolveTheme("linear-app")).toBe("dark");
  });

  it("explicit supported theme honored", () => {
    expect(resolveTheme("calibre", { theme: "light" })).toBe("light");
    expect(resolveTheme("calibre", { theme: "dark" })).toBe("dark");
    expect(resolveTheme("linear-app", { theme: "light" })).toBe("light");
    expect(resolveTheme("vercel", { theme: "dark" })).toBe("dark");
  });

  it("explicit unsupported theme falls back to preferredTheme", () => {
    expect(resolveTheme("stripe", { theme: "dark" })).toBe("light");
  });
});

describe("getBrandCss", () => {
  it("calibre dark returns the dark palette block", () => {
    const css = getBrandCss("calibre", "dark");
    expect(css).toContain("@media (prefers-color-scheme: dark)");
  });

  it("calibre light returns the light-only palette block", () => {
    const css = getBrandCss("calibre", "light");
    expect(css).toContain("color-scheme: light only");
    expect(css).not.toContain("@media (prefers-color-scheme: dark)");
  });

  it("vendored brand returns concatenated tokens.css + bridge.css", () => {
    const css = getBrandCss("linear-app", "dark");
    expect(css).toContain("--bg:");
    expect(css).toContain("--fg:");
    expect(css).toContain("--accent:");
    expect(css).toContain("--color-background:");
    expect(css).toContain("var(--bg)");
  });

  it("every vendored brand bridge maps exactly 6 color-semantics aliases (R3 revise-open-design-integration)", () => {
    const bridgeKeys = [
      "--color-background",
      "--color-foreground",
      "--color-primary",
      "--color-accent-success",
      "--color-accent-warning",
      "--color-accent-danger",
    ];
    const removedKeys = [
      "--color-card",
      "--color-card-foreground",
      "--color-muted",
      "--color-muted-foreground",
      "--color-border",
      "--color-primary-foreground",
      "--color-accent-primary",
      "--color-destructive",
      "--color-destructive-foreground",
    ];
    for (const id of ["linear-app", "stripe", "vercel"] satisfies BrandId[]) {
      const css = getBrandCss(id, "system");
      for (const key of bridgeKeys) {
        expect(css, `${id} missing bridge token ${key}`).toContain(key);
      }
      for (const key of removedKeys) {
        expect(css, `${id} should not contain removed bridge token ${key}`).not.toContain(key);
      }
    }
  });

  it("vendored brand CSS contains SPDX header", () => {
    const css = getBrandCss("linear-app", "system");
    expect(css).toContain("SPDX-License-Identifier: Apache-2.0");
  });

  it("vendored brand CSS contains provenance line", () => {
    const css = getBrandCss("stripe", "system");
    expect(css).toMatch(/Vendored from nexu-io\/open-design @ \S+ on \d{4}-\d{2}-\d{2}/);
  });

  it("font stacks are reduced to system fallback", () => {
    for (const id of ["linear-app", "stripe", "vercel"] satisfies BrandId[]) {
      const css = getBrandCss(id, "system");
      expect(css).toContain("-apple-system");
      expect(css).toContain("BlinkMacSystemFont");
    }
  });

  it("vendored brand CSS contains no runtime color-mix()", () => {
    for (const id of ["linear-app", "stripe", "vercel"] satisfies BrandId[]) {
      const css = getBrandCss(id, "system");
      const stripped = css
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\*.*$/gm, "");
      expect(stripped, `${id} still has runtime color-mix() outside comments`).not.toMatch(/color-mix\(/);
    }
  });
});

describe("isBrandId", () => {
  it("returns true for valid IDs", () => {
    expect(isBrandId("calibre")).toBe(true);
    expect(isBrandId("linear-app")).toBe(true);
    expect(isBrandId("stripe")).toBe(true);
    expect(isBrandId("vercel")).toBe(true);
  });

  it("returns false for invalid", () => {
    expect(isBrandId("unknown")).toBe(false);
    expect(isBrandId("")).toBe(false);
    expect(isBrandId(null)).toBe(false);
    expect(isBrandId(42)).toBe(false);
  });
});
