import {
  runEngine,
  type Report,
  type EngineLaunchAdapter,
  type EnginePageContext,
} from "@ohmyperf/core";
import { createExtensionDriver, pageHandleAsTargetExtension } from "@ohmyperf/driver-extension";
import {
  PROTOCOL_VERSION,
  type BridgeCapability,
  type BridgeError,
  type BridgeErrorCode,
  type BridgeErrorResponse,
  type BridgeMeasureRequest,
  type BridgeRequestEnvelope,
  type BridgeResponseEnvelope,
  type CancelRequest,
  type CancelResponse,
  type MeasureAck,
  type PingRequest,
  type PingResponse,
  type PortEvent,
} from "@ohmyperf/shared-types";

interface ChromeTab {
  id?: number;
  url?: string;
  title?: string;
  windowId?: number;
}

interface ChromeRuntimePort {
  name: string;
  sender?: { id?: string; origin?: string; url?: string; tab?: ChromeTab };
  postMessage(msg: unknown): void;
  disconnect(): void;
  onMessage: { addListener(cb: (msg: unknown) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
}

interface MessageSender {
  id?: string;
  origin?: string;
  url?: string;
  tab?: ChromeTab;
}

type SendResponse = (response: unknown) => void;

interface ChromeAPI {
  action: {
    onClicked: { addListener(cb: (tab: ChromeTab) => void | Promise<void>): void };
    setBadgeText(opts: { text: string; tabId?: number }): Promise<void>;
    setBadgeBackgroundColor(opts: { color: string; tabId?: number }): Promise<void>;
  };
  storage: {
    session: {
      set(items: Record<string, unknown>): Promise<void>;
      get(keys?: string | string[]): Promise<Record<string, unknown>>;
      remove(keys: string | string[]): Promise<void>;
    };
  };
  tabs: {
    create(opts: {
      url: string;
      active?: boolean;
      pinned?: boolean;
      openerTabId?: number;
      windowId?: number;
    }): Promise<ChromeTab>;
    get(tabId: number): Promise<ChromeTab>;
    query(opts: { url?: string | string[]; status?: string }): Promise<ChromeTab[]>;
    onRemoved: {
      addListener(cb: (tabId: number, info: { windowId: number; isWindowClosing: boolean }) => void): void;
      removeListener(cb: (tabId: number, info: { windowId: number; isWindowClosing: boolean }) => void): void;
    };
    onUpdated: {
      addListener(
        cb: (tabId: number, changeInfo: { status?: string; url?: string }, tab: ChromeTab) => void,
      ): void;
      removeListener(
        cb: (tabId: number, changeInfo: { status?: string; url?: string }, tab: ChromeTab) => void,
      ): void;
    };
  };
  runtime: {
    id: string;
    getURL(path: string): string;
    getManifest(): { version: string };
    onConnect: { addListener(cb: (port: ChromeRuntimePort) => void): void };
    onConnectExternal: { addListener(cb: (port: ChromeRuntimePort) => void): void };
    onInstalled: { addListener(cb: (details: { reason: string }) => void): void };
    onMessageExternal: {
      addListener(
        cb: (
          msg: unknown,
          sender: MessageSender,
          sendResponse: SendResponse,
        ) => boolean | void,
      ): void;
    };
  };
  scripting?: {
    executeScript(opts: {
      target: { tabId: number };
      func: (...args: unknown[]) => unknown;
      args?: unknown[];
      world?: 'MAIN' | 'ISOLATED';
    }): Promise<unknown>;
  };
}

declare const chrome: ChromeAPI;

const VIEWER_PATH = "viewer.html";

interface StoredMeasurement {
  status: "running" | "done" | "error";
  url: string;
  startedAt: number;
  report?: Report;
  error?: string;
}

async function setRunningBadge(tabId: number): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: "#4338ca", tabId });
  await chrome.action.setBadgeText({ text: "●●●", tabId });
}

async function setDoneBadge(tabId: number, passed: boolean): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({
    color: passed ? "#15803d" : "#b91c1c",
    tabId,
  });
  await chrome.action.setBadgeText({ text: passed ? "✓" : "!", tabId });
}

