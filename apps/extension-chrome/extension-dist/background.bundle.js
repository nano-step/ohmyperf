// ../../packages/core/dist/logger.js
function createSilentLogger() {
  return {
    debug: () => void 0,
    info: () => void 0,
    warn: () => void 0,
    error: () => void 0
  };
}

// ../../packages/core/dist/collectors.js
function emptyCollectorResult(reason) {
  const result = {
    metrics: {},
    longTasks: [],
    resources: [],
    available: reason === void 0,
    ...reason !== void 0 ? { reason } : {}
  };
  return result;
}
function mergeCollectorResults(results) {
  const metrics = {};
  const longTasks = [];
  const resources = [];
  let available = true;
  const reasons = [];
  for (const r of results) {
    for (const [name, metric] of Object.entries(r.metrics)) {
      metrics[name] = metric;
    }
    longTasks.push(...r.longTasks);
    resources.push(...r.resources);
    if (!r.available) {
      available = false;
      if (r.reason)
        reasons.push(r.reason);
    }
  }
  const merged = {
    metrics,
    longTasks,
    resources,
    available,
    ...reasons.length > 0 ? { reason: reasons.join("; ") } : {}
  };
  return merged;
}

// extension-dist/_stubs/node-stub.mjs
var randomUUID = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
var arch = () => "browser";
var platform = () => "browser";
var release = () => "";
var homedir = () => "";
var hostname = () => "extension";
var totalmem = () => 0;
var createHash = () => ({ update() {
  return this;
}, digest() {
  return "";
} });
var readFile = async () => {
  throw new Error("node:fs/promises not available in browser bundle");
};
var writeFile = async () => void 0;
var mkdir = async () => void 0;
var join = (...p) => p.join("/");
var dirname = (p) => p.split("/").slice(0, -1).join("/");

// ../../packages/core/dist/collectors-impl/cwv-inline-script.js
var CWV_INLINE_SCRIPT = `
(() => {
  if (window.__ohmyperfCwv) return;
  const state = { lcp: undefined, cls: 0, inp: undefined, fcp: undefined, ttfb: undefined };
  window.__ohmyperfCwv = state;

  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav && typeof nav.responseStart === 'number' && typeof nav.startTime === 'number') {
      state.ttfb = nav.responseStart - nav.startTime;
    }
  } catch (_) {}

  function safeObserve(type, cb, opts) {
    try {
      const po = new PerformanceObserver(cb);
      po.observe(Object.assign({ type }, opts || {}));
      return po;
    } catch (_) {
      return null;
    }
  }

  safeObserve('paint', (entries) => {
    for (const e of entries.getEntries()) {
      if (e.name === 'first-contentful-paint') {
        state.fcp = e.startTime;
      }
    }
  }, { buffered: true });

  safeObserve('largest-contentful-paint', (entries) => {
    const list = entries.getEntries();
    const last = list[list.length - 1];
    if (last) state.lcp = last.startTime;
  }, { buffered: true });

  safeObserve('layout-shift', (entries) => {
    for (const e of entries.getEntries()) {
      if (!e.hadRecentInput) {
        state.cls += e.value;
      }
    }
  }, { buffered: true });

  safeObserve('event', (entries) => {
    for (const e of entries.getEntries()) {
      const dur = e.duration;
      if (typeof dur === 'number' && (state.inp === undefined || dur > state.inp)) {
        state.inp = dur;
      }
    }
  }, { buffered: true, durationThreshold: 16 });
})();
`;

// ../../packages/core/dist/collectors-impl/cwv-collector.js
var cwvCollectorFactory = {
  id: "ohmyperf.cwv",
  requires: [],
  async create(session, ctx) {
    let installed = false;
    try {
      await session.send("Runtime.enable");
      await session.send("Page.enable");
      await session.send("Page.addScriptToEvaluateOnNewDocument", {
        source: CWV_INLINE_SCRIPT,
        runImmediately: true
      });
      installed = true;
    } catch (err) {
      ctx.logger.debug("cwv-collector: install failed", {
        frameId: ctx.frameId,
        error: errMessage(err)
      });
    }
    return {
      id: cwvCollectorFactory.id,
      async finalize() {
        if (!installed) {
          return emptyCollectorResult("cwv-script-injection-failed");
        }
        try {
          const snapshot = await readSnapshot(session);
          if (!snapshot) {
            return emptyCollectorResult("cwv-snapshot-unavailable");
          }
          const metrics = {};
          if (typeof snapshot.lcp === "number" && Number.isFinite(snapshot.lcp)) {
            metrics["lcp"] = { name: "lcp", value: snapshot.lcp, unit: "ms" };
          }
          if (typeof snapshot.cls === "number" && Number.isFinite(snapshot.cls)) {
            metrics["cls"] = { name: "cls", value: snapshot.cls, unit: "score" };
          }
          if (typeof snapshot.inp === "number" && Number.isFinite(snapshot.inp)) {
            metrics["inp"] = { name: "inp", value: snapshot.inp, unit: "ms" };
          }
          if (typeof snapshot.fcp === "number" && Number.isFinite(snapshot.fcp)) {
            metrics["fcp"] = { name: "fcp", value: snapshot.fcp, unit: "ms" };
          }
          if (typeof snapshot.ttfb === "number" && Number.isFinite(snapshot.ttfb)) {
            metrics["ttfb"] = { name: "ttfb", value: snapshot.ttfb, unit: "ms" };
          }
          return {
            metrics,
            longTasks: [],
            resources: [],
            available: true
          };
        } catch (err) {
          return emptyCollectorResult(`cwv-finalize-error: ${errMessage(err)}`);
        }
      },
      async dispose() {
        return void 0;
      }
    };
  }
};
async function readSnapshot(session) {
  const expression = "JSON.stringify(window.__ohmyperfCwv || null)";
  const result = await session.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: false
  });
  if (result.exceptionDetails)
    return void 0;
  const value = result.result?.value;
  if (typeof value !== "string")
    return void 0;
  try {
    const parsed = JSON.parse(value);
    if (parsed === null || typeof parsed !== "object")
      return void 0;
    return parsed;
  } catch {
    return void 0;
  }
}
function errMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

