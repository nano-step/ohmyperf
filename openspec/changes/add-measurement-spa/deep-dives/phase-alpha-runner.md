Task Result

Task ID: bg_486df025
Description: Phase α deep-dive: Runner backend
Duration: 6m 24s
Session ID: ses_1dfd2397cffefPTO6mMDYMZdzB

---

I'll do a deep-dive into the OhMyPerf repo to produce this code-level spec. Let me start by reading the required files in parallel.

Now let me examine the share-server Hono precedent and the core engine:

Now let me look at core engine API and CLI usage pattern:

Now I have enough on engine. Let me look at the CLI run command and driver-playwright:

Now let me check the driver-playwright structure:

Now let me check pnpm-workspace catalog, the package.json structure, and Report type:

Let me check Hono streamSSE and look at the apps/cli structure for tsconfig precedent:

Now let me check the storage.ts and workers.ts in share-server for additional patterns plus look at Hono node-server adapter:

Good, `@hono/node-server` is available. Let me check the apps/runner check (does it exist yet?) and check `ipaddr.js` availability:

Note: Playwright in lockfile is 1.59.1, not 1.49.1 as design says. Let me check Hono cors middleware:

Note: Hono cors does NOT handle PNA (`Access-Control-Allow-Private-Network`) automatically. We need a custom middleware. Now I have all I need. Let me check turbo.json:

I have enough context. Now let me produce the deliverable — the deep-dive code-level spec.

---

# Phase α — Runner Backend Code-Level Spec

**Scope**: `apps/runner/` — Hono server that exposes the HTTP contract D7 to the SPA, invokes `@ohmyperf/core.runEngine` via `@ohmyperf/driver-playwright`, and ships as a Docker image.

**Constraints applied from REVIEW.md**: C1 (DELETE /api/jobs/:id), C2 (15s SSE heartbeat), C3 (fan-out + replay buffer), R3 (no persistence, document restart loss), R7 (CSP — N/A here, applies to SPA), R9 (`crypto.randomUUID()` for jobId).

**Frozen surfaces (do not modify)**: `runEngine` signature in `packages/core/src/engine.ts:62-83`; `Report` shape in `packages/core/src/types.ts:189`; `createPlaywrightAdapter` in `packages/driver-playwright/src/engine-adapter.ts:31`.

---

## A. Directory structure (exact)

```
apps/runner/
├── package.json
├── tsconfig.json
├── Dockerfile                          # mcr.microsoft.com/playwright base (α.13)
├── Dockerfile.slim                     # node:20-slim + system chromium (α.14, NOT covered in this spec — separate task)
├── docker-compose.yml                  # single-service, 127.0.0.1:5174 (α.15)
├── README.md                           # quickstart, env, security model (α.16)
├── .dockerignore
├── vitest.config.ts
├── bin/
│   └── runner.mjs                      # `#!/usr/bin/env node` shim → import dist/server.js
└── src/
    ├── server.ts                       # entrypoint: createServer + serve (α.10)
    ├── app.ts                          # createApp(env) → Hono instance (mirrors share-server/src/app.ts)
    ├── config.ts                       # readConfig() from process.env (α.3)
    ├── ssrf-guard.ts                   # assertSafeUrl(raw) (α.4 / D8)
    ├── ssrf-guard.test.ts              # unit tests per blocked range (α.4)
    ├── queue.ts                        # JobStore + serial worker (α.5)
    ├── queue.test.ts
    ├── runner.ts                       # executeJob() — runEngine + ProgressEvent bridge (α.6 / F)
    ├── events.ts                       # EventBus: subscribe/unsubscribe/replay (C3, supports α.9)
    ├── rate-limit.ts                   # token bucket middleware (α.11)
    ├── pna.ts                          # PNA preflight middleware (D7)
    ├── errors.ts                       # ErrorCode union, errorEnvelope() helper (L)
    ├── version.ts                      # readVersion() — import package.json
    ├── routes/
    │   ├── health.ts                   # GET /api/health (α.7)
    │   ├── measure.ts                  # POST /api/measure (α.8)
    │   └── jobs.ts                     # GET /api/jobs/:id, /events, DELETE (α.9 + C1)
    └── routes/__tests__/
        ├── integration.test.ts         # α.17 — ephemeral port, real Playwright
        └── sse.test.ts                 # SSE heartbeat + replay + fan-out
