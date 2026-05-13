import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Config } from "./config.js";
import type { JobStore } from "./queue.js";
import { errorEnvelope } from "./errors.js";
import { healthRoute } from "./routes/health.js";
import { measureRoute } from "./routes/measure.js";
import { jobsRoute } from "./routes/jobs.js";

export type AppVariables = {
  requestId: string;
};

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

export interface AppEnv {
  readonly config: Config;
  readonly jobs: JobStore;
}

export function createApp(env: AppEnv): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", async (c, next) => {
    const reqId = c.req.header("x-request-id") ?? crypto.randomUUID();
    c.set("requestId", reqId);
    await next();
    c.header("x-request-id", reqId);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
  });

  app.use("/api/*", async (c, next) => {
    await next();
    const origin = c.req.header("Origin") ?? "";
    if (
      c.req.method === "OPTIONS" &&
      c.req.header("Access-Control-Request-Private-Network") === "true" &&
      env.config.corsOrigins.includes(origin)
    ) {
      c.header("Access-Control-Allow-Private-Network", "true");
    }
  });

  app.use(
    "/api/*",
    cors({
      origin: (origin) => (env.config.corsOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Accept", "Last-Event-ID", "x-request-id", "Cache-Control"],
      exposeHeaders: ["x-request-id"],
      maxAge: 600,
    }),
  );

  app.route("/api/health", healthRoute(env.config));
  app.route("/api/measure", measureRoute(env.config, env.jobs));
  app.route("/api/jobs", jobsRoute(env.config, env.jobs));

  app.notFound((c) => {
    const reqId = c.get("requestId") ?? "";
    return c.json(
      errorEnvelope("validation/bad-request", `route not found: ${c.req.path}`, reqId),
      404,
    );
  });

  app.onError((err, c) => {
    const reqId = c.get("requestId") ?? "";
    process.stderr.write(
      `[${reqId}] unhandled: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
    );
    return c.json(
      errorEnvelope(
        "internal/error",
        err instanceof Error ? err.message : String(err),
        reqId,
      ),
      500,
    );
  });

  return app;
}
