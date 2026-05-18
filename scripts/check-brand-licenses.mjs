#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const brandsDir = resolve(root, "packages/design-tokens/brands");

const SPDX_PATTERN = /SPDX-License-Identifier:\s*Apache-2\.0/;
const PROVENANCE_PATTERN = /Vendored from nexu-io\/open-design @ \S+ on \d{4}-\d{2}-\d{2}/;

async function walkCss(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkCss(p)));
    else if (e.isFile() && e.name.endsWith(".css")) out.push(p);
  }
  return out;
}

const files = await walkCss(brandsDir);
if (files.length === 0) {
  console.log("check-brand-licenses: no .css files under packages/design-tokens/brands/ (none vendored yet)");
  process.exit(0);
}

const failures = [];
let provenanceChecked = 0;

for (const path of files) {
  const rel = relative(root, path);
  const src = await readFile(path, "utf8");
  if (!SPDX_PATTERN.test(src)) failures.push(`${rel}: missing 'SPDX-License-Identifier: Apache-2.0' header`);
  if (path.endsWith("/tokens.css")) {
    provenanceChecked++;
    if (!PROVENANCE_PATTERN.test(src)) failures.push(`${rel}: missing 'Vendored from nexu-io/open-design @ <sha> on <date>' provenance line`);
  }
}

if (failures.length > 0) {
  console.error("check-brand-licenses: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`check-brand-licenses: OK (${String(files.length)} file(s), ${String(provenanceChecked)} tokens.css with provenance)`);
