import type { MiddlewareHandler } from "hono";
import type { Config } from "./config.js";
import type { AppVariables } from "./app.js";
import { errorEnvelope } from "./errors.js";

interface Bucket {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60 * 60 * 1000;

export function createRateLimiter(
  config: Config,
): MiddlewareHandler<{ Variables: AppVariables }> {
  const buckets = new Map<string, Bucket>();
  const sweeper = setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [ip, b] of buckets) {
      if (b.windowStart < cutoff) buckets.delete(ip);
    }
  }, 5 * 60 * 1000);
  sweeper.unref?.();

  return async (c, next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip")?.trim() ??
      "anon";
    const now = Date.now();
    const bucket = buckets.get(ip);
    if (!bucket || now - bucket.windowStart > WINDOW_MS) {
      buckets.set(ip, { count: 1, windowStart: now });
      await next();
      return;
    }
    if (bucket.count >= config.rateLimitPerHour) {
      const reqId = c.get("requestId") ?? "";
      const retryAfterSec = Math.max(
        1,
        Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000),
      );
      c.header("Retry-After", String(retryAfterSec));
      return c.json(
        errorEnvelope(
          "rate-limit/exceeded",
          `Rate limit of ${String(config.rateLimitPerHour)} requests/hour exceeded`,
          reqId,
          { retryAfterSec },
        ),
        429,
      );
    }
    bucket.count += 1;
    await next();
  };
}
