import { parseTrace, type MainThreadTask, type TraceEvent } from "@ohmyperf/trace-utils";
import type { CDPSessionLike, Logger, LongTask } from "../types.js";

export interface TraceCollectorHandle {
  start(): Promise<void>;
  collect(): Promise<TraceCollectionResult>;
}

export interface TraceCollectionResult {
  readonly tasks: ReadonlyArray<MainThreadTask>;
  readonly longTasks: ReadonlyArray<LongTask>;
  readonly bytesRead: number;
  readonly warned: boolean;
  readonly refused: boolean;
}

export const TRACE_WARN_BYTES = 25 * 1024 * 1024;
export const TRACE_HARD_REFUSE_BYTES = 100 * 1024 * 1024;
export const LONG_TASK_MIN_MS = 50;

const TRACE_CATEGORIES = [
  "devtools.timeline",
  "v8.execute",
  "disabled-by-default-devtools.timeline",
  "loading",
].join(",");

interface IoReadResult {
  data: string;
  base64Encoded?: boolean;
  eof: boolean;
}

interface TracingCompletePayload {
  stream?: string;
}

export function createTraceCollector(session: CDPSessionLike, logger: Logger): TraceCollectorHandle {
  let streamHandle: string | undefined;
  const completePromise = new Promise<TracingCompletePayload>((resolve) => {
    session.on("Tracing.tracingComplete", (payload: unknown) => {
      const typed = payload as TracingCompletePayload;
      streamHandle = typed.stream;
      resolve(typed);
    });
  });

  return {
    async start(): Promise<void> {
      await session.send("Tracing.start", {
        categories: TRACE_CATEGORIES,
        transferMode: "ReturnAsStream",
      });
    },
    async collect(): Promise<TraceCollectionResult> {
      try {
        await session.send("Tracing.end");
      } catch (err) {
        logger.debug("trace-collector: Tracing.end failed", { error: errMessage(err) });
      }
      await completePromise;

      if (!streamHandle) {
        return { tasks: [], longTasks: [], bytesRead: 0, warned: false, refused: false };
      }

      let body = "";
      let bytes = 0;
      let warned = false;
      try {
        while (true) {
          const chunk = (await session.send("IO.read", { handle: streamHandle, size: 1024 * 1024 })) as IoReadResult;
          body += chunk.data;
          bytes += Buffer.byteLength(chunk.data, "utf8");
          if (!warned && bytes >= TRACE_WARN_BYTES) {
            warned = true;
            logger.warn("trace-collector: trace exceeds warn threshold", { bytes, warnAt: TRACE_WARN_BYTES });
          }
          if (bytes >= TRACE_HARD_REFUSE_BYTES) {
            logger.warn("trace-collector: trace exceeds hard limit, refusing", {
              bytes,
              refuseAt: TRACE_HARD_REFUSE_BYTES,
            });
            try {
              await session.send("IO.close", { handle: streamHandle });
            } catch {}
            return { tasks: [], longTasks: [], bytesRead: bytes, warned: true, refused: true };
          }
          if (chunk.eof) break;
        }
      } catch (err) {
        logger.debug("trace-collector: IO.read failed", { error: errMessage(err) });
        return { tasks: [], longTasks: [], bytesRead: bytes, warned, refused: false };
      } finally {
        try {
          await session.send("IO.close", { handle: streamHandle });
        } catch {}
      }

      let parsed: { traceEvents?: ReadonlyArray<TraceEvent> } | undefined;
      try {
        parsed = JSON.parse(body) as { traceEvents?: ReadonlyArray<TraceEvent> };
      } catch (err) {
        logger.debug("trace-collector: JSON.parse failed", { error: errMessage(err) });
        return { tasks: [], longTasks: [], bytesRead: bytes, warned, refused: false };
      }

      const events = parsed?.traceEvents ?? [];
      const tasks = parseTrace(events);
      const longTasks: LongTask[] = tasks
        .filter((t) => t.durationMs >= LONG_TASK_MIN_MS)
        .map((t) => {
          const attribution = t.attribution.url
            ? `${t.attribution.invoker}@${t.attribution.url}`
            : t.attribution.invoker;
          const rich: { url?: string; invoker?: string; frameId: string } = {
            frameId: t.attribution.frameId ?? "main",
          };
          if (typeof t.attribution.url === "string") rich.url = t.attribution.url;
          if (typeof t.attribution.invoker === "string") rich.invoker = t.attribution.invoker;
          return {
            startTime: t.startMs,
            duration: t.durationMs,
            attribution,
            attributionRich: rich,
          } satisfies LongTask;
        });

      return { tasks, longTasks, bytesRead: bytes, warned, refused: false };
    },
  };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
