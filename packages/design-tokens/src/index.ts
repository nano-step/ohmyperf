export const PACKAGE_NAME = "@ohmyperf/design-tokens" as const;

export interface PaletteScheme {
  readonly background: string;
  readonly foreground: string;
  readonly card: string;
  readonly cardForeground: string;
  readonly primary: string;
  readonly primaryForeground: string;
  readonly muted: string;
  readonly mutedForeground: string;
  readonly border: string;
  readonly ring: string;
  readonly destructive: string;
  readonly destructiveForeground: string;
  readonly accentPrimary: string;
  readonly accentSuccess: string;
  readonly accentWarning: string;
  readonly accentDanger: string;
}

export interface PaletteWithHex extends PaletteScheme {
  readonly hex: PaletteScheme;
}

export const CALIBRE_LIGHT: PaletteWithHex = {
  background: "oklch(1 0 0)",
  foreground: "oklch(0.145 0 0)",
  card: "oklch(1 0 0)",
  cardForeground: "oklch(0.145 0 0)",
  primary: "oklch(0.50 0.18 245)",
  primaryForeground: "oklch(0.985 0 0)",
  muted: "oklch(0.97 0 0)",
  mutedForeground: "oklch(0.556 0 0)",
  border: "oklch(0.922 0 0)",
  ring: "oklch(0.50 0.18 245)",
  destructive: "oklch(0.55 0.22 25)",
  destructiveForeground: "oklch(0.985 0 0)",
  accentPrimary: "oklch(0.50 0.18 245)",
  accentSuccess: "oklch(0.55 0.17 145)",
  accentWarning: "oklch(0.55 0.16 70)",
  accentDanger: "oklch(0.55 0.22 25)",
  hex: {
    background: "#ffffff",
    foreground: "#252525",
    card: "#ffffff",
    cardForeground: "#252525",
    primary: "#1855b8",
    primaryForeground: "#fafafa",
    muted: "#f7f7f7",
    mutedForeground: "#8e8e8e",
    border: "#e6e6e6",
    ring: "#1855b8",
    destructive: "#c43928",
    destructiveForeground: "#fafafa",
    accentPrimary: "#1855b8",
    accentSuccess: "#377f3d",
    accentWarning: "#876012",
    accentDanger: "#c43928",
  },
};

export const CALIBRE_DARK: PaletteWithHex = {
  background: "oklch(0.145 0 0)",
  foreground: "oklch(0.985 0 0)",
  card: "oklch(0.18 0 0)",
  cardForeground: "oklch(0.985 0 0)",
  primary: "oklch(0.65 0.18 245)",
  primaryForeground: "oklch(0.145 0 0)",
  muted: "oklch(0.269 0 0)",
  mutedForeground: "oklch(0.708 0 0)",
  border: "oklch(0.269 0 0)",
  ring: "oklch(0.65 0.18 245)",
  destructive: "oklch(0.55 0.22 25)",
  destructiveForeground: "oklch(0.985 0 0)",
  accentPrimary: "oklch(0.65 0.18 245)",
  accentSuccess: "oklch(0.65 0.17 145)",
  accentWarning: "oklch(0.70 0.16 70)",
  accentDanger: "oklch(0.65 0.22 25)",
  hex: {
    background: "#252525",
    foreground: "#fafafa",
    card: "#2e2e2e",
    cardForeground: "#fafafa",
    primary: "#5a8fdc",
    primaryForeground: "#252525",
    muted: "#414141",
    mutedForeground: "#a8a8a8",
    border: "#414141",
    ring: "#5a8fdc",
    destructive: "#c43928",
    destructiveForeground: "#fafafa",
    accentPrimary: "#5a8fdc",
    accentSuccess: "#5b9762",
    accentWarning: "#c0822b",
    accentDanger: "#e35e4a",
  },
};

const PROP_TO_CSS_VAR: Record<keyof PaletteScheme, string> = {
  background: "--color-background",
  foreground: "--color-foreground",
  card: "--color-card",
  cardForeground: "--color-card-foreground",
  primary: "--color-primary",
  primaryForeground: "--color-primary-foreground",
  muted: "--color-muted",
  mutedForeground: "--color-muted-foreground",
  border: "--color-border",
  ring: "--color-ring",
  destructive: "--color-destructive",
  destructiveForeground: "--color-destructive-foreground",
  accentPrimary: "--color-accent-primary",
  accentSuccess: "--color-accent-success",
  accentWarning: "--color-accent-warning",
  accentDanger: "--color-accent-danger",
};

