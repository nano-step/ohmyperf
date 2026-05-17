import { runEngine, type EngineLaunchAdapter, type Logger, type Report } from "@ohmyperf/core";
import { createPlaywrightAdapter } from "@ohmyperf/driver-playwright";
import { axePlugin, cwvPlugin } from "@ohmyperf/plugins-builtin";
import type { ProgressEvent } from "@ohmyperf/shared-types";
import type { Job } from "./queue.js";

export type EngineRunner = (
  job: Job,
  emit: (ev: ProgressEvent) => void,
) => Promise<Report>;

export const executeJob: EngineRunner = async (job, emit) => {
  const { url, runs = 5, mode = "real", headless = "headless" } = job.request;
  const collectTrace =
    (job.request as { collectTrace?: boolean }).collectTrace ?? true;

  let currentRunIndex = 0;

  const taps: ReadonlyArray<{
    match: RegExp;
    toEvent: (runIdx: number) => ProgressEvent | null;
  }> = [
    {
      match: /^engine: starting run/,
      toEvent: (runIdx) => ({
        type: "navigation",
        jobId: job.id,
        runIndex: runIdx,
        phase: "started",
        t: Date.now(),
      }),
    },
    {
      match: /^engine: load-idle wait timed out/,
      toEvent: (runIdx) => ({
        type: "navigation",
        jobId: job.id,
        runIndex: runIdx,
        phase: "idle",
        t: Date.now(),
      }),
    },
  ];

  const tappedLogger: Logger = {
    debug(message, fields) {
      if (typeof message !== "string") return;
      const ri = (fields as { runIndex?: number } | undefined)?.runIndex;
      if (typeof ri === "number") currentRunIndex = ri;
      for (const t of taps) {
        if (t.match.test(message)) {
          const ev = t.toEvent(currentRunIndex);
          if (ev) emit(ev);
          break;
        }
      }
    },
    info() {
      // Engine info logs are noisy; SSE clients get structured ProgressEvents instead.
    },
    warn(message) {
      if (typeof message === "string") {
        process.stderr.write(`[engine warn] ${message}\n`);
      }
    },
    error(message) {
      if (typeof message === "string") {
        process.stderr.write(`[engine error] ${message}\n`);
      }
    },
  };

  const { driver, adapter } = createPlaywrightAdapter({
    url,
    kind: "chromium",
    headless,
    logger: tappedLogger,
  });

  const wrappedAdapter: EngineLaunchAdapter = {
    async launchPageWithCdp() {
      if (job.abortController.signal.aborted) {
        throw new Error("job/cancelled");
      }
      return adapter.launchPageWithCdp();
    },
  };

  const report = await runEngine({
    opts: {
      url,
      runs,
      mode,
      headless,
      collectTrace,
      plugins: [cwvPlugin(), axePlugin()],
    },
    driver,
    adapter: wrappedAdapter,
    logger: tappedLogger,
  });

  for (const r of report.runs) {
    emit({
      type: "run-complete",
      jobId: job.id,
      runIndex: r.runIndex,
      t: Date.now(),
    });
    for (const [name, m] of Object.entries(r.metrics)) {
      emit({
        type: "metric",
        jobId: job.id,
        runIndex: r.runIndex,
        name,
        value: m.value,
        t: Date.now(),
      });
    }
  }

  return report;
};
