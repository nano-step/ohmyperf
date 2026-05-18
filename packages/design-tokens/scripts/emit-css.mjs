#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const distPath = resolve(pkgRoot, "dist", "palette.css");

const { PALETTE_CSS } = await import(resolve(pkgRoot, "dist", "index.js"));
await writeFile(distPath, PALETTE_CSS, "utf8");
console.log(`emit-css: wrote ${PALETTE_CSS.length} bytes to ${distPath}`);