async function clearBadge(tabId: number): Promise<void> {
  await chrome.action.setBadgeText({ text: "", tabId });
}

async function setErrorBadge(tabId: number): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: "#b91c1c", tabId });
  await chrome.action.setBadgeText({ text: "!", tabId });
}

const RESTRICTED_URL_SCHEMES = [
  "chrome://",
  "chrome-untrusted://",
  "chrome-extension://",
  "chrome-search://",
  "edge://",
  "about:",
  "view-source:",
  "devtools://",
];

function isRestrictedScheme(url: string): boolean {
  return RESTRICTED_URL_SCHEMES.some((scheme) => url.startsWith(scheme));
}

export async function handleActionClick(tab: ChromeTab): Promise<void> {
  if (tab.id === undefined) return;
  const tabId = tab.id;
  const url = tab.url ?? "(no url)";

  if (isRestrictedScheme(url)) {
    await chrome.storage.session.set({
      [`measurement:${String(tabId)}`]: {
        status: "error",
        url,
        startedAt: Date.now(),
        error: `OhMyPerf cannot attach to ${url}. chrome:// (and similar restricted) URLs are off-limits to chrome.debugger.`,
      } satisfies StoredMeasurement,
    });
    await setErrorBadge(tabId);
    return;
  }

  await chrome.storage.session.set({
    [`measurement:${String(tabId)}`]: {
      status: "running",
      url,
      startedAt: Date.now(),
    } satisfies StoredMeasurement,
  });
  await setRunningBadge(tabId);

  try {
    const driver = createExtensionDriver({ tabId });
    const adapter: EngineLaunchAdapter = {
      async launchPageWithCdp(): Promise<EnginePageContext> {
        const browser = await driver.launch({ mode: "headful" });
        const page = await driver.newPage(browser);
        const target = pageHandleAsTargetExtension(page);
        const rootSession = await driver.attachCDP!(target);
        const ctx: EnginePageContext = {
          browserVersion: driver.browserVersion || "chrome.debugger",
          browserSource: "extension-host",
          rootSession,
          attachedFrames: [],
          async goto(_url: string): Promise<void> {
            return undefined;
          },
          async waitForLoadIdle(_timeoutMs: number): Promise<void> {
            await new Promise((r) => setTimeout(r, 800));
          },
          async close(): Promise<void> {
            try {
              await rootSession.detach();
            } catch {
              /* noop */
            }
          },
        };
        return ctx;
      },
    };

    const report = await runEngine({
      opts: { url, runs: 1, mode: "real", collectTrace: true },
      driver,
      adapter,
    });

    const audits = report.audits ?? [];
    const allPassed = audits.every((a) => a.passed);
    await chrome.storage.session.set({
      [`measurement:${String(tabId)}`]: {
        status: "done",
        url,
        startedAt: Date.now(),
        report,
      } satisfies StoredMeasurement,
    });
    await setDoneBadge(tabId, allPassed);

    const measurementId = encodeURIComponent(String(tabId));
    await chrome.tabs.create({
      url: chrome.runtime.getURL(`${VIEWER_PATH}?m=${measurementId}`),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await chrome.storage.session.set({
      [`measurement:${String(tabId)}`]: {
        status: "error",
        url,
        startedAt: Date.now(),
        error: message,
      } satisfies StoredMeasurement,
    });
    await setDoneBadge(tabId, false);
  } finally {
    setTimeout(() => {
      void clearBadge(tabId);
    }, 30_000);
  }
}

if (typeof chrome !== "undefined" && chrome.action) {
  chrome.action.onClicked.addListener((tab) => {
    void handleActionClick(tab);
  });
}

// ---------------------------------------------------------------------------
// Phase δ — externally_connectable bridge.
// MV3 SW stays alive while a connected port and chrome.debugger session exist,
// which covers v1 single-run (~10–15s, well under the 30s idle threshold).
// ---------------------------------------------------------------------------

const BRIDGE_CAPABILITIES: ReadonlyArray<BridgeCapability> = [
  "single-run",
  "real-mode",
  "ci-stable-mode",
  "progress-port-v1",
];

const REPLAY_BUFFER_LIMIT = 50;
const TAB_LOAD_TIMEOUT_MS = 15_000;
const PORT_PAYLOAD_WARN_BYTES = 10 * 1024 * 1024;

// Manifest allowlist, mirrored as regex for runtime defense-in-depth.
// KEEP IN SYNC with apps/extension-chrome/static/manifest.json
// externally_connectable.matches. Mismatch = silent ping rejection
// at runtime even though Chrome let the message through manifest layer.
const MANIFEST_MATCH_PATTERNS: ReadonlyArray<RegExp> = [
  /^https:\/\/ohmyperf\.dev$/,
  /^https:\/\/[a-z0-9-]+\.ohmyperf\.dev$/,
  /^https:\/\/hoainho\.github\.io$/,
  /^http:\/\/localhost:3000$/,
  /^http:\/\/127\.0\.0\.1:3000$/,
];

interface ActiveJob {
  readonly id: string;
  readonly portName: string;
  readonly request: BridgeMeasureRequest;
  readonly openerTabId: number | undefined;
  readonly origin: string;
  port: ChromeRuntimePort | null;
  targetTabId: number | null;
  driverCleanup: (() => Promise<void>) | null;
  cleanupTabRemoved: (() => void) | null;
  cancelled: boolean;
  finished: boolean;
  replay: PortEvent[];
}

const activeJobs = new Map<string, ActiveJob>();

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return MANIFEST_MATCH_PATTERNS.some((re) => re.test(origin));
}

function err(code: BridgeErrorCode, message: string, retriable = false): BridgeError {
  return { code, message, retriable };
}

function nowEvent(): number {
  return Date.now();
}

function bufferEvent(job: ActiveJob, ev: PortEvent): void {
  job.replay.push(ev);
  if (job.replay.length > REPLAY_BUFFER_LIMIT) {
    job.replay.splice(0, job.replay.length - REPLAY_BUFFER_LIMIT);
  }
}

function emit(job: ActiveJob, ev: PortEvent): void {
  bufferEvent(job, ev);
  if (!job.port) return;
  try {
    const size = JSON.stringify(ev).length;
    if (size > PORT_PAYLOAD_WARN_BYTES) {
      // Large payload warning — external port has a hard cap around 64MB.
      console.warn(`[ohmyperf bridge] port event ${ev.type} is ${size} bytes`);
    }
    job.port.postMessage(ev);
  } catch {
    /* port may have disconnected between checks */
  }
}

async function teardown(job: ActiveJob): Promise<void> {
  job.finished = true;
  if (job.cleanupTabRemoved) {
    try {
      job.cleanupTabRemoved();
    } catch {
      /* noop */
    }
    job.cleanupTabRemoved = null;
  }
  if (job.driverCleanup) {
    try {
      await job.driverCleanup();
    } catch {
      /* noop */
    }
    job.driverCleanup = null;
  }
  if (job.port) {
    try {
      job.port.disconnect();
    } catch {
      /* noop */
    }
    job.port = null;
  }
  activeJobs.delete(job.id);
}

function failJob(job: ActiveJob, error: BridgeError): void {
  emit(job, {
    protocolVersion: PROTOCOL_VERSION,
    type: "error",
    jobId: job.id,
    error,
    ts: nowEvent(),
  });
  void teardown(job);
}

function exactUrlMatch(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin && ua.pathname === ub.pathname && ua.search === ub.search;
  } catch {
    return false;
  }
}

