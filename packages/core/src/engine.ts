import { randomUUID } from "node:crypto";
import { arch as osArch, platform as osPlatform, release as osRelease } from "node:os";
import {
  type CollectorContext,
  type CollectorFactory,
  type CollectorHandle,
  type CollectorResult,
  emptyCollectorResult,
  mergeCollectorResults,
} from "./collectors.js";
import { cwvCollectorFactory } from "./collectors-impl/cwv-collector.js";
import { loadingCollectorFactory } from "./collectors-impl/loading-collector.js";
import { longTaskCollectorFactory } from "./collectors-impl/longtask-collector.js";
import { computeRenderBlockingOpportunity } from "./collectors-impl/render-blocking.js";
import { resourceCollectorFactory } from "./collectors-impl/resource-collector.js";
import { createTraceCollector } from "./collectors-impl/trace-collector.js";
import { applyEmulation, calibrate, type CalibrationResult } from "./calibration.js";
import { createConsoleLogger, createSilentLogger } from "./logger.js";
import {
  createPluginRuntime,
  loadPlugins,
  type PluginRuntime,
} from "./plugin-runtime.js";
import type {
  AggregatedMetric,
  AggregatedMetrics,
  CDPSessionLike,
  Driver,
  FrameNode,
  FrameTree,
  HeadlessMode,
  Logger,
  LongTask,
  MeasureOptions,
  Metric,
  Mode,
  Opportunity,
  Report,
  ReportCtx,
  ReportMeta,
  RunCtx,
  RunReport,
} from "./types.js";

export interface EngineLaunchAdapter {
  launchPageWithCdp(): Promise<EnginePageContext>;
}

export interface EnginePageContext {
  readonly browserVersion: string;
  readonly browserSource: "bundled" | "system" | "extension-host";
  readonly rootSession: CDPSessionLike;
  readonly attachedFrames: ReadonlyArray<EngineAttachedFrame>;
  goto(url: string): Promise<void>;
  waitForLoadIdle(timeoutMs: number): Promise<void>;
  close(): Promise<void>;
}

export interface EngineAttachedFrame {
  readonly frameId: string;
  readonly url: string;
  readonly isOOPIF: boolean;
  readonly session: CDPSessionLike | null;
}

export interface EngineRunOptions {
  readonly opts: MeasureOptions;
  readonly driver: Driver;
  readonly adapter: EngineLaunchAdapter;
  readonly logger?: Logger;
  readonly collectors?: ReadonlyArray<CollectorFactory>;
}

export const DEFAULT_COLLECTOR_FACTORIES: ReadonlyArray<CollectorFactory> = [
  cwvCollectorFactory,
  loadingCollectorFactory,
  longTaskCollectorFactory,
  resourceCollectorFactory,
];

const DEFAULT_RUNS = 5;
const DEFAULT_HEADLESS: HeadlessMode = "headless";
const DEFAULT_MODE: Mode = "real";
const ROOT_FRAME_ID = "ohmyperf:root";
const LOAD_IDLE_TIMEOUT_MS = 30_000;