```

One-line purpose mirrors share-server pattern (`app.ts` builds the Hono app, `node.ts`/`server.ts` is the runtime adapter). Separating `app.ts` from `server.ts` is essential for vitest (test `app.fetch(req)` without binding a real port).

---

## B. package.json

```json
{
  "name": "@ohmyperf/runner",
  "version": "0.0.0-pre",
  "private": true,
  "description": "Local Docker-self-host HTTP runner. Wraps @ohmyperf/core + driver-playwright behind Hono.",
  "license": "Apache-2.0",
  "type": "module",
  "main": "./dist/server.js",
  "scripts": {
    "build": "tsc -b",
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "typecheck": "tsc -b",
    "lint": "eslint src",
    "test": "vitest run --passWithNoTests",
    "clean": "rimraf dist .turbo *.tsbuildinfo"
  },
  "dependencies": {
    "@ohmyperf/core": "workspace:*",
    "@ohmyperf/driver-playwright": "workspace:*",
    "@ohmyperf/plugins-builtin": "workspace:*",
    "@hono/node-server": "^1.19.14",
    "hono": "catalog:",
    "ipaddr.js": "^1.9.1",
    "playwright": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "tsx": "^4.19.2",
    "vitest": "catalog:"
  }
}
```

**Notes**:
- `@hono/node-server` is present in node_modules already (1.19.14) — use catalog if you want to centralize; for now direct pin matches share-server's pragmatism.
- `ipaddr.js@^1.9.1` is in node_modules already; pin directly (it has no peer of `@ohmyperf/*` so catalog overkill — but you can add it to catalog later for consistency).
- `playwright` is needed because driver-playwright peer-depends on it — runner installs it directly.
- `plugins-builtin` is included so default cwv/axe plugins can run identically to CLI; the runner SHOULD apply the same default plugin set as `apps/cli/src/commands/run.ts:269` (`cwvPlugin + axePlugin + customMetricExamplePlugin`) for parity unless the request opts out.
- Catalog entry update to `pnpm-workspace.yaml` (α.12): `ipaddr.js: ^1.9.1` and `"@hono/node-server": ^1.19.14` are the only NEW entries; `hono`, `zod` already there.

### tsconfig.json

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./dist" },
  "references": [
    { "path": "../../packages/core" },
    { "path": "../../packages/driver-playwright" },
    { "path": "../../packages/plugins-builtin" }
  ],
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

---

## C. Hono server setup

### Middleware order

```
1. requestId      — generate per-request, attached to logs and error envelopes
2. securityHeaders — set X-Content-Type-Options, Referrer-Policy, X-Frame-Options (mirror share-server lines 28-32)
3. pna            — handle Access-Control-Request-Private-Network preflight BEFORE cors writes its OPTIONS response
4. cors           — Hono cors() with function-form origin echo
5. rateLimit      — only on POST /api/measure (10 jobs/hour/IP default)
6. (routes)       — body parsing happens per-route via c.req.json()
```

**Why this order**: PNA preflight requires its custom response header (`Access-Control-Allow-Private-Network: true`) AND cors needs to also reply with `Access-Control-Allow-Origin` on the same OPTIONS. The simplest correct approach is to merge PNA logic into the CORS middleware via a shared handler that reads `c.req.header('Access-Control-Request-Private-Network')` and conditionally adds the header. Below uses that approach.

### `src/app.ts` — concrete code

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { healthRoute } from "./routes/health.js";
import { measureRoute } from "./routes/measure.js";
import { jobsRoute } from "./routes/jobs.js";
import type { Config } from "./config.js";
import { JobStore } from "./queue.js";
import { errorEnvelope } from "./errors.js";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

export interface AppEnv {
  readonly config: Config;
  readonly jobs: JobStore;
}

export function createApp(env: AppEnv): Hono {
  const app = new Hono();

  // 1. Request id + security headers
  app.use("*", async (c, next) => {
    const reqId =
      c.req.header("x-request-id") ?? crypto.randomUUID();
    c.set("requestId", reqId);
    await next();
    c.header("x-request-id", reqId);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
  });

  // 2. PNA + CORS: function-form origin echo
  app.use("/api/*", cors({
    origin: (origin) =>
      env.config.corsOrigins.includes(origin) ? origin : null,
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept", "Last-Event-ID"],
    exposeHeaders: ["x-request-id"],
    maxAge: 600,
  }));

  // 3. PNA preflight: must run AFTER cors() so the Access-Control-Allow-Origin
  // header is already set. We append Access-Control-Allow-Private-Network only
  // when the browser explicitly asks for it AND origin is allowlisted.
  app.options("/api/*", async (c) => {
    const origin = c.req.header("Origin") ?? "";
    if (
      c.req.header("Access-Control-Request-Private-Network") === "true" &&
      env.config.corsOrigins.includes(origin)
    ) {
      c.header("Access-Control-Allow-Private-Network", "true");
    }
    return c.body(null, 204);
  });

  // 4. Mount routes
  app.route("/api/health", healthRoute(env));
  app.route("/api/measure", measureRoute(env));
  app.route("/api/jobs", jobsRoute(env));

  // 5. Catch-all error handler
  app.onError((err, c) => {
    const reqId = c.get("requestId") as string;
    console.error(`[${reqId}] unhandled`, err);
    return c.json(errorEnvelope("internal/error", err instanceof Error ? err.message : String(err), reqId), 500);
  });

  app.notFound((c) =>
    c.json(errorEnvelope("validation/bad-request", `route not found: ${c.req.path}`, c.get("requestId") as string), 404)
  );

  return app;
}
```

**Why `app.options("/api/*")` after `cors()`**: Hono's `cors()` middleware itself returns `204` for OPTIONS when matching the route pattern — but it does NOT add `Access-Control-Allow-Private-Network`. The explicit `app.options` handler runs AFTER cors has set the standard CORS headers (cors middleware runs `next()` then writes headers). Verify in vitest that both headers appear in the OPTIONS response.

### `src/config.ts` — bind to 127.0.0.1 + env

```ts
export interface Config {
  readonly bind: string;          // 127.0.0.1 default
  readonly port: number;          // 5174 default
  readonly corsOrigins: string[]; // ["https://ohmyperf.dev","http://localhost:3000"]
  readonly allowPrivate: boolean; // OHMYPERF_RUNNER_ALLOW_PRIVATE=1
  readonly rateLimitPerHour: number;
  readonly concurrency: number;   // 1 default
  readonly jobTtlMs: number;      // 60 * 60 * 1000 = 1h
  readonly sseHeartbeatMs: number; // 15_000
  readonly replayBufferSize: number; // 50
}

const DEFAULT_ORIGINS = [
  "https://ohmyperf.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const corsRaw = env.OHMYPERF_RUNNER_CORS_ORIGINS?.trim();
  const corsOrigins = corsRaw
    ? corsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_ORIGINS;
  return {
    bind: env.OHMYPERF_RUNNER_BIND ?? "127.0.0.1",
    port: Number(env.OHMYPERF_RUNNER_PORT ?? "5174"),
    corsOrigins,
    allowPrivate: env.OHMYPERF_RUNNER_ALLOW_PRIVATE === "1",
    rateLimitPerHour: Number(env.OHMYPERF_RUNNER_RATE_LIMIT ?? "10"),
    concurrency: Number(env.OHMYPERF_RUNNER_CONCURRENCY ?? "1"),
    jobTtlMs: Number(env.OHMYPERF_RUNNER_JOB_TTL_MS ?? String(60 * 60 * 1000)),
    sseHeartbeatMs: Number(env.OHMYPERF_RUNNER_SSE_HEARTBEAT_MS ?? "15000"),
    replayBufferSize: Number(env.OHMYPERF_RUNNER_REPLAY_BUFFER ?? "50"),
  };
}
```

### `src/server.ts` — Node entrypoint

```ts
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { JobStore } from "./queue.js";

const config = readConfig();
const jobs = new JobStore(config);
const app = createApp({ config, jobs });

serve(
  { fetch: app.fetch, port: config.port, hostname: config.bind },
  (info) => {
    // Log to stderr to keep stdout clean (matches share-server/node.ts:157)
    process.stderr.write(
      `ohmyperf runner listening on http://${info.address}:${String(info.port)}\n`,
    );
  },
);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    process.stderr.write(`ohmyperf runner: ${sig} → shutdown\n`);
    await jobs.shutdown();
    process.exit(0);
  });
}
```

---

## D. Routes — full code skeletons

### `src/routes/health.ts` (α.7)

```ts
import { Hono } from "hono";
import { SCHEMA_VERSION } from "@ohmyperf/core";
import type { AppEnv } from "../app.js";
import { readVersion } from "../version.js";

export function healthRoute(_env: AppEnv): Hono {
  const r = new Hono();
  r.get("/", (c) =>
    c.json({
      ok: true,
      version: readVersion(),         // runner package.json version
      engine: SCHEMA_VERSION,         // "1.0.0" from @ohmyperf/core
      browser: {
        source: "bundled",            // Playwright bundled chromium
        version: process.env.PLAYWRIGHT_CHROMIUM_VERSION ?? "unknown",
      },
    }),
  );
  return r;
}
```

**Note on browser version**: design.md D7 promises `{ source, version }`. Playwright's chromium version is discoverable only after `browserType.launch()` returns. Two pragmatic options:
- (a) **Lazy populate**: launch a throw-away browser at startup once and cache the version. Costs ~2s on cold start; acceptable.
- (b) **Static**: hardcode the playwright catalog version. Cheapest. Recommended for v1 — it's just informational metadata; if drift matters, swap to (a) later.

Use (b) for v1: `browser.version = "playwright@" + readPlaywrightCatalogVersion()`. Document this in README.

### `src/routes/measure.ts` (α.8)

```ts
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app.js";
import { assertSafeUrl, SsrfError } from "../ssrf-guard.js";
import { rateLimit } from "../rate-limit.js";
import { errorEnvelope, type ErrorCode } from "../errors.js";

const MeasureRequest = z.object({
  url: z.string().url(),
  runs: z.number().int().min(1).max(10).optional(),
  mode: z.enum(["real", "ci-stable"]).optional(),
  cacheMode: z.enum(["cold", "warm", "cold-then-warm"]).optional(),
  plugins: z.array(z.unknown()).optional(),     // PluginConfig[] — opaque pass-through
  headless: z.enum(["headless", "headful"]).optional(),
});
export type MeasureRequest = z.infer<typeof MeasureRequest>;

export function measureRoute(env: AppEnv): Hono {
  const r = new Hono();

  r.post("/", rateLimit(env.config), async (c) => {
    const reqId = c.get("requestId") as string;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorEnvelope("validation/bad-request", "invalid JSON body", reqId), 400);
    }
    const parsed = MeasureRequest.safeParse(body);
    if (!parsed.success) {
      return c.json(
        errorEnvelope("validation/bad-request", parsed.error.message, reqId, {
          issues: parsed.error.issues,
        }),
        400,
      );
    }
    try {
      await assertSafeUrl(parsed.data.url, env.config.allowPrivate);
    } catch (err) {
      if (err instanceof SsrfError) {
        return c.json(errorEnvelope("ssrf/blocked-range", err.message, reqId, { range: err.range }), 403);
      }
      throw err;
    }

    const jobId = crypto.randomUUID();   // R9 — unpredictable
    env.jobs.enqueue({ id: jobId, request: parsed.data, requestedBy: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon" });
    return c.json({ jobId, status: "queued" }, 202);
  });

  return r;
}
```

**Success envelope (202)**: `{ jobId: string; status: "queued" }`.

### `src/routes/jobs.ts` (α.9 + C1)

```ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppEnv } from "../app.js";
import { errorEnvelope } from "../errors.js";
import type { ProgressEvent } from "../events.js";

export function jobsRoute(env: AppEnv): Hono {
  const r = new Hono();

  // GET /api/jobs/:id — poll fallback
  r.get("/:id", (c) => {
    const reqId = c.get("requestId") as string;
    const job = env.jobs.get(c.req.param("id"));
    if (!job) return c.json(errorEnvelope("job/not-found", "job not found or expired", reqId), 404);
    return c.json({
      id: job.id,
      status: job.status,
      ...(job.report ? { report: job.report } : {}),
      ...(job.error ? { error: job.error } : {}),
    });
  });

  // GET /api/jobs/:id/events — SSE
  r.get("/:id/events", (c) => {
    const reqId = c.get("requestId") as string;
    const id = c.req.param("id");
    const job = env.jobs.get(id);
    if (!job) {
      return c.json(errorEnvelope("job/not-found", "job not found or expired", reqId), 404);
    }

    return streamSSE(c, async (stream) => {
      // Replay buffered events for late joiners (C3).
      for (const ev of job.events) {
        await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
      }
      if (job.status === "done" || job.status === "error" || job.status === "cancelled") {
        // Terminal — replay already covered final event; close.
        await stream.close();
        return;
      }

      const heartbeat = setInterval(() => {
        // Hono streamSSE has no "comment-only" writeSSE.
        // Use stream.write() to emit raw ":\n\n" comment frames (C2).
        // Fall back: send an explicit `ping` event of zero-length data.
        stream.write(":\n\n").catch(() => undefined);
      }, env.config.sseHeartbeatMs);

      const unsubscribe = env.jobs.subscribe(id, async (ev: ProgressEvent) => {
        await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
        if (ev.type === "complete" || ev.type === "error" || ev.type === "cancelled") {
          clearInterval(heartbeat);
          await stream.close();
        }
      });

      stream.onAbort(() => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    });
  });

  // DELETE /api/jobs/:id — cancel (C1)
  r.delete("/:id", async (c) => {
    const reqId = c.get("requestId") as string;
    const id = c.req.param("id");
    const ok = await env.jobs.cancel(id);
    if (!ok) return c.json(errorEnvelope("job/not-found", "job not found or already finished", reqId), 404);
    return c.body(null, 204);
  });

  return r;
}
```

**Heartbeat note**: `streamSSE`'s `SSEStreamingApi` extends `StreamingApi` (see `node_modules/.../streaming/sse.d.ts:9-12`). `StreamingApi.write()` accepts a string and writes raw bytes — this is how we emit the `:\n\n` SSE comment which clients ignore but keeps proxies from idle-timing out.

**Error codes inventory across these three routes**:
- `validation/bad-request` — 400 (zod failure, bad JSON)
- `ssrf/blocked-range` — 403 (assertSafeUrl rejected)
- `rate-limit/exceeded` — 429 (rate-limit middleware)
- `job/not-found` — 404 (unknown jobId)
- `job/cancelled` — emitted as SSE event when DELETE wins
- `navigation/*`, `internal/error` — emitted as SSE events from runner.ts

---

## E. Queue + Job lifecycle

### `src/queue.ts`

```ts
import type { Config } from "./config.js";
import type { MeasureRequest } from "./routes/measure.js";
import type { Report } from "@ohmyperf/core";
import { EventBus, type ProgressEvent } from "./events.js";
import { executeJob } from "./runner.js";

export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

export interface Job {
  readonly id: string;
  readonly request: MeasureRequest;
  readonly requestedBy: string;
  readonly createdAt: number;
  status: JobStatus;
  startedAt?: number;
  finishedAt?: number;
  report?: Report;
  error?: { code: string; message: string };
  events: ProgressEvent[];                 // replay buffer (last N + terminal)
  abortController: AbortController;
  bus: EventBus<ProgressEvent>;
}

export interface EnqueueArgs {
  id: string;
  request: MeasureRequest;
  requestedBy: string;
}

export class JobStore {
  private readonly map = new Map<string, Job>();
  private readonly queue: string[] = [];
  private busy = false;
  private evictTimer: NodeJS.Timeout;
  private shuttingDown = false;

  constructor(private readonly config: Config) {
    // Periodic TTL eviction of terminal jobs (1h default).
    this.evictTimer = setInterval(() => this.evictExpired(), 60 * 1000);
    this.evictTimer.unref?.();
  }

  enqueue(args: EnqueueArgs): Job {
    const job: Job = {
      id: args.id,
      request: args.request,
      requestedBy: args.requestedBy,
      createdAt: Date.now(),
      status: "queued",
      events: [],
      abortController: new AbortController(),
      bus: new EventBus<ProgressEvent>(this.config.replayBufferSize),
    };
    this.map.set(args.id, job);
    this.queue.push(args.id);
    // Emit queued event immediately so late SSE subscribers see it (C3).
    this.publish(job, { type: "queued", jobId: job.id, t: Date.now() });
    void this.drain();
    return job;
  }

  get(id: string): Job | undefined {
    return this.map.get(id);
  }

  subscribe(id: string, onEvent: (ev: ProgressEvent) => void | Promise<void>): () => void {
    const job = this.map.get(id);
    if (!job) return () => undefined;
    return job.bus.subscribe(onEvent);
  }

  async cancel(id: string): Promise<boolean> {
    const job = this.map.get(id);
    if (!job) return false;
    if (job.status === "done" || job.status === "error" || job.status === "cancelled") {
      return false;
    }
    job.abortController.abort();
    if (job.status === "queued") {
      // Not yet started — remove from queue and emit terminal event.
      const idx = this.queue.indexOf(id);
      if (idx >= 0) this.queue.splice(idx, 1);
      job.status = "cancelled";
      job.finishedAt = Date.now();
      this.publish(job, { type: "cancelled", jobId: id, code: "job/cancelled", t: Date.now() });
    }
    // If running, executeJob() will observe abortController.signal and emit
    // its own terminal cancelled event when it unwinds.
    return true;
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    clearInterval(this.evictTimer);
    for (const job of this.map.values()) {
      if (job.status === "queued" || job.status === "running") {
        job.abortController.abort();
      }
    }
    // Allow up to 5s for in-flight drain.
    const deadline = Date.now() + 5000;
    while (this.busy && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /** Concurrency=1 default via single boolean lock. */
  private async drain(): Promise<void> {
    if (this.busy || this.shuttingDown) return;
    const nextId = this.queue.shift();
    if (!nextId) return;
    const job = this.map.get(nextId);
    if (!job) return void this.drain();
    if (job.status === "cancelled") return void this.drain();

    this.busy = true;
    job.status = "running";
    job.startedAt = Date.now();
    this.publish(job, { type: "run-start", jobId: job.id, runIndex: 0, totalRuns: job.request.runs ?? 5, t: Date.now() });

    try {
      const report = await executeJob(job, (ev) => this.publish(job, ev));
      if (job.abortController.signal.aborted) {
        job.status = "cancelled";
        this.publish(job, { type: "cancelled", jobId: job.id, code: "job/cancelled", t: Date.now() });
      } else {
        job.status = "done";
        job.report = report;
        this.publish(job, { type: "complete", jobId: job.id, report, t: Date.now() });
      }
    } catch (err) {
      const errInfo = classifyError(err);
      job.status = "error";
      job.error = errInfo;
      this.publish(job, { type: "error", jobId: job.id, code: errInfo.code, message: errInfo.message, t: Date.now() });
    } finally {
      job.finishedAt = Date.now();
      job.bus.close();
      this.busy = false;
      void this.drain();
    }
  }

  private publish(job: Job, ev: ProgressEvent): void {
    job.events.push(ev);
    if (job.events.length > this.config.replayBufferSize + 10) {
      // Trim while preserving terminal event if already pushed.
      job.events.splice(0, job.events.length - this.config.replayBufferSize);
    }
    job.bus.emit(ev);
  }

  private evictExpired(): void {
    const cutoff = Date.now() - this.config.jobTtlMs;
    for (const [id, job] of this.map) {
      const terminal = job.status === "done" || job.status === "error" || job.status === "cancelled";
      if (terminal && (job.finishedAt ?? job.createdAt) < cutoff) {
        this.map.delete(id);
      }
    }
  }
}

