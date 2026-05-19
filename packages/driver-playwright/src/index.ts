import {
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
  chromium,
  firefox,
  webkit,
} from "playwright";
import type {
  BrowserHandle,
  CDPSessionLike,
  Driver,
  DriverCapability,
  LaunchOpts,
  PageHandle,
  TargetHandle,
} from "@ohmyperf/core";
import { wrap, type CdpClient } from "./cdp-compat.js";
import {
  setupOopifAutoAttach,
  type OopifAttachController,
  type OopifAttachOptions,
} from "./oopif-attach.js";

export type ChromiumChannel = "chrome" | "msedge" | "chromium";

export type PlaywrightBrowserKind = "chromium" | "firefox" | "webkit";

export interface PlaywrightDriverOptions {
  readonly kind: PlaywrightBrowserKind;
  readonly channel?: ChromiumChannel;
  readonly executablePath?: string;
  readonly extraChromiumArgs?: ReadonlyArray<string>;
}

interface BrowserHandleImpl {
  readonly id: string;
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly kind: PlaywrightBrowserKind;
}

interface PageHandleImpl {
  readonly id: string;
  readonly page: Page;
  readonly browserHandle: BrowserHandleImpl;
}

interface TargetHandleImpl {
  readonly id: string;
  readonly page: Page;
  readonly browserHandle: BrowserHandleImpl;
}

const CHROMIUM_CAPABILITIES: ReadonlySet<DriverCapability> = new Set<DriverCapability>([
  "cdp-oopif",
  "coverage",
  "heap-snapshot",
  "trace",
  "long-tasks",
  "har",
  "axe",
]);

const FIREFOX_CAPABILITIES: ReadonlySet<DriverCapability> = new Set<DriverCapability>([
  "long-tasks",
  "har",
  "axe",
]);

const WEBKIT_CAPABILITIES: ReadonlySet<DriverCapability> = new Set<DriverCapability>(["har", "axe"]);

export type PlaywrightDriverInstance = Driver & {
  attachOopif(
    target: TargetHandle,
    opts: Omit<OopifAttachOptions, "rootSession" | "newSessionFromId">,
  ): Promise<OopifAttachController>;
};

export function createPlaywrightDriver(opts: PlaywrightDriverOptions): PlaywrightDriverInstance {
  const browserType = pickBrowserType(opts.kind);
  const id = `playwright-${opts.kind}` as const;
  let browserVersionCache: string | undefined;

  const baseDriver: Driver = {
    id,
    get browserVersion(): string {
      return browserVersionCache ?? "";
    },
    supports(capability: DriverCapability): boolean {
      switch (opts.kind) {
        case "chromium":
          return CHROMIUM_CAPABILITIES.has(capability);
        case "firefox":
          return FIREFOX_CAPABILITIES.has(capability);
        case "webkit":
          return WEBKIT_CAPABILITIES.has(capability);
      }
    },
    async launch(launchOpts: LaunchOpts): Promise<BrowserHandle> {
      const headless = launchOpts.mode === "headless";
      const launchExecutablePath = launchOpts.executablePath ?? opts.executablePath;
      const launchArgs: Parameters<typeof chromium.launch>[0] = { headless };
      if (launchExecutablePath !== undefined) {
        launchArgs.executablePath = launchExecutablePath;
      }
      if (opts.channel !== undefined && opts.kind === "chromium") {
        launchArgs.channel = opts.channel;
      }
      if (opts.kind === "chromium") {
        const baseArgs = [
          "--site-per-process",
          "--enable-features=IsolateOrigins,site-per-process",
          "--no-sandbox",
          "--disable-features=Translate",
        ];
        launchArgs.args = opts.extraChromiumArgs
          ? [...baseArgs, ...opts.extraChromiumArgs]
          : baseArgs;
      }
      const browser = await browserType.launch(launchArgs);
      browserVersionCache = browser.version();
      const context = await browser.newContext(buildContextOptions(launchOpts));
      const handle: BrowserHandleImpl = {
        id: `browser:${id}:${String(Date.now())}`,
        browser,
        context,
        kind: opts.kind,
      };
      return handle;
    },
    async newPage(browserHandle: BrowserHandle): Promise<PageHandle> {
      const impl = ensureBrowserHandle(browserHandle);
      const page = await impl.context.newPage();
      const ph: PageHandleImpl = {
        id: `page:${impl.id}:${String(Date.now())}`,
        page,
        browserHandle: impl,
      };
      return ph;
    },
    async attachCDP(target: TargetHandle): Promise<CDPSessionLike> {
      const impl = ensureTargetHandle(target);
      if (impl.browserHandle.kind !== "chromium") {
        throw new Error(`attachCDP is only supported on Chromium; got ${impl.browserHandle.kind}`);
      }
      const session = await impl.browserHandle.context.newCDPSession(impl.page);
      const client = wrap(session);
      return adaptToCDPSessionLike(client);
    },
  };

  const attachOopif = async (
    target: TargetHandle,
    oopifOpts: Omit<OopifAttachOptions, "rootSession" | "newSessionFromId" | "page">,
  ): Promise<OopifAttachController> => {
    const impl = ensureTargetHandle(target);
    if (impl.browserHandle.kind !== "chromium") {
      throw new Error(`attachOopif is only supported on Chromium; got ${impl.browserHandle.kind}`);
    }
    const rootSession = await impl.browserHandle.context.newCDPSession(impl.page);
    const rootClient = wrap(rootSession);
    const newSessionFromId = makeChildSessionFactory(impl.browserHandle, rootSession);
    return setupOopifAutoAttach({
      ...oopifOpts,
      rootSession: rootClient,
      newSessionFromId,
      page: impl.page,
    });
  };

  return Object.assign(baseDriver, { attachOopif }) as PlaywrightDriverInstance;
}

