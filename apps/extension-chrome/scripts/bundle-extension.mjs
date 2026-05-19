#!/usr/bin/env node
import { mkdir, cp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, "extension-dist");
const staticDir = join(root, "static");
const pemPath = join(root, ".dev-keys", "extension.pem");

await mkdir(out, { recursive: true });

if (existsSync(out)) {
  for (const entry of await readdir(out)) {
    if (entry.startsWith("_") && entry !== "_locales" && entry !== "_metadata") {
      await rm(join(out, entry), { recursive: true, force: true });
      console.log(`[bundle-extension] removed reserved-name leftover: ${entry}`);
    }
  }
}

await cp(join(staticDir, "viewer.html"), join(out, "viewer.html"));

const manifest = JSON.parse(await readFile(join(staticDir, "manifest.json"), "utf8"));
if (existsSync(pemPath)) {
  const pubDer = execSync(`openssl rsa -in "${pemPath}" -pubout -outform DER 2>/dev/null`);
  manifest.key = pubDer.toString("base64");
  console.log("[bundle-extension] injected dev key from .dev-keys/extension.pem");
}
await writeFile(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const esbuild = await import("esbuild").catch(() => null);
if (!esbuild) {
  await writeFile(
    join(out, "background.bundle.js"),
    "// Placeholder — install 'esbuild' to produce the real bundle.\n",
  );
  await writeFile(
    join(out, "viewer.bundle.js"),
    "// Placeholder — install 'esbuild' to produce the real bundle.\n",
  );
  console.warn(
    "[bundle-extension] esbuild not installed; wrote placeholder bundles. Run `pnpm add -D -F @ohmyperf/extension-chrome esbuild` for production bundles.",
  );
  process.exit(0);
}

const stubDir = join(root, ".build-cache", "stubs");
await mkdir(stubDir, { recursive: true });
const nodeStub = "export default {};\nexport const randomUUID = () => Math.random().toString(36).slice(2) + Date.now().toString(36);\nexport const arch = () => 'browser';\nexport const platform = () => 'browser';\nexport const release = () => '';\nexport const homedir = () => '';\nexport const hostname = () => 'extension';\nexport const totalmem = () => 0;\nexport const createHash = () => ({ update() { return this; }, digest() { return ''; } });\nexport const readFile = async () => { throw new Error('node:fs/promises not available in browser bundle'); };\nexport const writeFile = async () => undefined;\nexport const mkdir = async () => undefined;\nexport const unlink = async () => undefined;\nexport const existsSync = () => false;\nexport const join = (...p) => p.join('/');\nexport const dirname = (p) => p.split('/').slice(0, -1).join('/');\nexport const resolve = (...p) => p.join('/');\n";
await writeFile(join(stubDir, "node-stub.mjs"), nodeStub);

const common = {
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome116",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  alias: {
    "node:crypto": join(stubDir, "node-stub.mjs"),
    "node:fs": join(stubDir, "node-stub.mjs"),
    "node:fs/promises": join(stubDir, "node-stub.mjs"),
    "node:os": join(stubDir, "node-stub.mjs"),
    "node:path": join(stubDir, "node-stub.mjs"),
    "node:http": join(stubDir, "node-stub.mjs"),
    "node:net": join(stubDir, "node-stub.mjs"),
    "node:child_process": join(stubDir, "node-stub.mjs"),
    "node:module": join(stubDir, "node-stub.mjs"),
  },
};

await esbuild.build({
  ...common,
  entryPoints: [join(root, "dist/background.js")],
  outfile: join(out, "background.bundle.js"),
});

await esbuild.build({
  ...common,
  entryPoints: [join(root, "dist/viewer.js")],
  outfile: join(out, "viewer.bundle.js"),
});

console.log(`Wrote extension bundle to ${out}`);