function classifyError(err: unknown): { code: import("./errors.js").ErrorCode; message: string } {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes("timeout")) return { code: "navigation/timeout", message: String(err instanceof Error ? err.message : err) };
  if (msg.includes("cert") || msg.includes("ssl")) return { code: "navigation/cert-error", message: String(err instanceof Error ? err.message : err) };
  if (msg.includes("net::") || msg.includes("dns")) return { code: "navigation/network", message: String(err instanceof Error ? err.message : err) };
  return { code: "internal/error", message: err instanceof Error ? err.message : String(err) };
}
```

### `src/events.ts` — EventBus (C3 fan-out + replay)

```ts
export type ProgressEvent =
  | { type: "queued"; jobId: string; t: number }
  | { type: "run-start"; jobId: string; runIndex: number; totalRuns: number; t: number }
  | { type: "navigation"; jobId: string; runIndex: number; phase: "started" | "committed" | "loaded" | "idle"; t: number }
  | { type: "metric"; jobId: string; runIndex: number; name: string; value: number; t: number }
  | { type: "run-complete"; jobId: string; runIndex: number; t: number }
  | { type: "complete"; jobId: string; report: import("@ohmyperf/core").Report; t: number }
  | { type: "error"; jobId: string; code: string; message: string; t: number }
  | { type: "cancelled"; jobId: string; code: "job/cancelled"; t: number };

