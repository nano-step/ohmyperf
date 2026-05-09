import type { Logger } from "@ohmyperf/core";
import type { Frame, Page } from "playwright";
import {
  type AttachedToTargetEvent,
  type CdpClient,
  type DetachedFromTargetEvent,
  type TargetInfo,
  type TargetInfoChangedEvent,
  TARGET_SUBTYPE_FENCED_FRAME,
  TARGET_SUBTYPE_PRERENDER,
  TARGET_TYPE_IFRAME,
  TARGET_TYPE_PAGE,
  isDetachedError,
} from "./cdp-compat.js";

export interface AttachedTarget {
  readonly sessionId: string;
  readonly targetId: string;
  readonly type: string;
  readonly subtype: string | undefined;
  readonly url: string;
  readonly openerId: string | undefined;
  readonly client: CdpClient;
  readonly attachedAt: number;
}

export interface OopifAttachOptions {
  readonly rootSession: CdpClient;
  readonly newSessionFromId: (sessionId: string) => Promise<CdpClient | undefined>;
  readonly page: Page;
  readonly logger: Logger;
  readonly onAttach: (target: AttachedTarget) => Promise<void> | void;
  readonly onDetach?: (sessionId: string, targetId: string | undefined) => void;
  readonly onTargetInfoChanged?: (info: TargetInfo) => void;
  readonly waitForDebuggerOnStart?: boolean;
  readonly trackSrcdoc?: boolean;
}

export class OopifAutoAttachOrderViolation extends Error {
  public override readonly name = "OopifAutoAttachOrderViolation";
  constructor(message: string) {
    super(message);
  }
}

export interface OopifAttachController {
  readonly attached: ReadonlyMap<string, AttachedTarget>;
  detachAll(): Promise<void>;
}

const FILTER = [
  { type: TARGET_TYPE_IFRAME, exclude: false },
  { type: TARGET_TYPE_PAGE, exclude: false },
] as const;

