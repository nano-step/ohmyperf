#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import crypto from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const extRoot = dirname(here);
const repoRoot = dirname(dirname(extRoot));
const keyDir = join(extRoot, ".dev-keys");
const pemPath = join(keyDir, "extension.pem");
const websiteEnvLocal = join(repoRoot, "apps", "website", ".env.local");

await mkdir(keyDir, { recursive: true });

if (!existsSync(pemPath)) {
  execSync(`openssl genrsa -out "${pemPath}" 2048`, { stdio: "inherit" });
  console.log(`[setup-dev-extension] generated ${pemPath}`);
} else {
  console.log(`[setup-dev-extension] reusing existing ${pemPath}`);
}

const pubDer = execSync(`openssl rsa -in "${pemPath}" -pubout -outform DER 2>/dev/null`);
const sha256 = crypto.createHash("sha256").update(pubDer).digest();
const idBytes = sha256.subarray(0, 16);
let extensionId = "";
for (const byte of idBytes) {
  extensionId += String.fromCharCode("a".charCodeAt(0) + (byte >> 4));
  extensionId += String.fromCharCode("a".charCodeAt(0) + (byte & 0x0f));
}

const envLine = `NEXT_PUBLIC_EXTENSION_ID=${extensionId}\n`;
let envBody = envLine;
if (existsSync(websiteEnvLocal)) {
  const existing = await readFile(websiteEnvLocal, "utf8");
  envBody = /NEXT_PUBLIC_EXTENSION_ID=/.test(existing)
    ? existing.replace(/NEXT_PUBLIC_EXTENSION_ID=.*\n?/, envLine)
    : (existing.endsWith("\n") ? existing : existing + "\n") + envLine;
}
await writeFile(websiteEnvLocal, envBody);
console.log(`[setup-dev-extension] wrote ${websiteEnvLocal}`);

console.log(`
[setup-dev-extension] ✅ DONE

Extension ID: ${extensionId}

Next steps:
  1. Build the extension (bundle script will inject the key automatically):
       pnpm --filter @ohmyperf/extension-chrome build
  2. Open chrome://extensions
  3. Enable "Developer mode" (top-right toggle)
  4. Click "Load unpacked"
  5. Select directory: ${join(extRoot, "extension-dist")}
  6. Verify the extension ID matches: ${extensionId}
  7. Restart the SPA dev server so .env.local is picked up:
       pnpm --filter @ohmyperf/website dev
  8. Open http://localhost:3000 — backend detector should now find the extension.

The keypair at .dev-keys/extension.pem is git-ignored. Keep it stable so the
extension ID stays the same across rebuilds.

────────────────────────────────────────────────────────────────────────────
IMPORTANT — multi-developer / CI implications:
────────────────────────────────────────────────────────────────────────────

The keypair is generated locally on first run via 'openssl genrsa'. This means:

  • Each developer running this script gets a DIFFERENT extension ID.
  • CI runners that don't have the keypair will produce yet another ID
    (or no key at all → Chrome assigns a path-hash ID at load-unpacked time).
  • The SPA's NEXT_PUBLIC_EXTENSION_ID in .env.local must match the keypair's
    ID for the handshake to succeed.

Consequences:
  • test:e2e:extension passes locally for you but fails on CI / a teammate's
    machine because the IDs don't match.
  • Sharing .dev-keys/extension.pem between developers (e.g. via 1Password)
    is the recommended workaround if you need shared dev environment.

For production / CI builds, scripts/bundle-extension.mjs only injects the
manifest 'key' field WHEN .dev-keys/extension.pem exists. CI runners don't
have this directory → no key → Chrome / CWS assigns the ID at install time.
This dev-only flow exists purely to keep the unpacked-load ID stable across
rebuilds on a single machine.
────────────────────────────────────────────────────────────────────────────
`);