export class EventBus<T> {
  private readonly subs = new Set<(ev: T) => void | Promise<void>>();
  private closed = false;
  constructor(private readonly _replaySize: number) {}

  subscribe(fn: (ev: T) => void | Promise<void>): () => void {
    if (this.closed) return () => undefined;
    this.subs.add(fn);
    return () => { this.subs.delete(fn); };
  }

  emit(ev: T): void {
    for (const fn of this.subs) {
      try { void fn(ev); } catch { /* subscriber errors are non-fatal */ }
    }
  }

  close(): void {
    this.closed = true;
    this.subs.clear();
  }
}
```

**State transitions**: `queued → running → (done|error|cancelled)`. Only `queued → cancelled` is direct (cancel-before-start); all other terminals go through `running`. Enforced by the single `drain()` worker.

**Concurrency=1**: single `busy` boolean lock. If `config.concurrency > 1` is needed later, replace with a worker pool that pulls from `this.queue` — but design.md doesn't require it. **Keep it simple.**

**TTL eviction**: 1h after `finishedAt` (config-driven). Runs every 60s via `setInterval` (unref'd so it doesn't block exit). Terminal-only — running jobs are never evicted.

---

## F. Engine adapter — `src/runner.ts`

**Critical reality check**: I read `packages/core/src/engine.ts:83-295`. The `runEngine` function is a **single async call that returns a Report**. There are NO progress callbacks — collectors are installed per-run inside the engine and emit metrics ONLY at finalize. The only public hook for progress is `Logger.info(msg, fields)` calls (e.g., line 120: `"engine: starting run"`).

This means: **we cannot get fine-grained `metric` events from `runEngine` without modifying core** (which is frozen). Three options:

| Option | Fidelity | Effort | Frozen? |
|--------|---------|--------|---------|
| (1) Wrap `Logger` and parse known log strings into ProgressEvents | Medium | Quick | ✅ yes |
| (2) Add an optional `onProgress` callback to `EngineRunOptions` | High | Medium + spec change | ❌ requires core mod |
| (3) Loop runs in runner.ts: call `runEngine` once per run with `runs:1`, emit between-run events | High for run-level, none for metric-level | Short | ✅ yes |

**Recommendation: (1) + (3) hybrid**:
- For coarse events (`queued`, `run-start`, `run-complete`, `complete`, `error`): drive them from the runner via option (3) — call `runEngine` per run.
- For navigation/metric phase events: tap the engine logger (option 1) and forward `engine: starting run`, `engine: load-idle wait timed out`, etc., as navigation phase events. CWV/metric values are NOT extractable mid-stream — they only exist post-aggregation. SPA's progress UI must accept that per-run metrics arrive at `run-complete` not `metric`.

This means **D7 should be revised**: drop the `metric` event from the contract OR emit it only at `run-complete` time by walking the per-run report. Note this in M (open questions).

### `src/runner.ts`

```ts
import {
  runEngine,
  type Logger,
  type Report,
} from "@ohmyperf/core";
import { createPlaywrightAdapter } from "@ohmyperf/driver-playwright";
import { cwvPlugin, axePlugin } from "@ohmyperf/plugins-builtin";
import type { Job } from "./queue.js";
import type { ProgressEvent } from "./events.js";

