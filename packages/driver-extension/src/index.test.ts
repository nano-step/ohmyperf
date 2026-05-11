import { describe, expect, it } from "vitest";
import { createExtensionDriver, pageHandleAsTargetExtension } from "./index.js";

interface DebuggerTarget {
  tabId?: number;
}

function makeFakeDebugger() {
  const attached = new Set<number>();
  const sentCommands: Array<{ tabId: number; method: string; params?: unknown }> = [];
  const eventListeners: Array<(s: DebuggerTarget, method: string, params?: unknown) => void> = [];
  const detachListeners: Array<(s: DebuggerTarget, reason: string) => void> = [];

  const api = {
    async attach(target: DebuggerTarget): Promise<void> {
      if (target.tabId === undefined) throw new Error("missing tabId");
      attached.add(target.tabId);
    },
    async detach(target: DebuggerTarget): Promise<void> {
      if (target.tabId !== undefined) attached.delete(target.tabId);
    },
    async sendCommand(target: DebuggerTarget, method: string, params?: unknown): Promise<unknown> {
      if (target.tabId === undefined || !attached.has(target.tabId)) {
        throw new Error("not attached");
      }
      sentCommands.push({ tabId: target.tabId, method, params });
      if (method === "Browser.getVersion") {
        return { product: "Chrome/147.0.7727.0", revision: "147.0" };
      }
      return {};
    },
    onEvent: {
      addListener(cb: (s: DebuggerTarget, method: string, params?: unknown) => void) {
        eventListeners.push(cb);
      },
      removeListener(cb: (s: DebuggerTarget, method: string, params?: unknown) => void) {
        const i = eventListeners.indexOf(cb);
        if (i >= 0) eventListeners.splice(i, 1);
      },
    },
    onDetach: {
      addListener(cb: (s: DebuggerTarget, reason: string) => void) {
        detachListeners.push(cb);
      },
      removeListener(cb: (s: DebuggerTarget, reason: string) => void) {
        const i = detachListeners.indexOf(cb);
        if (i >= 0) detachListeners.splice(i, 1);
      },
    },
    emit(target: DebuggerTarget, method: string, params?: unknown): void {
      for (const l of [...eventListeners]) l(target, method, params);
    },
    triggerDetach(target: DebuggerTarget, reason: string): void {
      if (target.tabId !== undefined) attached.delete(target.tabId);
      for (const l of [...detachListeners]) l(target, reason);
    },
    isAttached(tabId: number): boolean {
      return attached.has(tabId);
    },
    sent(): typeof sentCommands {
      return sentCommands;
    },
  };
  return api;
}

describe("createExtensionDriver", () => {
  it("reports chrome.debugger capabilities matrix", () => {
    const fake = makeFakeDebugger();
    const driver = createExtensionDriver({ tabId: 42, debuggerImpl: fake });
    expect(driver.id).toBe("extension-chrome");
    expect(driver.supports("cdp-oopif")).toBe(true);
    expect(driver.supports("coverage")).toBe(true);
    expect(driver.supports("har")).toBe(true);
    expect(driver.supports("axe")).toBe(true);
    expect(driver.supports("trace")).toBe(false);
  });

  it("launch() attaches chrome.debugger and queries Browser.getVersion", async () => {
    const fake = makeFakeDebugger();
    const driver = createExtensionDriver({ tabId: 7, debuggerImpl: fake });
    const browser = await driver.launch({ mode: "headless" });
    expect((browser as { tabId: number }).tabId).toBe(7);
    expect(fake.isAttached(7)).toBe(true);
    expect(driver.browserVersion).toMatch(/^Chrome/);
    expect(fake.sent().some((c) => c.method === "Browser.getVersion")).toBe(true);
  });

  it("attachCDP returns a CDPSessionLike that forwards sendCommand and filters events by tabId", async () => {
    const fake = makeFakeDebugger();
    const driver = createExtensionDriver({ tabId: 11, debuggerImpl: fake });
    const browser = await driver.launch({ mode: "headless" });
    const page = await driver.newPage(browser);
    const target = pageHandleAsTargetExtension(page);
    const cdp = await driver.attachCDP!(target);

    await cdp.send("Network.enable");
    expect(fake.sent().some((c) => c.method === "Network.enable" && c.tabId === 11)).toBe(true);

    const received: unknown[] = [];
    cdp.on("Page.lifecycleEvent", (p) => received.push(p));
    fake.emit({ tabId: 11 }, "Page.lifecycleEvent", { name: "load" });
    fake.emit({ tabId: 99 }, "Page.lifecycleEvent", { name: "load" });
    expect(received).toEqual([{ name: "load" }]);
  });

  it("treats onDetach as a session-detached signal", async () => {
    const fake = makeFakeDebugger();
    const driver = createExtensionDriver({ tabId: 3, debuggerImpl: fake });
    const browser = await driver.launch({ mode: "headless" });
    const page = await driver.newPage(browser);
    const target = pageHandleAsTargetExtension(page);
    const cdp = await driver.attachCDP!(target);
    fake.triggerDetach({ tabId: 3 }, "target_closed");
    await expect(cdp.send("Network.enable")).rejects.toThrow(/detached/i);
  });

  it("detach() cleans up listeners and tolerates double-detach", async () => {
    const fake = makeFakeDebugger();
    const driver = createExtensionDriver({ tabId: 5, debuggerImpl: fake });
    const browser = await driver.launch({ mode: "headless" });
    const page = await driver.newPage(browser);
    const target = pageHandleAsTargetExtension(page);
    const cdp = await driver.attachCDP!(target);

    await cdp.detach();
    expect(fake.isAttached(5)).toBe(false);
    await cdp.detach();
  });

  it("throws when chrome.debugger is unavailable and no debuggerImpl override is given", () => {
    expect(() => createExtensionDriver({ tabId: 1 })).toThrow(/chrome\.debugger API/);
  });
});
