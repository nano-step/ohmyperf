#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const CANONICAL = resolve(root, "apps", "website", "app", "globals.css");
const MIRRORS = [
  resolve(root, "packages", "design-tokens", "dist", "palette.css"),
  resolve(root, "packages", "viewer", "dist", "styles.js"),
  resolve(root, "packages", "reporter-deck", "dist", "styles.js"),
];

const TOKEN_REGEX = /--color-([\w-]+)\s*:\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g;

function parseOklch(source) {
  const tokens = new Map();
  for (const match of source.matchAll(TOKEN_REGEX)) {
    const [, name, l, c, h] = match;
    const key = `--color-${name}`;
    const triple = `${l} ${c} ${h}`;
    if (!tokens.has(key)) tokens.set(key, new Set());
    tokens.get(key).add(triple);
  }
  return tokens;
}

async function readIfExists(path) {
  try {
    await stat(path);
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

const canonicalSrc = await readFile(CANONICAL, "utf8");
const canonical = parseOklch(canonicalSrc);

if (canonical.size === 0) {
  console.error(`FAIL: no OKLCH tokens found in canonical source ${CANONICAL}`);
  process.exit(1);
}

const failures = [];
let mirrorsChecked = 0;

for (const mirror of MIRRORS) {
  const src = await readIfExists(mirror);
  if (src === null) {
    console.log(`SKIP (not built yet): ${mirror}`);
    continue;
  }
  const mirrorTokens = parseOklch(src);
  if (mirrorTokens.size === 0) {
    console.log(`SKIP (no design tokens — not opted in yet): ${mirror}`);
    continue;
  }
  mirrorsChecked += 1;

  for (const [name, mirrorValues] of mirrorTokens) {
    const canonicalValues = canonical.get(name);
    if (!canonicalValues) {
      failures.push(`${mirror}: ${name} not declared in canonical source`);
      continue;
    }
    for (const v of mirrorValues) {
      if (!canonicalValues.has(v)) {
        failures.push(
          `${mirror}: ${name} = oklch(${v}), expected one of: ${[...canonicalValues].map((x) => `oklch(${x})`).join(", ")}`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error("DESIGN-TOKEN DRIFT DETECTED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

const tokenCount = canonical.size;
console.log(
  `OK: ${String(tokenCount)} canonical token(s) match across ${String(mirrorsChecked)} mirror(s) (canonical: ${CANONICAL.replace(root + "/", "")})`,
);
