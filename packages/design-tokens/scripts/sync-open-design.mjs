#!/usr/bin/env node
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const brandsDir = resolve(pkgRoot, "brands");
const upstreamRoot = resolve(homedir(), ".config/opencode/open-design-library/design-systems");

const TARGET_BRANDS = ["linear-app", "stripe", "vercel"];

const SYSTEM_DISPLAY_FONT_STACK = `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif`;
const SYSTEM_MONO_FONT_STACK = `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace`;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyBrand = (() => {
  const a = args.find((x) => x.startsWith("--brand="));
  return a ? a.slice("--brand=".length) : null;
})();
const all = args.includes("--all") || onlyBrand === null;

function fail(msg) {
  console.error(`sync-open-design: FAIL — ${msg}`);
  process.exit(1);
}

async function readUpstreamSchemaDigest() {
  const schemaPath = resolve(upstreamRoot, "_schema/tokens.schema.ts");
  const src = await readFile(schemaPath, "utf8");
  const names = [...src.matchAll(/name:\s*['"](\-\-[\w-]+)['"]/g)].map((m) => m[1]).sort();
  if (names.length === 0) fail(`could not parse token names from ${schemaPath}`);
  const digest = createHash("sha256").update(names.join("|")).digest("hex").slice(0, 16);
  return { digest, tokenCount: names.length };
}

async function assertSchemaUnchanged() {
  const pinnedPath = resolve(brandsDir, ".schema-digest");
  let pinned;
  try {
    pinned = (await readFile(pinnedPath, "utf8")).trim();
  } catch {
    fail(`${pinnedPath} missing — run from a clean tree`);
  }
  const { digest, tokenCount } = await readUpstreamSchemaDigest();
  if (pinned !== digest) {
    fail(
      `upstream schema drift detected\n  pinned:   ${pinned}\n  upstream: ${digest}\n  tokens:   ${String(tokenCount)}\n` +
        `  To accept the change: review _schema/tokens.schema.ts, update brands/.schema-digest, re-run.`,
    );
  }
  console.log(`schema digest OK (${digest}, ${String(tokenCount)} tokens)`);
}

function stripFontStacks(css) {
  const beforeDisplay = css.match(/--font-display:[^;]+;/g)?.length ?? 0;
  const beforeMono = css.match(/--font-mono:[^;]+;/g)?.length ?? 0;
  let out = css.replace(/--font-display:[^;]+;/g, `--font-display: ${SYSTEM_DISPLAY_FONT_STACK};`);
  out = out.replace(/--font-mono:[^;]+;/g, `--font-mono: ${SYSTEM_MONO_FONT_STACK};`);
  return { css: out, displayStripped: beforeDisplay, monoStripped: beforeMono };
}

function parseHexToRgb(hex) {
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex({ r, g, b }) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mixRgb(a, b, pct) {
  return {
    r: a.r + (b.r - a.r) * pct,
    g: a.g + (b.g - a.g) * pct,
    b: a.b + (b.b - a.b) * pct,
  };
}

function buildTokenMap(css) {
  const map = new Map();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

function resolveVar(tokenMap, value, seen = new Set()) {
  const trimmed = value.trim();
  const varMatch = trimmed.match(/^var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)$/);
  if (varMatch) {
    const name = varMatch[1];
    if (seen.has(name)) return null;
    seen.add(name);
    const next = tokenMap.get(name);
    if (next === undefined) return varMatch[2] ?? null;
    return resolveVar(tokenMap, next, seen);
  }
  return trimmed;
}

function precomputeColorMix(css) {
  const tokenMap = buildTokenMap(css);
  let count = 0;
  const transformed = css.replace(
    /color-mix\(\s*in\s+(?:oklab|srgb|oklch)\s*,\s*([^,]+),\s*(black|white|#[0-9a-fA-F]{6})\s+([\d.]+)%\s*\)/g,
    (match, baseExpr, mixColor, pctStr) => {
      const baseResolved = resolveVar(tokenMap, baseExpr);
      if (!baseResolved) return match;
      const baseRgb = parseHexToRgb(baseResolved);
      if (!baseRgb) return match;
      const mixRgbColor = mixColor === "black" ? { r: 0, g: 0, b: 0 } : mixColor === "white" ? { r: 255, g: 255, b: 255 } : parseHexToRgb(mixColor);
      if (!mixRgbColor) return match;
      const pct = parseFloat(pctStr) / 100;
      const result = mixRgb(baseRgb, mixRgbColor, pct);
      const hex = rgbToHex(result);
      count++;
      return `${hex} /* was: ${match.trim()} */`;
    },
  );
  return { css: transformed, count };
}

function makeProvenanceHeader(brandId, upstreamSha) {
  const now = new Date().toISOString().slice(0, 10);
  return `/* SPDX-License-Identifier: Apache-2.0
 *
 * Vendored from nexu-io/open-design @ ${upstreamSha} on ${now}
 * Brand: ${brandId}
 * Transforms applied at sync time:
 *   - Font stacks reduced to system fallback (ohmyperf single-file offline-portable constraint)
 *   - color-mix() resolved to static hex (browser back-compat for archived reports)
 * DO NOT EDIT — run \`pnpm sync:open-design\` from the repo root to refresh.
 */
`;
}

const CANONICAL_BRIDGE = `:root {
  --color-background: var(--bg);
  --color-foreground: var(--fg);
  --color-card: var(--surface);
  --color-card-foreground: var(--fg);
  --color-muted: var(--surface-warm);
  --color-muted-foreground: var(--meta);
  --color-border: var(--border);
  --color-primary: var(--accent);
  --color-primary-foreground: var(--accent-on);
  --color-accent-primary: var(--accent);
  --color-accent-success: var(--success);
  --color-accent-warning: var(--warn);
  --color-accent-danger: var(--danger);
  --color-destructive: var(--danger);
  --color-destructive-foreground: var(--accent-on);
}
`;

function makeBridgeFile(brandId, upstreamSha) {
  const now = new Date().toISOString().slice(0, 10);
  const header = `/* SPDX-License-Identifier: Apache-2.0
 *
 * Bridge layer: aliases open-design tokens (--bg, --fg, --accent, ...) onto
 * ohmyperf's --color-* namespace. Loaded after this brand's tokens.css.
 * Generated by sync-open-design.mjs on ${now}.
 * Brand: ${brandId}
 * Upstream SHA: ${upstreamSha}
 */
${CANONICAL_BRIDGE}`;
  return header;
}

async function syncBrand(brandId, upstreamSha) {
  const srcPath = resolve(upstreamRoot, brandId, "tokens.css");
  try {
    await stat(srcPath);
  } catch {
    fail(`upstream tokens.css missing for brand "${brandId}" at ${srcPath}`);
  }
  const raw = await readFile(srcPath, "utf8");
  const { css: noFonts, displayStripped, monoStripped } = stripFontStacks(raw);
  const { css: noMix, count: mixCount } = precomputeColorMix(noFonts);
  const provenance = makeProvenanceHeader(brandId, upstreamSha);
  const tokensOut = `${provenance}\n${noMix}`;
  const bridgeOut = makeBridgeFile(brandId, upstreamSha);
  const brandDir = resolve(brandsDir, brandId);
  if (dryRun) {
    console.log(`[dry-run] ${brandId}: ${displayStripped} display + ${monoStripped} mono font stacks stripped; ${mixCount} color-mix() calls precomputed`);
    console.log(`[dry-run] would write: ${brandDir}/{tokens.css,bridge.css}`);
    return { brandId, displayStripped, monoStripped, mixCount };
  }
  await mkdir(brandDir, { recursive: true });
  await writeFile(resolve(brandDir, "tokens.css"), tokensOut, "utf8");
  await writeFile(resolve(brandDir, "bridge.css"), bridgeOut, "utf8");
  console.log(`${brandId}: wrote tokens.css (${String(noMix.length)} bytes, ${String(displayStripped)}+${String(monoStripped)} fonts stripped, ${String(mixCount)} color-mix resolved)`);
  console.log(`${brandId}: wrote bridge.css (${String(bridgeOut.length)} bytes)`);
  return { brandId, displayStripped, monoStripped, mixCount };
}

await assertSchemaUnchanged();

const upstreamSha = (await readFile(resolve(brandsDir, "UPSTREAM_SHA"), "utf8")).trim();
console.log(`upstream SHA: ${upstreamSha}`);
console.log(`dry-run: ${String(dryRun)}`);

const brandsToSync = onlyBrand ? [onlyBrand] : TARGET_BRANDS;
for (const id of brandsToSync) {
  if (!TARGET_BRANDS.includes(id)) fail(`unknown brand: ${id} (valid: ${TARGET_BRANDS.join(", ")})`);
  await syncBrand(id, upstreamSha);
}

console.log(`\nDone. ${dryRun ? "(dry-run — no files written)" : `Synced ${brandsToSync.length} brand(s).`}`);
