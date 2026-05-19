import { Hono } from "hono";
import { SCHEMA_VERSION } from "@ohmyperf/core";
import type { HealthResponse } from "@ohmyperf/shared-types";
import type { Config } from "../config.js";
import type { AppVariables } from "../app.js";
import { RUNNER_VERSION } from "../version.js";

export function healthRoute(config: Config): Hono<{ Variables: AppVariables }> {
  const r = new Hono<{ Variables: AppVariables }>();
  r.get("/", (c) => {
    const body: HealthResponse = {
      ok: true,
      version: RUNNER_VERSION,
      engine: SCHEMA_VERSION,
      browser: {
        source: "bundled",
        version: config.browserVersion,
      },
    };
    return c.json(body);
  });
  return r;
}