export async function executeJob(
  job: Job,
  emit: (ev: ProgressEvent) => void,
): Promise<Report> {
  const { url, runs = 5, mode = "real", headless = "headless" } = job.request;

  // Build a logger that taps key engine messages and re-emits them as ProgressEvents.
  const taps: Array<{ match: RegExp; toEvent: (fields: unknown, runIdx: number) => ProgressEvent | null }> = [
    {
      match: /^engine: starting run/,
      toEvent: (_f, runIdx) => ({
        type: "navigation", jobId: job.id, runIndex: runIdx, phase: "started", t: Date.now(),
      }),
    },
    {
      match: /^engine: load-idle wait timed out/,
      toEvent: (_f, runIdx) => ({
        type: "navigation", jobId: job.id, runIndex: runIdx, phase: "idle", t: Date.now(),
      }),
    },
  ];

  let currentRunIndex = 0;
  const tappedLogger: Logger = {
    debug() { /* drop */ },
    info(message, fields) {
      if (typeof message !== "string") return;
      // Heuristic: extract runIndex from structured fields when present.
      const ri = (fields as { runIndex?: number } | undefined)?.runIndex;
      if (typeof ri === "number") currentRunIndex = ri;
      for (const t of taps) {
        if (t.match.test(message)) {
          const ev = t.toEvent(fields, currentRunIndex);
          if (ev) emit(ev);
          break;
        }
      }
    },
    warn() { /* drop or log to stderr */ },
    error() { /* drop or log to stderr */ },
  };

  const { driver, adapter } = createPlaywrightAdapter({
    url,
    kind: "chromium",
    headless,
    logger: tappedLogger,
  });

  // Abort signal: wrap adapter.launchPageWithCdp to throw if signal aborted between runs.
  // The engine itself does not consume AbortSignal; we enforce at the run-boundary.
  const wrappedAdapter = {
    async launchPageWithCdp() {
      if (job.abortController.signal.aborted) {
        throw new Error("job/cancelled");
      }
      return adapter.launchPageWithCdp();
    },
  };

  // NOTE: matches apps/cli/src/commands/run.ts:174-185 exactly.
  const report = await runEngine({
    opts: {
      url,
      runs,
      mode,
      headless,
      plugins: [cwvPlugin(), axePlugin()],
    },
    driver,
    adapter: wrappedAdapter,
    logger: tappedLogger,
  });

  // Walk runs[] to emit retrospective per-run events (best-effort UX).
  for (const r of report.runs) {
    emit({ type: "run-complete", jobId: job.id, runIndex: r.runIndex, t: Date.now() });
    for (const [name, m] of Object.entries(r.metrics)) {
      emit({ type: "metric", jobId: job.id, runIndex: r.runIndex, name, value: m.value, t: Date.now() });
    }
  }
  return report;
}
```

**Caveats** (call these out in M):
- Per-run UI updates won't appear during a 5-run measurement — only after the whole batch finishes. Acceptable for v1 (single-run is the dominant landing flow per D4); CLI users on `runs=5` accept the wait already.
- A v1.5 improvement: split into N sequential `runEngine` calls with `runs:1` each, aggregating client-side. But that breaks the cold/warm cacheMode semantics of D3 (`cold-then-warm`), which depends on the engine's own per-run cache handling.

**Cancellation**: Playwright respects context close. The `wrappedAdapter` checks the abort signal at each run boundary. For mid-run abort (e.g., during a 30s `waitForLoadState`), the engine's own browser close in the `finally` block of `engine.ts:249-257` will unstick the awaited promise — but only after the current run's navigation completes or times out. **True mid-run cancellation** would require closing the Playwright browser from outside. Provide a `closeBrowser()` callback on the wrappedAdapter that's invoked on abort:

```ts
job.abortController.signal.addEventListener("abort", () => {
  // adapter's underlying browser is captured in driver-playwright/src/engine-adapter.ts:73-82.
  // We don't have a direct handle; the most reliable cancel is to set a flag and
  // let the next run-boundary throw. Add a TODO to expose browser handle.
});
```

For v1, accept that cancel waits up to ~30s for the current run to time out. Document in README.

---

## G. SSRF guard exact code — `src/ssrf-guard.ts`

```ts
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

const BLOCKED_RANGES: ReadonlyArray<readonly [string, number, "ipv4" | "ipv6"]> = [
  ["10.0.0.0", 8, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["127.0.0.0", 8, "ipv4"],
  ["169.254.0.0", 16, "ipv4"],            // link-local + cloud metadata 169.254.169.254
  ["0.0.0.0", 8, "ipv4"],                 // RFC1122 "this network"
  ["100.64.0.0", 10, "ipv4"],             // RFC6598 CGNAT
  ["::1", 128, "ipv6"],
  ["fc00::", 7, "ipv6"],                  // unique local
  ["fe80::", 10, "ipv6"],                 // link-local
  ["::ffff:0:0", 96, "ipv6"],             // IPv4-mapped (defense in depth)
];

const BLOCKED_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.googleapis.com",
  "169.254.169.254",                      // AWS / Azure IMDS literal
  "fd00:ec2::254",                        // AWS IPv6 IMDS
]);

