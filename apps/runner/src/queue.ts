import type {
  ErrorCode,
  JobStatus,
  MeasureRequest,
  ProgressEvent,
  Report,
} from "@ohmyperf/shared-types";
import type { Config } from "./config.js";
import { EventBus } from "./events.js";
import { executeJob, type EngineRunner } from "./runner.js";
import { classifyEngineError } from "./errors.js";

export type { JobStatus };

export interface Job {
  readonly id: string;
  readonly request: MeasureRequest;
  readonly requestedBy: string;
  readonly createdAt: number;
  status: JobStatus;
  startedAt?: number;
  finishedAt?: number;
  report?: Report;
  error?: { code: ErrorCode; message: string };
  events: ProgressEvent[];
  abortController: AbortController;
  bus: EventBus<ProgressEvent>;
}

export interface EnqueueArgs {
  readonly id: string;
  readonly request: MeasureRequest;
  readonly requestedBy: string;
}

export interface JobStoreOptions {
  readonly engineRunner?: EngineRunner;
}

export class JobStore {
  private readonly map = new Map<string, Job>();
  private readonly queue: string[] = [];
  private busy = false;
  private readonly evictTimer: NodeJS.Timeout;
  private shuttingDown = false;
  private readonly runner: EngineRunner;

  constructor(
    private readonly config: Config,
    options: JobStoreOptions = {},
  ) {
    this.runner = options.engineRunner ?? executeJob;
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
      bus: new EventBus<ProgressEvent>(),
    };
    this.map.set(args.id, job);
    this.queue.push(args.id);
    this.publish(job, { type: "queued", jobId: job.id, t: Date.now() });
    void this.drain();
    return job;
  }

  get(id: string): Job | undefined {
    return this.map.get(id);
  }

  subscribe(id: string, fn: (ev: ProgressEvent) => void | Promise<void>): () => void {
    const job = this.map.get(id);
    if (!job) return () => undefined;
    return job.bus.subscribe(fn);
  }

  async cancel(id: string): Promise<boolean> {
    const job = this.map.get(id);
    if (!job) return false;
    if (job.status === "done" || job.status === "error" || job.status === "cancelled") {
      return false;
    }
    job.abortController.abort();
    if (job.status === "queued") {
      const idx = this.queue.indexOf(id);
      if (idx >= 0) this.queue.splice(idx, 1);
      job.status = "cancelled";
      job.finishedAt = Date.now();
      this.publish(job, {
        type: "cancelled",
        jobId: id,
        code: "job/cancelled",
        t: Date.now(),
      });
      job.bus.close();
    }
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
    const deadline = Date.now() + 5_000;
    while (this.busy && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  private async drain(): Promise<void> {
    if (this.busy || this.shuttingDown) return;
    const nextId = this.queue.shift();
    if (!nextId) return;
    const job = this.map.get(nextId);
    if (!job) {
      void this.drain();
      return;
    }
    if (job.status === "cancelled") {
      void this.drain();
      return;
    }

    this.busy = true;
    job.status = "running";
    job.startedAt = Date.now();
    this.publish(job, {
      type: "run-start",
      jobId: job.id,
      runIndex: 0,
      totalRuns: job.request.runs ?? 5,
      t: Date.now(),
    });

    try {
      const report = await this.runner(job, (ev) => this.publish(job, ev));
      if (job.abortController.signal.aborted) {
        job.status = "cancelled";
        this.publish(job, {
          type: "cancelled",
          jobId: job.id,
          code: "job/cancelled",
          t: Date.now(),
        });
      } else {
        job.status = "done";
        job.report = report;
        this.publish(job, {
          type: "complete",
          jobId: job.id,
          report,
          t: Date.now(),
        });
      }
    } catch (err) {
      if (job.abortController.signal.aborted) {
        job.status = "cancelled";
        this.publish(job, {
          type: "cancelled",
          jobId: job.id,
          code: "job/cancelled",
          t: Date.now(),
        });
      } else {
        const info = classifyEngineError(err);
        job.status = "error";
        job.error = info;
        this.publish(job, {
          type: "error",
          jobId: job.id,
          code: info.code,
          message: info.message,
          t: Date.now(),
        });
      }
    } finally {
      job.finishedAt = Date.now();
      job.bus.close();
      this.busy = false;
      void this.drain();
    }
  }

  private publish(job: Job, ev: ProgressEvent): void {
    job.events.push(ev);
    const cap = this.config.replayBufferSize;
    if (job.events.length > cap) {
      job.events.splice(0, job.events.length - cap);
    }
    job.bus.emit(ev);
  }

  private evictExpired(): void {
    const cutoff = Date.now() - this.config.jobTtlMs;
    for (const [id, job] of this.map) {
      const terminal =
        job.status === "done" || job.status === "error" || job.status === "cancelled";
      if (terminal && (job.finishedAt ?? job.createdAt) < cutoff) {
        this.map.delete(id);
      }
    }
  }
}
