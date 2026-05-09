import { createHash } from "node:crypto";
import {
  PluginHookTimeout,
  PluginIncompatibleDriver,
  PluginLoadError,
} from "./errors.js";
import type {
  AuditResult,
  Driver,
  Logger,
  Metric,
  NavigationEvent,
  Plugin,
  PluginRef,
  ReportCtx,
  RunCtx,
  SetupCtx,
  ShareCtx,
  TeardownCtx,
} from "./types.js";

const SUPPORTED_API_VERSION = "1" as const;

const DEFAULT_HOOK_TIMEOUT_MS = 30_000;

export const HOOK_NAMES = [
  "beforeNavigate",
  "onNavigate",
  "onLoad",
  "onIdle",
  "onFrameAttached",
  "onMetric",
  "beforeReport",
  "onReport",
  "onShare",
] as const;

export type HookName = (typeof HOOK_NAMES)[number];

export interface PluginCapabilityUseRecord {
  readonly pluginId: string;
  readonly capability: string;
  readonly when: string;
}

export interface PluginRuntimeOptions {
  readonly plugins: ReadonlyArray<Plugin>;
  readonly driver: Driver;
  readonly logger: Logger;
  readonly hookTimeoutMs?: number;
}

export interface PluginRuntime {
  readonly plugins: ReadonlyArray<Plugin>;
  readonly capabilityUses: ReadonlyArray<PluginCapabilityUseRecord>;
  readonly audits: ReadonlyArray<AuditResult>;
  readonly pluginData: Readonly<Record<string, unknown>>;
  readonly activePluginId: { id: string };
  setup(): Promise<void>;
  beforeNavigate(ctx: RunCtx): Promise<void>;
  onNavigate(ctx: RunCtx, nav: NavigationEvent): Promise<void>;
  onLoad(ctx: RunCtx): Promise<void>;
  onIdle(ctx: RunCtx): Promise<void>;
  onMetric(ctx: RunCtx, metric: Metric): Promise<Metric>;
  beforeReport(ctx: ReportCtx): Promise<void>;
  onReport(ctx: ReportCtx, report: import("./types.js").Report): Promise<import("./types.js").Report>;
  onShare(ctx: ShareCtx, report: import("./types.js").Report): Promise<void>;
  teardown(): Promise<void>;
  recordCapabilityUse(pluginId: string, capability: string, when: string): void;
  emitAudit(pluginId: string, audit: AuditResult): void;
  setPluginData(pluginId: string, data: unknown): void;
}

export function loadPlugins(refs: ReadonlyArray<PluginRef>): ReadonlyArray<Plugin> {
  const seen = new Map<string, Plugin>();
  for (const ref of refs) {
    const plugin = resolvePluginRef(ref);
    if (plugin.apiVersion !== SUPPORTED_API_VERSION) {
      throw new PluginLoadError(
        `Unsupported apiVersion ${String(plugin.apiVersion)} for plugin ${plugin.id}; expected ${SUPPORTED_API_VERSION}`,
      );
    }
    if (seen.has(plugin.id)) {
      throw new PluginLoadError(`Duplicate plugin id: ${plugin.id}`);
    }
    seen.set(plugin.id, plugin);
  }
  return Array.from(seen.values());
}

export function checkDriverCompatibility(
  plugins: ReadonlyArray<Plugin>,
  driver: Driver,
): void {
  for (const plugin of plugins) {
    for (const capability of plugin.capabilities ?? []) {
      if (capability === "lowLevel" && !driver.supports("cdp-oopif")) {
        throw new PluginIncompatibleDriver(
          `plugin ${plugin.id} requires lowLevel; driver ${driver.id} does not support it`,
        );
      }
    }
  }
}

function resolvePluginRef(ref: PluginRef): Plugin {
  if (typeof ref === "string") {
    throw new PluginLoadError(
      `Cannot resolve plugin from string '${ref}': dynamic resolution requires an explicit Plugin instance in v1. Pass the plugin object directly.`,
    );
  }
  const candidate = ref as Plugin;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    throw new PluginLoadError("plugin is missing required 'id' string");
  }
  if (typeof candidate.version !== "string") {
    throw new PluginLoadError(`plugin ${candidate.id} is missing required 'version' string`);
  }
  if (typeof candidate.apiVersion !== "string") {
    throw new PluginLoadError(`plugin ${candidate.id} is missing required 'apiVersion' field`);
  }
  return candidate;
}

export function computePluginIntegrity(plugin: Plugin): string {
  const canonical = JSON.stringify({
    id: plugin.id,
    version: plugin.version,
    apiVersion: plugin.apiVersion,
    capabilities: plugin.capabilities ?? [],
  });
  const digest = createHash("sha384").update(canonical).digest("base64");
  return `sha384-${digest}`;
}

