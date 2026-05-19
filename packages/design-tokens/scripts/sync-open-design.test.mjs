import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { describe, it, expect } from "vitest";

const upstreamRoot = resolve(homedir(), ".config/opencode/open-design-library/design-systems");
const pkgRoot = resolve(new URL(".", import.meta.url).pathname, "..");
const brandsDir = resolve(pkgRoot, "brands");

const TARGET_BRANDS = ["linear-app", "stripe", "vercel"];

async function upstreamExists(brandId) {
  try {
    await access(resolve(upstreamRoot, brandId, "tokens.css"));
    return true;
  } catch {
    return false;
  }
}

function extractElevRaised(css) {
  const match = css.match(/--elev-raised\s*:\s*([\s\S]*?);/);
  if (!match) return null;
  return match[1].replace(/\s+/g, " ").trim();
}

describe("sync-open-design byte-fidelity: --elev-raised", () => {
  for (const brandId of TARGET_BRANDS) {
    it(`${brandId}: --elev-raised matches upstream byte-for-byte (modulo font/color-mix transforms)`, async () => {
      const hasUpstream = await upstreamExists(brandId);
      if (!hasUpstream) {
        console.log(`[skip] upstream not found for ${brandId} — skipping byte-fidelity test`);
        return;
      }

      const upstreamCss = await readFile(resolve(upstreamRoot, brandId, "tokens.css"), "utf8");
      const vendoredCss = await readFile(resolve(brandsDir, brandId, "tokens.css"), "utf8");

      const upstreamValue = extractElevRaised(upstreamCss);
      const vendoredValue = extractElevRaised(vendoredCss);

      expect(upstreamValue).not.toBeNull();
      expect(vendoredValue).not.toBeNull();

      expect(vendoredValue).toBe(upstreamValue);
    });
  }
});

describe("sync-open-design: bridge.css has exactly 6 color aliases", () => {
  for (const brandId of TARGET_BRANDS) {
    it(`${brandId}: bridge.css has exactly 6 --color-* declarations`, async () => {
      const bridgeCss = await readFile(resolve(brandsDir, brandId, "bridge.css"), "utf8");
      const declarations = [...bridgeCss.matchAll(/--color-[\w-]+\s*:/g)];
      expect(declarations).toHaveLength(6);

      expect(bridgeCss).toContain("--color-background: var(--bg)");
      expect(bridgeCss).toContain("--color-foreground: var(--fg)");
      expect(bridgeCss).toContain("--color-primary: var(--accent)");
      expect(bridgeCss).toContain("--color-accent-success: var(--success)");
      expect(bridgeCss).toContain("--color-accent-warning: var(--warn)");
      expect(bridgeCss).toContain("--color-accent-danger: var(--danger)");
    });
  }
});
