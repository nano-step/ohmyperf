import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { InMemoryStorage } from "./storage.js";
import type { Report } from "@ohmyperf/core";

function makeReport(): Report {
  return {
    schemaVersion: "1.0.0",
    meta: {
      url: "https://example.com",
      startedAt: "2026-05-11T00:00:00.000Z",
      durationMs: 1000,
      runs: 1,
      mode: "real",
      browser: { name: "chromium", version: "147.0", source: "bundled" },
      host: { os: "linux", arch: "x64", nodeVersion: "v22" },
      parity: { mode: "headless", knownDeltas: {} },
      emulation: false,
      pluginCapabilityUses: [],
      measurementId: "m_test",
    },
    runs: [],
    aggregated: {},
    frames: {
      root: "r",
      nodes: {
        r: {
          frameId: "r",
          url: "https://example.com",
          origin: "https://example.com",
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

function buildApp(opts: { rateLimitPerHour?: number } = {}) {
  const storage = new InMemoryStorage();
  const app = createApp({
    storage,
    maxBodyBytes: 5 * 1024 * 1024,
    defaultTtlMs: 30 * 24 * 60 * 60 * 1000,
    maxTtlMs: 365 * 24 * 60 * 60 * 1000,
    rateLimit: { perIpPerHour: opts.rateLimitPerHour ?? 100 },
    publicBaseUrl: "http://localhost:4170",
  });
  return { app, storage };
}

describe("share-server app", () => {
  it("GET /healthz", async () => {
    const { app } = buildApp();
    const res = await app.fetch(new Request("http://x/healthz"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; schemaVersion: string };
    expect(body.ok).toBe(true);
    expect(body.schemaVersion).toBe("1.0.0");
  });

  it("POST /api/share creates a share and GET /api/r/:id returns it", async () => {
    const { app } = buildApp();
    const report = makeReport();
    const createRes = await app.fetch(
      new Request("http://x/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
        body: JSON.stringify({ report }),
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; url: string; expiresAt: number };
    expect(created.id).toMatch(/^[0-9a-f]{24}$/);
    expect(created.url).toBe(`http://localhost:4170/r/${created.id}`);
    expect(created.expiresAt).toBeGreaterThan(Date.now());

    const getRes = await app.fetch(new Request(`http://x/api/r/${created.id}`));
    expect(getRes.status).toBe(200);
    const back = (await getRes.json()) as Report;
    expect(back.schemaVersion).toBe("1.0.0");
    expect(back.meta.url).toBe("https://example.com");
  });

  it("GET /r/:id renders HTML via the viewer", async () => {
    const { app } = buildApp();
    const createRes = await app.fetch(
      new Request("http://x/api/share", {
        method: "POST",
        headers: { "x-forwarded-for": "1.2.3.4" },
        body: JSON.stringify({ report: makeReport() }),
      }),
    );
    const { id } = (await createRes.json()) as { id: string };
    const htmlRes = await app.fetch(new Request(`http://x/r/${id}`));
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.headers.get("Content-Type") ?? "").toMatch(/text\/html/i);
    const html = await htmlRes.text();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("OhMyPerf v1.0.0 report");
  });

  it("rejects malformed reports (400)", async () => {
    const { app } = buildApp();
    const res = await app.fetch(
      new Request("http://x/api/share", {
        method: "POST",
        body: JSON.stringify({ report: { schemaVersion: "2.0.0" } }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown id", async () => {
    const { app } = buildApp();
    const res = await app.fetch(new Request("http://x/api/r/000000000000000000000000"));
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid id format", async () => {
    const { app } = buildApp();
    const res = await app.fetch(new Request("http://x/api/r/not-an-id"));
    expect(res.status).toBe(400);
  });

  it("enforces password gate when set", async () => {
    const { app } = buildApp();
    const createRes = await app.fetch(
      new Request("http://x/api/share", {
        method: "POST",
        headers: { "x-forwarded-for": "1.2.3.4" },
        body: JSON.stringify({ report: makeReport(), password: "s3cret" }),
      }),
    );
    const { id } = (await createRes.json()) as { id: string };

    const noPw = await app.fetch(new Request(`http://x/api/r/${id}`));
    expect(noPw.status).toBe(401);

    const wrongPw = await app.fetch(
      new Request(`http://x/api/r/${id}`, { headers: { "x-ohmyperf-password": "nope" } }),
    );
    expect(wrongPw.status).toBe(401);

    const ok = await app.fetch(
      new Request(`http://x/api/r/${id}`, { headers: { "x-ohmyperf-password": "s3cret" } }),
    );
    expect(ok.status).toBe(200);
  });

  it("DELETE removes the share", async () => {
    const { app } = buildApp();
    const createRes = await app.fetch(
      new Request("http://x/api/share", {
        method: "POST",
        headers: { "x-forwarded-for": "1.2.3.4" },
        body: JSON.stringify({ report: makeReport() }),
      }),
    );
    const { id } = (await createRes.json()) as { id: string };

    const del = await app.fetch(new Request(`http://x/api/r/${id}`, { method: "DELETE" }));
    expect(del.status).toBe(204);

    const getRes = await app.fetch(new Request(`http://x/api/r/${id}`));
    expect(getRes.status).toBe(404);
  });

  it("enforces per-IP rate limit (429)", async () => {
    const { app } = buildApp({ rateLimitPerHour: 2 });
    const body = JSON.stringify({ report: makeReport() });
    const headers = { "x-forwarded-for": "9.9.9.9" };
    const r1 = await app.fetch(new Request("http://x/api/share", { method: "POST", headers, body }));
    expect(r1.status).toBe(201);
    const r2 = await app.fetch(new Request("http://x/api/share", { method: "POST", headers, body }));
    expect(r2.status).toBe(201);
    const r3 = await app.fetch(new Request("http://x/api/share", { method: "POST", headers, body }));
    expect(r3.status).toBe(429);
    expect(r3.headers.get("Retry-After")).toBe("3600");
  });

  it("sets standard security headers", async () => {
    const { app } = buildApp();
    const res = await app.fetch(new Request("http://x/healthz"));
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
