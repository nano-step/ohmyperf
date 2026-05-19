# `@ohmyperf/runner`

Local Docker self-host HTTP runner for OhMyPerf. Wraps `@ohmyperf/core` 1.0 + Playwright behind a Hono HTTP server. Powers the SPA "Local runner" path (Phase α of `add-measurement-spa`).

## Quickstart

```sh
# 1. Run via docker-compose (binds 127.0.0.1:5174 by default)
docker compose -f apps/runner/docker-compose.yml up --build

# 2. Verify health
curl http://127.0.0.1:5174/api/health
# => { "ok": true, "version": "...", "engine": "1.0.0", "browser": {...} }

# 3. Kick off a measurement
JOB=$(curl -sX POST http://127.0.0.1:5174/api/measure \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","runs":1}' | jq -r .jobId)

# 4. Stream progress (SSE)
curl -N http://127.0.0.1:5174/api/jobs/$JOB/events

# 5. Or poll
curl http://127.0.0.1:5174/api/jobs/$JOB
```

## HTTP contract (D7)

| Method | Path                       | Description                                                  |
| ------ | -------------------------- | ------------------------------------------------------------ |
| GET    | `/api/health`              | Liveness probe + version + bundled browser version.          |
| POST   | `/api/measure`             | Enqueue a measurement. Returns `202 { jobId, status }`.      |
| GET    | `/api/jobs/:id`            | Poll job state. Returns the Report once `status === "done"`. |
| GET    | `/api/jobs/:id/events`     | SSE stream of `ProgressEvent`s + 15s heartbeat comments.     |
| DELETE | `/api/jobs/:id`            | Cancel an in-flight job. Returns `204`.                      |

Event types in the SSE stream: `queued`, `run-start`, `navigation`, `metric`, `run-complete`, `complete`, `error`, `cancelled`. See `@ohmyperf/shared-types` for the discriminated union.

## Environment variables

| Variable                                | Default                                                                            | Effect                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `OHMYPERF_RUNNER_BIND`                  | `127.0.0.1`                                                                        | Bind address. Inside the container the compose file overrides to `0.0.0.0`; the host-side port mapping pins it to `127.0.0.1:5174`. |
| `OHMYPERF_RUNNER_PORT`                  | `5174`                                                                             | Listen port.                                                                                 |
| `OHMYPERF_RUNNER_CORS_ORIGINS`          | `https://ohmyperf.dev,http://localhost:3000,http://127.0.0.1:3000`                 | Comma-separated allowlist for CORS origin echo. Never `*`.                                   |
| `OHMYPERF_RUNNER_ALLOW_PRIVATE`         | `0`                                                                                | Set to `1` to bypass the SSRF guard (allows measuring private/loopback IPs).                 |
| `OHMYPERF_RUNNER_RATE_LIMIT`            | `10`                                                                               | Max POST `/api/measure` requests per IP per hour.                                            |
| `OHMYPERF_RUNNER_CONCURRENCY`           | `1`                                                                                | Concurrent jobs. v1 is serial by design (single Playwright browser at a time).               |
| `OHMYPERF_RUNNER_JOB_TTL_MS`            | `3600000` (1h)                                                                     | Time after which terminal jobs (done/error/cancelled) are evicted from memory.               |
| `OHMYPERF_RUNNER_SSE_HEARTBEAT_MS`      | `15000`                                                                            | SSE comment-frame heartbeat interval (defeats reverse-proxy / browser idle disconnects).     |
| `OHMYPERF_RUNNER_REPLAY_BUFFER`         | `50`                                                                               | Number of recent `ProgressEvent`s kept per job for late SSE subscribers to replay on connect. |
| `OHMYPERF_RUNNER_BROWSER_VERSION`       | `playwright@1.59.1`                                                                | Reported in `/api/health`. Override if you swap the Playwright base image tag.               |

## Security model

- **Bind to loopback by default.** Even when run on a public host, `docker-compose.yml` maps `127.0.0.1:5174:5174` so the runner is unreachable from LAN. Override only when you explicitly want LAN exposure.
- **CORS allowlist (echoed, never `*`).** Only the production SPA origin and localhost dev origins are accepted. Set `OHMYPERF_RUNNER_CORS_ORIGINS` for self-hosted SPA deployments.
- **Private Network Access (PNA) preflight.** Responds `Access-Control-Allow-Private-Network: true` on OPTIONS for allowlisted origins so Chrome 130+ permits `https://ohmyperf.dev` to fetch `http://127.0.0.1:5174`.
- **SSRF guard.** `POST /api/measure` rejects URLs whose hostname resolves into RFC1918, loopback, link-local, CGNAT, ULA, or cloud-metadata ranges. Override with `OHMYPERF_RUNNER_ALLOW_PRIVATE=1` only when you control the target network.
- **Rate limit.** Token bucket per `x-forwarded-for`/`x-real-ip` (10/hour default).
- **Non-root container.** Runs as `pwuser` from the Playwright base image.
- **JobId.** `crypto.randomUUID()` — unguessable so a coexisting tab cannot snoop another tab's job.

## Persistence and restart behaviour

The runner is **stateless by design.** All job state lives in memory:

- Restart wipes the queue. In-flight measurements are aborted; the SPA's SSE reconnect to `/api/jobs/:id/events` returns `404 job/not-found`.
- Terminal jobs are evicted 1h after completion.
- Rate-limit counters are per-process; restarting resets them.

If you need durable history use the CLI (`ohmyperf run`) or the SPA's IndexedDB (the SPA persists Reports on `complete`).

## Local development

```sh
pnpm install
pnpm --filter @ohmyperf/shared-types build
pnpm --filter @ohmyperf/runner build

# Production-style start
pnpm --filter @ohmyperf/runner start

# Watch mode (uses Node 22 strip-types so no tsx needed)
pnpm --filter @ohmyperf/runner dev
```

Run the test suite (no real Playwright required for these tests — the engine is mocked via dependency injection):

```sh
pnpm --filter @ohmyperf/runner test
```

To run the runner against real targets, install Playwright browsers locally:

```sh
pnpm dlx playwright install chromium
pnpm --filter @ohmyperf/runner start
```

## Known limitations (v1)

- **Per-run `metric` events are retrospective.** `runEngine` returns a finalized `Report`; the runner emits `metric`/`run-complete` events after the full batch completes. The SPA progress UI should accept that per-run CWV values appear at `run-complete` time rather than mid-run.
- **Cancellation latency.** `DELETE /api/jobs/:id` aborts at the next run boundary. A long-running single navigation can take up to `LOAD_IDLE_TIMEOUT_MS` (~30s) to unwind before the `cancelled` event is emitted.
- **No `Last-Event-ID` resume.** SSE reconnect replays the last 50 events from the in-memory buffer. Older events from a long measurement are lost on reconnect.
- **Telemetry is off, always.** No outbound calls except to the URL under measurement.
