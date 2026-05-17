export interface TraceEvent {
  readonly name: string;
  readonly ph: string;
  readonly pid: number;
  readonly tid: number;
  readonly ts: number;
  readonly dur?: number;
  readonly args?: {
    readonly data?: {
      readonly url?: string;
      readonly scriptId?: string;
      readonly functionName?: string;
      readonly frame?: string;
    };
    readonly url?: string;
  };
}

export interface MainThreadTask {
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
  readonly attribution: TaskAttribution;
  readonly children: ReadonlyArray<MainThreadTask>;
}

export interface TaskAttribution {
  readonly invoker: string;
  readonly url?: string;
  readonly frameId?: string;
}

const TASK_EVENT_NAMES = new Set(["RunTask", "RunMicrotasks", "ThreadControllerImpl::RunTask"]);
const SCRIPT_EVENT_NAMES = new Set([
  "EvaluateScript",
  "v8.compile",
  "FunctionCall",
  "TimerFire",
  "XHRReadyStateChange",
  "EventDispatch",
]);

export function parseTrace(events: ReadonlyArray<TraceEvent>): ReadonlyArray<MainThreadTask> {
  const rendererPid = pickRendererPid(events);
  if (rendererPid === undefined) return [];

  const mainThreadEvents = events
    .filter((e) => e.pid === rendererPid && typeof e.dur === "number" && e.dur > 0)
    .sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0));

  const topTasks = mainThreadEvents.filter((e) => TASK_EVENT_NAMES.has(e.name));
  if (topTasks.length === 0) return [];

  const tasks: MainThreadTask[] = [];
  for (const task of topTasks) {
    const startUs = task.ts;
    const endUs = task.ts + (task.dur ?? 0);
    const children = mainThreadEvents.filter(
      (e) =>
        e !== task &&
        e.ts >= startUs &&
        e.ts + (e.dur ?? 0) <= endUs,
    );
    tasks.push({
      startMs: startUs / 1000,
      endMs: endUs / 1000,
      durationMs: (endUs - startUs) / 1000,
      attribution: attributeTask(task, children),
      children: [],
    });
  }
  return tasks;
}

export function attributeTask(
  task: TraceEvent,
  children: ReadonlyArray<TraceEvent>,
): TaskAttribution {
  for (const child of children) {
    if (!SCRIPT_EVENT_NAMES.has(child.name)) continue;
    const url = child.args?.data?.url ?? child.args?.url;
    if (typeof url === "string" && url.length > 0 && url !== "about:blank") {
      const result: { invoker: string; url: string; frameId?: string } = {
        invoker: child.name,
        url,
      };
      const frame = child.args?.data?.frame;
      if (typeof frame === "string") result.frameId = frame;
      return result;
    }
  }
  return { invoker: task.name };
}

function pickRendererPid(events: ReadonlyArray<TraceEvent>): number | undefined {
  const counts = new Map<number, number>();
  for (const e of events) {
    if (TASK_EVENT_NAMES.has(e.name)) {
      counts.set(e.pid, (counts.get(e.pid) ?? 0) + 1);
    }
  }
  let best: number | undefined;
  let bestCount = 0;
  for (const [pid, count] of counts) {
    if (count > bestCount) {
      best = pid;
      bestCount = count;
    }
  }
  return best;
}

export const PACKAGE_NAME = "@ohmyperf/trace-utils" as const;
export const PACKAGE_ROLE = "MainThreadTasks parsing + function attribution (minimal Lighthouse 13 tracehouse port)." as const;
