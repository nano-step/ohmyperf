import {
  PROTOCOL_VERSION,
  type BridgeError,
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
  type ProgressEvent,
  type MeasureRequest,
} from '@ohmyperf/shared-types';

import { EXTENSION_ID } from './extension-id';

export interface BridgePingResult {
  readonly version: string;
  readonly capabilities: ReadonlyArray<string>;
}

export class ExtensionBridgeError extends Error {
  readonly code: BridgeError['code'];
  readonly retriable: boolean;
  constructor(error: BridgeError) {
    super(error.message);
    this.name = 'ExtensionBridgeError';
    this.code = error.code;
    this.retriable = error.retriable;
  }
}

function getRuntime(): NonNullable<NonNullable<Window['chrome']>['runtime']> | null {
  if (typeof window === 'undefined') return null;
  const r = window.chrome?.runtime;
  if (!r || typeof r.sendMessage !== 'function' || typeof r.connect !== 'function') {
    return null;
  }
  return r;
}

function sendBridgeMessage(req: BridgeRequestEnvelope): Promise<BridgeResponseEnvelope> {
  const runtime = getRuntime();
  if (!runtime) {
    return Promise.reject(
      new ExtensionBridgeError({
        code: 'extension/internal',
        message: 'chrome.runtime.sendMessage unavailable',
        retriable: false,
      }),
    );
  }
  if (!EXTENSION_ID) {
    return Promise.reject(
      new ExtensionBridgeError({
        code: 'extension/internal',
        message: 'NEXT_PUBLIC_EXTENSION_ID is not set',
        retriable: false,
      }),
    );
  }
  return new Promise((resolve, reject) => {
    try {
      runtime.sendMessage(EXTENSION_ID, req, (response: unknown) => {
        if (runtime.lastError) {
          reject(
            new ExtensionBridgeError({
              code: 'extension/internal',
              message: runtime.lastError.message,
              retriable: true,
            }),
          );
          return;
        }
        if (!isResponseEnvelope(response)) {
          reject(
            new ExtensionBridgeError({
              code: 'extension/internal',
              message: 'Malformed response from extension',
              retriable: false,
            }),
          );
          return;
        }
        if (response.protocolVersion !== PROTOCOL_VERSION) {
          reject(
            new ExtensionBridgeError({
              code: 'extension/internal',
              message: `Protocol version mismatch: extension=${String(response.protocolVersion)} spa=${String(PROTOCOL_VERSION)}`,
              retriable: false,
            }),
          );
          return;
        }
        resolve(response);
      });
    } catch (e) {
      reject(
        new ExtensionBridgeError({
          code: 'extension/internal',
          message: e instanceof Error ? e.message : String(e),
          retriable: false,
        }),
      );
    }
  });
}

function isResponseEnvelope(value: unknown): value is BridgeResponseEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { protocolVersion?: unknown; type?: unknown };
  return typeof v.protocolVersion === 'number' && typeof v.type === 'string';
}

function isErrorResponse(r: BridgeResponseEnvelope): r is BridgeErrorResponse {
  return r.type === 'ohmyperf/error';
}

export async function ping(): Promise<BridgePingResult> {
  const req: PingRequest = { protocolVersion: PROTOCOL_VERSION, type: 'ohmyperf/ping' };
  const resp = await sendBridgeMessage(req);
  if (isErrorResponse(resp)) throw new ExtensionBridgeError(resp.error);
  if (resp.type !== 'ohmyperf/ping/response') {
    throw new ExtensionBridgeError({
      code: 'extension/internal',
      message: `Unexpected response type: ${resp.type}`,
      retriable: false,
    });
  }
  const pong = resp as PingResponse;
  return { version: pong.version, capabilities: pong.capabilities };
}

export interface MeasureStartResult {
  readonly jobId: string;
  readonly portName: string;
}

export async function startMeasure(input: MeasureRequest): Promise<MeasureStartResult> {
  if ((input.runs ?? 1) > 1) {
    throw new ExtensionBridgeError({
      code: 'extension/unsupported-runs',
      message: 'Extension backend supports single-run only; multi-run requires the runner backend.',
      retriable: false,
    });
  }
  const req: BridgeMeasureRequest = {
    protocolVersion: PROTOCOL_VERSION,
    type: 'ohmyperf/measure',
    url: input.url,
    runs: 1,
    mode: input.mode ?? 'real',
    ...(input.cacheMode !== undefined ? { cacheMode: input.cacheMode } : {}),
  };
  const resp = await sendBridgeMessage(req);
  if (isErrorResponse(resp)) throw new ExtensionBridgeError(resp.error);
  if (resp.type !== 'ohmyperf/measure/ack') {
    throw new ExtensionBridgeError({
      code: 'extension/internal',
      message: `Unexpected response type: ${resp.type}`,
      retriable: false,
    });
  }
  const ack = resp as MeasureAck;
  return { jobId: ack.jobId, portName: ack.portName };
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const req: CancelRequest = {
    protocolVersion: PROTOCOL_VERSION,
    type: 'ohmyperf/cancel',
    jobId,
  };
  const resp = await sendBridgeMessage(req);
  if (isErrorResponse(resp)) return false;
  if (resp.type !== 'ohmyperf/cancel/response') return false;
  return (resp as CancelResponse).ok;
}

