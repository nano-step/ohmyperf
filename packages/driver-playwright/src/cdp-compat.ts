import type { CDPSession } from "playwright";

export interface CdpFilterEntry {
  type: "page" | "iframe" | "worker" | "shared_worker" | "service_worker" | "browser";
  exclude?: boolean;
}

export interface SetAutoAttachParams {
  autoAttach: boolean;
  waitForDebuggerOnStart: boolean;
  flatten?: true;
  filter?: ReadonlyArray<CdpFilterEntry>;
}

export interface AttachedToTargetEvent {
  sessionId: string;
  targetInfo: TargetInfo;
  waitingForDebugger: boolean;
}

export interface DetachedFromTargetEvent {
  sessionId: string;
  targetId?: string;
}

export interface TargetInfoChangedEvent {
  targetInfo: TargetInfo;
}

export interface TargetInfo {
  targetId: string;
  type: string;
  title: string;
  url: string;
  attached: boolean;
  openerId?: string;
  canAccessOpener?: boolean;
  openerFrameId?: string;
  browserContextId?: string;
  subtype?: string;
}

export type CdpEvent =
  | { method: "Target.attachedToTarget"; params: AttachedToTargetEvent }
  | { method: "Target.detachedFromTarget"; params: DetachedFromTargetEvent }
  | { method: "Target.targetInfoChanged"; params: TargetInfoChangedEvent }
  | { method: "Target.targetDestroyed"; params: { targetId: string } }
  | { method: "Page.frameAttached"; params: { frameId: string; parentFrameId: string; stack?: unknown } }
  | { method: "Page.frameNavigated"; params: { frame: { id: string; parentId?: string; url: string } } }
  | { method: "Page.frameDetached"; params: { frameId: string; reason: string } }
  | { method: "Page.lifecycleEvent"; params: { frameId: string; loaderId: string; name: string; timestamp: number } }
  | { method: "Page.frameResized"; params: Record<string, never> }
  | { method: "Page.navigatedWithinDocument"; params: { frameId: string; url: string } }
  | { method: "Inspector.targetCrashed"; params: Record<string, never> }
  | { method: "Runtime.executionContextCreated"; params: { context: { id: number; auxData?: { frameId?: string; isDefault?: boolean } } } }
  | { method: "Runtime.executionContextDestroyed"; params: { executionContextId: number } };

export class DetachedSessionError extends Error {
  public override readonly name = "DetachedSessionError";
  constructor(method: string) {
    super(`CDP session is detached; cannot send ${method}`);
  }
}

export function isDetachedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err instanceof DetachedSessionError ||
    msg.includes("session is detached") ||
    msg.includes("session closed") ||
    msg.includes("target closed") ||
    msg.includes("target page, context or browser has been closed") ||
    msg.includes("connection closed")
  );
}

export interface CdpClient {
  send<TResult = unknown>(method: string, params?: unknown): Promise<TResult>;
  on(method: "Target.attachedToTarget", handler: (params: AttachedToTargetEvent) => void): () => void;
  on(method: "Target.detachedFromTarget", handler: (params: DetachedFromTargetEvent) => void): () => void;
  on(method: "Target.targetInfoChanged", handler: (params: TargetInfoChangedEvent) => void): () => void;
  on(method: "Target.targetDestroyed", handler: (params: { targetId: string }) => void): () => void;
  on(method: string, handler: (params: unknown) => void): () => void;
  detach(): Promise<void>;
  readonly detached: boolean;
}

export function wrap(session: CDPSession): CdpClient {
  let detached = false;
  const offHandlers: Array<() => void> = [];

  session.once("close" as never, () => {
    detached = true;
    for (const off of offHandlers) {
      try {
        off();
      } catch {
        /* noop */
      }
    }
  });

  function on(method: string, handler: (params: unknown) => void): () => void {
    const wrapped = (payload: unknown) => {
      try {
        handler(payload);
      } catch {
        /* swallow handler errors so one bad subscriber cannot kill the session */
      }
    };
    session.on(method as never, wrapped as never);
    const off = () => {
      try {
        session.off(method as never, wrapped as never);
      } catch {
        /* noop */
      }
    };
    offHandlers.push(off);
    return off;
  }

  return {
    get detached() {
      return detached;
    },
    async send<TResult>(method: string, params?: unknown): Promise<TResult> {
      if (detached) throw new DetachedSessionError(method);
      try {
        return (await session.send(
          method as Parameters<CDPSession["send"]>[0],
          params as never,
        )) as TResult;
      } catch (err) {
        if (isDetachedError(err)) {
          detached = true;
          throw new DetachedSessionError(method);
        }
        throw err;
      }
    },
    on: on as CdpClient["on"],
    async detach(): Promise<void> {
      if (detached) return;
      detached = true;
      try {
        await session.detach();
      } catch (err) {
        if (!isDetachedError(err)) throw err;
      }
    },
  };
}

export const TARGET_TYPE_IFRAME = "iframe";
export const TARGET_TYPE_PAGE = "page";
export const TARGET_TYPE_WORKER = "worker";
export const TARGET_TYPE_SHARED_WORKER = "shared_worker";
export const TARGET_TYPE_SERVICE_WORKER = "service_worker";

export const TARGET_SUBTYPE_PRERENDER = "prerender";
export const TARGET_SUBTYPE_FENCED_FRAME = "fenced-frame";
