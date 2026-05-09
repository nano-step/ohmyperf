export const PACKAGE_NAME = "@ohmyperf/core" as const;
export const SCHEMA_VERSION = "1.0.0" as const;

export { createConsoleLogger, createSilentLogger } from "./logger.js";
export type { LogLevel, ConsoleLoggerOptions } from "./logger.js";

export {
  emptyCollectorResult,
  mergeCollectorResults,
  withCollectorTimeout,
  CollectorTimeoutError,
} from "./collectors.js";
export type {
  CollectorContext,
  CollectorFactory,
  CollectorHandle,
  CollectorResult,
} from "./collectors.js";

export {
  DEFAULT_COLLECTOR_FACTORIES,
  runEngine,
  makeConsoleLoggerForEngine,
} from "./engine.js";
export type {
  EngineAttachedFrame,
  EngineLaunchAdapter,
  EnginePageContext,
  EngineRunOptions,
} from "./engine.js";

export { cwvCollectorFactory } from "./collectors-impl/cwv-collector.js";
export { loadingCollectorFactory } from "./collectors-impl/loading-collector.js";
export { longTaskCollectorFactory } from "./collectors-impl/longtask-collector.js";

export {
  HOOK_NAMES,
  checkDriverCompatibility,
  computePluginIntegrity,
  createPluginRuntime,
  loadPlugins,
} from "./plugin-runtime.js";
export type {
  HookName,
  PluginCapabilityUseRecord,
  PluginRuntime,
  PluginRuntimeOptions,
} from "./plugin-runtime.js";

export type {
  AggregatedMetric,
  AggregatedMetrics,
  ArtifactRef,
  AuditResult,
  Awaitable,
  BrowserHandle,
  BrowserInfo,
  BudgetConfig,
  BudgetEvaluation,
  CDPSessionLike,
  CalibrationInfo,
  Driver,
  DriverCapability,
  DriverHandle,
  DriverRef,
  EmulationConfig,
  EngineHooks,
  FrameCtx,
  FrameNode,
  FrameTree,
  HeadlessMode,
  LaunchOpts,
  Logger,
  LongTask,
  MeasureOptions,
  Metric,
  MetricAttribution,
  Mode,
  NavigationEvent,
  PageHandle,
  ParityInfo,
  Plugin,
  PluginCapability,
  PluginHooks,
  PluginRef,
  PluginRefByName,
  Report,
  ReportCtx,
  ReportMeta,
  Resource,
  ReporterName,
  RunCtx,
  RunReport,
  ScenarioDefinition,
  ScenarioFn,
  ScenarioStep,
  SchemaVersion,
  SetupCtx,
  ShareCtx,
  TargetHandle,
  TeardownCtx,
} from "./types.js";

import type {
  MeasureOptions,
  Plugin,
  Report,
  ScenarioDefinition,
} from "./types.js";

import { MeasureOptionsError } from "./errors.js";

export {
  MeasureOptionsError,
  PluginLoadError,
  PluginHookTimeout,
  PluginIncompatibleDriver,
} from "./errors.js";

export function defineScenario<T extends ScenarioDefinition>(scenario: T): T {
  return scenario;
}

export function definePlugin<T extends Plugin>(plugin: T): T {
  return plugin;
}

export function defineConfig<T>(config: T): T {
  return config;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function measure(opts: MeasureOptions): Promise<Report> {
  if (typeof opts !== "object" || opts === null) {
    throw new MeasureOptionsError("opts must be an object", "opts");
  }
  if (typeof opts.url !== "string" || !isValidHttpUrl(opts.url)) {
    throw new MeasureOptionsError(
      `Invalid url: expected http(s) URL, got ${JSON.stringify(opts.url)}`,
      "url",
    );
  }
  if (
    opts.runs !== undefined &&
    (!Number.isInteger(opts.runs) || opts.runs < 1)
  ) {
    throw new MeasureOptionsError(
      `Invalid runs: expected positive integer, got ${String(opts.runs)}`,
      "runs",
    );
  }

  throw new Error(
    "ohmyperf measure() is not yet implemented. The engine is in P0 development; see openspec/changes/add-ohmyperf-mvp/ for the implementation plan.",
  );
}
