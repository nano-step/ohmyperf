#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const PACKAGES = [
  { dir: "packages/core",                pkg: "@ohmyperf/core",                role: "Engine, types, plugin runtime. Reentrant. Public API frozen at 1.0.0-stable end of P0." },
  { dir: "packages/driver-playwright",   pkg: "@ohmyperf/driver-playwright",   role: "Playwright Driver implementation. Wraps newCDPSession() for Chromium-deep work.", deps: { peer: ["playwright"] } },
  { dir: "packages/driver-extension",    pkg: "@ohmyperf/driver-extension",    role: "Driver implementation backed by chrome.debugger. Used by the Chrome extension surface." },
  { dir: "packages/plugins-builtin",     pkg: "@ohmyperf/plugins-builtin",     role: "Built-in plugins: cwv, axe, lh-audits (vendored), seo, best-practices.", deps: { peer: ["@ohmyperf/core"], dev: ["axe-core", "web-vitals"] } },
  { dir: "packages/reporter-json",       pkg: "@ohmyperf/reporter-json",       role: "Canonical Report JSON reporter (the source of truth)." },
  { dir: "packages/reporter-html",       pkg: "@ohmyperf/reporter-html",       role: "Self-contained HTML reporter via Vite single-file. Embeds the React viewer." },
  { dir: "packages/reporter-markdown",   pkg: "@ohmyperf/reporter-markdown",   role: "Markdown summary reporter, PR-comment friendly." },
  { dir: "packages/reporter-junit",      pkg: "@ohmyperf/reporter-junit",      role: "JUnit XML reporter; one testcase per budget threshold." },
  { dir: "packages/reporter-csv",        pkg: "@ohmyperf/reporter-csv",        role: "CSV reporter (long format, per-metric-per-run)." },
  { dir: "packages/reporter-har",        pkg: "@ohmyperf/reporter-har",        role: "HTTP Archive (HAR) reporter with redaction applied." },
  { dir: "packages/reporter-trace",      pkg: "@ohmyperf/reporter-trace",      role: "Chrome trace .json.gz reporter (loadable in chrome://tracing)." },
  { dir: "packages/reporter-lh-compat",  pkg: "@ohmyperf/reporter-lh-compat",  role: "Lighthouse-compatible JSON reporter (lossy)." },
  { dir: "packages/viewer",              pkg: "@ohmyperf/viewer",              role: "React + Vite + Tailwind viewer. Consumes Report JSON only.", browser: true },
  { dir: "packages/share-client",        pkg: "@ohmyperf/share-client",        role: "Upload/fetch shareable reports; runs the redaction pipeline before upload." },
  { dir: "packages/share-server",        pkg: "@ohmyperf/share-server",        role: "Hono backend for shareable links. CF Workers + R2 + D1; Hono+S3+Postgres for self-host." },
  { dir: "packages/trace-utils",         pkg: "@ohmyperf/trace-utils",         role: "Vendored tracium-equivalent. MainThreadTasks parsing, function attribution." },
];

const APPS = [
  { dir: "apps/cli",              pkg: "@ohmyperf/cli",              role: "ohmyperf CLI binary (citty). Default entry point.",          bin: { "ohmyperf": "./bin/ohmyperf.mjs" } },
  { dir: "apps/website",          pkg: "@ohmyperf/website",          role: "ohmyperf.dev landing + drag-drop viewer + extension download + hosted share UI.", browser: true, private: true },
  { dir: "apps/extension-chrome", pkg: "@ohmyperf/extension-chrome", role: "MV3 Chrome extension; chrome.debugger-backed real-device runner.",                browser: true, private: true },
  { dir: "apps/ide-vscode",       pkg: "@ohmyperf/ide-vscode",       role: "VSCode extension; spawns CLI subprocess; embeds viewer in webview.",              private: true },
];

const TESTS = [
  { dir: "tests/oopif-corpus", pkg: "@ohmyperf/tests-oopif-corpus", role: "Synthetic OOPIF/iframe/SW/SPA/popup test fixtures + expectations. CI-gated.", private: true },
];

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function writeJson(file, data) {
  ensureDir(dirname(file));
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function writeText(file, content) {
  ensureDir(dirname(file));
  writeFileSync(file, content.endsWith("\n") ? content : content + "\n");
}

function makePackageJson({ pkg, role, browser = false, bin, private: isPrivate = false, deps = {} }) {
  const json = {
    name: pkg,
    version: "0.0.0-pre",
    description: role,
    license: "Apache-2.0",
    type: "module",
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
    },
    files: ["dist", "README.md", "LICENSE", "NOTICE"],
    scripts: {
      build: "tsc -b",
      typecheck: "tsc -b --noEmit",
      lint: "eslint src",
      clean: "rimraf dist .turbo *.tsbuildinfo",
    },
    devDependencies: {},
  };
  if (isPrivate) {
    json.private = true;
    delete json.files;
  }
  if (browser) {
    json.exports["."].browser = "./dist/index.js";
  }
  if (bin) {
    json.bin = bin;
  }
  if (deps.peer && deps.peer.length) {
    json.peerDependencies = Object.fromEntries(deps.peer.map((d) => [d, d.startsWith("@ohmyperf/") ? "workspace:*" : "*"]));
  }
  if (deps.dev && deps.dev.length) {
    json.devDependencies = Object.fromEntries(deps.dev.map((d) => [d, "catalog:"]));
  }
  return json;
}

function makeTsconfig({ browser = false }) {
  return {
    extends: "../../tsconfig.base.json",
    compilerOptions: {
      rootDir: "./src",
      outDir: "./dist",
      ...(browser
        ? { lib: ["ES2023", "DOM", "DOM.Iterable"], types: [] }
        : {}),
    },
    include: ["src/**/*"],
    exclude: ["dist", "node_modules"],
  };
}

function makeIndex(pkg, role) {
  return [
    `export const PACKAGE_NAME = ${JSON.stringify(pkg)} as const;`,
    `export const PACKAGE_ROLE = ${JSON.stringify(role)} as const;`,
    "",
  ].join("\n");
}

function makeReadme(pkg, role) {
  return `# ${pkg}\n\n${role}\n\nStatus: skeleton. See [\`openspec/\`](../../openspec) for the proposal that drives this package.\n`;
}

function scaffold(entry) {
  const dir = join(repoRoot, entry.dir);
  ensureDir(dir);
  ensureDir(join(dir, "src"));
  writeJson(join(dir, "package.json"), makePackageJson(entry));
  writeJson(join(dir, "tsconfig.json"), makeTsconfig({ browser: !!entry.browser }));
  if (!existsSync(join(dir, "src", "index.ts"))) {
    writeText(join(dir, "src", "index.ts"), makeIndex(entry.pkg, entry.role));
  }
  if (!existsSync(join(dir, "README.md"))) {
    writeText(join(dir, "README.md"), makeReadme(entry.pkg, entry.role));
  }
  if (entry.bin) {
    ensureDir(join(dir, "bin"));
    const binFile = join(dir, "bin", "ohmyperf.mjs");
    if (!existsSync(binFile)) {
      writeText(binFile,
`#!/usr/bin/env node
console.error("ohmyperf is not yet implemented. See openspec/changes/add-ohmyperf-mvp/.");
process.exit(2);
`);
      try {
        chmodSync(binFile, 0o755);
      } catch {
        // ignore on platforms where chmod is unsupported
      }
    }
  }
}

const all = [...PACKAGES, ...APPS, ...TESTS];
for (const entry of all) {
  scaffold(entry);
}
console.log(`Scaffolded ${all.length} workspaces.`);