export class SsrfError extends Error {
  constructor(message: string, readonly range: string) {
    super(message);
    this.name = "SsrfError";
  }
}

export async function assertSafeUrl(raw: string, allowPrivate: boolean): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SsrfError(`Invalid URL: ${raw}`, "invalid-url");
  }
  if (!["http:", "https:"].includes(u.protocol)) {
    throw new SsrfError(`Only http/https supported (got ${u.protocol})`, "bad-protocol");
  }
  const hostname = u.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new SsrfError(`Blocked host: ${hostname}`, hostname);
  }
  if (allowPrivate) return;

  // Resolve. Use 'all: false' (single) — engine will resolve again under the hood
  // but the worst case is TOCTOU which is mitigated by docker network isolation.
  let address: string;
  try {
    const r = await lookup(hostname);
    address = r.address;
  } catch (err) {
    throw new SsrfError(`DNS resolution failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`, "dns-failure");
  }

  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(address);
  } catch {
    throw new SsrfError(`Cannot parse resolved address: ${address}`, "parse-failure");
  }

  for (const [net, bits, family] of BLOCKED_RANGES) {
    if (family !== addr.kind()) continue;
    const range = ipaddr.parse(net);
    // ipaddr.js: a.match(b, bits) — type-narrow per family.
    const matched =
      family === "ipv4"
        ? (addr as ipaddr.IPv4).match(range as ipaddr.IPv4, bits)
        : (addr as ipaddr.IPv6).match(range as ipaddr.IPv6, bits);
    if (matched) {
      throw new SsrfError(
        `Refusing to measure ${address} in blocked range ${net}/${String(bits)} ` +
        `(set OHMYPERF_RUNNER_ALLOW_PRIVATE=1 to override)`,
        `${net}/${String(bits)}`,
      );
    }
  }
}
```

### Test cases — `src/ssrf-guard.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import * as dns from "node:dns/promises";
import { assertSafeUrl, SsrfError } from "./ssrf-guard.js";

describe("assertSafeUrl", () => {
  it("rejects non-http(s) protocol", async () => {
    await expect(assertSafeUrl("file:///etc/passwd", false)).rejects.toThrow(SsrfError);
    await expect(assertSafeUrl("gopher://x", false)).rejects.toThrow(/protocol/);
  });

  it("rejects localhost by host blocklist before DNS", async () => {
    await expect(assertSafeUrl("http://localhost/", false)).rejects.toThrow(/Blocked host: localhost/);
  });

  it("rejects metadata.google.internal", async () => {
    await expect(assertSafeUrl("http://metadata.google.internal/x", false)).rejects.toThrow(/Blocked host/);
  });

  it("rejects AWS IMDS literal 169.254.169.254", async () => {
    await expect(assertSafeUrl("http://169.254.169.254/", false)).rejects.toThrow(/Blocked host: 169.254.169.254/);
  });

  it.each([
    ["http://example.test/", "10.1.2.3"],
    ["http://example.test/", "172.20.0.1"],
    ["http://example.test/", "192.168.1.1"],
    ["http://example.test/", "127.0.0.5"],
    ["http://example.test/", "169.254.42.1"],
  ])("rejects DNS to %s → %s", async (url, ip) => {
    vi.spyOn(dns, "lookup").mockResolvedValueOnce({ address: ip, family: 4 } as never);
    await expect(assertSafeUrl(url, false)).rejects.toThrow(SsrfError);
  });

  it("rejects IPv6 loopback ::1", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValueOnce({ address: "::1", family: 6 } as never);
    await expect(assertSafeUrl("http://example.test/", false)).rejects.toThrow(/blocked range/);
  });

  it("rejects IPv6 fc00::/7 unique-local", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValueOnce({ address: "fd12:3456::1", family: 6 } as never);
    await expect(assertSafeUrl("http://example.test/", false)).rejects.toThrow(/blocked range/);
  });

  it("rejects IPv4-mapped IPv6 ::ffff:127.0.0.1", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValueOnce({ address: "::ffff:127.0.0.1", family: 6 } as never);
    await expect(assertSafeUrl("http://example.test/", false)).rejects.toThrow(/blocked range/);
  });

  it("allows public IPv4", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValueOnce({ address: "93.184.216.34", family: 4 } as never);
    await expect(assertSafeUrl("https://example.com/", false)).resolves.toBeUndefined();
  });

  it("bypasses all checks when allowPrivate=true", async () => {
    await expect(assertSafeUrl("http://10.0.0.1/", true)).resolves.toBeUndefined();
    // Even localhost still blocked by host check
    await expect(assertSafeUrl("http://localhost/", true)).rejects.toThrow();
  });

  it("error.range carries the matched CIDR", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValueOnce({ address: "192.168.1.5", family: 4 } as never);
    try {
      await assertSafeUrl("http://x.test/", false);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(SsrfError);
      expect((e as SsrfError).range).toBe("192.168.0.0/16");
    }
  });
});
```

---

## H. SSE implementation in Hono

Already covered structurally in route code (D). Two points worth emphasizing:

**Headers**: `streamSSE` automatically sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `Transfer-Encoding: chunked`. No manual header setting needed — verify in integration test.

**Heartbeat** (C2): Use `stream.write(":\n\n")` (raw write, not `writeSSE`). SSE spec: lines starting with `:` are comments and ignored by EventSource. Interval = 15s default (config). Critical for browsers with PNA + proxies; cloud reverse-proxies typically idle-kill at 30-60s.

**Replay buffer** (C3): `job.events: ProgressEvent[]` is the buffer. Cap at `config.replayBufferSize` (50). On new SSE subscriber, replay ALL buffered events before subscribing to the live bus. If a terminal event (`complete`/`error`/`cancelled`) is in the buffer, close the stream immediately after replay — no live subscription needed.

**Fan-out** (C3): `EventBus.subscribe` adds to a `Set<callback>`; multiple SSE clients each register; `emit()` iterates the set. Subscriber errors are swallowed (a slow client must not block the worker).

**Cleanup on disconnect**: Hono's `stream.onAbort` fires when the underlying connection closes (client navigated away, network lost). It must clear the heartbeat interval AND call the unsubscribe returned from `bus.subscribe`. Without this, you leak intervals and closures per disconnect.

**Last-Event-ID resumption** (not in scope for v1): If you want robust resume across reconnects, write each event's `id` field with a monotonic counter, and on reconnect read `Last-Event-ID` header to skip already-delivered events. Out of scope for Phase α; add as a v1.5 enhancement note.

---

## I. Dockerfile (multi-stage)

```dockerfile
# syntax=docker/dockerfile:1.7

# ---- Build stage ----
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate

WORKDIR /repo

