#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const websiteRoot = join(root, 'apps', 'website');

const budgetsJson = JSON.parse(
  await readFile(join(root, 'scripts', 'bundle-budgets.json'), 'utf8'),
);
const budgets = budgetsJson.budgets;

async function readJson(p) {
  const text = await readFile(p, 'utf8').catch(() => null);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

const manifestPath = join(websiteRoot, '.next', 'app-build-manifest.json');
const manifest = await readJson(manifestPath);

if (!manifest) {
  console.error(`Cannot find ${manifestPath}. Run 'pnpm --filter @ohmyperf/website build' first.`);
  process.exit(2);
}

async function gzipKBForChunks(chunkPaths) {
  let total = 0;
  for (const rel of chunkPaths) {
    const abs = join(websiteRoot, '.next', rel.replace(/^\/?_next\//, ''));
    const buf = await readFile(abs).catch(() => null);
    if (buf) {
      total += gzipSync(buf, { level: 9 }).length;
    }
  }
  return Math.round(total / 1024);
}

let failed = false;

for (const { route, maxGzipKB } of budgets) {
  const chunks = manifest.pages?.[route] ?? [];
  const gzKB = await gzipKBForChunks(chunks);
  const status = gzKB <= maxGzipKB ? '✅' : '❌';
  console.log(`${status} ${route.padEnd(25)} ${String(gzKB).padStart(5)} KB  (budget ${maxGzipKB} KB)`);
  if (gzKB > maxGzipKB) failed = true;
}

if (failed) {
  console.error('\nBundle budget exceeded.');
  process.exit(1);
}
console.log('\nAll budgets OK.');