function mapEngineError(message: string): BridgeError {
  if (/another debugger|already attached/i.test(message)) {
    return err(
      "extension/devtools-attached",
      "DevTools or another debugger is attached to the target tab. Close DevTools and retry.",
      true,
    );
  }
  if (/detached|target closed|disconnected/i.test(message)) {
    return err("extension/debugger-detached", message, true);
  }
  return err("extension/engine-error", message, false);
}

function genJobId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isProtocolMatch(msg: unknown): msg is BridgeRequestEnvelope {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { protocolVersion?: unknown }).protocolVersion === PROTOCOL_VERSION
  );
}

function makeErrorResponse(error: BridgeError): BridgeErrorResponse {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: "ohmyperf/error",
    ok: false,
    error,
  };
}

function handlePing(_req: PingRequest): PingResponse {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: "ohmyperf/ping/response",
    ok: true,
    version: chrome.runtime.getManifest().version,
    capabilities: BRIDGE_CAPABILITIES,
  };
}

function handleCancel(req: CancelRequest): CancelResponse {
  const job = activeJobs.get(req.jobId);
  if (!job) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: "ohmyperf/cancel/response",
      ok: false,
    };
  }
  job.cancelled = true;
  failJob(
    job,
    err("extension/cancelled", "Measurement cancelled by SPA request.", false),
  );
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: "ohmyperf/cancel/response",
    ok: true,
  };
}