# Copy monorepo manifests for cache-friendly install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/runner/package.json apps/runner/
COPY packages/core/package.json packages/core/
COPY packages/driver-playwright/package.json packages/driver-playwright/
COPY packages/plugins-builtin/package.json packages/plugins-builtin/
# Add any other workspace packages the runner transitively needs (collectors).
COPY packages/ packages/
COPY apps/runner/ apps/runner/

# Skip Playwright browser download in build stage — the runtime image has them.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile --filter @ohmyperf/runner...

# Build the runner + its workspace deps.
RUN pnpm --filter @ohmyperf/runner... build

# Prune to production-only dependency tree.
RUN pnpm --filter @ohmyperf/runner deploy --prod /out

# ---- Runtime stage ----
FROM mcr.microsoft.com/playwright:v1.49.1-jammy AS runtime
# Playwright image ships Node 22 + bundled chromium + xvfb + fonts.

ENV NODE_ENV=production \
    OHMYPERF_RUNNER_BIND=0.0.0.0 \
    OHMYPERF_RUNNER_PORT=5174 \
    OHMYPERF_RUNNER_ALLOW_PRIVATE=0

# Non-root user (Playwright image already has 'pwuser' uid 1000).
USER pwuser
WORKDIR /home/pwuser/app

COPY --from=build --chown=pwuser:pwuser /out ./

EXPOSE 5174
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5174/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
```

**Pin choice**: Use the playwright catalog version as the runtime image tag. If `pnpm-workspace.yaml` says `playwright: ^1.49.1` but the lockfile resolved 1.59.1, **pin the docker tag to match the lockfile-resolved version** (`v1.59.1-jammy`). Otherwise the bundled chromium in the image will mismatch the playwright client API in dist — chromium protocol differences cause silent failures. Add a CI check: parse pnpm-lock.yaml for the resolved playwright version, fail if Dockerfile FROM tag drifts.

**Inside Docker the bind MUST be `0.0.0.0`** so the host port mapping works. Security is preserved by docker-compose binding to `127.0.0.1:5174` on the host side (see J).

---

## J. docker-compose.yml

```yaml
services:
  runner:
    build:
      context: ../..                  # monorepo root
      dockerfile: apps/runner/Dockerfile
    image: ohmyperf-runner:dev
    container_name: ohmyperf-runner
    restart: unless-stopped
    init: true                         # PID 1 reaping for browser processes
    ports:
      - "127.0.0.1:5174:5174"          # host-side bind to loopback only
    environment:
      OHMYPERF_RUNNER_BIND: "0.0.0.0"
      OHMYPERF_RUNNER_PORT: "5174"
      OHMYPERF_RUNNER_CORS_ORIGINS: "https://ohmyperf.dev,http://localhost:3000,http://127.0.0.1:3000"
      OHMYPERF_RUNNER_ALLOW_PRIVATE: "0"
      OHMYPERF_RUNNER_RATE_LIMIT: "10"
      OHMYPERF_RUNNER_CONCURRENCY: "1"
    # Optional: persistent browser cache to speed warm starts.
    # volumes:
    #   - ohmyperf-browser-cache:/home/pwuser/.cache
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:5174/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s

# volumes:
#   ohmyperf-browser-cache:
```

**Port mapping `127.0.0.1:5174:5174`**: critical — host-side bind to loopback prevents LAN exposure regardless of container's `OHMYPERF_RUNNER_BIND`. README must document overriding for explicit LAN use.

**`init: true`**: Playwright spawns chromium subprocess; without init you get zombie processes on cancel/timeout. The Playwright base image's documentation recommends this.

---

## K. Vitest integration test plan

**Strategy**:
- **Real Playwright, real network for a fixture site**: spin up a local static `http://127.0.0.1:<ephemeral>/` server in `beforeAll` that serves a known-good HTML file with deterministic LCP/CLS. Set `OHMYPERF_RUNNER_ALLOW_PRIVATE=1` in test env so SSRF guard allows 127.0.0.1.
- **Server lifecycle**: import `createApp` directly and call `app.fetch(req)` against `new Request("http://test/...")`. NO `serve()` for unit-level tests. For SSE end-to-end, use `@hono/node-server` with port `0` (ephemeral) and a real fetch client.
- **Why this is preferred over fully mocking Playwright**: the value of the runner IS its integration with the engine. Mocking the engine just tests Hono plumbing, which is already tested in share-server.

### Test cases (8)

```ts
// src/routes/__tests__/integration.test.ts (outline only — code is straightforward)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve } from "@hono/node-server";
import { createApp } from "../../app.js";
import { readConfig } from "../../config.js";
import { JobStore } from "../../queue.js";
import { createStaticFixtureServer } from "./_fixtures.js";

let fixtureUrl: string;
let runnerUrl: string;
let close: () => Promise<void>;

beforeAll(async () => {
  process.env.OHMYPERF_RUNNER_ALLOW_PRIVATE = "1";
  fixtureUrl = await createStaticFixtureServer(); // returns http://127.0.0.1:<ephem>/
  const config = readConfig();
  const app = createApp({ config, jobs: new JobStore(config) });
  const srv = serve({ fetch: app.fetch, port: 0 });
  runnerUrl = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  close = () => new Promise((r) => srv.close(() => r()));
});

afterAll(() => close());

describe("runner integration", () => {
  it("K1. GET /api/health returns ok within 100ms warm", async () => {
    const r = await fetch(`${runnerUrl}/api/health`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(body.engine).toBe("1.0.0");
  });

  it("K2. POST /api/measure → 202 + jobId, GET /api/jobs/:id eventually 'done' with valid Report", async () => {
    const r = await fetch(`${runnerUrl}/api/measure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: fixtureUrl, runs: 1 }),
    });
    expect(r.status).toBe(202);
    const { jobId } = await r.json();
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/); // UUID v4
    // Poll until done (cap 60s).
    let final;
    for (let i = 0; i < 60; i++) {
      const j = await (await fetch(`${runnerUrl}/api/jobs/${jobId}`)).json();
      if (j.status === "done") { final = j; break; }
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(final?.report?.schemaVersion).toBe("1.0.0");
    expect(final?.report?.runs.length).toBe(1);
  });

  it("K3. POST /api/measure with private URL → 403 ssrf/blocked-range when ALLOW_PRIVATE=0", async () => {
    // Run isolated: clone app with allowPrivate=false.
    // ... (assert response.status === 403, body.error.code === "ssrf/blocked-range")
  });

  it("K4. POST /api/measure with bad JSON → 400 validation/bad-request", async () => { /* ... */ });

  it("K5. SSE stream replays buffered events on late subscribe", async () => {
    // 1. POST measure
    // 2. Wait 1s so 'queued' + 'run-start' are buffered
    // 3. Open EventSource (use 'eventsource' npm or manual fetch+ReadableStream)
    // 4. Assert first event received is 'queued' (replay), then 'run-start', then live events
  });

  it("K6. SSE heartbeat fires every ~heartbeatMs", async () => {
    // Override config: heartbeatMs=200 for fast test
    // Open SSE; read raw text; assert ":\n\n" appears at >=2 intervals
  });

  it("K7. Two concurrent SSE subscribers receive identical events (fan-out)", async () => {
    // POST measure; open two EventSources simultaneously; collect events from each;
    // assert sequence equality (modulo timing).
  });

  it("K8. DELETE /api/jobs/:id cancels in-flight + emits cancelled event", async () => {
    // POST measure with runs:5; subscribe SSE; after run-start, DELETE the job;
    // expect 204; expect SSE stream to receive { type: 'cancelled', code: 'job/cancelled' }
    // and close.
  });

  it("K9. Rate limit: 10 POST /api/measure from same IP returns 429 on the 11th", async () => { /* ... */ });

  it("K10. CORS preflight with allowlisted Origin + Access-Control-Request-Private-Network → 204 with both ACAO and ACAPN headers", async () => {
    const r = await fetch(`${runnerUrl}/api/measure`, {
      method: "OPTIONS",
      headers: {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Private-Network": "true",
      },
    });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(r.headers.get("access-control-allow-private-network")).toBe("true");
  });
});
```

**Asserting SSE content**: use `eventsource` npm (peer-dep-free) OR manually parse the response body via `fetch().then(r => r.body.getReader())` and split on `\n\n`. The latter avoids an extra dependency; recommended.

**Report shape assertion**: import the `Report` type and structurally check `{ schemaVersion: "1.0.0", meta: { url }, runs: [...], aggregated: {...}, frames: {...} }`. Don't try to assert metric values (variance defeats determinism); only assert presence of expected keys.

---

## L. Error envelope schema — `src/errors.ts`

```ts
export type ErrorCode =
  | "ssrf/blocked-range"
  | "ssrf/dns-failure"
  | "navigation/timeout"
  | "navigation/cert-error"
  | "navigation/csp-blocked"
  | "navigation/network"
  | "job/not-found"
  | "job/cancelled"
  | "rate-limit/exceeded"
  | "validation/bad-request"
  | "internal/error";