// ../../packages/core/dist/collectors-impl/loading-collector.js
var TRACKED_LIFECYCLE = /* @__PURE__ */ new Set([
  "navigationStart",
  "DOMContentLoaded",
  "load",
  "firstPaint",
  "firstContentfulPaint"
]);
var loadingCollectorFactory = {
  id: "ohmyperf.loading",
  requires: [],
  async create(session, ctx) {
    const lifecycle = /* @__PURE__ */ new Map();
    let installed = false;
    try {
      await session.send("Page.enable");
      await session.send("Page.setLifecycleEventsEnabled", { enabled: true });
      await session.send("Performance.enable");
      installed = true;
    } catch (err) {
      ctx.logger.debug("loading-collector: install failed", {
        frameId: ctx.frameId,
        error: errMessage2(err)
      });
    }
    session.on("Page.lifecycleEvent", (raw) => {
      const event = raw;
      if (!TRACKED_LIFECYCLE.has(event.name))
        return;
      if (lifecycle.has(event.name))
        return;
      lifecycle.set(event.name, event.timestamp * 1e6);
    });
    return {
      id: loadingCollectorFactory.id,
      async finalize() {
        if (!installed)
          return emptyCollectorResult("loading-collector-install-failed");
        const metrics = {};
        const navStartUs = lifecycle.get("navigationStart");
        const dclUs = lifecycle.get("DOMContentLoaded");
        const loadUs = lifecycle.get("load");
        if (navStartUs !== void 0) {
          const navStartMs = navStartUs / 1e3;
          if (dclUs !== void 0) {
            const ms = dclUs / 1e3 - navStartMs;
            if (Number.isFinite(ms) && ms >= 0 && ms < 6e5) {
              metrics["domContentLoaded"] = {
                name: "domContentLoaded",
                value: ms,
                unit: "ms"
              };
            }
          }
          if (loadUs !== void 0) {
            const ms = loadUs / 1e3 - navStartMs;
            if (Number.isFinite(ms) && ms >= 0 && ms < 6e5) {
              metrics["load"] = { name: "load", value: ms, unit: "ms" };
            }
          }
        }
        try {
          await session.send("Performance.getMetrics");
        } catch (err) {
          ctx.logger.debug("loading-collector: Performance.getMetrics failed", {
            error: errMessage2(err)
          });
        }
        return { metrics, longTasks: [], resources: [], available: true };
      },
      async dispose() {
        return void 0;
      }
    };
  }
};
function errMessage2(err) {
  return err instanceof Error ? err.message : String(err);
}

// ../../packages/core/dist/collectors-impl/longtask-collector.js
var LONGTASK_INLINE_SCRIPT = `
(() => {
  if (window.__ohmyperfLongTasks) return;
  const list = [];
  window.__ohmyperfLongTasks = list;
  try {
    const po = new PerformanceObserver((entries) => {
      for (const e of entries.getEntries()) {
        list.push({ startTime: e.startTime, duration: e.duration });
      }
    });
    po.observe({ type: 'longtask', buffered: true });
  } catch (_) {}
})();
`;
var longTaskCollectorFactory = {
  id: "ohmyperf.longtask",
  requires: [],
  async create(session, ctx) {
    let installed = false;
    try {
      await session.send("Runtime.enable");
      await session.send("Page.enable");
      await session.send("Page.addScriptToEvaluateOnNewDocument", {
        source: LONGTASK_INLINE_SCRIPT,
        runImmediately: true
      });
      installed = true;
    } catch (err) {
      ctx.logger.debug("longtask-collector: install failed", {
        frameId: ctx.frameId,
        error: errMessage3(err)
      });
    }
    return {
      id: longTaskCollectorFactory.id,
      async finalize() {
        if (!installed)
          return emptyCollectorResult("longtask-script-injection-failed");
        try {
          const raw = await readLongTasks(session);
          if (!raw)
            return emptyCollectorResult("longtask-snapshot-unavailable");
          const longTasks = raw.map((t) => ({
            startTime: t.startTime,
            duration: t.duration,
            attribution: ctx.isRoot ? "main-thread" : `frame:${ctx.frameId}`
          }));
          const totalBlockingTime = longTasks.reduce((acc, t) => acc + Math.max(0, t.duration - 50), 0);
          const metrics = {};
          if (ctx.isRoot) {
            metrics["tbt"] = { name: "tbt", value: totalBlockingTime, unit: "ms" };
          }
          return {
            metrics,
            longTasks,
            resources: [],
            available: true
          };
        } catch (err) {
          return emptyCollectorResult(`longtask-finalize-error: ${errMessage3(err)}`);
        }
      },
      async dispose() {
        return void 0;
      }
    };
  }
};
async function readLongTasks(session) {
  const result = await session.send("Runtime.evaluate", {
    expression: "JSON.stringify(window.__ohmyperfLongTasks || [])",
    returnByValue: true,
    awaitPromise: false
  });
  if (result.exceptionDetails)
    return void 0;
  const value = result.result?.value;
  if (typeof value !== "string")
    return void 0;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed))
      return void 0;
    return parsed.filter((x) => x !== null && typeof x === "object" && typeof x.startTime === "number" && typeof x.duration === "number");
  } catch {
    return void 0;
  }
}
function errMessage3(err) {
  return err instanceof Error ? err.message : String(err);
}

