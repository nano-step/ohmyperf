import type {
  CDPSessionLike,
  EngineAttachedFrame,
  EngineLaunchAdapter,
  EnginePageContext,
  Logger,
} from "@ohmyperf/core";
import { createSilentLogger } from "@ohmyperf/core";
import {
  createPlaywrightDriver,
  pageHandleAsTarget,
  type PlaywrightBrowserKind,
  type PlaywrightDriverInstance,
} from "./index.js";
import type { AttachedTarget } from "./oopif-attach.js";

export interface PlaywrightAdapterOptions {
  readonly url: string;
  readonly kind?: PlaywrightBrowserKind;
  readonly executablePath?: string;
  readonly extraChromiumArgs?: ReadonlyArray<string>;
  readonly headless?: "headless" | "headful";
  readonly logger?: Logger;
}

export interface PlaywrightAdapterBundle {
  readonly driver: PlaywrightDriverInstance;
  readonly adapter: EngineLaunchAdapter;
}

export function createPlaywrightAdapter(opts: PlaywrightAdapterOptions): PlaywrightAdapterBundle {
  const logger = opts.logger ?? createSilentLogger();
  const driver = createPlaywrightDriver({
    kind: opts.kind ?? "chromium",
    ...(opts.executablePath !== undefined ? { executablePath: opts.executablePath } : {}),
    ...(opts.extraChromiumArgs !== undefined ? { extraChromiumArgs: opts.extraChromiumArgs } : {}),
  });

  const adapter: EngineLaunchAdapter = {
    async launchPageWithCdp(): Promise<EnginePageContext> {
      const browser = await driver.launch({ mode: opts.headless ?? "headless" });
      const page = await driver.newPage(browser);
      const target = pageHandleAsTarget(page);

      const collectedFrames: EngineAttachedFrame[] = [];
      const oopifAttachOptions = {
        logger,
        onAttach: (t: AttachedTarget) => {
          collectedFrames.push({
            frameId: t.targetId,
            url: t.url,
            isOOPIF: t.type === "iframe",
            session: null,
          });
        },
      };
      const oopifController = await driver.attachOopif(
        target,
        oopifAttachOptions as Parameters<typeof driver.attachOopif>[1],
      );

      const rootSessionLike = await driver.attachCDP!(target);
      const internal = page as unknown as {
        page: {
          goto(url: string, opts?: unknown): Promise<unknown>;
          waitForLoadState(state: string, opts?: unknown): Promise<void>;
          close(): Promise<void>;
        };
      };
      const internalBrowser = browser as unknown as {
        browser: { close(): Promise<void> };
      };

      const ctx: EnginePageContext = {
        browserVersion: driver.browserVersion,
        browserSource: "bundled",
        rootSession: rootSessionLike as CDPSessionLike,
        attachedFrames: collectedFrames,
        async goto(url: string): Promise<void> {
          await internal.page.goto(url, { waitUntil: "load" });
        },
        async waitForLoadIdle(timeoutMs: number): Promise<void> {
          await internal.page.waitForLoadState("networkidle", { timeout: timeoutMs });
        },
        async close(): Promise<void> {
          try {
            await oopifController.detachAll();
          } catch (err) {
            logger.debug("playwright-adapter: detachAll threw", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
          try {
            await rootSessionLike.detach();
          } catch (err) {
            logger.debug("playwright-adapter: rootSession.detach threw", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
          try {
            await internal.page.close();
          } catch (err) {
            logger.debug("playwright-adapter: page.close threw", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
          try {
            await internalBrowser.browser.close();
          } catch (err) {
            logger.debug("playwright-adapter: browser.close threw", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        },
      };
      return ctx;
    },
  };

  return { driver, adapter };
}