export async function setupOopifAutoAttach(
  opts: OopifAttachOptions,
): Promise<OopifAttachController> {
  const { rootSession, newSessionFromId, page, logger, onAttach } = opts;
  const waitForDebuggerOnStart = opts.waitForDebuggerOnStart ?? false;
  const trackSrcdoc = opts.trackSrcdoc ?? false;
  const attached = new Map<string, AttachedTarget>();
  const seenFrameUrls = new Set<string>();
  const offHandlers: Array<() => void> = [];
  let frameCounter = 0;
  const parentUrl = (): string => page.url();

  const cdpEnrichments = new Map<string, { subtype: string | undefined; targetId: string }>();
  const recordCdpAttach = async (params: AttachedToTargetEvent): Promise<void> => {
    const { sessionId, targetInfo } = params;
    if (!shouldTrack(targetInfo)) return;
    try {
      await newSessionFromId(sessionId);
    } catch (err) {
      logger.debug("oopif-attach: cannot resolve child CDPSession", {
        sessionId,
        targetId: targetInfo.targetId,
        error: errMessage(err),
      });
    }
    const key = targetInfo.url || `target:${targetInfo.targetId}`;
    cdpEnrichments.set(key, { subtype: targetInfo.subtype, targetId: targetInfo.targetId });
  };

  const seenFrames = new WeakSet<Frame>();
  const recordFrameAttach = async (frame: Frame): Promise<void> => {
    if (frame === page.mainFrame()) return;
    if (frame.parentFrame() !== page.mainFrame()) return;
    if (seenFrames.has(frame)) return;
    seenFrames.add(frame);

    await new Promise((r) => setTimeout(r, 200));
    const url = frame.url();
    const isSrcdocLike = url === "about:srcdoc" || url === "about:blank" || url === "";
    if (isSrcdocLike && !trackSrcdoc) {
      return;
    }
    for (const existing of attached.values()) {
      if (existing.url === url) return;
    }

    const enrichment = cdpEnrichments.get(url);
    frameCounter++;
    const synthSessionId = `frame-${String(frameCounter)}`;
    const record: AttachedTarget = {
      sessionId: synthSessionId,
      targetId: enrichment?.targetId ?? synthSessionId,
      type: TARGET_TYPE_IFRAME,
      subtype: enrichment?.subtype,
      url,
      openerId: undefined,
      client: noopClient(),
      attachedAt: Date.now(),
    };
    attached.set(synthSessionId, record);
    try {
      await onAttach(record);
    } catch (err) {
      logger.warn("oopif-attach: onAttach handler threw (playwright path)", {
        url,
        error: errMessage(err),
      });
    }
  };

  const handleCdpDetached = (params: DetachedFromTargetEvent): void => {
    const record = attached.get(params.sessionId);
    if (!record) return;
    attached.delete(params.sessionId);
    seenFrameUrls.delete(record.url);
    opts.onDetach?.(params.sessionId, params.targetId ?? record.targetId);
  };

  const handleFrameDetached = (frame: Frame): void => {
    const url = frame.url();
    for (const [sessionId, record] of attached) {
      if (record.url === url || record.url === "") {
        attached.delete(sessionId);
        seenFrameUrls.delete(record.url);
        opts.onDetach?.(sessionId, record.targetId);
        return;
      }
    }
  };

  const handleCdpInfoChanged = (params: TargetInfoChangedEvent): void => {
    opts.onTargetInfoChanged?.(params.targetInfo);
  };

  offHandlers.push(
    rootSession.on("Target.attachedToTarget", (p) => {
      void recordCdpAttach(p);
    }),
  );
  offHandlers.push(rootSession.on("Target.detachedFromTarget", handleCdpDetached));
  offHandlers.push(rootSession.on("Target.targetInfoChanged", handleCdpInfoChanged));

  const onPlaywrightFrameAttached = (frame: Frame): void => {
    void recordFrameAttach(frame);
  };
  page.on("frameattached", onPlaywrightFrameAttached);
  page.on("framedetached", handleFrameDetached);
  offHandlers.push(() => {
    try {
      page.off("frameattached", onPlaywrightFrameAttached);
      page.off("framedetached", handleFrameDetached);
    } catch {
      /* noop */
    }
  });

  await rootSession.send("Target.setAutoAttach", {
    autoAttach: true,
    waitForDebuggerOnStart,
    flatten: true,
    filter: FILTER,
  });

  return {
    attached,
    async detachAll() {
      for (const off of offHandlers) {
        try {
          off();
        } catch {
          /* noop */
        }
      }
      const targets = Array.from(attached.values());
      attached.clear();
      await Promise.all(
        targets.map(async (t) => {
          try {
            await t.client.detach();
          } catch (err) {
            if (!isDetachedError(err)) {
              logger.debug("oopif-attach: detach() raised non-detached error", {
                sessionId: t.sessionId,
                error: errMessage(err),
              });
            }
          }
        }),
      );
    },
  };
}

export function classifyFrame(targetInfo: TargetInfo): {
  isOOPIF: boolean;
  isFenced: boolean;
  isPrerender: boolean;
  isCrossOriginCandidate: boolean;
  isPopup: boolean;
} {
  const isOOPIF = targetInfo.type === TARGET_TYPE_IFRAME;
  const isFenced = targetInfo.subtype === TARGET_SUBTYPE_FENCED_FRAME;
  const isPrerender = targetInfo.subtype === TARGET_SUBTYPE_PRERENDER;
  const isCrossOriginCandidate = isOOPIF;
  const isPopup = targetInfo.type === TARGET_TYPE_PAGE && Boolean(targetInfo.openerId);
  return { isOOPIF, isFenced, isPrerender, isCrossOriginCandidate, isPopup };
}

function shouldTrack(info: TargetInfo): boolean {
  if (info.type === TARGET_TYPE_IFRAME) return true;
  if (info.type === TARGET_TYPE_PAGE && info.openerId) return true;
  return false;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function noopClient(): CdpClient {
  return {
    detached: true,
    async send() {
      throw new Error("noop CdpClient: per-frame CDPSession not yet implemented");
    },
    on: (() => () => undefined) as CdpClient["on"],
    async detach() {
      return undefined;
    },
  };
}
