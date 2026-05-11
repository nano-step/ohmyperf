import type {
  BrowserHandle,
  CDPSessionLike,
  Driver,
  DriverCapability,
  LaunchOpts,
  PageHandle,
  TargetHandle,
} from "@ohmyperf/core";

interface ChromeDebuggerTarget {
  tabId?: number;
  extensionId?: string;
  targetId?: string;
}

interface ChromeDebuggerAPI {
  attach(target: ChromeDebuggerTarget, version: string): Promise<void>;
  detach(target: ChromeDebuggerTarget): Promise<void>;
  sendCommand(
    target: ChromeDebuggerTarget,
    method: string,
    params?: unknown,
  ): Promise<unknown>;
  onEvent: {
    addListener(
      cb: (source: ChromeDebuggerTarget, method: string, params?: unknown) => void,
    ): void;
    removeListener(
      cb: (source: ChromeDebuggerTarget, method: string, params?: unknown) => void,
    ): void;
  };
  onDetach: {
    addListener(cb: (source: ChromeDebuggerTarget, reason: string) => void): void;
    removeListener(cb: (source: ChromeDebuggerTarget, reason: string) => void): void;
  };
}

declare global {
  interface ChromeRuntime {
    debugger?: ChromeDebuggerAPI;
  }
  const chrome: ChromeRuntime & { tabs?: unknown };
}

const CHROMIUM_CAPABILITIES: ReadonlySet<DriverCapability> = new Set<DriverCapability>([
  "cdp-oopif",
  "coverage",
  "heap-snapshot",
  "long-tasks",
  "har",
  "axe",
]);

export interface ExtensionDriverOptions {
  readonly tabId: number;
  readonly debuggerImpl?: ChromeDebuggerAPI;
  readonly protocolVersion?: string;
}

interface BrowserHandleImpl {
  readonly id: string;
  readonly tabId: number;
  readonly debuggerImpl: ChromeDebuggerAPI;
}

interface PageHandleImpl {
  readonly id: string;
  readonly tabId: number;
  readonly debuggerImpl: ChromeDebuggerAPI;
}

interface TargetHandleImpl {
  readonly id: string;
  readonly tabId: number;
  readonly debuggerImpl: ChromeDebuggerAPI;
}

export type ExtensionDriverInstance = Driver;

export function createExtensionDriver(opts: ExtensionDriverOptions): ExtensionDriverInstance {
  const debuggerImpl = resolveDebuggerImpl(opts.debuggerImpl);
  const protocolVersion = opts.protocolVersion ?? "1.3";
  const tabId = opts.tabId;
  let browserVersionCache = "";

  return {
    id: "extension-chrome",
    get browserVersion(): string {
      return browserVersionCache;
    },
    supports(capability: DriverCapability): boolean {
      return CHROMIUM_CAPABILITIES.has(capability);
    },
    async launch(_launchOpts: LaunchOpts): Promise<BrowserHandle> {
      await debuggerImpl.attach({ tabId }, protocolVersion);
      try {
        const version = (await debuggerImpl.sendCommand({ tabId }, "Browser.getVersion")) as {
          product?: string;
          revision?: string;
        };
        if (version.product) browserVersionCache = version.product;
      } catch {
        browserVersionCache = "chrome.debugger";
      }
      const handle: BrowserHandleImpl = {
        id: `browser:extension-chrome:${String(tabId)}`,
        tabId,
        debuggerImpl,
      };
      return handle;
    },
    async newPage(browser: BrowserHandle): Promise<PageHandle> {
      const impl = ensureBrowser(browser);
      const ph: PageHandleImpl = {
        id: `page:extension-chrome:${String(impl.tabId)}`,
        tabId: impl.tabId,
        debuggerImpl: impl.debuggerImpl,
      };
      return ph;
    },
    async attachCDP(target: TargetHandle): Promise<CDPSessionLike> {
      const impl = ensureTarget(target);
      return wrapChromeDebuggerSession(impl);
    },
  };
}

export function pageHandleAsTargetExtension(handle: PageHandle): TargetHandle {
  const impl = handle as Partial<PageHandleImpl>;
  if (impl.tabId === undefined || !impl.debuggerImpl) {
    throw new Error("PageHandle was not created by createExtensionDriver()");
  }
  const target: TargetHandleImpl = {
    id: `target:${impl.id ?? ""}`,
    tabId: impl.tabId,
    debuggerImpl: impl.debuggerImpl,
  };
  return target;
}

function ensureBrowser(b: BrowserHandle): BrowserHandleImpl {
  const cand = b as Partial<BrowserHandleImpl>;
  if (cand.tabId === undefined || !cand.debuggerImpl) {
    throw new Error("BrowserHandle was not created by createExtensionDriver()");
  }
  return b as BrowserHandleImpl;
}

function ensureTarget(t: TargetHandle): TargetHandleImpl {
  const cand = t as Partial<TargetHandleImpl>;
  if (cand.tabId === undefined || !cand.debuggerImpl) {
    throw new Error("TargetHandle was not created by createExtensionDriver()");
  }
  return t as TargetHandleImpl;
}

function resolveDebuggerImpl(supplied?: ChromeDebuggerAPI): ChromeDebuggerAPI {
  if (supplied) return supplied;
  const g = globalThis as { chrome?: { debugger?: ChromeDebuggerAPI } };
  if (g.chrome?.debugger) return g.chrome.debugger;
  throw new Error(
    "chrome.debugger API is not available; createExtensionDriver() must run inside an MV3 service worker with the 'debugger' permission",
  );
}

function wrapChromeDebuggerSession(target: TargetHandleImpl): CDPSessionLike {
  let detached = false;
  const listeners: Array<(source: ChromeDebuggerTarget, method: string, params?: unknown) => void> = [];

  const onDetachListener = (source: ChromeDebuggerTarget): void => {
    if (source.tabId === target.tabId) {
      detached = true;
    }
  };
  target.debuggerImpl.onDetach.addListener(onDetachListener);

  return {
    async send(method: string, params?: unknown): Promise<unknown> {
      if (detached) throw new Error(`CDP session detached; cannot send ${method}`);
      return target.debuggerImpl.sendCommand({ tabId: target.tabId }, method, params);
    },
    on(event: string, handler: (payload: unknown) => void): void {
      const wrapped = (source: ChromeDebuggerTarget, method: string, params?: unknown): void => {
        if (source.tabId !== target.tabId) return;
        if (method !== event) return;
        try {
          handler(params);
        } catch {
          /* swallow handler errors */
        }
      };
      target.debuggerImpl.onEvent.addListener(wrapped);
      listeners.push(wrapped);
    },
    async detach(): Promise<void> {
      if (detached) return;
      detached = true;
      target.debuggerImpl.onDetach.removeListener(onDetachListener);
      for (const l of listeners) {
        try {
          target.debuggerImpl.onEvent.removeListener(l);
        } catch {
          /* noop */
        }
      }
      try {
        await target.debuggerImpl.detach({ tabId: target.tabId });
      } catch {
        /* noop */
      }
    },
  };
}
