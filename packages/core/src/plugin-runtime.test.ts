import { describe, expect, it } from "vitest";
import {
  PluginHookTimeout,
  PluginIncompatibleDriver,
  PluginLoadError,
} from "./errors.js";
import {
  computePluginIntegrity,
  createPluginRuntime,
  loadPlugins,
} from "./plugin-runtime.js";
import { createSilentLogger } from "./logger.js";
import { definePlugin } from "./index.js";
import type {
  Driver,
  DriverCapability,
  Metric,
  Plugin,
  Report,
  RunCtx,
} from "./types.js";

const fakeDriver: Driver = {
  id: "fake",
  browserVersion: "0.0.0",
  supports: (cap: DriverCapability) => cap === "har" || cap === "axe",
  async launch() {
    return { id: "b" };
  },
  async newPage() {
    return { id: "p" };
  },
};

const cdpDriver: Driver = {
  id: "fake-cdp",
  browserVersion: "1.0.0",
  supports: () => true,
  async launch() {
    return { id: "b" };
  },
  async newPage() {
    return { id: "p" };
  },
};

function createFakeRunCtx(): RunCtx {
  return {
    runIndex: 0,
    driver: { id: "fake" },
    page: { id: "p" },
    emit: () => undefined,
    logger: createSilentLogger(),
    state: new Map<string, unknown>(),
    cdp: null,
    async evaluateInPage<T>() {
      return undefined as T | undefined;
    },
    audit: () => undefined,
    setData: () => undefined,
    recordCapabilityUse: () => undefined,
  };
}