function validateMeasureRequest(
  req: BridgeMeasureRequest,
  origin: string,
): BridgeError | null {
  if (req.runs !== 1) {
    return err(
      "extension/unsupported-runs",
      "Extension path supports single-run only in v1. Use the runner backend for multi-run.",
      false,
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(req.url);
  } catch {
    return err("extension/invalid-request", `Invalid URL: ${req.url}`, false);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return err(
      "extension/invalid-request",
      `Unsupported protocol: ${parsed.protocol}`,
      false,
    );
  }
  if (req.mode !== "real" && req.mode !== "ci-stable") {
    return err("extension/invalid-request", `Unsupported mode: ${req.mode}`, false);
  }
  // R10: exact URL match against opener origin (no eTLD+1 heuristic).
  if (exactUrlMatch(req.url, origin)) {
    return err(
      "extension/self-measurement-refused",
      "Refusing to measure the SPA's own URL.",
      false,
    );
  }
  return null;
}

async function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("tab load timeout"));
    }, timeoutMs);
    const onUpdated = (
      updatedTabId: number,
      info: { status?: string },
    ): void => {
      if (updatedTabId !== tabId) return;
      if (info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function runMeasurement(job: ActiveJob): Promise<void> {
  emit(job, {
    protocolVersion: PROTOCOL_VERSION,
    type: "queued",
    jobId: job.id,
    ts: nowEvent(),
  });

  let targetTab: ChromeTab;
  try {
    targetTab = await chrome.tabs.create({
      url: job.request.url,
      active: false,
      pinned: false,
      ...(job.openerTabId !== undefined ? { openerTabId: job.openerTabId } : {}),
    });
  } catch (e) {
    failJob(
      job,
      err(
        "extension/tab-create-failed",
        e instanceof Error ? e.message : String(e),
        false,
      ),
    );
    return;
  }
  if (targetTab.id === undefined) {
    failJob(job, err("extension/tab-create-failed", "Tab created without id", false));
    return;
  }
  job.targetTabId = targetTab.id;

  const onRemoved = (removedTabId: number): void => {
    if (removedTabId !== job.targetTabId) return;
    if (job.finished) return;
    failJob(
      job,
      err(
        "extension/target-tab-closed",
        "Target tab was closed before measurement completed.",
        true,
      ),
    );
  };
  chrome.tabs.onRemoved.addListener(onRemoved);
  job.cleanupTabRemoved = () => {
    chrome.tabs.onRemoved.removeListener(onRemoved);
  };

  try {
    await waitForTabComplete(targetTab.id, TAB_LOAD_TIMEOUT_MS);
  } catch {
    // Continue anyway; engine will attempt CDP attach. Falling through emits navigation phases.
  }

  if (job.cancelled || job.finished) return;

  emit(job, {
    protocolVersion: PROTOCOL_VERSION,
    type: "run-start",
    jobId: job.id,
    runIndex: 0,
    totalRuns: 1,
    ts: nowEvent(),
  });
  emit(job, {
    protocolVersion: PROTOCOL_VERSION,
    type: "navigation",
    jobId: job.id,
    runIndex: 0,
    phase: "committed",
    ts: nowEvent(),
  });

  const driver = createExtensionDriver({ tabId: targetTab.id });
  let report: Report;
  try {
    const adapter: EngineLaunchAdapter = {
      async launchPageWithCdp(): Promise<EnginePageContext> {
        const browser = await driver.launch({ mode: "headful" });
        const page = await driver.newPage(browser);
        const target = pageHandleAsTargetExtension(page);
        const rootSession = await driver.attachCDP!(target);
        return {
          browserVersion: driver.browserVersion || "chrome.debugger",
          browserSource: "extension-host",
          rootSession,
          attachedFrames: [],
          async goto(_url: string): Promise<void> {
            emit(job, {
              protocolVersion: PROTOCOL_VERSION,
              type: "navigation",
              jobId: job.id,
              runIndex: 0,
              phase: "loaded",
              ts: nowEvent(),
            });
          },
          async waitForLoadIdle(_timeoutMs: number): Promise<void> {
            await new Promise((r) => setTimeout(r, 800));
            emit(job, {
              protocolVersion: PROTOCOL_VERSION,
              type: "navigation",
              jobId: job.id,
              runIndex: 0,
              phase: "idle",
              ts: nowEvent(),
            });
          },
          async close(): Promise<void> {
            try {
              await rootSession.detach();
            } catch {
              /* noop */
            }
          },
        };
      },
    };

    job.driverCleanup = async () => {
      // Driver lifecycle is owned by runEngine; nothing to detach manually here.
    };

    report = await runEngine({
      opts: { url: job.request.url, runs: 1, mode: job.request.mode, collectTrace: true },
      driver,
      adapter,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    failJob(job, mapEngineError(message));
    return;
  }

  if (job.cancelled || job.finished) return;

  for (const r of report.runs) {
    emit(job, {
      protocolVersion: PROTOCOL_VERSION,
      type: "run-complete",
      jobId: job.id,
      runIndex: 0,
      ts: nowEvent(),
    });
    for (const [name, m] of Object.entries(r.metrics)) {
      emit(job, {
        protocolVersion: PROTOCOL_VERSION,
        type: "metric",
        jobId: job.id,
        runIndex: 0,
        name,
        value: m.value,
        ts: nowEvent(),
      });
    }
  }

  emit(job, {
    protocolVersion: PROTOCOL_VERSION,
    type: "complete",
    jobId: job.id,
    report,
    ts: nowEvent(),
  });
  await teardown(job);
}

function handleMeasureRequest(
  req: BridgeMeasureRequest,
  sender: MessageSender,
  sendResponse: SendResponse,
): void {
  const origin = sender.origin ?? "";
  const validationError = validateMeasureRequest(req, origin);
  if (validationError) {
    sendResponse(makeErrorResponse(validationError));
    return;
  }
  const jobId = genJobId();
  const portName = `ohmyperf/job/${jobId}`;
  const job: ActiveJob = {
    id: jobId,
    portName,
    request: req,
    openerTabId: sender.tab?.id,
    origin,
    port: null,
    targetTabId: null,
    driverCleanup: null,
    cleanupTabRemoved: null,
    cancelled: false,
    finished: false,
    replay: [],
  };
  activeJobs.set(jobId, job);

  const ack: MeasureAck = {
    protocolVersion: PROTOCOL_VERSION,
    type: "ohmyperf/measure/ack",
    ok: true,
    jobId,
    portName,
  };
  sendResponse(ack);

  // Defer measurement to the next tick so the ack is delivered first.
  setTimeout(() => {
    void runMeasurement(job);
  }, 0);
}

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessageExternal) {
  chrome.runtime.onMessageExternal.addListener(
    (msg: unknown, sender: MessageSender, sendResponse: SendResponse): boolean => {
      if (!isAllowedOrigin(sender.origin)) {
        sendResponse(
          makeErrorResponse(
            err("extension/invalid-request", "Origin not allowed.", false),
          ),
        );
        return false;
      }
      if (!isProtocolMatch(msg)) {
        sendResponse(
          makeErrorResponse(
            err(
              "extension/invalid-request",
              `protocolVersion mismatch; extension expects ${String(PROTOCOL_VERSION)}.`,
              false,
            ),
          ),
        );
        return false;
      }
      const envelope = msg;
      switch (envelope.type) {
        case "ohmyperf/ping": {
          const resp: BridgeResponseEnvelope = handlePing(envelope);
          sendResponse(resp);
          return false;
        }
        case "ohmyperf/measure": {
          handleMeasureRequest(envelope, sender, sendResponse);
          return true;
        }
        case "ohmyperf/cancel": {
          const resp: BridgeResponseEnvelope = handleCancel(envelope);
          sendResponse(resp);
          return false;
        }
        default: {
          sendResponse(
            makeErrorResponse(
              err("extension/invalid-request", "Unknown message type.", false),
            ),
          );
          return false;
        }
      }
    },
  );
}

const PORT_NAME_RE = /^ohmyperf\/job\/([0-9a-f-]{8,})$/i;

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onConnectExternal) {
  chrome.runtime.onConnectExternal.addListener((port: ChromeRuntimePort) => {
    if (!isAllowedOrigin(port.sender?.origin)) {
      try {
        port.disconnect();
      } catch {
        /* noop */
      }
      return;
    }
    const m = PORT_NAME_RE.exec(port.name);
    if (!m) {
      try {
        port.disconnect();
      } catch {
        /* noop */
      }
      return;
    }
    const jobId = m[1] ?? "";
    const job = activeJobs.get(jobId);
    if (!job) {
      try {
        port.postMessage({
          protocolVersion: PROTOCOL_VERSION,
          type: "error",
          jobId,
          error: err("extension/invalid-request", "Unknown jobId.", false),
          ts: nowEvent(),
        } satisfies PortEvent);
        port.disconnect();
      } catch {
        /* noop */
      }
      return;
    }
    job.port = port;
    // Replay buffered events to the new subscriber before any new ones arrive.
    for (const ev of job.replay) {
      try {
        port.postMessage(ev);
      } catch {
        break;
      }
    }
    port.onDisconnect.addListener(() => {
      if (job.port === port) job.port = null;
      // Job continues; single-run is short and the replay buffer covers reconnect.
    });
  });
}

const ANNOUNCE_URL_PATTERNS = [
  "https://ohmyperf.dev/*",
  "https://*.ohmyperf.dev/*",
  "https://hoainho.github.io/*",
  "http://localhost:3000/*",
  "http://127.0.0.1:3000/*",
];

function announceToTab(tabId: number, extensionId: string, version: string): void {
  if (!chrome.scripting) return;
  chrome.scripting
    .executeScript({
      target: { tabId },
      world: "MAIN",
      func: (id: unknown, ver: unknown) => {
        try {
          window.postMessage(
            {
              source: "ohmyperf-extension",
              type: "ohmyperf/announce",
              protocolVersion: 1,
              extensionId: id,
              version: ver,
            },
            window.location.origin,
          );
        } catch (_e) {
          /* tab navigated away mid-injection */
        }
      },
      args: [extensionId, version],
    })
    .catch(() => undefined);
}

function announceToAllTabs(): void {
  if (typeof chrome === "undefined" || !chrome.tabs || !chrome.runtime) return;
  const extId = chrome.runtime.id;
  const ver = chrome.runtime.getManifest().version;
  chrome.tabs
    .query({ url: ANNOUNCE_URL_PATTERNS })
    .then((tabs) => {
      for (const tab of tabs) {
        if (typeof tab.id === "number") announceToTab(tab.id, extId, ver);
      }
    })
    .catch(() => undefined);
}

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => announceToAllTabs());
}

if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status !== "complete") return;
    const url = tab.url ?? "";
    if (
      !/^https:\/\/(ohmyperf\.dev|[a-z0-9-]+\.ohmyperf\.dev|hoainho\.github\.io)(\/|$)/.test(url)
      && !/^http:\/\/(localhost|127\.0\.0\.1):3000(\/|$)/.test(url)
    ) return;
    if (!chrome.runtime) return;
    announceToTab(tabId, chrome.runtime.id, chrome.runtime.getManifest().version);
  });
}