function pickBrowserType(kind: PlaywrightBrowserKind) {
  switch (kind) {
    case "chromium":
      return chromium;
    case "firefox":
      return firefox;
    case "webkit":
      return webkit;
  }
}

function ensureBrowserHandle(handle: BrowserHandle): BrowserHandleImpl {
  const candidate = handle as Partial<BrowserHandleImpl>;
  if (candidate.browser === undefined || candidate.context === undefined) {
    throw new Error("BrowserHandle was not created by createPlaywrightDriver()");
  }
  return handle as BrowserHandleImpl;
}

function ensureTargetHandle(handle: TargetHandle): TargetHandleImpl {
  const candidate = handle as Partial<TargetHandleImpl>;
  if (!candidate.page || !candidate.browserHandle) {
    throw new Error("TargetHandle was not created by createPlaywrightDriver()");
  }
  return handle as TargetHandleImpl;
}

export function pageHandleAsTarget(handle: PageHandle): TargetHandle {
  const impl = handle as Partial<PageHandleImpl>;
  if (!impl.page || !impl.browserHandle) {
    throw new Error("PageHandle was not created by createPlaywrightDriver()");
  }
  const target: TargetHandleImpl = {
    id: `target:${impl.id ?? ""}`,
    page: impl.page,
    browserHandle: impl.browserHandle,
  };
  return target;
}

function buildContextOptions(launchOpts: LaunchOpts): Parameters<Browser["newContext"]>[0] {
  const ctx: NonNullable<Parameters<Browser["newContext"]>[0]> = {};
  if (launchOpts.emulation) {
    const e = launchOpts.emulation;
    if (e.viewport) {
      ctx.viewport = { width: e.viewport.width, height: e.viewport.height };
      ctx.deviceScaleFactor = e.viewport.deviceScaleFactor;
    }
    if (e.userAgent !== undefined) {
      ctx.userAgent = e.userAgent;
    }
    if (e.geolocation) {
      ctx.geolocation = e.geolocation;
    }
  }
  return ctx;
}

function adaptToCDPSessionLike(client: CdpClient): CDPSessionLike {
  return {
    async send(method: string, params?: unknown): Promise<unknown> {
      return client.send(method, params);
    },
    on(event: string, handler: (payload: unknown) => void): void {
      client.on(event as never, handler as never);
    },
    async detach(): Promise<void> {
      return client.detach();
    },
  };
}

function makeChildSessionFactory(
  _browserHandle: BrowserHandleImpl,
  _rootSession: CDPSession,
): (sessionId: string) => Promise<CdpClient | undefined> {
  return async (_sessionId: string) => undefined;
}

export { wrap as wrapCdpSession } from "./cdp-compat.js";
export type {
  AttachedToTargetEvent,
  CdpClient,
  CdpEvent,
  TargetInfo,
} from "./cdp-compat.js";
export type { AttachedTarget, OopifAttachController } from "./oopif-attach.js";

export { createPlaywrightAdapter } from "./engine-adapter.js";
export type {
  PlaywrightAdapterOptions,
  PlaywrightAdapterBundle,
} from "./engine-adapter.js";
