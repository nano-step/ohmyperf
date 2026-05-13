import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { JobPollResponse, ProgressEvent } from "@ohmyperf/shared-types";
import type { Config } from "../config.js";
import type { JobStore } from "../queue.js";
import type { AppVariables } from "../app.js";
import { errorEnvelope } from "../errors.js";

export function jobsRoute(config: Config, jobs: JobStore): Hono<{ Variables: AppVariables }> {
  const r = new Hono<{ Variables: AppVariables }>();

  r.get("/:id", (c) => {
    const reqId = c.get("requestId") ?? "";
    const job = jobs.get(c.req.param("id"));
    if (!job) {
      return c.json(
        errorEnvelope("job/not-found", "job not found or expired", reqId),
        404,
      );
    }
    const body: JobPollResponse = {
      id: job.id,
      status: job.status,
      ...(job.report ? { report: job.report } : {}),
      ...(job.error ? { error: job.error } : {}),
    };
    return c.json(body);
  });

  r.get("/:id/events", (c) => {
    const reqId = c.get("requestId") ?? "";
    const id = c.req.param("id");
    const job = jobs.get(id);
    if (!job) {
      return c.json(
        errorEnvelope("job/not-found", "job not found or expired", reqId),
        404,
      );
    }

    return streamSSE(c, async (stream) => {
      for (const ev of job.events) {
        await stream.writeSSE({
          event: ev.type,
          data: JSON.stringify(ev),
        });
      }

      if (
        job.status === "done" ||
        job.status === "error" ||
        job.status === "cancelled"
      ) {
        await stream.close();
        return;
      }

      const heartbeat = setInterval(() => {
        // SSE comment frame keeps proxies/browsers from idle-killing the stream.
        stream.write(":\n\n").catch(() => undefined);
      }, config.sseHeartbeatMs);
      heartbeat.unref?.();

      let closed = false;
      const closeOnce = async (): Promise<void> => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          await stream.close();
        } catch {
          /* stream may already be closed by the client */
        }
      };

      const unsubscribe = jobs.subscribe(id, async (ev: ProgressEvent) => {
        if (closed) return;
        try {
          await stream.writeSSE({
            event: ev.type,
            data: JSON.stringify(ev),
          });
        } catch {
          await closeOnce();
          return;
        }
        if (
          ev.type === "complete" ||
          ev.type === "error" ||
          ev.type === "cancelled"
        ) {
          await closeOnce();
        }
      });

      stream.onAbort(() => {
        clearInterval(heartbeat);
        unsubscribe();
        closed = true;
      });

      while (!closed) {
        await stream.sleep(1000);
      }
      unsubscribe();
    });
  });

  r.delete("/:id", async (c) => {
    const reqId = c.get("requestId") ?? "";
    const id = c.req.param("id");
    const ok = await jobs.cancel(id);
    if (!ok) {
      return c.json(
        errorEnvelope("job/not-found", "job not found or already finished", reqId),
        404,
      );
    }
    return c.body(null, 204);
  });

  return r;
}
