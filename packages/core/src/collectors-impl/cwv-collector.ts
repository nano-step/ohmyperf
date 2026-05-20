import {
  type CollectorContext,
  type CollectorFactory,
  type CollectorHandle,
  type CollectorResult,
  emptyCollectorResult,
} from "../collectors.js";
import type { CDPSessionLike, Metric, MetricAttribution } from "../types.js";
import { CWV_INLINE_SCRIPT } from "./cwv-inline-script.js";

interface CwvSnapshot {
  lcp?: number;
  cls?: number;
  inp?: number;
  fcp?: number;
  ttfb?: number;
  attribution?: {
    lcp?: LcpAttributionRaw;
    cls?: ClsAttributionRaw;
    inp?: InpAttributionRaw;
    fcp?: FcpAttributionRaw;
    ttfb?: TtfbAttributionRaw;
  };
}

interface LcpAttributionRaw {
  target?: string;
  url?: string;
  timeToFirstByte?: number;
  resourceLoadDelay?: number;
  resourceLoadDuration?: number;
  elementRenderDelay?: number;
}

interface ClsAttributionRaw {
  largestShiftTarget?: string;
  largestShiftSource?: {
    previousRect?: { x: number; y: number; width: number; height: number };
    currentRect?: { x: number; y: number; width: number; height: number };
    node?: { nodeName?: string };
  };
  loadState?: string;
}

interface InpAttributionRaw {
  interactionTarget?: string;
  interactionType?: "pointer" | "keyboard";
  inputDelay?: number;
  processingDuration?: number;
  presentationDelay?: number;
  longestScript?: {
    entry?: { invoker?: string; invokerType?: string; sourceURL?: string };
    intersectingDuration?: number;
    subpart?: "input-delay" | "processing" | "presentation";
  };
}

interface FcpAttributionRaw {
  timeToFirstByte?: number;
  firstByteToFCP?: number;
  loadState?: string;
}

interface TtfbAttributionRaw {
  waitingDuration?: number;
  cacheDuration?: number;
  dnsDuration?: number;
  connectionDuration?: number;
  requestDuration?: number;
}

interface RuntimeEvaluateResult {
  result?: { type: string; value?: unknown };
  exceptionDetails?: { text?: string };
}

export const cwvCollectorFactory: CollectorFactory = {
  id: "ohmyperf.cwv",
  requires: [],
  async create(session: CDPSessionLike, ctx: CollectorContext): Promise<CollectorHandle> {
    let installed = false;
    try {
      await session.send("Runtime.enable");
      await session.send("Page.enable");
      await session.send("Page.addScriptToEvaluateOnNewDocument", {
        source: CWV_INLINE_SCRIPT,
        runImmediately: true,
      });
      installed = true;
    } catch (err) {
      ctx.logger.debug("cwv-collector: install failed", {
        frameId: ctx.frameId,
        error: errMessage(err),
      });
    }

    return {
      id: cwvCollectorFactory.id,
      async finalize(): Promise<CollectorResult> {
        if (!installed) {
          return emptyCollectorResult("cwv-script-injection-failed");
        }
        try {
          const snapshot = await readSnapshot(session);
          if (!snapshot) {
            return emptyCollectorResult("cwv-snapshot-unavailable");
          }
          const metrics: Record<string, Metric> = {};
          if (typeof snapshot.lcp === "number" && Number.isFinite(snapshot.lcp)) {
            metrics["lcp"] = buildMetric("lcp", snapshot.lcp, "ms", mapLcp(snapshot.attribution?.lcp));
          }
          if (typeof snapshot.cls === "number" && Number.isFinite(snapshot.cls)) {
            metrics["cls"] = buildMetric("cls", snapshot.cls, "score", mapCls(snapshot.attribution?.cls));
          }
          if (typeof snapshot.inp === "number" && Number.isFinite(snapshot.inp)) {
            metrics["inp"] = buildMetric("inp", snapshot.inp, "ms", mapInp(snapshot.attribution?.inp));
          }
          if (typeof snapshot.fcp === "number" && Number.isFinite(snapshot.fcp)) {
            metrics["fcp"] = buildMetric("fcp", snapshot.fcp, "ms", mapFcp(snapshot.attribution?.fcp));
          }
          if (typeof snapshot.ttfb === "number" && Number.isFinite(snapshot.ttfb)) {
            metrics["ttfb"] = buildMetric("ttfb", snapshot.ttfb, "ms", mapTtfb(snapshot.attribution?.ttfb));
          }
          return {
            metrics,
            longTasks: [],
            resources: [],
            available: true,
          };
        } catch (err) {
          return emptyCollectorResult(`cwv-finalize-error: ${errMessage(err)}`);
        }
      },
      async dispose(): Promise<void> {
        return undefined;
      },
    };
  },
};

function buildMetric(
  name: string,
  value: number,
  unit: Metric["unit"],
  attribution: MetricAttribution | undefined,
): Metric {
  return attribution
    ? { name, value, unit, attribution }
    : { name, value, unit };
}

