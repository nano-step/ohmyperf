import { describe, expect, it } from "vitest";

interface ChromeState {
  storage: Record<string, unknown>;
  badges: Record<number, { color?: string; text?: string }>;
  openedUrls: string[];
}

function installFakeChrome(): ChromeState {
  const state: ChromeState = { storage: {}, badges: {}, openedUrls: [] };
  const attached = new Set<number>();
  const eventListeners: Array<(s: { tabId?: number }, m: string, p?: unknown) => void> = [];
  const detachListeners: Array<(s: { tabId?: number }, r: string) => void> = [];

  (globalThis as { chrome?: unknown }).chrome = {
    action: {
      onClicked: { addListener: () => undefined },
      async setBadgeText(opts: { text: string; tabId?: number }) {
        if (opts.tabId !== undefined) {
          state.badges[opts.tabId] = { ...state.badges[opts.tabId], text: opts.text };
        }
      },
      async setBadgeBackgroundColor(opts: { color: string; tabId?: number }) {
        if (opts.tabId !== undefined) {
          state.badges[opts.tabId] = { ...state.badges[opts.tabId], color: opts.color };
        }
      },
    },
    storage: {
      session: {
        async set(items: Record<string, unknown>) {
          Object.assign(state.storage, items);
        },
        async get(keys?: string | string[]) {
          const arr = Array.isArray(keys) ? keys : keys ? [keys] : Object.keys(state.storage);
          const out: Record<string, unknown> = {};
          for (const k of arr) out[k] = state.storage[k];
          return out;
        },
        async remove(keys: string | string[]) {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) delete state.storage[k];
        },
      },
    },
    tabs: {
      async create(opts: { url: string }) {
        state.openedUrls.push(opts.url);
        return { id: 999, url: opts.url };
      },
      async get() {
        return {};
      },
    },
    runtime: {
      getURL(path: string) {
        return `chrome-extension://fake/${path}`;
      },
      onConnect: { addListener: () => undefined },
    },
    debugger: {
      async attach(target: { tabId?: number }) {
        if (target.tabId !== undefined) attached.add(target.tabId);
      },
      async detach(target: { tabId?: number }) {
        if (target.tabId !== undefined) attached.delete(target.tabId);
      },
      async sendCommand(target: { tabId?: number }, method: string) {
        if (target.tabId === undefined || !attached.has(target.tabId)) {
          throw new Error("not attached");
        }
        if (method === "Browser.getVersion") {
          return { product: "Chrome/147.0", revision: "147" };
        }
        if (method === "Runtime.evaluate") {
          return { result: { type: "string", value: "null" } };
        }
        if (method === "Performance.getMetrics") return { metrics: [] };
        return {};
      },
      onEvent: {
        addListener(cb: (s: { tabId?: number }, m: string, p?: unknown) => void) {
          eventListeners.push(cb);
        },
        removeListener(cb: (s: { tabId?: number }, m: string, p?: unknown) => void) {
          const i = eventListeners.indexOf(cb);
          if (i >= 0) eventListeners.splice(i, 1);
        },
      },
      onDetach: {
        addListener(cb: (s: { tabId?: number }, r: string) => void) {
          detachListeners.push(cb);
        },
        removeListener(cb: (s: { tabId?: number }, r: string) => void) {
          const i = detachListeners.indexOf(cb);
          if (i >= 0) detachListeners.splice(i, 1);
        },
      },
    },
  };
  return state;
}

describe("extension-chrome background.handleActionClick", () => {
  it("runs measurement, stores report in session storage, opens viewer tab, sets badge", async () => {
    const state = installFakeChrome();
    const { handleActionClick } = await import("./background.js");

    await handleActionClick({ id: 42, url: "https://example.test/", title: "test" });

    const stored = state.storage["measurement:42"] as { status: string; report?: { schemaVersion?: string } };
    expect(stored).toBeDefined();
    expect(stored.status).toBe("done");
    expect(stored.report?.schemaVersion).toBe("1.0.0");
    expect(state.openedUrls[0]).toContain("viewer.html?m=42");
    expect(state.badges[42]?.text).toMatch(/^(✓|!)$/);
  }, 30_000);

  it("returns early when tab.id is undefined", async () => {
    installFakeChrome();
    const { handleActionClick } = await import("./background.js");
    await expect(handleActionClick({ url: "https://x" })).resolves.toBeUndefined();
  });
});
