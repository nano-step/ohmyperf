#!/usr/bin/env bash
# Smoke γ.18 — Runner path acceptance
#
# Verifies: SPA detects local runner → measures URL → returns Report
# Requires: Docker (or local node), open ports 3000 + 5174
# Output:   logs in scripts/smoke/logs/01-runner.log + 01-runner.json

set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$ROOT/scripts/smoke/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/01-runner.log"
JSON="$LOG_DIR/01-runner.json"
: > "$LOG"

step() { echo "==> $1" | tee -a "$LOG"; }
ok()   { echo "  ✅ $1" | tee -a "$LOG"; }
fail() { echo "  ❌ $1" | tee -a "$LOG"; FAILED=1; }
FAILED=0

step "γ.18 — Runner path acceptance"
echo "Date: $(date)" >> "$LOG"
echo "Repo: $ROOT" >> "$LOG"

step "1/5 Pre-flight: ports + tools"
if lsof -i:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  fail "port 3000 already in use — stop the other process first"
fi
if lsof -i:5174 -sTCP:LISTEN >/dev/null 2>&1; then
  fail "port 5174 already in use — stop the other process first"
fi
command -v docker >/dev/null && ok "docker available ($(docker --version))" || fail "docker not found; install Docker Desktop or skip to 'local mode'"
command -v pnpm   >/dev/null && ok "pnpm $(pnpm --version)" || fail "pnpm not found"
command -v curl   >/dev/null && ok "curl available"            || fail "curl not found"

[ "$FAILED" = "1" ] && { echo; echo "Pre-flight FAILED. See $LOG."; exit 1; }

step "2/5 Start runner (docker compose, port 5174)"
echo "If docker compose fails, fallback: pnpm --filter @ohmyperf/runner dev" >> "$LOG"
if (cd "$ROOT" && docker compose -f apps/runner/docker-compose.yml up --build -d >> "$LOG" 2>&1); then
  ok "runner started"
else
  fail "runner docker compose failed — see $LOG"
  echo; echo "Aborting before remaining steps; fix the docker error first."
  exit 1
fi

step "   Waiting for /api/health (max 60s)"
HEALTH_OK=0
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:5174/api/health >/dev/null 2>&1; then
    ok "health passed after ${i}x2s"
    HEALTH_OK=1
    break
  fi
  sleep 2
done
if [ "$HEALTH_OK" = "0" ]; then
  fail "runner health never green"
  echo; echo "Container logs (last 40 lines):"
  (cd "$ROOT" && docker compose -f apps/runner/docker-compose.yml logs --tail=40) | tee -a "$LOG"
  exit 1
fi

curl -fsS http://127.0.0.1:5174/api/health | tee -a "$LOG" >/dev/null
echo >> "$LOG"

step "3/5 Build + start website (port 3000)"
(cd "$ROOT" && pnpm --filter @ohmyperf/website build >> "$LOG" 2>&1) \
  && ok "website build" || fail "website build failed"

cd "$ROOT/apps/website"
nohup npx --yes serve out -l 3000 >> "$LOG" 2>&1 &
WEB_PID=$!
cd "$ROOT"
echo "WEB_PID=$WEB_PID" >> "$LOG"
sleep 4

curl -fsS http://127.0.0.1:3000/ >/dev/null \
  && ok "website serving on :3000" \
  || fail "website not responding on :3000"

step "4/5 Direct runner contract (curl) — proves backend works"
JOB=$(curl -fsS -X POST http://127.0.0.1:5174/api/measure \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","runs":1}' \
  | tee -a "$LOG" | grep -oE '"jobId":"[^"]+"' | head -1 | cut -d'"' -f4 || true)
if [ -n "${JOB:-}" ]; then
  ok "job created: $JOB"
else
  fail "no jobId returned"
  exit 1
fi

step "   Polling until done (max 90s)"
STATUS=""
for i in $(seq 1 45); do
  STATUS=$(curl -fsS "http://127.0.0.1:5174/api/jobs/$JOB" 2>/dev/null | grep -oE '"status":"[^"]+"' | head -1 | cut -d'"' -f4 || true)
  echo "  poll #$i: ${STATUS:-?}" >> "$LOG"
  [ "${STATUS:-}" = "done" ]      && { ok "measurement done in ${i}x2s"; break; }
  [ "${STATUS:-}" = "error" ]     && { fail "measurement errored"; break; }
  [ "${STATUS:-}" = "cancelled" ] && { fail "measurement cancelled"; break; }
  sleep 2
done

curl -fsS "http://127.0.0.1:5174/api/jobs/$JOB" > "$JSON"
ok "report saved → $JSON"

if grep -q '"lcp"' "$JSON"; then ok "Report has CWV/lcp";  else fail "no lcp in Report"; fi
if grep -q '"frameTree"\|"frames"' "$JSON"; then ok "Report has frame tree"; else fail "no frame tree"; fi

step "5/5 Manual browser step (do this in your real Chrome)"
cat <<MANUAL | tee -a "$LOG"

   🖱️  Open http://127.0.0.1:3000  in Chrome
   →  Enter URL:  https://example.com
   →  Press "Measure"
   →  WATCH FOR:
       (a) progress bar / live events update (queued → run-start → metric → complete)
       (b) report screen with CWV cards + audits + frame tree + waterfall
       (c) F12 console: ZERO red errors
       (d) Network tab: requests go to http://127.0.0.1:5174 (runner), NOT extension

   When done, paste the result into chat:
       PASS / FAIL — note: <anything broken>

MANUAL

echo
echo "Backend smoke complete. Browser step is manual."
echo "Log: $LOG"
echo "Report JSON: $JSON"
echo
echo "When finished, tear down:"
echo "  docker compose -f apps/runner/docker-compose.yml down"
echo "  kill $WEB_PID  # website serve"

[ "$FAILED" = "1" ] && exit 1 || exit 0
