#!/usr/bin/env bash
# Smoke ε.15 + ε.16 — Final E2E + a11y test files
#
# Runs Playwright suites that need a real Chromium binary.
# Output: scripts/smoke/logs/03-e2e-*.log + Playwright HTML report

set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$ROOT/scripts/smoke/logs"
mkdir -p "$LOG_DIR"

step() { echo "==> $1"; }
ok()   { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; FAILED=1; }
FAILED=0

step "ε.15 + ε.16 — Final E2E test files"

step "1/4 Install Playwright chromium"
(cd "$ROOT" && pnpm --filter @ohmyperf/website exec playwright install chromium 2>&1) \
  | tee "$LOG_DIR/03-e2e-install.log"

step "2/4 Smoke test (tests/smoke.spec.ts)"
(cd "$ROOT" && pnpm --filter @ohmyperf/website test:smoke 2>&1) \
  | tee "$LOG_DIR/03-e2e-smoke.log"
[ "${PIPESTATUS[0]}" = "0" ] && ok "smoke passed" || fail "smoke failed — see log"

step "3/4 a11y test (tests/a11y.spec.ts)"
(cd "$ROOT" && pnpm --filter @ohmyperf/website test:a11y 2>&1) \
  | tee "$LOG_DIR/03-e2e-a11y.log"
[ "${PIPESTATUS[0]}" = "0" ] && ok "a11y passed" || fail "a11y failed — see log"

step "4/4 no-telemetry test"
(cd "$ROOT" && pnpm --filter @ohmyperf/website exec playwright test tests/no-telemetry.spec.ts 2>&1) \
  | tee "$LOG_DIR/03-e2e-no-telemetry.log"
[ "${PIPESTATUS[0]}" = "0" ] && ok "no-telemetry passed" || fail "no-telemetry failed — see log"

echo
echo "Logs in: $LOG_DIR/"
echo "Playwright HTML report: apps/website/playwright-report/index.html"
echo
[ "$FAILED" = "1" ] && { echo "FAILED — paste failing log into chat"; exit 1; }
echo "ALL GREEN — paste the last 20 lines of each log into chat to confirm."
exit 0