export async function runEngine(input: EngineRunOptions): Promise<Report> {
  const { opts, driver, adapter, collectors } = input;
  const logger = input.logger ?? createSilentLogger();
  const factories = collectors ?? DEFAULT_COLLECTOR_FACTORIES;

  const runs = opts.runs ?? DEFAULT_RUNS;
  const headless = opts.headless ?? DEFAULT_HEADLESS;
  const mode = opts.mode ?? DEFAULT_MODE;
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();

  const plugins = loadPlugins(opts.plugins ?? []);
  const pluginRuntime = createPluginRuntime({ plugins, driver, logger });
  await pluginRuntime.setup();

  let calibration: CalibrationResult | undefined;
  if (mode === "ci-stable") {
    logger.info("engine: running CPU calibration (mode=ci-stable)");
    calibration = await calibrate({
      driver,
      adapter,
      logger,
      networkProfile: "fast-4g",
      ...(opts.calibration?.recalibrate ? { recalibrate: true } : {}),
    });
    logger.info("engine: calibration done", {
      throttleRate: calibration.throttleRate,
      observedScore: calibration.observedScore,
      cacheHit: calibration.cacheHit,
    });
  }

  const runReports: RunReport[] = [];
  const frameNodes: Record<string, FrameNode> = {};
  let browserVersion = driver.browserVersion;
  let browserSource: "bundled" | "system" | "extension-host" = "bundled";

  for (let i = 0; i < runs; i++) {
    logger.debug("engine: starting run", { runIndex: i, url: opts.url });
    const pageCtx = await adapter.launchPageWithCdp();
    browserVersion = pageCtx.browserVersion || browserVersion;
    browserSource = pageCtx.browserSource;

    const runCtx: RunCtx = {
      runIndex: i,
      driver: { id: driver.id },
      page: { id: `page:${String(i)}` },
      emit: () => undefined,
      logger,
      state: new Map<string, unknown>(),
      cdp: pageCtx.rootSession,
      async evaluateInPage<T = unknown>(expression: string): Promise<T | undefined> {
        try {
          const result = (await pageCtx.rootSession.send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
          })) as { result?: { value?: unknown }; exceptionDetails?: unknown };
          if (result.exceptionDetails) return undefined;
          return result.result?.value as T | undefined;
        } catch (err) {
          logger.debug("engine: evaluateInPage failed", {
            error: err instanceof Error ? err.message : String(err),
          });
          return undefined;
        }
      },
      audit(audit) {
        pluginRuntime.emitAudit(pluginRuntime.activePluginId.id, audit);
      },
      setData(data) {
        pluginRuntime.setPluginData(pluginRuntime.activePluginId.id, data);
      },
      recordCapabilityUse(capability) {
        pluginRuntime.recordCapabilityUse(pluginRuntime.activePluginId.id, capability, "run");
      },
    };

    try {
      await pluginRuntime.beforeNavigate(runCtx);
      const navStartMs = Date.now();

      const rootCtx: CollectorContext = {
        logger,
        frameId: ROOT_FRAME_ID,
        isRoot: true,
        url: opts.url,
        navigationStart: navStartMs,
      };
      const rootHandles = await installCollectorsOn(
        pageCtx.rootSession,
        rootCtx,
        factories,
        driver,
        logger,
      );

      if (calibration) {
        await applyEmulation(pageCtx.rootSession, calibration, logger);
      }

      const traceEnabled = opts.collectTrace === true && mode !== "ci-stable";
      const traceCollector = traceEnabled
        ? createTraceCollector(pageCtx.rootSession, logger)
        : undefined;
      if (traceCollector) {
        try {
          await traceCollector.start();
        } catch (err) {
          logger.debug("engine: Tracing.start failed; continuing without trace", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      await pageCtx.goto(opts.url);
      await pluginRuntime.onNavigate(runCtx, {
        url: opts.url,
        frameId: ROOT_FRAME_ID,
        type: "initial",
      });
      try {
        await pageCtx.waitForLoadIdle(LOAD_IDLE_TIMEOUT_MS);
      } catch (err) {
        logger.debug("engine: load-idle wait timed out", {
          runIndex: i,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      await pluginRuntime.onLoad(runCtx);
      await pluginRuntime.onIdle(runCtx);

      const frameResults: Record<string, CollectorResult> = {};
      const frameHandles: Array<{ frameId: string; handles: CollectorHandle[] }> = [];
      for (const f of pageCtx.attachedFrames) {
        if (f.session === null) continue;
        const fctx: CollectorContext = {
          logger,
          frameId: f.frameId,
          isRoot: false,
          url: f.url,
          navigationStart: navStartMs,
        };
        const handles = await installCollectorsOn(f.session, fctx, factories, driver, logger);
        frameHandles.push({ frameId: f.frameId, handles });
      }

      const rootFinal = await finalizeAll(rootHandles);
      for (const f of frameHandles) {
        frameResults[f.frameId] = await finalizeAll(f.handles);
      }

      let traceLongTasks: ReadonlyArray<LongTask> = [];
      if (traceCollector) {
        try {
          const result = await traceCollector.collect();
          traceLongTasks = result.longTasks;
        } catch (err) {
          logger.debug("engine: trace collection failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const mergedLongTasks: ReadonlyArray<LongTask> =
        traceLongTasks.length > 0 ? traceLongTasks : rootFinal.longTasks;

      const fcpValue = rootFinal.metrics["fcp"]?.value;
      const renderBlockingOpp = computeRenderBlockingOpportunity(rootFinal.resources, fcpValue);
      const opportunities: Opportunity[] = renderBlockingOpp ? [renderBlockingOpp] : [];

      const transformedMetrics = await applyOnMetric(rootFinal.metrics, runCtx, pluginRuntime);
      runReports.push(
        buildRunReport(i, {
          ...rootFinal,
          metrics: transformedMetrics,
          longTasks: mergedLongTasks,
          opportunities,
        }),
      );

      if (i === 0) {
        frameNodes[ROOT_FRAME_ID] = {
          frameId: ROOT_FRAME_ID,
          url: opts.url,
          origin: safeOrigin(opts.url),
          parentFrameId: null,
          isOOPIF: false,
          isCrossOrigin: false,
          attachedAt: navStartMs,
          metrics: rootFinal.metrics,
          children: pageCtx.attachedFrames.map((f) => f.frameId),
        };
        for (const f of pageCtx.attachedFrames) {
          frameNodes[f.frameId] = {
            frameId: f.frameId,
            url: f.url,
            origin: safeOrigin(f.url),
            parentFrameId: ROOT_FRAME_ID,
            isOOPIF: f.isOOPIF,
            isCrossOrigin: safeOrigin(f.url) !== safeOrigin(opts.url),
            attachedAt: navStartMs,
            metrics: frameResults[f.frameId]?.metrics ?? {},
            children: [],
          };
        }
      }
    } finally {
      try {
        await pageCtx.close();
      } catch (err) {
        logger.debug("engine: pageCtx.close threw", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const aggregated = aggregateRuns(runReports);
  const durationMs = Date.now() - startedAtMs;

  const reportCtx: ReportCtx = { logger };
  await pluginRuntime.beforeReport(reportCtx);

  const unstable = isReportUnstable(aggregated);
  const meta = buildMeta({
    opts,
    runs,
    mode,
    headless,
    browserVersion,
    browserSource,
    startedAt,
    durationMs,
    pluginCapabilityUses: pluginRuntime.capabilityUses,
    unstable,
    calibration,
  });

  const reportOpportunities = aggregateOpportunities(runReports);

  let report: Report = {
    schemaVersion: "1.0.0",
    meta,
    runs: runReports,
    aggregated,
    frames: { root: ROOT_FRAME_ID, nodes: frameNodes } satisfies FrameTree,
    audits: [...pluginRuntime.audits],
    artifacts: {},
    pluginData: { ...pluginRuntime.pluginData },
    ...(reportOpportunities.length > 0 ? { opportunities: reportOpportunities } : {}),
  };

  report = await pluginRuntime.onReport(reportCtx, report);
  await pluginRuntime.teardown();
  return report;
}

async function applyOnMetric(
  metrics: Readonly<Record<string, Metric>>,
  runCtx: RunCtx,
  pluginRuntime: PluginRuntime,
): Promise<Record<string, Metric>> {
  if (pluginRuntime.plugins.length === 0) return { ...metrics };
  const out: Record<string, Metric> = {};
  for (const [name, metric] of Object.entries(metrics)) {
    out[name] = await pluginRuntime.onMetric(runCtx, metric);
  }
  return out;
}

async function installCollectorsOn(
  session: CDPSessionLike,
  ctx: CollectorContext,
  factories: ReadonlyArray<CollectorFactory>,
  driver: Driver,
  logger: Logger,
): Promise<CollectorHandle[]> {
  const handles: CollectorHandle[] = [];
  for (const factory of factories) {
    const supported = factory.requires.every((cap) => driver.supports(cap));
    if (!supported) {
      logger.debug("engine: collector skipped (driver capability missing)", {
        collectorId: factory.id,
        requires: factory.requires,
      });
      continue;
    }
    try {
      const handle = await factory.create(session, ctx);
      handles.push(handle);
    } catch (err) {
      logger.warn("engine: collector create() threw", {
        collectorId: factory.id,
        frameId: ctx.frameId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return handles;
}

async function finalizeAll(handles: ReadonlyArray<CollectorHandle>): Promise<CollectorResult> {
  const results: CollectorResult[] = [];
  for (const h of handles) {
    try {
      results.push(await h.finalize());
    } catch (err) {
      results.push(emptyCollectorResult(`${h.id}: ${err instanceof Error ? err.message : String(err)}`));
    }
    try {
      await h.dispose();
    } catch {
      /* dispose errors are non-fatal */
    }
  }
  return mergeCollectorResults(results);
}

function buildRunReport(
  runIndex: number,
  rootFinal: CollectorResult & { opportunities?: ReadonlyArray<Opportunity> },
): RunReport {
  const runtime: Record<string, number> = {};
  for (const [name, m] of Object.entries(rootFinal.metrics)) {
    if (name.startsWith("runtime.")) {
      runtime[name.slice("runtime.".length)] = m.value;
    }
  }
  const base: RunReport = {
    runIndex,
    cold: runIndex === 0,
    metrics: rootFinal.metrics,
    resources: rootFinal.resources,
    longTasks: rootFinal.longTasks,
    meta: {},
  };
  const out: Mutable<RunReport> = { ...base };
  if (Object.keys(runtime).length > 0) out.runtime = runtime;
  if (rootFinal.opportunities && rootFinal.opportunities.length > 0) {
    out.opportunities = rootFinal.opportunities;
  }
  return out;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function aggregateOpportunities(runs: ReadonlyArray<RunReport>): ReadonlyArray<Opportunity> {
  const byId = new Map<string, Opportunity>();
  for (const r of runs) {
    for (const opp of r.opportunities ?? []) {
      if (!byId.has(opp.id)) byId.set(opp.id, opp);
    }
  }
  return Array.from(byId.values());
}

const UNSTABLE_COV_THRESHOLD = 0.2;
const OUTLIER_Z_THRESHOLD = 3.5;

const CWV_METRIC_NAMES = new Set(["lcp", "cls", "inp", "fcp", "ttfb"]);

export function aggregateRuns(runs: ReadonlyArray<RunReport>): AggregatedMetrics {
  const byMetric: Record<string, number[]> = {};
  for (const r of runs) {
    for (const [name, m] of Object.entries(r.metrics)) {
      const list = byMetric[name];
      if (list) list.push(m.value);
      else byMetric[name] = [m.value];
    }
  }
  const aggregated: Record<string, AggregatedMetric> = {};
  for (const [name, raw] of Object.entries(byMetric)) {
    if (raw.length === 0) continue;
    const { kept, dropped } = rejectOutliers(raw);
    const values = kept;
    if (values.length === 0) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const median = quantile(sorted, 0.5);
    const p75 = quantile(sorted, 0.75);
    const p95 = quantile(sorted, 0.95);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.length > 1
        ? values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
        : 0;
    const stdev = Math.sqrt(variance);
    const cov = mean === 0 ? 0 : Math.abs(stdev / mean);
    aggregated[name] = {
      median,
      p75,
      p95,
      mean,
      stdev,
      cov,
      runs: values.length,
      droppedOutliers: dropped,
    };
  }
  return aggregated;
}

export function isReportUnstable(aggregated: AggregatedMetrics): boolean {
  for (const name of CWV_METRIC_NAMES) {
    const agg = aggregated[name];
    if (!agg) continue;
    if (Number.isFinite(agg.cov) && agg.cov > UNSTABLE_COV_THRESHOLD) return true;
  }
  return false;
}

function rejectOutliers(values: ReadonlyArray<number>): {
  kept: number[];
  dropped: number;
} {
  if (values.length < 5) return { kept: [...values], dropped: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const deviations = values.map((v) => Math.abs(v - median));
  const sortedDeviations = [...deviations].sort((a, b) => a - b);
  const mad = quantile(sortedDeviations, 0.5);
  if (mad === 0) return { kept: [...values], dropped: 0 };
  const kept: number[] = [];
  let dropped = 0;
  for (const v of values) {
    const z = (0.6745 * (v - median)) / mad;
    if (Math.abs(z) > OUTLIER_Z_THRESHOLD) {
      dropped++;
    } else {
      kept.push(v);
    }
  }
  return { kept, dropped };
}

function quantile(sortedAsc: ReadonlyArray<number>, q: number): number {
  if (sortedAsc.length === 0) return Number.NaN;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lo = sortedAsc[base]!;
  const hi = sortedAsc[Math.min(base + 1, sortedAsc.length - 1)]!;
  return lo + rest * (hi - lo);
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

interface BuildMetaInput {
  opts: MeasureOptions;
  runs: number;
  mode: Mode;
  headless: HeadlessMode;
  browserVersion: string;
  browserSource: "bundled" | "system" | "extension-host";
  startedAt: string;
  durationMs: number;
  pluginCapabilityUses: ReadonlyArray<{
    pluginId: string;
    capability: string;
    when: string;
  }>;
  unstable: boolean;
  calibration?: CalibrationResult | undefined;
}

function buildMeta(input: BuildMetaInput): ReportMeta {
  const {
    opts,
    runs,
    mode,
    headless,
    browserVersion,
    browserSource,
    startedAt,
    durationMs,
    pluginCapabilityUses,
    unstable,
    calibration,
  } = input;
  const meta: ReportMeta = {
    url: opts.url,
    startedAt,
    durationMs,
    runs,
    mode,
    browser: {
      name: "chromium",
      version: browserVersion,
      source: browserSource,
    },
    host: {
      os: `${osPlatform()} ${osRelease()}`,
      arch: osArch(),
      nodeVersion: process.version,
    },
    parity: {
      mode: headless,
      knownDeltas: headless === "headless" ? { inp: "synthetic-input" } : {},
    },
    emulation: opts.emulation ?? false,
    pluginCapabilityUses: pluginCapabilityUses.map((u) => ({
      pluginId: u.pluginId,
      capability: u.capability as import("./types.js").PluginCapability,
      when: u.when,
    })),
    measurementId: typeof randomUUID === "function" ? randomUUID() : `m_${String(Date.now())}`,
    ...(unstable ? { unstable: true } : {}),
    ...(calibration
      ? {
          calibration: {
            reference: calibration.reference,
            observedScore: calibration.observedScore,
            throttleRate: calibration.throttleRate,
            networkProfile: calibration.networkProfile,
            cacheHit: calibration.cacheHit,
          },
        }
      : {}),
  };
  return meta;
}

export function makeConsoleLoggerForEngine(level: "debug" | "info" | "warn" | "error" = "info"): Logger {
  return createConsoleLogger({ level, prefix: "ohmyperf:engine" });
}