function isPortEvent(value: unknown): value is PortEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { protocolVersion?: unknown; type?: unknown; jobId?: unknown };
  return (
    v.protocolVersion === PROTOCOL_VERSION &&
    typeof v.type === 'string' &&
    typeof v.jobId === 'string'
  );
}

function toProgressEvent(ev: PortEvent): ProgressEvent | null {
  switch (ev.type) {
    case 'queued':
      return { type: 'queued', jobId: ev.jobId, t: ev.ts };
    case 'run-start':
      return {
        type: 'run-start',
        jobId: ev.jobId,
        runIndex: ev.runIndex,
        totalRuns: ev.totalRuns,
        t: ev.ts,
      };
    case 'navigation':
      return {
        type: 'navigation',
        jobId: ev.jobId,
        runIndex: ev.runIndex,
        phase: ev.phase,
        t: ev.ts,
      };
    case 'metric':
      return {
        type: 'metric',
        jobId: ev.jobId,
        runIndex: ev.runIndex,
        name: ev.name,
        value: ev.value,
        t: ev.ts,
      };
    case 'run-complete':
      return {
        type: 'run-complete',
        jobId: ev.jobId,
        runIndex: ev.runIndex,
        t: ev.ts,
      };
    case 'complete':
      return { type: 'complete', jobId: ev.jobId, report: ev.report, t: ev.ts };
    case 'error':
      return {
        type: 'error',
        jobId: ev.jobId,
        code:
          ev.error.code === 'extension/cancelled'
            ? 'job/cancelled'
            : ev.error.code === 'extension/devtools-attached'
              ? 'extension/devtools-attached'
              : ev.error.code === 'extension/target-tab-closed'
                ? 'extension/target-tab-closed'
                : ev.error.code === 'extension/self-measurement-refused'
                  ? 'extension/self-measurement-refused'
                  : ev.error.code === 'extension/unsupported-runs'
                    ? 'extension/multi-run-unsupported'
                    : 'internal/error',
        message: ev.error.message,
        t: ev.ts,
      };
    default:
      return null;
  }
}

export interface StreamPortHandle {
  readonly events: AsyncIterable<ProgressEvent>;
  close(): void;
}

export function streamPort(portName: string): StreamPortHandle {
  const runtime = getRuntime();
  if (!runtime || !EXTENSION_ID) {
    throw new ExtensionBridgeError({
      code: 'extension/internal',
      message: 'chrome.runtime.connect unavailable',
      retriable: false,
    });
  }
  const port = runtime.connect(EXTENSION_ID, { name: portName });

  const queue: ProgressEvent[] = [];
  let resolveNext: ((v: IteratorResult<ProgressEvent>) => void) | null = null;
  let closed = false;

  function push(value: ProgressEvent): void {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r({ value, done: false });
      return;
    }
    queue.push(value);
  }

  function finish(): void {
    if (closed) return;
    closed = true;
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r({ value: undefined as unknown as ProgressEvent, done: true });
    }
  }

  port.onMessage.addListener((msg: unknown) => {
    if (!isPortEvent(msg)) return;
    const pe = toProgressEvent(msg);
    if (!pe) return;
    push(pe);
    if (pe.type === 'complete' || pe.type === 'error' || pe.type === 'cancelled') {
      finish();
    }
  });
  port.onDisconnect.addListener(() => {
    finish();
  });

  const events: AsyncIterable<ProgressEvent> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<ProgressEvent>> {
          if (queue.length > 0) {
            const value = queue.shift() as ProgressEvent;
            return Promise.resolve({ value, done: false });
          }
          if (closed) {
            return Promise.resolve({
              value: undefined as unknown as ProgressEvent,
              done: true,
            });
          }
          return new Promise((resolve) => {
            resolveNext = resolve;
          });
        },
        return(): Promise<IteratorResult<ProgressEvent>> {
          finish();
          try {
            port.disconnect();
          } catch {
            /* noop */
          }
          return Promise.resolve({
            value: undefined as unknown as ProgressEvent,
            done: true,
          });
        },
      };
    },
  };

  return {
    events,
    close(): void {
      finish();
      try {
        port.disconnect();
      } catch {
        /* noop */
      }
    },
  };
}

export const extensionBridge = {
  ping,
  startMeasure,
  cancelJob,
  streamPort,
} as const;
