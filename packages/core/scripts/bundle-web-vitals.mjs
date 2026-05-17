#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const iifePath = join(root, "node_modules", "web-vitals", "dist", "web-vitals.attribution.iife.js");

const source = await readFile(iifePath, "utf8");
const gzipped = gzipSync(source);
const gzKb = gzipped.byteLength / 1024;

const HARD_LIMIT_KB = 6;
if (gzKb > HARD_LIMIT_KB) {
  console.error(
    `bundle-web-vitals: gzip size ${gzKb.toFixed(2)} KB exceeds hard limit ${HARD_LIMIT_KB} KB`,
  );
  process.exit(1);
}

const escapedSource = source
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

const out = `export const WEB_VITALS_ATTRIBUTION_SRC = \`${escapedSource}\`;
export const WEB_VITALS_ATTRIBUTION_GZ_BYTES = ${gzipped.byteLength};
export const WEB_VITALS_ATTRIBUTION_RAW_BYTES = ${Buffer.byteLength(source, "utf8")};
`;

const outPath = join(root, "src", "generated", "web-vitals-attribution.ts");
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, out, "utf8");

console.log(
  `bundle-web-vitals: wrote ${outPath} (${Buffer.byteLength(source, "utf8")} raw, ${gzipped.byteLength} gz; limit ${HARD_LIMIT_KB} KB)`,
);
