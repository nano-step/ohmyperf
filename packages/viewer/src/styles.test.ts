import { describe, expect, it } from "vitest";
import { VIEWER_CSS } from "./styles.js";

describe("VIEWER_CSS", () => {
  it("contains @media print stylesheet for B&W PDF export", () => {
    expect(VIEWER_CSS).toContain("@media print");
    expect(VIEWER_CSS).toContain('content: " (good)"');
    expect(VIEWER_CSS).toContain('content: " (needs improvement)"');
    expect(VIEWER_CSS).toContain('content: " (poor)"');
  });

  it("emits hex fallback before oklch for every design token", () => {
    const tokenLines = VIEWER_CSS.split("\n").filter((l) => l.match(/^\s*--color-[\w-]+:/));
    const seen = new Set<string>();
    for (const line of tokenLines) {
      const name = line.match(/--color-([\w-]+):/)?.[1];
      if (!name) continue;
      const isHex = line.includes("#");
      const isOklch = line.includes("oklch(");
      if (!seen.has(name) && isOklch) {
        const hasHexBefore = tokenLines.some((l) => l.includes(`--color-${name}:`) && l.includes("#"));
        expect(hasHexBefore, `--color-${name}: missing hex fallback before oklch`).toBe(true);
      }
      if (isHex || isOklch) seen.add(name);
    }
    expect(seen.size).toBeGreaterThanOrEqual(16);
  });

  it("includes :root and prefers-color-scheme dark blocks (dark mode preserved)", () => {
    expect(VIEWER_CSS).toContain(":root");
    expect(VIEWER_CSS).toContain("@media (prefers-color-scheme: dark)");
  });

  it("STRUCTURAL_CSS uses brand-native tokens — var(--accent), var(--surface), etc. (R3 revise-open-design-integration)", () => {
    expect(VIEWER_CSS).toContain("var(--accent)");
    expect(VIEWER_CSS).toContain("var(--surface)");
    expect(VIEWER_CSS).toContain("var(--meta)");
    expect(VIEWER_CSS).toContain("var(--border)");
    expect(VIEWER_CSS).toContain("var(--space-6)");
    expect(VIEWER_CSS).toContain("var(--radius-lg)");
    expect(VIEWER_CSS).toContain("var(--elev-raised)");
    expect(VIEWER_CSS).toContain("var(--container-max)");
    expect(VIEWER_CSS).toContain("var(--font-display)");
  });
});
