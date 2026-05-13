import { Hono } from "hono";
import { z } from "zod";
import type { MeasureAcceptedResponse, MeasureRequest } from "@ohmyperf/shared-types";
import type { Config } from "../config.js";
import type { JobStore } from "../queue.js";
import type { AppVariables } from "../app.js";
import { assertSafeUrl, SsrfError } from "../ssrf-guard.js";
import { createRateLimiter } from "../rate-limit.js";
import { errorEnvelope } from "../errors.js";

const MeasureRequestSchema = z.object({
  url: z.string().url(),
  runs: z.number().int().min(1).max(10).optional(),
  mode: z.enum(["real", "ci-stable"]).optional(),
  cacheMode: z.enum(["cold", "warm", "cold-then-warm"]).optional(),
  headless: z.enum(["headless", "headful"]).optional(),
  plugins: z.array(z.unknown()).optional(),
});

export function measureRoute(config: Config, jobs: JobStore): Hono<{ Variables: AppVariables }> {
  const r = new Hono<{ Variables: AppVariables }>();
  const rateLimiter = createRateLimiter(config);

  r.post("/", rateLimiter, async (c) => {
    const reqId = c.get("requestId") ?? "";
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        errorEnvelope("validation/bad-request", "invalid JSON body", reqId),
        400,
      );
    }
    const parsed = MeasureRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        errorEnvelope("validation/bad-request", parsed.error.message, reqId, {
          issues: parsed.error.issues as unknown as ReadonlyArray<unknown>,
        }),
        400,
      );
    }
    try {
      await assertSafeUrl(parsed.data.url, config.allowPrivate);
    } catch (err) {
      if (err instanceof SsrfError) {
        const code = err.range === "dns-failure" ? "ssrf/dns-failure" : "ssrf/blocked-range";
        return c.json(
          errorEnvelope(code, err.message, reqId, { range: err.range }),
          403,
        );
      }
      throw err;
    }

    const jobId = crypto.randomUUID();
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip")?.trim() ??
      "anon";
    const request: MeasureRequest = {
      url: parsed.data.url,
      ...(parsed.data.runs !== undefined ? { runs: parsed.data.runs } : {}),
      ...(parsed.data.mode !== undefined ? { mode: parsed.data.mode } : {}),
      ...(parsed.data.cacheMode !== undefined ? { cacheMode: parsed.data.cacheMode } : {}),
      ...(parsed.data.headless !== undefined ? { headless: parsed.data.headless } : {}),
      ...(parsed.data.plugins !== undefined ? { plugins: parsed.data.plugins } : {}),
    };
    jobs.enqueue({ id: jobId, request, requestedBy: ip });
    const accepted: MeasureAcceptedResponse = { jobId, status: "queued" };
    return c.json(accepted, 202);
  });

  return r;
}