function mapLcp(raw: LcpAttributionRaw | undefined): MetricAttribution | undefined {
  if (!raw) return undefined;
  const a: Mutable<MetricAttribution> = {};
  if (typeof raw.target === "string") a.element = raw.target;
  if (typeof raw.url === "string") a.url = raw.url;
  const subparts: Record<string, number> = {};
  if (typeof raw.timeToFirstByte === "number") subparts["ttfb"] = raw.timeToFirstByte;
  if (typeof raw.resourceLoadDelay === "number") subparts["loadDelay"] = raw.resourceLoadDelay;
  if (typeof raw.resourceLoadDuration === "number") subparts["loadDuration"] = raw.resourceLoadDuration;
  if (typeof raw.elementRenderDelay === "number") subparts["renderDelay"] = raw.elementRenderDelay;
  if (Object.keys(subparts).length > 0) a.subparts = subparts;
  return Object.keys(a).length > 0 ? (a as MetricAttribution) : undefined;
}

function mapCls(raw: ClsAttributionRaw | undefined): MetricAttribution | undefined {
  if (!raw) return undefined;
  const a: Mutable<MetricAttribution> = {};
  if (typeof raw.largestShiftTarget === "string") a.element = raw.largestShiftTarget;
  if (raw.largestShiftSource?.previousRect) a.previousRect = raw.largestShiftSource.previousRect;
  if (raw.largestShiftSource?.currentRect) a.currentRect = raw.largestShiftSource.currentRect;
  const shiftNodeName = raw.largestShiftSource?.node?.nodeName?.toUpperCase();
  if (shiftNodeName === "IFRAME") {
    a.cause = "frame-resize";
  } else if (typeof raw.loadState === "string") {
    a.cause = `load-state:${raw.loadState}`;
  }
  return Object.keys(a).length > 0 ? (a as MetricAttribution) : undefined;
}

function mapInp(raw: InpAttributionRaw | undefined): MetricAttribution | undefined {
  if (!raw) return undefined;
  const a: Mutable<MetricAttribution> = {};
  if (typeof raw.interactionTarget === "string") a.element = raw.interactionTarget;
  if (raw.interactionType === "pointer" || raw.interactionType === "keyboard") {
    a.interactionType = raw.interactionType;
  }
  const subparts: Record<string, number> = {};
  if (typeof raw.inputDelay === "number") subparts["inputDelay"] = raw.inputDelay;
  if (typeof raw.processingDuration === "number") subparts["processing"] = raw.processingDuration;
  if (typeof raw.presentationDelay === "number") subparts["presentation"] = raw.presentationDelay;
  if (Object.keys(subparts).length > 0) a.subparts = subparts;
  if (raw.longestScript?.subpart && typeof raw.longestScript.intersectingDuration === "number") {
    const ls: Mutable<NonNullable<MetricAttribution["longestScript"]>> = {
      duration: raw.longestScript.intersectingDuration,
      subpart: raw.longestScript.subpart,
    };
    if (typeof raw.longestScript.entry?.sourceURL === "string") ls.url = raw.longestScript.entry.sourceURL;
    if (typeof raw.longestScript.entry?.invoker === "string") ls.invoker = raw.longestScript.entry.invoker;
    a.longestScript = ls;
  }
  return Object.keys(a).length > 0 ? (a as MetricAttribution) : undefined;
}

function mapFcp(raw: FcpAttributionRaw | undefined): MetricAttribution | undefined {
  if (!raw) return undefined;
  const subparts: Record<string, number> = {};
  if (typeof raw.timeToFirstByte === "number") subparts["ttfb"] = raw.timeToFirstByte;
  if (typeof raw.firstByteToFCP === "number") subparts["firstByteToFCP"] = raw.firstByteToFCP;
  if (Object.keys(subparts).length === 0) return undefined;
  return { subparts };
}

function mapTtfb(raw: TtfbAttributionRaw | undefined): MetricAttribution | undefined {
  if (!raw) return undefined;
  const subparts: Record<string, number> = {};
  if (typeof raw.waitingDuration === "number") subparts["waiting"] = raw.waitingDuration;
  if (typeof raw.cacheDuration === "number") subparts["cache"] = raw.cacheDuration;
  if (typeof raw.dnsDuration === "number") subparts["dns"] = raw.dnsDuration;
  if (typeof raw.connectionDuration === "number") subparts["connection"] = raw.connectionDuration;
  if (typeof raw.requestDuration === "number") subparts["request"] = raw.requestDuration;
  if (Object.keys(subparts).length === 0) return undefined;
  return { subparts };
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

async function readSnapshot(session: CDPSessionLike): Promise<CwvSnapshot | undefined> {
  const expression = "JSON.stringify(window.__ohmyperfCwv || null)";
  const result = (await session.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: false,
  })) as RuntimeEvaluateResult;

  if (result.exceptionDetails) return undefined;
  const value = result.result?.value;
  if (typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || typeof parsed !== "object") return undefined;
    return parsed as CwvSnapshot;
  } catch {
    return undefined;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