export function createPluginRuntime(opts: PluginRuntimeOptions): PluginRuntime {
  const plugins = opts.plugins;
  const logger = opts.logger;
  const hookTimeoutMs = opts.hookTimeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS;
  checkDriverCompatibility(plugins, opts.driver);

  const capabilityUses: PluginCapabilityUseRecord[] = [];
  const audits: AuditResult[] = [];
  const pluginData: Record<string, unknown> = {};
  const activePluginId = { id: "unknown" };

  async function invokeOne(
    plugin: Plugin,
    hookName: HookName | "setup" | "teardown",
    invocation: () => unknown,
  ): Promise<unknown> {
    activePluginId.id = plugin.id;
    try {
      return await invokeHook(plugin, hookName, invocation, logger, hookTimeoutMs);
    } finally {
      activePluginId.id = "unknown";
    }
  }

  const runtime: PluginRuntime = {
    plugins,
    capabilityUses,
    audits,
    pluginData,
    activePluginId,
    async setup() {
      const ctx: SetupCtx = { logger };
      for (const plugin of plugins) {
        if (typeof plugin.setup !== "function") continue;
        await invokeOne(plugin, "setup", () => plugin.setup!(ctx));
      }
    },
    async beforeNavigate(ctx: RunCtx) {
      for (const plugin of plugins) {
        const fn = plugin.hooks?.beforeNavigate;
        if (typeof fn !== "function") continue;
        await invokeOne(plugin, "beforeNavigate", () => fn(ctx));
      }
    },
    async onNavigate(ctx: RunCtx, nav: NavigationEvent) {
      for (const plugin of plugins) {
        const fn = plugin.hooks?.onNavigate;
        if (typeof fn !== "function") continue;
        await invokeOne(plugin, "onNavigate", () => fn(ctx, nav));
      }
    },
    async onLoad(ctx: RunCtx) {
      for (const plugin of plugins) {
        const fn = plugin.hooks?.onLoad;
        if (typeof fn !== "function") continue;
        await invokeOne(plugin, "onLoad", () => fn(ctx));
      }
    },
    async onIdle(ctx: RunCtx) {
      for (const plugin of plugins) {
        const fn = plugin.hooks?.onIdle;
        if (typeof fn !== "function") continue;
        await invokeOne(plugin, "onIdle", () => fn(ctx));
      }
    },
    async onMetric(ctx: RunCtx, metric: Metric) {
      let current = metric;
      for (const plugin of plugins) {
        const fn = plugin.hooks?.onMetric;
        if (typeof fn !== "function") continue;
        const result = await invokeOne(plugin, "onMetric", () => fn(ctx, current));
        if (result !== undefined && result !== null) {
          const transformed = result as Metric;
          if (typeof transformed.value === "number" && Number.isFinite(transformed.value)) {
            current = { ...transformed, previousValue: current.value };
          }
        }
      }
      return current;
    },
    async beforeReport(ctx: ReportCtx) {
      for (const plugin of plugins) {
        const fn = plugin.hooks?.beforeReport;
        if (typeof fn !== "function") continue;
        await invokeOne(plugin, "beforeReport", () => fn(ctx));
      }
    },
    async onReport(ctx: ReportCtx, report) {
      let current = report;
      for (const plugin of plugins) {
        const fn = plugin.hooks?.onReport;
        if (typeof fn !== "function") continue;
        const result = await invokeOne(plugin, "onReport", () => fn(ctx, current));
        if (result !== undefined && result !== null) {
          current = result as import("./types.js").Report;
        }
      }
      return current;
    },
    async onShare(ctx: ShareCtx, report) {
      for (const plugin of plugins) {
        const fn = plugin.hooks?.onShare;
        if (typeof fn !== "function") continue;
        await invokeOne(plugin, "onShare", () => fn(ctx, report));
      }
    },
    async teardown() {
      const ctx: TeardownCtx = { logger };
      for (const plugin of plugins) {
        if (typeof plugin.teardown !== "function") continue;
        try {
          await invokeOne(plugin, "teardown", () => plugin.teardown!(ctx));
        } catch (err) {
          logger.warn("plugin-runtime: teardown threw, continuing", {
            pluginId: plugin.id,
            error: errMessage(err),
          });
        }
      }
    },
    recordCapabilityUse(pluginId, capability, when) {
      capabilityUses.push({ pluginId, capability, when });
    },
    emitAudit(_pluginId, audit) {
      audits.push(audit);
    },
    setPluginData(pluginId, data) {
      pluginData[pluginId] = data;
    },
  };

  return runtime;
}

async function invokeHook<T>(
  plugin: Plugin,
  hookName: HookName | "setup" | "teardown",
  fn: () => T | Promise<T>,
  logger: Logger,
  timeoutMs: number,
): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const racePromise = new Promise<T>((resolve, reject) => {
      Promise.resolve()
        .then(fn)
        .then(resolve, (err: unknown) => {
          reject(err instanceof Error ? err : new Error(String(err)));
        });
      timer = setTimeout(() => {
        reject(
          new PluginHookTimeout(
            `plugin ${plugin.id} hook ${hookName} timed out after ${String(timeoutMs)}ms`,
          ),
        );
      }, timeoutMs);
    });
    const out = await racePromise;
    return out;
  } catch (err) {
    if (err instanceof PluginHookTimeout) {
      throw err;
    }
    logger.warn("plugin-runtime: hook threw", {
      pluginId: plugin.id,
      hook: hookName,
      error: errMessage(err),
    });
    throw err;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
