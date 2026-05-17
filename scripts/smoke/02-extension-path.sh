#!/usr/bin/env bash
# Smoke δ.11 — Extension path acceptance
#
# Backend-side prep only. The actual measurement step happens in Chrome
# (load unpacked → click toolbar OR drive via SPA bridge → see Report).
# Output: scripts/smoke/logs/02-extension.log

set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$ROOT/scripts/smoke/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/02-extension.log"
: > "$LOG"

step() { echo "==> $1" | tee -a "$LOG"; }
ok()   { echo "  ✅ $1" | tee -a "$LOG"; }
fail() { echo "  ❌ $1" | tee -a "$LOG"; FAILED=1; }
FAILED=0

step "δ.11 — Extension path acceptance"
echo "Date: $(date)" >> "$LOG"

step "1/3 Verify extension-dist artifacts"
DIST="$ROOT/apps/extension-chrome/extension-dist"
for f in manifest.json background.bundle.js viewer.html viewer.bundle.js; do
  if [ -f "$DIST/$f" ]; then ok "$f present"; else fail "$f missing — run: pnpm --filter @ohmyperf/extension-chrome build"; fi
done

step "2/3 Verify manifest has externally_connectable + deterministic key"
if grep -q '"externally_connectable"' "$DIST/manifest.json"; then
  ok "externally_connectable declared"
else
  fail "externally_connectable missing from manifest"
fi
if grep -q '"key"' "$DIST/manifest.json"; then
  ok "manifest 'key' field present (deterministic ID)"
else
  fail "manifest 'key' missing — extension ID will be random per Chrome profile"
fi

EXPECTED_ID=$(grep NEXT_PUBLIC_EXTENSION_ID "$ROOT/apps/website/.env.example" | cut -d= -f2)
ok "Expected extension ID (from .env.example): $EXPECTED_ID"

step "3/3 Manual browser step"
cat <<MANUAL | tee -a "$LOG"

   1. Open chrome://extensions
   2. Toggle Developer mode ON (top right)
   3. Click "Load unpacked" → select:
        $DIST
   4. Verify the loaded extension's ID matches:
        $EXPECTED_ID
      If it does NOT match → the 'key' in manifest is wrong; reach out.

   5. Now run the SPA (either keep runner running, OR stop it to force extension path):
        cd $ROOT
        pnpm --filter @ohmyperf/website build
        npx --yes serve apps/website/out -l 3000

   6. Open http://127.0.0.1:3000/measure (or landing → enter URL)
   7. WATCH FOR:
       (a) Backend detector shows "Extension" (look for badge / status)
       (b) Enter URL https://example.com → Measure
       (c) New tab opens in background, runs in Chrome
       (d) Stream of progress events lands in SPA
       (e) Report screen shows:
             Report.meta.browser.source === "extension-host"
           (open the JSON / inspect via devtools)
       (f) CWV numbers are within run-to-run variance of the runner result
       (g) F12 console: ZERO red errors on SPA AND extension service worker

   8. Compare extension Report vs runner Report (logs/01-runner.json):
        - LCP/CLS/INP within 30% (variance is normal on a real machine)
        - Frame tree shape identical (same iframe count)
        - audit IDs identical

   Paste result in chat: PASS / FAIL — note: <difference / error>

MANUAL

[ "$FAILED" = "1" ] && exit 1 || exit 0