export function paletteCssVars(scheme: PaletteWithHex): string {
  const lines: string[] = [];
  const keys = Object.keys(PROP_TO_CSS_VAR) as Array<keyof PaletteScheme>;
  for (const key of keys) {
    const cssVar = PROP_TO_CSS_VAR[key];
    const hex = scheme.hex[key];
    const oklch = scheme[key];
    lines.push(`  ${cssVar}: ${hex};`);
    lines.push(`  ${cssVar}: ${oklch};`);
  }
  return lines.join("\n");
}

const CALIBRE_STRUCTURAL_TOKENS_LIGHT = `  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --section-y-desktop: 64px;
  --section-y-tablet: 48px;
  --section-y-phone: 32px;
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-xl: 24px;
  --text-2xl: 32px;
  --text-3xl: 40px;
  --text-4xl: 56px;
  --leading-body: 1.5;
  --leading-tight: 1.1;
  --tracking-display: -0.01em;
  --font-display: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
  --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 12px;
  --radius-pill: 9999px;
  --elev-flat: none;
  --elev-ring: 0 0 0 1px var(--color-border);
  --elev-raised: 0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04);
  --focus-ring: 0 0 0 3px color-mix(in oklab, var(--color-accent-primary), transparent 70%);
  --motion-fast: 150ms;
  --motion-base: 200ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --container-max: 1100px;
  --container-gutter-desktop: 24px;
  --container-gutter-tablet: 16px;
  --container-gutter-phone: 12px;
  --bg: var(--color-background);
  --fg: var(--color-foreground);
  --fg-2: oklch(0.30 0 0);
  --surface: var(--color-card);
  --surface-warm: var(--color-muted);
  --accent: var(--color-accent-primary);
  --accent-on: var(--color-primary-foreground);
  --success: var(--color-accent-success);
  --warn: var(--color-accent-warning);
  --danger: var(--color-accent-danger);
  --meta: var(--color-muted-foreground);
  --muted: var(--color-muted-foreground);
  --border: var(--color-border);
  --border-soft: oklch(0.95 0 0);`;

const CALIBRE_STRUCTURAL_TOKENS_DARK = `  --fg-2: oklch(0.75 0 0);
  --border-soft: oklch(0.30 0 0);
  --elev-ring: 0 0 0 1px var(--color-border);
  --elev-raised: 0 1px 3px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.15);
  --focus-ring: 0 0 0 3px color-mix(in oklab, var(--color-accent-primary), transparent 70%);`;

export const PALETTE_CSS = `:root {
  color-scheme: light dark;
${paletteCssVars(CALIBRE_LIGHT)}
${CALIBRE_STRUCTURAL_TOKENS_LIGHT}
}

@media (prefers-color-scheme: dark) {
  :root {
${paletteCssVars(CALIBRE_DARK)
  .split("\n")
  .map((l) => `  ${l}`)
  .join("\n")}
${CALIBRE_STRUCTURAL_TOKENS_DARK
  .split("\n")
  .map((l) => `  ${l}`)
  .join("\n")}
  }
}

.theme-light {
${paletteCssVars(CALIBRE_LIGHT)
  .split("\n")
  .map((l) => `  ${l}`)
  .join("\n")}
${CALIBRE_STRUCTURAL_TOKENS_LIGHT
  .split("\n")
  .map((l) => `  ${l}`)
  .join("\n")}
}

.theme-dark {
${paletteCssVars(CALIBRE_DARK)
  .split("\n")
  .map((l) => `  ${l}`)
  .join("\n")}
${CALIBRE_STRUCTURAL_TOKENS_DARK
  .split("\n")
  .map((l) => `  ${l}`)
  .join("\n")}
}
`;

export const PALETTE_CSS_LIGHT_ONLY = `:root {
  color-scheme: light only;
${paletteCssVars(CALIBRE_LIGHT)}
${CALIBRE_STRUCTURAL_TOKENS_LIGHT}
}
`;

export const TOKEN_NAMES = Object.values(PROP_TO_CSS_VAR) as ReadonlyArray<string>;

export {
  BRAND_IDS,
  BRAND_MANIFEST,
  getBrandCss,
  getDeckBrandOverlay,
  isBrandId,
  resolveTheme,
  type BrandId,
  type BrandManifest,
} from "./brands.js";
