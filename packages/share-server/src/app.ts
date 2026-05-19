import { Hono } from "hono";
import type { Report } from "@ohmyperf/core";
import { renderReportHtml } from "@ohmyperf/viewer";
import type { ShareStorage } from "./storage.js";

export interface AppEnv {
  readonly storage: ShareStorage;
  readonly maxBodyBytes: number;
  readonly defaultTtlMs: number;
  readonly maxTtlMs: number;
  readonly rateLimit: { perIpPerHour: number };
  readonly publicBaseUrl: string;
}

export interface ShareCreatePayload {
  readonly report: Report;
  readonly password?: string;
  readonly expiresInMs?: number;
  readonly private?: boolean;
}

export interface ShareCreateResponse {
  readonly id: string;
  readonly url: string;
  readonly expiresAt: number;
}

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

export function createApp(env: AppEnv): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    await next();
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
  });

  app.get("/healthz", (c) => c.json({ ok: true, schemaVersion: "1.0.0" }));

  app.post("/api/share", async (c) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
    const since = Date.now() - 60 * 60 * 1000;
    const recent = await env.storage.countByIp(ip, since);
    if (recent >= env.rateLimit.perIpPerHour) {
      return c.json({ error: "rate_limited", retryAfter: 3600 }, 429, {
        "Retry-After": "3600",
      });
    }

    let payload: ShareCreatePayload;
    try {
      const raw = await c.req.text();
      if (raw.length > env.maxBodyBytes) {
        return c.json({ error: "payload_too_large", maxBytes: env.maxBodyBytes }, 413);
      }
      payload = JSON.parse(raw) as ShareCreatePayload;
    } catch (err) {
      return c.json(
        { error: "invalid_json", reason: err instanceof Error ? err.message : String(err) },
        400,
      );
    }

    if (
      !payload.report ||
      typeof payload.report !== "object" ||
      payload.report.schemaVersion !== "1.0.0" ||
      !Array.isArray(payload.report.runs)
    ) {
      return c.json({ error: "invalid_report_shape" }, 400);
    }

    const now = Date.now();
    const ttl = clampTtl(payload.expiresInMs ?? env.defaultTtlMs, env.maxTtlMs);
    const id = generateShareId();
    const expiresAt = now + ttl;

    const passwordHash =
      payload.password && payload.password.length > 0
        ? await hashPassword(payload.password)
        : undefined;

    const body = new TextEncoder().encode(JSON.stringify(payload.report));
    await env.storage.putReport(id, body);
    await env.storage.putRecord({
      id,
      createdAt: now,
      expiresAt,
      ...(passwordHash !== undefined ? { passwordHash } : {}),
      private: Boolean(payload.private),
    });
    await env.storage.recordUpload(ip, id, now);

    const response: ShareCreateResponse = {
      id,
      url: `${env.publicBaseUrl}/r/${id}`,
      expiresAt,
    };
    return c.json(response, 201);
  });

  app.get("/api/r/:id", async (c) => {
    const id = c.req.param("id");
    if (!isValidId(id)) return c.json({ error: "invalid_id" }, 400);
    const rec = await env.storage.getRecord(id);
    if (!rec) return c.json({ error: "not_found" }, 404);
    if (rec.expiresAt < Date.now()) {
      return c.json({ error: "expired", expiredAt: rec.expiresAt }, 410);
    }
    if (rec.passwordHash) {
      const supplied = c.req.header("x-ohmyperf-password");
      if (!supplied) return c.json({ error: "password_required" }, 401);
      const hash = await hashPassword(supplied);
      if (!constantTimeEqual(hash, rec.passwordHash)) {
        return c.json({ error: "wrong_password" }, 401);
      }
    }
    const body = await env.storage.getReport(id);
    if (!body) return c.json({ error: "report_blob_missing" }, 500);
    return new Response(new Blob([new Uint8Array(body)]), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=300",
      },
    });
  });

  app.get("/r/:id", async (c) => {
    const id = c.req.param("id");
    if (!isValidId(id)) return c.text("Invalid id", 400);
    const rec = await env.storage.getRecord(id);
    if (!rec) return c.text("Not found", 404);
    if (rec.expiresAt < Date.now()) return c.text("Report expired", 410);
    if (rec.passwordHash) {
      const supplied = c.req.query("password");
      if (!supplied) {
        return c.html(passwordPrompt(id));
      }
      const hash = await hashPassword(supplied);
      if (!constantTimeEqual(hash, rec.passwordHash)) {
        return c.html(passwordPrompt(id, "Wrong password."), 401);
      }
    }
    const body = await env.storage.getReport(id);
    if (!body) return c.text("Report blob missing", 500);
    const report = JSON.parse(new TextDecoder().decode(body)) as Report;
    const html = renderReportHtml(report, { title: `OhMyPerf share ${id}` });
    c.header("Cache-Control", "private, max-age=300");
    return c.html(html);
  });

  app.delete("/api/r/:id", async (c) => {
    const id = c.req.param("id");
    if (!isValidId(id)) return c.json({ error: "invalid_id" }, 400);
    const rec = await env.storage.getRecord(id);
    if (!rec) return c.json({ error: "not_found" }, 404);
    await env.storage.deleteReport(id);
    return new Response(null, { status: 204 });
  });

  return app;
}

function clampTtl(requested: number, max: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return max;
  return Math.min(requested, max);
}

function generateShareId(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isValidId(id: string | undefined): id is string {
  if (typeof id !== "string") return false;
  return /^[0-9a-f]{24}$/.test(id);
}

async function hashPassword(pw: string): Promise<string> {
  const data = new TextEncoder().encode(`ohmyperf-v1:${pw}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function passwordPrompt(id: string, error?: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>OhMyPerf — password required</title>
<style>body{font-family:system-ui;max-width:520px;margin:80px auto;padding:0 20px}input{padding:8px;font-size:14px;width:240px}button{padding:8px 16px}</style>
</head><body>
<h1>Password required</h1>
${error ? `<p style="color:#b91c1c">${error}</p>` : ""}
<form method="get" action="/r/${id}">
  <input type="password" name="password" autofocus required>
  <button type="submit">Unlock</button>
</form>
</body></html>`;
}
