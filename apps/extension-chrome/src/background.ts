import { runEngine, type Report, type EngineLaunchAdapter, type EnginePageContext } from "@ohmyperf/core";
import { createExtensionDriver, pageHandleAsTargetExtension } from "@ohmyperf/driver-extension";

interface ChromeTab {
  id?: number;
  url?: string;
  title?: string;
}

interface ChromeRuntimePort {
  postMessage(msg: unknown): void;
  onMessage: { addListener(cb: (msg: unknown) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
}

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
    create(opts: { url: string }): Promise<ChromeTab>;
    get(tabId: number): Promise<ChromeTab>;
  };
  runtime: {
    getURL(path: string): string;
    onConnect: { addListener(cb: (port: ChromeRuntimePort) => void): void };
  };
  scripting?: unknown;
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

export async function handleActionClick(tab: ChromeTab): Promise<void> {
  if (tab.id === undefined) return;
  const tabId = tab.id;
  const url = tab.url ?? "(no url)";

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
      opts: { url, runs: 1, mode: "real" },
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