// ../../packages/core/dist/collectors-impl/resource-collector.js
var RENDER_BLOCKING_TYPES = /* @__PURE__ */ new Set(["Stylesheet", "Document"]);
var resourceCollectorFactory = {
  id: "ohmyperf.resources",
  requires: [],
  async create(session, ctx) {
    const inFlight = /* @__PURE__ */ new Map();
    let installed = false;
    try {
      await session.send("Network.enable", { maxResourceBufferSize: 5e6 });
      installed = true;
    } catch (err) {
      ctx.logger.debug("resource-collector: Network.enable failed", {
        frameId: ctx.frameId,
        error: errMessage4(err)
      });
    }
    session.on("Network.requestWillBeSent", (raw) => {
      const p = raw;
      if (p.redirectResponse !== void 0) {
        const prior = inFlight.get(p.requestId);
        if (prior) {
          prior.response = p.redirectResponse;
          prior.responseAt = p.timestamp;
          prior.finishedAt = p.timestamp;
          prior.finalEncodedDataLength = p.redirectResponse.encodedDataLength ?? 0;
        }
      }
      inFlight.set(p.requestId, {
        url: p.request.url,
        startedAt: p.timestamp,
        initiatorType: p.initiator?.type ?? "other",
        type: p.type ?? "Other",
        willBeRenderBlocking: RENDER_BLOCKING_TYPES.has(p.type ?? "")
      });
    });
    session.on("Network.responseReceived", (raw) => {
      const p = raw;
      const entry = inFlight.get(p.requestId);
      if (!entry)
        return;
      entry.response = p.response;
      entry.responseAt = p.timestamp;
      if (p.willBeSentAsRenderBlocking !== void 0) {
        entry.responseRenderBlocking = p.willBeSentAsRenderBlocking;
      }
    });
    session.on("Network.loadingFinished", (raw) => {
      const p = raw;
      const entry = inFlight.get(p.requestId);
      if (!entry)
        return;
      entry.finishedAt = p.timestamp;
      entry.finalEncodedDataLength = p.encodedDataLength;
    });
    session.on("Network.loadingFailed", (raw) => {
      const p = raw;
      const entry = inFlight.get(p.requestId);
      if (!entry)
        return;
      entry.failed = { errorText: p.errorText, canceled: p.canceled === true };
      entry.finishedAt = p.timestamp;
    });
    return {
      id: resourceCollectorFactory.id,
      async finalize() {
        if (!installed)
          return emptyCollectorResult("resource-collector-install-failed");
        const resources = [];
        for (const entry of inFlight.values()) {
          if (entry.failed && entry.failed.canceled)
            continue;
          if (!entry.response || entry.responseAt === void 0)
            continue;
          resources.push(buildResource(entry));
        }
        return {
          metrics: {},
          longTasks: [],
          resources,
          available: true
        };
      },
      async dispose() {
        return void 0;
      }
    };
  }
};
function buildResource(entry) {
  const response = entry.response;
  const timing = response.timing;
  const responseAt = entry.responseAt;
  const finishedAt = entry.finishedAt ?? responseAt;
  const requestMs = clampNonNegative((responseAt - entry.startedAt) * 1e3);
  const responseMs = clampNonNegative((finishedAt - responseAt) * 1e3);
  const cacheHit = Boolean(response.fromDiskCache || response.fromPrefetchCache || response.fromServiceWorker);
  const renderBlocking = entry.responseRenderBlocking ?? entry.willBeRenderBlocking ?? false;
  const encodedSizeBytes = entry.finalEncodedDataLength ?? response.encodedDataLength ?? 0;
  const decodedSizeBytes = encodedSizeBytes;
  const transferSizeBytes = cacheHit ? 0 : encodedSizeBytes;
  const result = {
    url: entry.url,
    mimeType: response.mimeType ?? "",
    requestMs,
    responseMs,
    transferSizeBytes,
    encodedSizeBytes,
    decodedSizeBytes,
    renderBlocking,
    cacheHit
  };
  if (timing) {
    const dns = nonNegativeDelta(timing.dnsEnd, timing.dnsStart);
    const tcp = nonNegativeDelta(timing.connectEnd, timing.connectStart);
    const tls = nonNegativeDelta(timing.sslEnd, timing.sslStart);
    return {
      ...result,
      ...dns !== void 0 ? { dnsMs: dns } : {},
      ...tcp !== void 0 ? { tcpMs: tcp } : {},
      ...tls !== void 0 ? { tlsMs: tls } : {}
    };
  }
  return result;
}
function nonNegativeDelta(end, start) {
  if (!Number.isFinite(end) || !Number.isFinite(start))
    return void 0;
  if (end < 0 || start < 0)
    return void 0;
  const d = end - start;
  if (d < 0 || d > 6e4)
    return void 0;
  return d;
}
function clampNonNegative(value) {
  if (!Number.isFinite(value) || value < 0)
    return 0;
  return value;
}
function errMessage4(err) {
  return err instanceof Error ? err.message : String(err);
}