describe("loadPlugins()", () => {
  it("returns plugins unchanged when valid", () => {
    const p = definePlugin({ id: "a", version: "1.0.0", apiVersion: "1" });
    const out = loadPlugins([p]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("a");
  });

  it("rejects unsupported apiVersion", () => {
    const bad = { id: "x", version: "1.0.0", apiVersion: "99" } as unknown as Plugin;
    expect(() => loadPlugins([bad])).toThrow(PluginLoadError);
  });

  it("rejects duplicate plugin ids", () => {
    const a = definePlugin({ id: "dup", version: "1", apiVersion: "1" });
    const b = definePlugin({ id: "dup", version: "2", apiVersion: "1" });
    expect(() => loadPlugins([a, b])).toThrow(/Duplicate plugin id/);
  });

  it("rejects string PluginRefs in v1 (no dynamic resolution)", () => {
    expect(() => loadPlugins(["@ohmyperf/plugin-cwv"])).toThrow(PluginLoadError);
  });
});

describe("computePluginIntegrity()", () => {
  it("produces a stable sha384 hash for identical inputs", () => {
    const p = definePlugin({
      id: "x",
      version: "1.0.0",
      apiVersion: "1",
      capabilities: ["metric"],
    });
    const a = computePluginIntegrity(p);
    const b = computePluginIntegrity(p);
    expect(a).toBe(b);
    expect(a).toMatch(/^sha384-[A-Za-z0-9+/=]+$/);
  });

  it("changes when version changes", () => {
    const a = computePluginIntegrity(
      definePlugin({ id: "x", version: "1.0.0", apiVersion: "1" }),
    );
    const b = computePluginIntegrity(
      definePlugin({ id: "x", version: "1.0.1", apiVersion: "1" }),
    );
    expect(a).not.toBe(b);
  });
});

describe("createPluginRuntime()", () => {
  it("rejects plugins requiring lowLevel on a driver without cdp-oopif", () => {
    const plugin = definePlugin({
      id: "deep",
      version: "1.0.0",
      apiVersion: "1",
      capabilities: ["lowLevel"],
    });
    expect(() =>
      createPluginRuntime({ plugins: [plugin], driver: fakeDriver, logger: createSilentLogger() }),
    ).toThrow(PluginIncompatibleDriver);
  });

  it("invokes hooks in canonical order", async () => {
    const order: string[] = [];
    const plugin = definePlugin({
      id: "order-tracker",
      version: "1",
      apiVersion: "1",
      setup: () => {
        order.push("setup");
      },
      hooks: {
        beforeNavigate: () => {
          order.push("beforeNavigate");
        },
        onNavigate: () => {
          order.push("onNavigate");
        },
        onLoad: () => {
          order.push("onLoad");
        },
        onIdle: () => {
          order.push("onIdle");
        },
        onMetric: () => {
          order.push("onMetric");
        },
        beforeReport: () => {
          order.push("beforeReport");
        },
        onReport: () => {
          order.push("onReport");
        },
      },
      teardown: () => {
        order.push("teardown");
      },
    });

    const runtime = createPluginRuntime({
      plugins: [plugin],
      driver: cdpDriver,
      logger: createSilentLogger(),
    });
    const ctx = createFakeRunCtx();
    const reportCtx = { logger: createSilentLogger() };
    const fakeMetric: Metric = { name: "lcp", value: 100, unit: "ms" };
    const fakeReport = {
      schemaVersion: "1.0.0",
      meta: {},
      runs: [],
      aggregated: {},
      frames: { root: "r", nodes: {} },
      audits: [],
      artifacts: {},
      pluginData: {},
    } as unknown as Report;

    await runtime.setup();
    await runtime.beforeNavigate(ctx);
    await runtime.onNavigate(ctx, { url: "u", frameId: "r", type: "initial" });
    await runtime.onLoad(ctx);
    await runtime.onIdle(ctx);
    await runtime.onMetric(ctx, fakeMetric);
    await runtime.beforeReport(reportCtx);
    await runtime.onReport(reportCtx, fakeReport);
    await runtime.teardown();

    expect(order).toEqual([
      "setup",
      "beforeNavigate",
      "onNavigate",
      "onLoad",
      "onIdle",
      "onMetric",
      "beforeReport",
      "onReport",
      "teardown",
    ]);
  });

  it("times out a hook that never resolves with PluginHookTimeout", async () => {
    const plugin = definePlugin({
      id: "stuck",
      version: "1",
      apiVersion: "1",
      hooks: {
        onLoad: () => new Promise<void>(() => undefined),
      },
    });
    const runtime = createPluginRuntime({
      plugins: [plugin],
      driver: cdpDriver,
      logger: createSilentLogger(),
      hookTimeoutMs: 50,
    });
    await expect(runtime.onLoad(createFakeRunCtx())).rejects.toBeInstanceOf(PluginHookTimeout);
  });

  it("onMetric replaces value and stashes previousValue", async () => {
    const transformer = definePlugin({
      id: "double",
      version: "1",
      apiVersion: "1",
      hooks: {
        onMetric: (_ctx, m: Metric): Metric => ({ ...m, value: m.value * 2 }),
      },
    });
    const runtime = createPluginRuntime({
      plugins: [transformer],
      driver: cdpDriver,
      logger: createSilentLogger(),
    });
    const out = await runtime.onMetric(createFakeRunCtx(), {
      name: "lcp",
      value: 100,
      unit: "ms",
    });
    expect(out.value).toBe(200);
    expect(out.previousValue).toBe(100);
  });

  it("onMetric ignores non-finite values returned by a plugin", async () => {
    const broken = definePlugin({
      id: "broken",
      version: "1",
      apiVersion: "1",
      hooks: {
        onMetric: (_ctx, m: Metric): Metric => ({ ...m, value: Number.NaN }),
      },
    });
    const runtime = createPluginRuntime({
      plugins: [broken],
      driver: cdpDriver,
      logger: createSilentLogger(),
    });
    const out = await runtime.onMetric(createFakeRunCtx(), {
      name: "lcp",
      value: 42,
      unit: "ms",
    });
    expect(out.value).toBe(42);
  });

  it("captures audits and pluginData scoped per plugin id", async () => {
    const plugin = definePlugin({
      id: "auditor",
      version: "1",
      apiVersion: "1",
      hooks: {
        onIdle: (ctx) => {
          ctx.audit({
            id: "x",
            title: "X",
            score: 1,
            passed: true,
            status: "pass",
          });
          ctx.setData({ count: 7 });
          ctx.recordCapabilityUse("audit");
        },
      },
    });
    const runtime = createPluginRuntime({
      plugins: [plugin],
      driver: cdpDriver,
      logger: createSilentLogger(),
    });
    const captured: { audits: unknown[]; data: unknown; uses: unknown[] } = {
      audits: [],
      data: undefined,
      uses: [],
    };
    const ctx: RunCtx = {
      ...createFakeRunCtx(),
      audit: (a) => {
        captured.audits.push(a);
        runtime.emitAudit(runtime.activePluginId.id, a);
      },
      setData: (d) => {
        captured.data = d;
        runtime.setPluginData(runtime.activePluginId.id, d);
      },
      recordCapabilityUse: (cap) => {
        captured.uses.push({ id: runtime.activePluginId.id, cap });
        runtime.recordCapabilityUse(runtime.activePluginId.id, cap, "test");
      },
    };
    await runtime.onIdle(ctx);
    expect(runtime.audits).toHaveLength(1);
    expect(runtime.pluginData["auditor"]).toEqual({ count: 7 });
    expect(runtime.capabilityUses).toHaveLength(1);
    expect(runtime.capabilityUses[0]!.pluginId).toBe("auditor");
  });
});
