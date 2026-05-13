import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import type { Report } from "@ohmyperf/core";
import type {
  ErrorEnvelope,
  HealthResponse,
  JobPollResponse,
  MeasureAcceptedResponse,
} from "@ohmyperf/shared-types";
import { createApp } from "../../app.js";
import { readConfig, type Config } from "../../config.js";
import { JobStore } from "../../queue.js";
import type { EngineRunner } from "../../runner.js";

function fakeReport(url: string): Report {
  return {
    schemaVersion: "1.0.0",
    meta: {
      url,
      startedAt: new Date(0).toISOString(),
      durationMs: 10,
      runs: 1,
      mode: "real",
      browser: { name: "fake", version: "0", source: "bundled" },
      host: { os: "linux", arch: "x64", nodeVersion: "v22" },
      parity: { mode: "headless", knownDeltas: {} },
      emulation: false,
      pluginCapabilityUses: [],
      measurementId: "m_fake",
    },
    runs: [
      {
        runIndex: 0,
        cold: true,
        metrics: {
          lcp: {
            name: "lcp",
            value: 1200,
            unit: "ms",
            attribution: { frameId: "r" },
          },
        },
        resources: [],
        longTasks: [],
        meta: {},
      },
    ],
    aggregated: {
      lcp: {
        median: 1200,
        p75: 1200,
        p95: 1200,
        mean: 1200,
        stdev: 0,
        cov: 0,
        runs: 1,
        droppedOutliers: 0,
      },
    },
    frames: {
      root: "r",
      nodes: {
        r: {
          frameId: "r",
          url,
          origin: new URL(url).origin,
          parentFrameId: null,
          isOOPIF: false,
          isCrossOrigin: false,
          attachedAt: 0,
          metrics: {},
          children: [],
        },
      },
    },
    audits: [],
    artifacts: {},
    pluginData: {},
  };
}

function fakeRunner(opts: { delayMs?: number; throwError?: string } = {}): EngineRunner {
  return async (job, emit) => {
    const delay = opts.delayMs ?? 30;
    await new Promise((r) => setTimeout(r, delay));
    if (job.abortController.signal.aborted) throw new Error("aborted");
    if (opts.throwError) throw new Error(opts.throwError);
    emit({ type: "run-complete", jobId: job.id, runIndex: 0, t: Date.now() });
    emit({ type: "metric", jobId: job.id, runIndex: 0, name: "lcp", value: 1200, t: Date.now() });
    return fakeReport(job.request.url);
  };
}

function bootServer(overrides: Partial<Config> = {}, runner: EngineRunner = fakeRunner()): Promise<{
  url: string;
  server: ServerType;
  jobs: JobStore;
  close: () => Promise<void>;
}> {
  process.env["OHMYPERF_RUNNER_ALLOW_PRIVATE"] = "1";
  const config: Config = { ...readConfig(), ...overrides };
  const jobs = new JobStore(config, { engineRunner: runner });
  const app = createApp({ config, jobs });
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
      const url = `http://127.0.0.1:${String(info.port)}`;
      resolve({
        url,
        server,
        jobs,
        close: async () => {
          await jobs.shutdown();
          await new Promise<void>((r) => server.close(() => r()));
        },
      });
    });
  });
}

async function pollUntil<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T = await fn();
  while (Date.now() < deadline) {
    last = await fn();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 50));
  }
  return last;
}