// ../../packages/core/dist/calibration.js
var CALIBRATION_REFERENCE_NAME = "mid-range-2024-laptop";
var CALIBRATION_REFERENCE_MS = 250;
var NETWORK_PROFILES = {
  "fast-4g": {
    downloadThroughput: 12 * 1024 * 1024 / 8,
    uploadThroughput: 5 * 1024 * 1024 / 8,
    latency: 70
  },
  "slow-4g": {
    downloadThroughput: 1.6 * 1024 * 1024 / 8,
    uploadThroughput: 768 * 1024 / 8,
    latency: 150
  },
  "no-throttle": null
};
var CALIBRATION_BENCHMARK_SOURCE = `
(() => {
  const ITER = 200000;
  const start = performance.now();
  let acc = 0;
  for (let i = 0; i < ITER; i++) {
    acc = (acc + Math.sin(i) * Math.cos(i / 3)) % 1.0;
  }
  return { ms: performance.now() - start, acc };
})();
`;
var CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
var CalibrationFailedError = class extends Error {
  name = "CalibrationFailedError";
};
async function calibrate(opts) {
  const logger = opts.logger ?? createSilentLogger();
  const samples = opts.samples ?? 3;
  const cacheDir = opts.cacheDir ?? defaultCacheDir();
  const networkProfile = opts.networkProfile ?? "fast-4g";
  const fingerprint = computeFingerprint(opts.driver);
  if (!opts.recalibrate) {
    const cached = await readCachedCalibration(cacheDir, fingerprint, logger);
    if (cached) {
      logger.debug("calibration: cache hit", { fingerprint, score: cached.observedScore });
      return { ...cached, cacheHit: true, networkProfile };
    }
  }
  const samplesMs = await runBenchmark(opts.adapter, samples, logger);
  if (samplesMs.length === 0) {
    throw new CalibrationFailedError("benchmark produced zero samples");
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const observedScore = median;
  const throttleRate = computeThrottleRate(observedScore, CALIBRATION_REFERENCE_MS);
  if (throttleRate < 1 && observedScore > CALIBRATION_REFERENCE_MS * 2) {
    throw new CalibrationFailedError(`host CPU is too slow to match reference (${String(observedScore)}ms vs ${String(CALIBRATION_REFERENCE_MS)}ms target); cannot speed up`);
  }
  const result = {
    reference: CALIBRATION_REFERENCE_NAME,
    observedScore,
    throttleRate,
    networkProfile,
    cacheHit: false,
    samplesMs
  };
  await writeCachedCalibration(cacheDir, fingerprint, result, logger);
  return result;
}
async function runBenchmark(adapter, samples, logger) {
  const out = [];
  for (let i = 0; i < samples; i++) {
    const ctx = await adapter.launchPageWithCdp();
    try {
      await ctx.goto("about:blank");
      const result = await ctx.rootSession.send("Runtime.evaluate", {
        expression: CALIBRATION_BENCHMARK_SOURCE,
        returnByValue: true,
        awaitPromise: false
      });
      if (result.exceptionDetails) {
        logger.debug("calibration: benchmark threw inside the page", {});
        continue;
      }
      const ms = result.result?.value?.ms;
      if (typeof ms === "number" && Number.isFinite(ms) && ms > 0) {
        out.push(ms);
      }
    } finally {
      await ctx.close();
    }
  }
  return out;
}
function computeThrottleRate(observedMs, referenceMs) {
  if (!Number.isFinite(observedMs) || observedMs <= 0)
    return 1;
  if (observedMs >= referenceMs)
    return 1;
  const rate = referenceMs / observedMs;
  return Math.max(1, Math.min(20, Number(rate.toFixed(2))));
}
async function applyEmulation(session, calibration, logger) {
  if (calibration.throttleRate > 1) {
    try {
      await session.send("Emulation.setCPUThrottlingRate", { rate: calibration.throttleRate });
    } catch (err) {
      logger.warn("calibration: setCPUThrottlingRate failed", {
        rate: calibration.throttleRate,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  const profile = NETWORK_PROFILES[calibration.networkProfile];
  if (profile) {
    try {
      await session.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: profile.latency,
        downloadThroughput: profile.downloadThroughput,
        uploadThroughput: profile.uploadThroughput
      });
    } catch (err) {
      logger.warn("calibration: emulateNetworkConditions failed", {
        profile: calibration.networkProfile,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
}
function computeFingerprint(driver) {
  const parts = [
    platform(),
    arch(),
    release(),
    String(totalmem()),
    hostname(),
    driver.id,
    driver.browserVersion,
    "v1"
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}
function defaultCacheDir() {
  const env = process.env["OHMYPERF_CACHE_DIR"];
  if (env && env.length > 0)
    return env;
  return join(homedir(), ".ohmyperf-cache");
}
async function readCachedCalibration(cacheDir, fingerprint, logger) {
  try {
    const path = join(cacheDir, "calibration.json");
    const body = await readFile(path, "utf8");
    const entries = JSON.parse(body);
    const found = entries.find((e) => e.fingerprint === fingerprint);
    if (!found)
      return void 0;
    if (Date.now() - found.storedAt > CACHE_TTL_MS) {
      logger.debug("calibration: cache stale", { fingerprint });
      return void 0;
    }
    if (found.reference !== CALIBRATION_REFERENCE_NAME)
      return void 0;
    return {
      reference: found.reference,
      observedScore: found.observedScore,
      throttleRate: found.throttleRate,
      networkProfile: "fast-4g",
      cacheHit: true,
      samplesMs: found.samplesMs
    };
  } catch {
    return void 0;
  }
}
async function writeCachedCalibration(cacheDir, fingerprint, result, logger) {
  try {
    const path = join(cacheDir, "calibration.json");
    await mkdir(dirname(path), { recursive: true });
    let entries = [];
    try {
      const existing = await readFile(path, "utf8");
      entries = JSON.parse(existing);
    } catch {
      entries = [];
    }
    const filtered = entries.filter((e) => e.fingerprint !== fingerprint);
    filtered.push({
      fingerprint,
      reference: result.reference,
      observedScore: result.observedScore,
      throttleRate: result.throttleRate,
      samplesMs: [...result.samplesMs],
      storedAt: Date.now()
    });
    await writeFile(path, JSON.stringify(filtered, null, 2), "utf8");
  } catch (err) {
    logger.debug("calibration: cache write failed", {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

// ../../packages/core/dist/errors.js
var PluginLoadError = class extends Error {
  name = "PluginLoadError";
};
var PluginHookTimeout = class extends Error {
  name = "PluginHookTimeout";
};
var PluginIncompatibleDriver = class extends Error {
  name = "PluginIncompatibleDriver";
};

// ../../packages/core/dist/plugin-runtime.js
var SUPPORTED_API_VERSION = "1";
var DEFAULT_HOOK_TIMEOUT_MS = 3e4;
function loadPlugins(refs) {
  const seen = /* @__PURE__ */ new Map();
  for (const ref of refs) {
    const plugin = resolvePluginRef(ref);
    if (plugin.apiVersion !== SUPPORTED_API_VERSION) {
      throw new PluginLoadError(`Unsupported apiVersion ${String(plugin.apiVersion)} for plugin ${plugin.id}; expected ${SUPPORTED_API_VERSION}`);
    }
    if (seen.has(plugin.id)) {
      throw new PluginLoadError(`Duplicate plugin id: ${plugin.id}`);
    }
    seen.set(plugin.id, plugin);
  }
  return Array.from(seen.values());
}
function checkDriverCompatibility(plugins, driver) {
  for (const plugin of plugins) {
    for (const capability of plugin.capabilities ?? []) {
      if (capability === "lowLevel" && !driver.supports("cdp-oopif")) {
        throw new PluginIncompatibleDriver(`plugin ${plugin.id} requires lowLevel; driver ${driver.id} does not support it`);
      }
    }
  }
}
function resolvePluginRef(ref) {
  if (typeof ref === "string") {
    throw new PluginLoadError(`Cannot resolve plugin from string '${ref}': dynamic resolution requires an explicit Plugin instance in v1. Pass the plugin object directly.`);
  }
  const candidate = ref;
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
function createPluginRuntime(opts) {
  const plugins = opts.plugins;
  const logger = opts.logger;
  const hookTimeoutMs = opts.hookTimeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS;
  checkDriverCompatibility(plugins, opts.driver);
  const capabilityUses = [];
  const audits = [];
  const pluginData = {};
  const activePluginId = { id: "unknown" };
  async function invokeOne(plugin, hookName, invocation) {
    activePluginId.id = plugin.id;
    try {
      return await invokeHook(plugin, hookName, invocation, logger, hookTimeoutMs);
    } finally {
      activePluginId.id = "unknown";
    }
  }
  const runtime = {
    plugins,
    capabilityUses,
    audits,
    pluginData,
    activePluginId,
    async setup() {
      const ctx = { logger };
      for (const plugin of plugins) {
        if (typeof plugin.setup !== "function")
          continue;
        await invokeOne(plugin, "setup", () => plugin.setup(ctx));
      }
    },
    async beforeNavigate(ctx) {
      for (const plugin of plugins) {
        const fn = plugin.hooks?.beforeNavigate;
        if (typeof fn !== "function")
          continue;
        await invokeOne(plugin, "beforeNavigate", () => fn(ctx));
      }
    },
    async onNavigate(ctx, nav) {
      for (const plugin of plugins) {
        const fn = plugin.hooks?.onNavigate;
        if (typeof fn !== "function")
          continue;
        await invokeOne(plugin, "onNavigate", () => fn(ctx, nav));
      }
    },
    async onLoad(ctx) {
      for (const plugin of plugins) {
        const fn = plugin.hooks?.onLoad;
        if (typeof fn !== "function")
          continue;
        await invokeOne(plugin, "onLoad", () => fn(ctx));
      }
    },
    async onIdle(ctx) {
      for (const plugin of plugins) {
        const fn = plugin.hooks?.onIdle;
        if (typeof fn !== "function")
          continue;
        await invokeOne(plugin, "onIdle", () => fn(ctx));
      }
    },
    async onMetric(ctx, metric) {
      let current = metric;
      for (const plugin of plugins) {
        const fn = plugin.hooks?.onMetric;
        if (typeof fn !== "function")
          continue;
        const result = await invokeOne(plugin, "onMetric", () => fn(ctx, current));
        if (result !== void 0 && result !== null) {
          const transformed = result;
          if (typeof transformed.value === "number" && Number.isFinite(transformed.value)) {
            current = { ...transformed, previousValue: current.value };
          }
        }
      }
      return current;
    },
    async beforeReport(ctx) {
      for (const plugin of plugins) {
        const fn = plugin.hooks?.beforeReport;
        if (typeof fn !== "function")
          continue;
        await invokeOne(plugin, "beforeReport", () => fn(ctx));
      }
    },
    async onReport(ctx, report) {
      let current = report;
      for (const plugin of plugins) {
        const fn = plugin.hooks?.onReport;
        if (typeof fn !== "function")
          continue;
        const result = await invokeOne(plugin, "onReport", () => fn(ctx, current));
        if (result !== void 0 && result !== null) {
          current = result;
        }
      }
      return current;
    },
    async onShare(ctx, report) {
      for (const plugin of plugins) {
        const fn = plugin.hooks?.onShare;
        if (typeof fn !== "function")
          continue;
        await invokeOne(plugin, "onShare", () => fn(ctx, report));
      }
    },
    async teardown() {
      const ctx = { logger };
      for (const plugin of plugins) {
        if (typeof plugin.teardown !== "function")
          continue;
        try {
          await invokeOne(plugin, "teardown", () => plugin.teardown(ctx));
        } catch (err) {
          logger.warn("plugin-runtime: teardown threw, continuing", {
            pluginId: plugin.id,
            error: errMessage5(err)
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
    }
  };
  return runtime;
}
async function invokeHook(plugin, hookName, fn, logger, timeoutMs) {
  let timer;
  try {
    const racePromise = new Promise((resolve, reject) => {
      Promise.resolve().then(fn).then(resolve, (err) => {
        reject(err instanceof Error ? err : new Error(String(err)));
      });
      timer = setTimeout(() => {
        reject(new PluginHookTimeout(`plugin ${plugin.id} hook ${hookName} timed out after ${String(timeoutMs)}ms`));
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
      error: errMessage5(err)
    });
    throw err;
  } finally {
    if (timer !== void 0)
      clearTimeout(timer);
  }
}
function errMessage5(err) {
  return err instanceof Error ? err.message : String(err);
}

// ../../packages/core/dist/engine.js
var DEFAULT_COLLECTOR_FACTORIES = [
  cwvCollectorFactory,
  loadingCollectorFactory,
  longTaskCollectorFactory,
  resourceCollectorFactory
];
var DEFAULT_RUNS = 5;
var DEFAULT_HEADLESS = "headless";
var DEFAULT_MODE = "real";
var ROOT_FRAME_ID = "ohmyperf:root";
var LOAD_IDLE_TIMEOUT_MS = 3e4;
async function runEngine(input) {
  const { opts, driver, adapter, collectors } = input;
  const logger = input.logger ?? createSilentLogger();
  const factories = collectors ?? DEFAULT_COLLECTOR_FACTORIES;
  const runs = opts.runs ?? DEFAULT_RUNS;
  const headless = opts.headless ?? DEFAULT_HEADLESS;
  const mode = opts.mode ?? DEFAULT_MODE;
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const startedAtMs = Date.now();
  const plugins = loadPlugins(opts.plugins ?? []);
  const pluginRuntime = createPluginRuntime({ plugins, driver, logger });
  await pluginRuntime.setup();
  let calibration;
  if (mode === "ci-stable") {
    logger.info("engine: running CPU calibration (mode=ci-stable)");
    calibration = await calibrate({
      driver,
      adapter,
      logger,
      networkProfile: "fast-4g"
    });
    logger.info("engine: calibration done", {
      throttleRate: calibration.throttleRate,
      observedScore: calibration.observedScore,
      cacheHit: calibration.cacheHit
    });
  }
  const runReports = [];
  const frameNodes = {};
  let browserVersion = driver.browserVersion;
  let browserSource = "bundled";
  for (let i = 0; i < runs; i++) {
    logger.debug("engine: starting run", { runIndex: i, url: opts.url });
    const pageCtx = await adapter.launchPageWithCdp();
    browserVersion = pageCtx.browserVersion || browserVersion;
    browserSource = pageCtx.browserSource;
    const runCtx = {
      runIndex: i,
      driver: { id: driver.id },
      page: { id: `page:${String(i)}` },
      emit: () => void 0,
      logger,
      state: /* @__PURE__ */ new Map(),
      cdp: pageCtx.rootSession,
      async evaluateInPage(expression) {
        try {
          const result = await pageCtx.rootSession.send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true
          });
          if (result.exceptionDetails)
            return void 0;
          return result.result?.value;
        } catch (err) {
          logger.debug("engine: evaluateInPage failed", {
            error: err instanceof Error ? err.message : String(err)
          });
          return void 0;
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
      }
    };
    try {
      await pluginRuntime.beforeNavigate(runCtx);
      const navStartMs = Date.now();
      const rootCtx = {
        logger,
        frameId: ROOT_FRAME_ID,
        isRoot: true,
        url: opts.url,
        navigationStart: navStartMs
      };
      const rootHandles = await installCollectorsOn(pageCtx.rootSession, rootCtx, factories, driver, logger);
      if (calibration) {
        await applyEmulation(pageCtx.rootSession, calibration, logger);
      }
      await pageCtx.goto(opts.url);
      await pluginRuntime.onNavigate(runCtx, {
        url: opts.url,
        frameId: ROOT_FRAME_ID,
        type: "initial"
      });
      try {
        await pageCtx.waitForLoadIdle(LOAD_IDLE_TIMEOUT_MS);
      } catch (err) {
        logger.debug("engine: load-idle wait timed out", {
          runIndex: i,
          error: err instanceof Error ? err.message : String(err)
        });
      }
      await pluginRuntime.onLoad(runCtx);
      await pluginRuntime.onIdle(runCtx);
      const frameResults = {};
      const frameHandles = [];
      for (const f of pageCtx.attachedFrames) {
        if (f.session === null)
          continue;
        const fctx = {
          logger,
          frameId: f.frameId,
          isRoot: false,
          url: f.url,
          navigationStart: navStartMs
        };
        const handles = await installCollectorsOn(f.session, fctx, factories, driver, logger);
        frameHandles.push({ frameId: f.frameId, handles });
      }
      const rootFinal = await finalizeAll(rootHandles);
      for (const f of frameHandles) {
        frameResults[f.frameId] = await finalizeAll(f.handles);
      }
      const transformedMetrics = await applyOnMetric(rootFinal.metrics, runCtx, pluginRuntime);
      runReports.push(buildRunReport(i, { ...rootFinal, metrics: transformedMetrics }));
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
          children: pageCtx.attachedFrames.map((f) => f.frameId)
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
            children: []
          };
        }
      }
    } finally {
      try {
        await pageCtx.close();
      } catch (err) {
        logger.debug("engine: pageCtx.close threw", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }
  const aggregated = aggregateRuns(runReports);
  const durationMs = Date.now() - startedAtMs;
  const reportCtx = { logger };
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
    calibration
  });
  let report = {
    schemaVersion: "1.0.0",
    meta,
    runs: runReports,
    aggregated,
    frames: { root: ROOT_FRAME_ID, nodes: frameNodes },
    audits: [...pluginRuntime.audits],
    artifacts: {},
    pluginData: { ...pluginRuntime.pluginData }
  };
  report = await pluginRuntime.onReport(reportCtx, report);
  await pluginRuntime.teardown();
  return report;
}
async function applyOnMetric(metrics, runCtx, pluginRuntime) {
  if (pluginRuntime.plugins.length === 0)
    return { ...metrics };
  const out = {};
  for (const [name, metric] of Object.entries(metrics)) {
    out[name] = await pluginRuntime.onMetric(runCtx, metric);
  }
  return out;
}
async function installCollectorsOn(session, ctx, factories, driver, logger) {
  const handles = [];
  for (const factory of factories) {
    const supported = factory.requires.every((cap) => driver.supports(cap));
    if (!supported) {
      logger.debug("engine: collector skipped (driver capability missing)", {
        collectorId: factory.id,
        requires: factory.requires
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
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return handles;
}
async function finalizeAll(handles) {
  const results = [];
  for (const h of handles) {
    try {
      results.push(await h.finalize());
    } catch (err) {
      results.push(emptyCollectorResult(`${h.id}: ${err instanceof Error ? err.message : String(err)}`));
    }
    try {
      await h.dispose();
    } catch {
    }
  }
  return mergeCollectorResults(results);
}
function buildRunReport(runIndex, rootFinal) {
  return {
    runIndex,
    cold: runIndex === 0,
    metrics: rootFinal.metrics,
    resources: rootFinal.resources,
    longTasks: rootFinal.longTasks,
    meta: {}
  };
}
var UNSTABLE_COV_THRESHOLD = 0.2;
var OUTLIER_Z_THRESHOLD = 3.5;
var CWV_METRIC_NAMES = /* @__PURE__ */ new Set(["lcp", "cls", "inp", "fcp", "ttfb"]);
function aggregateRuns(runs) {
  const byMetric = {};
  for (const r of runs) {
    for (const [name, m] of Object.entries(r.metrics)) {
      const list = byMetric[name];
      if (list)
        list.push(m.value);
      else
        byMetric[name] = [m.value];
    }
  }
  const aggregated = {};
  for (const [name, raw] of Object.entries(byMetric)) {
    if (raw.length === 0)
      continue;
    const { kept, dropped } = rejectOutliers(raw);
    const values = kept;
    if (values.length === 0)
      continue;
    const sorted = [...values].sort((a, b) => a - b);
    const median = quantile(sorted, 0.5);
    const p75 = quantile(sorted, 0.75);
    const p95 = quantile(sorted, 0.95);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.length > 1 ? values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length : 0;
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
      droppedOutliers: dropped
    };
  }
  return aggregated;
}
function isReportUnstable(aggregated) {
  for (const name of CWV_METRIC_NAMES) {
    const agg = aggregated[name];
    if (!agg)
      continue;
    if (Number.isFinite(agg.cov) && agg.cov > UNSTABLE_COV_THRESHOLD)
      return true;
  }
  return false;
}
function rejectOutliers(values) {
  if (values.length < 5)
    return { kept: [...values], dropped: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const deviations = values.map((v) => Math.abs(v - median));
  const sortedDeviations = [...deviations].sort((a, b) => a - b);
  const mad = quantile(sortedDeviations, 0.5);
  if (mad === 0)
    return { kept: [...values], dropped: 0 };
  const kept = [];
  let dropped = 0;
  for (const v of values) {
    const z = 0.6745 * (v - median) / mad;
    if (Math.abs(z) > OUTLIER_Z_THRESHOLD) {
      dropped++;
    } else {
      kept.push(v);
    }
  }
  return { kept, dropped };
}
function quantile(sortedAsc, q) {
  if (sortedAsc.length === 0)
    return Number.NaN;
  if (sortedAsc.length === 1)
    return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lo = sortedAsc[base];
  const hi = sortedAsc[Math.min(base + 1, sortedAsc.length - 1)];
  return lo + rest * (hi - lo);
}
function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
function buildMeta(input) {
  const { opts, runs, mode, headless, browserVersion, browserSource, startedAt, durationMs, pluginCapabilityUses, unstable, calibration } = input;
  const meta = {
    url: opts.url,
    startedAt,
    durationMs,
    runs,
    mode,
    browser: {
      name: "chromium",
      version: browserVersion,
      source: browserSource
    },
    host: {
      os: `${platform()} ${release()}`,
      arch: arch(),
      nodeVersion: process.version
    },
    parity: {
      mode: headless,
      knownDeltas: headless === "headless" ? { inp: "synthetic-input" } : {}
    },
    emulation: opts.emulation ?? false,
    pluginCapabilityUses: pluginCapabilityUses.map((u) => ({
      pluginId: u.pluginId,
      capability: u.capability,
      when: u.when
    })),
    measurementId: typeof randomUUID === "function" ? randomUUID() : `m_${String(Date.now())}`,
    ...unstable ? { unstable: true } : {},
    ...calibration ? {
      calibration: {
        reference: calibration.reference,
        observedScore: calibration.observedScore,
        throttleRate: calibration.throttleRate,
        networkProfile: calibration.networkProfile,
        cacheHit: calibration.cacheHit
      }
    } : {}
  };
  return meta;
}

// ../../packages/driver-extension/dist/index.js
var CHROMIUM_CAPABILITIES = /* @__PURE__ */ new Set([
  "cdp-oopif",
  "coverage",
  "heap-snapshot",
  "long-tasks",
  "har",
  "axe"
]);
function createExtensionDriver(opts) {
  const debuggerImpl = resolveDebuggerImpl(opts.debuggerImpl);
  const protocolVersion = opts.protocolVersion ?? "1.3";
  const tabId = opts.tabId;
  let browserVersionCache = "";
  return {
    id: "extension-chrome",
    get browserVersion() {
      return browserVersionCache;
    },
    supports(capability) {
      return CHROMIUM_CAPABILITIES.has(capability);
    },
    async launch(_launchOpts) {
      await debuggerImpl.attach({ tabId }, protocolVersion);
      try {
        const version = await debuggerImpl.sendCommand({ tabId }, "Browser.getVersion");
        if (version.product)
          browserVersionCache = version.product;
      } catch {
        browserVersionCache = "chrome.debugger";
      }
      const handle = {
        id: `browser:extension-chrome:${String(tabId)}`,
        tabId,
        debuggerImpl
      };
      return handle;
    },
    async newPage(browser) {
      const impl = ensureBrowser(browser);
      const ph = {
        id: `page:extension-chrome:${String(impl.tabId)}`,
        tabId: impl.tabId,
        debuggerImpl: impl.debuggerImpl
      };
      return ph;
    },
    async attachCDP(target) {
      const impl = ensureTarget(target);
      return wrapChromeDebuggerSession(impl);
    }
  };
}
function pageHandleAsTargetExtension(handle) {
  const impl = handle;
  if (impl.tabId === void 0 || !impl.debuggerImpl) {
    throw new Error("PageHandle was not created by createExtensionDriver()");
  }
  const target = {
    id: `target:${impl.id ?? ""}`,
    tabId: impl.tabId,
    debuggerImpl: impl.debuggerImpl
  };
  return target;
}
function ensureBrowser(b) {
  const cand = b;
  if (cand.tabId === void 0 || !cand.debuggerImpl) {
    throw new Error("BrowserHandle was not created by createExtensionDriver()");
  }
  return b;
}
function ensureTarget(t) {
  const cand = t;
  if (cand.tabId === void 0 || !cand.debuggerImpl) {
    throw new Error("TargetHandle was not created by createExtensionDriver()");
  }
  return t;
}
function resolveDebuggerImpl(supplied) {
  if (supplied)
    return supplied;
  const g = globalThis;
  if (g.chrome?.debugger)
    return g.chrome.debugger;
  throw new Error("chrome.debugger API is not available; createExtensionDriver() must run inside an MV3 service worker with the 'debugger' permission");
}
function wrapChromeDebuggerSession(target) {
  let detached = false;
  const listeners = [];
  const onDetachListener = (source) => {
    if (source.tabId === target.tabId) {
      detached = true;
    }
  };
  target.debuggerImpl.onDetach.addListener(onDetachListener);
  return {
    async send(method, params) {
      if (detached)
        throw new Error(`CDP session detached; cannot send ${method}`);
      return target.debuggerImpl.sendCommand({ tabId: target.tabId }, method, params);
    },
    on(event, handler) {
      const wrapped = (source, method, params) => {
        if (source.tabId !== target.tabId)
          return;
        if (method !== event)
          return;
        try {
          handler(params);
        } catch {
        }
      };
      target.debuggerImpl.onEvent.addListener(wrapped);
      listeners.push(wrapped);
    },
    async detach() {
      if (detached)
        return;
      detached = true;
      target.debuggerImpl.onDetach.removeListener(onDetachListener);
      for (const l of listeners) {
        try {
          target.debuggerImpl.onEvent.removeListener(l);
        } catch {
        }
      }
      try {
        await target.debuggerImpl.detach({ tabId: target.tabId });
      } catch {
      }
    }
  };
}

// dist/background.js
var VIEWER_PATH = "viewer.html";
async function setRunningBadge(tabId) {
  await chrome.action.setBadgeBackgroundColor({ color: "#4338ca", tabId });
  await chrome.action.setBadgeText({ text: "\u25CF\u25CF\u25CF", tabId });
}
async function setDoneBadge(tabId, passed) {
  await chrome.action.setBadgeBackgroundColor({
    color: passed ? "#15803d" : "#b91c1c",
    tabId
  });
  await chrome.action.setBadgeText({ text: passed ? "\u2713" : "!", tabId });
}
async function clearBadge(tabId) {
  await chrome.action.setBadgeText({ text: "", tabId });
}
async function handleActionClick(tab) {
  if (tab.id === void 0)
    return;
  const tabId = tab.id;
  const url = tab.url ?? "(no url)";
  await chrome.storage.session.set({
    [`measurement:${String(tabId)}`]: {
      status: "running",
      url,
      startedAt: Date.now()
    }
  });
  await setRunningBadge(tabId);
  try {
    const driver = createExtensionDriver({ tabId });
    const adapter = {
      async launchPageWithCdp() {
        const browser = await driver.launch({ mode: "headful" });
        const page = await driver.newPage(browser);
        const target = pageHandleAsTargetExtension(page);
        const rootSession = await driver.attachCDP(target);
        const ctx = {
          browserVersion: driver.browserVersion || "chrome.debugger",
          browserSource: "extension-host",
          rootSession,
          attachedFrames: [],
          async goto(_url) {
            return void 0;
          },
          async waitForLoadIdle(_timeoutMs) {
            await new Promise((r) => setTimeout(r, 800));
          },
          async close() {
            try {
              await rootSession.detach();
            } catch {
            }
          }
        };
        return ctx;
      }
    };
    const report = await runEngine({
      opts: { url, runs: 1, mode: "real" },
      driver,
      adapter
    });
    const audits = report.audits ?? [];
    const allPassed = audits.every((a) => a.passed);
    await chrome.storage.session.set({
      [`measurement:${String(tabId)}`]: {
        status: "done",
        url,
        startedAt: Date.now(),
        report
      }
    });
    await setDoneBadge(tabId, allPassed);
    const measurementId = encodeURIComponent(String(tabId));
    await chrome.tabs.create({
      url: chrome.runtime.getURL(`${VIEWER_PATH}?m=${measurementId}`)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await chrome.storage.session.set({
      [`measurement:${String(tabId)}`]: {
        status: "error",
        url,
        startedAt: Date.now(),
        error: message
      }
    });
    await setDoneBadge(tabId, false);
  } finally {
    setTimeout(() => {
      void clearBadge(tabId);
    }, 3e4);
  }
}
if (typeof chrome !== "undefined" && chrome.action) {
  chrome.action.onClicked.addListener((tab) => {
    void handleActionClick(tab);
  });
}
export {
  handleActionClick
};
