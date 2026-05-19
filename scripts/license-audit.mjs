#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const ALLOWED = new Set([
  "Apache-2.0",
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "MPL-2.0",
  "0BSD",
  "Unlicense",
  "CC0-1.0",
  "Python-2.0",
  "BlueOak-1.0.0",
]);

const NOTICE_REQUIRED = new Set(["MPL-2.0"]);

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function normalizeLicense(field) {
  if (!field) return [];
  if (typeof field === "string") {
    return field
      .replace(/[()]/g, " ")
      .split(/\s+(?:OR|AND)\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(field)) {
    return field.flatMap((f) =>
      typeof f === "string" ? [f] : f && f.type ? [f.type] : [],
    );
  }
  if (typeof field === "object" && field.type) return [field.type];
  return [];
}

function walkPackages(root) {
  const seen = new Set();
  const found = [];
  function visit(dir) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === ".bin" || name === ".cache" || name === ".pnpm-store") continue;
      const p = join(dir, name);
      let stats;
      try {
        stats = statSync(p);
      } catch {
        continue;
      }
      if (!stats.isDirectory()) continue;
      if (name === ".pnpm" || name === "node_modules") {
        visit(p);
        continue;
      }
      if (name.startsWith("@")) {
        visit(p);
        continue;
      }
      const pkgPath = join(p, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = readJson(pkgPath);
        if (pkg && pkg.name) {
          const key = `${pkg.name}@${pkg.version}`;
          if (!seen.has(key)) {
            seen.add(key);
            found.push({ pkg, dir: p });
          }
          if (existsSync(join(p, "node_modules"))) visit(join(p, "node_modules"));
          continue;
        }
      }
    }
  }
  visit(root);
  return found;
}

function main() {
  const nodeModules = join(repoRoot, "node_modules");
  if (!existsSync(nodeModules)) {
    console.error(
      "license-audit: node_modules missing. Run `pnpm install` first.",
    );
    process.exit(2);
  }
  const packages = walkPackages(nodeModules);
  const violations = [];
  const noticeMisses = [];
  const notice = existsSync(join(repoRoot, "NOTICE"))
    ? readFileSync(join(repoRoot, "NOTICE"), "utf8")
    : "";

  for (const { pkg } of packages) {
    if (!pkg.name) continue;
    if (pkg.name.startsWith("@ohmyperf/")) continue;
    const licenses = normalizeLicense(pkg.license || pkg.licenses);
    if (licenses.length === 0) {
      violations.push({ name: pkg.name, version: pkg.version, reason: "no license declared" });
      continue;
    }
    const allOk = licenses.every((l) => ALLOWED.has(l));
    if (!allOk) {
      violations.push({
        name: pkg.name,
        version: pkg.version,
        reason: `disallowed license(s): ${licenses.join(", ")}`,
      });
      continue;
    }
    const needsNotice = licenses.some((l) => NOTICE_REQUIRED.has(l));
    if (needsNotice && !notice.includes(pkg.name)) {
      noticeMisses.push({
        name: pkg.name,
        version: pkg.version,
        license: licenses.join(" / "),
      });
    }
  }

  console.log(`license-audit: scanned ${packages.length} packages.`);

  if (violations.length) {
    console.error(`\nlicense-audit: ${violations.length} violation(s):`);
    for (const v of violations) {
      console.error(`  - ${v.name}@${v.version}: ${v.reason}`);
    }
  }
  if (noticeMisses.length) {
    console.error(
      `\nlicense-audit: ${noticeMisses.length} package(s) require NOTICE attribution but are not mentioned:`,
    );
    for (const v of noticeMisses) {
      console.error(`  - ${v.name}@${v.version} (${v.license})`);
    }
  }
  if (violations.length || noticeMisses.length) {
    process.exit(1);
  }
  console.log("license-audit: OK");
}

main();
