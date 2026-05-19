import { PALETTE_CSS, PALETTE_CSS_LIGHT_ONLY } from "./index.js";
import { VENDORED_BRAND_CSS, VENDORED_DECK_OVERLAY } from "./generated/brand-css.js";

export type BrandId = "calibre" | "linear-app" | "stripe" | "vercel";

export const BRAND_IDS: ReadonlyArray<BrandId> = [
  "calibre",
  "linear-app",
  "stripe",
  "vercel",
] as const;

export interface BrandManifest {
  readonly id: BrandId;
  readonly displayName: string;
  readonly preferredTheme: "light" | "dark";
  readonly supportsLight: boolean;
  readonly supportsDark: boolean;
  readonly description: string;
  readonly license: string;
  readonly upstreamSha?: string;
}

export const BRAND_MANIFEST: Readonly<Record<BrandId, BrandManifest>> = {
  calibre: {
    id: "calibre",
    displayName: "Calibre",
    preferredTheme: "light",
    supportsLight: true,
    supportsDark: true,
    description: "OhMyPerf's default Calibre-inspired palette. Deep blue accent, OKLCH-based, WCAG-AA verified.",
    license: "Apache-2.0",
  },
  "linear-app": {
    id: "linear-app",
    displayName: "Linear",
    preferredTheme: "dark",
    supportsLight: true,
    supportsDark: true,
    description: "Linear's dark-mode-native engineering aesthetic. Near-black canvas with indigo-violet accent.",
    license: "Apache-2.0",
    upstreamSha: "local-vendor-2026-05-18",
  },
  stripe: {
    id: "stripe",
    displayName: "Stripe",
    preferredTheme: "light",
    supportsLight: true,
    supportsDark: false,
    description: "Stripe's fintech infrastructure look: white canvas, signature violet, blue-tinted multi-layer shadows.",
    license: "Apache-2.0",
    upstreamSha: "local-vendor-2026-05-18",
  },
  vercel: {
    id: "vercel",
    displayName: "Vercel",
    preferredTheme: "light",
    supportsLight: true,
    supportsDark: true,
    description: "Vercel's engineering-as-design thesis: near-white canvas, near-black text, one saturated blue accent.",
    license: "Apache-2.0",
    upstreamSha: "local-vendor-2026-05-18",
  },
};

export function resolveTheme(
  id: BrandId,
  opts: { theme?: "light" | "dark" | "system" } = {},
): "light" | "dark" {
  const manifest = BRAND_MANIFEST[id];
  const requested = opts.theme ?? "system";
  if (requested === "system") return manifest.preferredTheme;
  if (requested === "light") {
    if (manifest.supportsLight) return "light";
    if (typeof console !== "undefined") {
      console.warn(
        `[ohmyperf/viewer] ${manifest.displayName} does not support light theme; using ${manifest.preferredTheme}`,
      );
    }
    return manifest.preferredTheme;
  }
  if (manifest.supportsDark) return "dark";
  if (typeof console !== "undefined") {
    console.warn(
      `[ohmyperf/viewer] ${manifest.displayName} does not support dark theme; using ${manifest.preferredTheme}`,
    );
  }
  return manifest.preferredTheme;
}

export function getBrandCss(
  id: BrandId,
  theme: "light" | "dark" | "system" = "system",
): string {
  const resolved = resolveTheme(id, { theme });
  if (id === "calibre") {
    return resolved === "light" ? PALETTE_CSS_LIGHT_ONLY : PALETTE_CSS;
  }
  return VENDORED_BRAND_CSS[id];
}

export function isBrandId(value: unknown): value is BrandId {
  return typeof value === "string" && (BRAND_IDS as ReadonlyArray<string>).includes(value);
}

/**
 * @deprecated As of revise-open-design-integration. Deck now consumes the full brand CSS
 * via getBrandCss(id). This function returns empty string for back-compat with v1 callers.
 * Will be REMOVED in v0.1.0 (next minor version bump).
 */
export function getDeckBrandOverlay(_id: BrandId): string {
  return "";
}