async function readSseEvents(
  url: string,
  options: { maxEvents?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<Array<{ event: string; data: string }>> {
  const res = await fetch(url, { headers: { Accept: "text/event-stream" }, ...(options.signal ? { signal: options.signal } : {}) });
  if (!res.body) throw new Error("no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events: Array<{ event: string; data: string }> = [];
  let buffer = "";
  const maxEvents = options.maxEvents ?? Infinity;
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  while (events.length < maxEvents && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (part.startsWith(":")) continue;
      let event = "message";
      let data = "";
      for (const line of part.split("\n")) {
        if (line.startsWith("event:")) event = line.slice("event:".length).trim();
        else if (line.startsWith("data:")) data += line.slice("data:".length).trim();
      }
      if (data) events.push({ event, data });
      if (events.length >= maxEvents) break;
    }
  }
  await reader.cancel().catch(() => undefined);
  return events;
}

describe("runner integration (app-only, fake engine)", () => {
  let booted: Awaited<ReturnType<typeof bootServer>>;
  beforeAll(async () => {
    booted = await bootServer();
  });
  afterAll(async () => {
    await booted.close();
  });

  it("K1. GET /api/health returns ok + engine + browser", async () => {
    const r = await fetch(`${booted.url}/api/health`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as HealthResponse;
    expect(body.ok).toBe(true);
    expect(body.engine).toBe("1.0.0");
    expect(body.browser.source).toBe("bundled");
    expect(typeof body.browser.version).toBe("string");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r.headers.get("x-request-id")).toBeTruthy();
  });

  it("K2. POST /api/measure -> 202, then GET /api/jobs/:id resolves to done with a valid Report", async () => {
    const r = await fetch(`${booted.url}/api/measure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://127.0.0.1:9/", runs: 1 }),
    });
    expect(r.status).toBe(202);
    const { jobId } = (await r.json()) as MeasureAcceptedResponse;
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/);

    const final = await pollUntil(
      async () =>
        (await (await fetch(`${booted.url}/api/jobs/${jobId}`)).json()) as JobPollResponse,
      (j) => j.status === "done" || j.status === "error",
      5_000,
    );
    expect(final.status).toBe("done");
    expect(final.report?.schemaVersion).toBe("1.0.0");
    expect(final.report?.runs?.length).toBe(1);
  });

  it("K3. POST /api/measure with bad JSON -> 400 validation/bad-request", async () => {
    const r = await fetch(`${booted.url}/api/measure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as ErrorEnvelope;
    expect(body.error.code).toBe("validation/bad-request");
  });

  it("K4. POST /api/measure with missing url -> 400", async () => {
    const r = await fetch(`${booted.url}/api/measure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runs: 1 }),
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as ErrorEnvelope;
    expect(body.error.code).toBe("validation/bad-request");
  });

  it("K5. GET /api/jobs/<unknown> -> 404 job/not-found", async () => {
    const r = await fetch(`${booted.url}/api/jobs/00000000-0000-0000-0000-000000000000`);
    expect(r.status).toBe(404);
    const body = (await r.json()) as ErrorEnvelope;
    expect(body.error.code).toBe("job/not-found");
  });

  it("K6. SSE stream replays buffered events and ends with complete", async () => {
    const r = await fetch(`${booted.url}/api/measure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://127.0.0.1:9/", runs: 1 }),
    });
    const { jobId } = (await r.json()) as MeasureAcceptedResponse;
    const events = await readSseEvents(`${booted.url}/api/jobs/${jobId}/events`, {
      timeoutMs: 5_000,
    });
    const types = events.map((e) => e.event);
    expect(types).toContain("queued");
    expect(types).toContain("run-start");
    expect(types[types.length - 1]).toBe("complete");
    const last = JSON.parse(events[events.length - 1]!.data) as {
      type: string;
      report: { schemaVersion: string };
    };
    expect(last.type).toBe("complete");
    expect(last.report.schemaVersion).toBe("1.0.0");
  });

  it("K7. CORS preflight with allowlisted Origin + PNA echoes both headers", async () => {
    const r = await fetch(`${booted.url}/api/measure`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Private-Network": "true",
      },
    });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(r.headers.get("access-control-allow-private-network")).toBe("true");
  });

  it("K8. CORS preflight with disallowed Origin omits ACAO", async () => {
    const r = await fetch(`${booted.url}/api/measure`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example.com",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("K9. DELETE /api/jobs/<unknown> -> 404", async () => {
    const r = await fetch(
      `${booted.url}/api/jobs/00000000-0000-0000-0000-000000000000`,
      { method: "DELETE" },
    );
    expect(r.status).toBe(404);
  });
});

describe("runner integration: SSRF guard via HTTP", () => {
  let booted: Awaited<ReturnType<typeof bootServer>>;
  beforeAll(async () => {
    delete process.env["OHMYPERF_RUNNER_ALLOW_PRIVATE"];
    booted = await bootServer({ allowPrivate: false });
  });
  afterAll(async () => {
    await booted.close();
    process.env["OHMYPERF_RUNNER_ALLOW_PRIVATE"] = "1";
  });

  it("rejects http://localhost/ with 403 ssrf/blocked-range", async () => {
    const r = await fetch(`${booted.url}/api/measure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://localhost/" }),
    });
    expect(r.status).toBe(403);
    const body = (await r.json()) as ErrorEnvelope;
    expect(body.error.code).toBe("ssrf/blocked-range");
  });
});

describe("runner integration: rate limit", () => {
  let booted: Awaited<ReturnType<typeof bootServer>>;
  beforeAll(async () => {
    booted = await bootServer({ rateLimitPerHour: 2 });
  });
  afterAll(async () => {
    await booted.close();
  });

  it("returns 429 after the configured per-IP limit", async () => {
    const body = JSON.stringify({ url: "http://127.0.0.1:9/", runs: 1 });
    const headers = { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9" };
    const r1 = await fetch(`${booted.url}/api/measure`, { method: "POST", headers, body });
    expect(r1.status).toBe(202);
    const r2 = await fetch(`${booted.url}/api/measure`, { method: "POST", headers, body });
    expect(r2.status).toBe(202);
    const r3 = await fetch(`${booted.url}/api/measure`, { method: "POST", headers, body });
    expect(r3.status).toBe(429);
    expect(r3.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("runner integration: cancel via DELETE", () => {
  let booted: Awaited<ReturnType<typeof bootServer>>;
  beforeAll(async () => {
    booted = await bootServer({}, fakeRunner({ delayMs: 1_500 }));
  });
  afterAll(async () => {
    await booted.close();
  });

  it("DELETE cancels a queued/running job and emits cancelled", async () => {
    const r = await fetch(`${booted.url}/api/measure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://127.0.0.1:9/", runs: 1 }),
    });
    const { jobId } = (await r.json()) as MeasureAcceptedResponse;
    await new Promise((r2) => setTimeout(r2, 100));
    const del = await fetch(`${booted.url}/api/jobs/${jobId}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const final = await pollUntil(
      async () =>
        (await (await fetch(`${booted.url}/api/jobs/${jobId}`)).json()) as JobPollResponse,
      (j) => j.status === "cancelled" || j.status === "done" || j.status === "error",
      5_000,
    );
    expect(final.status).toBe("cancelled");
  });
});