export interface ErrorEnvelope {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly requestId: string;
    readonly details?: Record<string, unknown>;
  };
}

export function errorEnvelope(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      requestId,
      ...(details ? { details } : {}),
    },
  };
}
```

**HTTP status mapping**:

| code | status |
|---|---|
| `validation/bad-request` | 400 |
| `ssrf/blocked-range` | 403 |
| `ssrf/dns-failure` | 403 (treat unresolvable as blocked) |
| `job/not-found` | 404 |
| `rate-limit/exceeded` | 429 |
| `navigation/*` | emitted as SSE event only; HTTP returns 202 then SSE error |
| `internal/error` | 500 |

**SSE error events** use the same `{ code, message }` shape but without the `requestId` (the SSE `id:` field carries that role per event).

---

## M. Open questions / risks for implementer

1. **Per-run metric streaming is fake** (F). `runEngine` returns a finalized `Report`; the runner emits `metric` events retrospectively after `complete`. SPA UX promised "each completed run SHALL display its CWV values immediately" (spec.md scenario "Multi-run measurement progress"). **Either** (a) revise spec to clarify metrics are available at `run-complete` only, **or** (b) restructure runner.ts to invoke `runEngine` once per run with `runs: 1` and aggregate runner-side. Option (b) breaks `cold-then-warm` cacheMode semantics. **Recommend (a)** — update spec to drop the mid-run `metric` claim; emit a single `metric` batch alongside each `run-complete`. **Decision needed before α.6.**

2. **Mid-run cancellation latency**. Cancel waits up to ~30s for the current `runEngine` iteration to time out (F). For 1-run measurements this is bearable; for `runs=5` the user sees a long pause after clicking cancel. Mitigation: expose the underlying Playwright `Browser` handle from `createPlaywrightAdapter` so the runner can `browser.close()` on abort. Requires a Quick(<1h) change to `driver-playwright`. Not strictly Phase α scope but pragmatic.

3. **Browser version reporting** in `/api/health` (D). Lazy-launch-then-cache vs static-from-catalog. Recommended static for v1. Confirm with SPA team that "playwright@1.49.1" is acceptable as `browser.version`.

4. **Playwright version drift**: `pnpm-workspace.yaml` says `^1.49.1`, lockfile resolved `1.59.1`, Dockerfile mentioned `v1.49.1-jammy` in design. Pick one and pin everywhere. Add a CI script that parses pnpm-lock and asserts Dockerfile FROM matches.

5. **`Last-Event-ID` reconnection**: not implemented in v1. Spec scenario "SPA reloads mid-measurement, SSE reconnects, sees current progress" is satisfied by the replay buffer (50 events), but a >50-event measurement plus a reload would lose early events. Acceptable for v1; document.

6. **Rate-limit storage is per-process**. A restart wipes counters — same caveat as R3 (job loss). OK for self-host; document.

7. **`stream.write(":\n\n")` vs `writeSSE`**: Hono's `streamSSE` types don't expose a "comment-only" frame. The `StreamingApi.write()` method on the parent class accepts raw strings. Verify at runtime that the comment frame is delivered as-is (no buffering, no enrichment by Hono). If not, drop down to manual `ReadableStream` construction.

8. **Engine logger heuristics are fragile** (F). Parsing `"engine: starting run"` log lines is implicit coupling. If `packages/core/src/engine.ts:120` changes the log string, runner navigation events silently disappear. Add a vitest assertion against the literal log strings; or accept that and prioritize core's exposing structured progress hooks in v1.5.

9. **Plugin defaults**. CLI uses `[cwvPlugin(), axePlugin(), customMetricExamplePlugin()]` (apps/cli/src/commands/run.ts:269). Runner should drop `customMetricExamplePlugin` (it's an example) but keep cwv+axe for parity. Document the choice in README so users aren't surprised.

10. **CSP/cert error classification**. The Playwright/Chrome error messages for `navigation/csp-blocked` are not well-documented and may differ from `navigation/cert-error`. The current `classifyError` in `queue.ts` is heuristic. Add fixture pages for both scenarios to integration tests and tune the classifier against actual error messages — without this, the SPA will get `internal/error` for what should be specific user-actionable codes.

---

**Bottom line**: This spec is implementation-ready modulo the three decisions in M.1 (metric event semantics), M.2 (cancel latency), and M.4 (Playwright version pin). Total effort estimate for an implementer who can read the existing share-server: **Medium (1.5–2 days)** to land α.1–α.18 with passing integration tests. The heaviest items are the SSE fan-out + replay tests (K5–K7) and validating the engine-logger tap actually receives the strings we expect (M.8) — budget half a day for those alone.