export const SHARED_TYPES_PACKAGE = "@ohmyperf/shared-types" as const;

export type { Report, BrowserInfo, ReportMeta, RunReport, Mode } from "@ohmyperf/core";

export type CacheMode = "cold" | "warm" | "cold-then-warm";

export type MeasurementMode = "real" | "ci-stable";

export type HeadlessPreference = "headless" | "headful";

/**
 * Body of POST /api/measure (runner) and payload of the extension `ohmyperf/measure` message.
 *
 * `plugins` is forwarded opaquely to the engine; runner does not introspect it. When omitted
 * the runner applies the default plugin set (`cwvPlugin + axePlugin`) for parity with the CLI.
 */
export interface MeasureRequest {
  readonly url: string;
  readonly runs?: number;
  readonly mode?: MeasurementMode;
  readonly cacheMode?: CacheMode;
  readonly headless?: HeadlessPreference;
  readonly plugins?: ReadonlyArray<unknown>;
}

export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

export type NavigationPhase = "started" | "committed" | "loaded" | "idle";

export interface ProgressEventQueued {
  readonly type: "queued";
  readonly jobId: string;
  readonly t: number;
}

export interface ProgressEventRunStart {
  readonly type: "run-start";
  readonly jobId: string;
  readonly runIndex: number;
  readonly totalRuns: number;
  readonly t: number;
}

export interface ProgressEventNavigation {
  readonly type: "navigation";
  readonly jobId: string;
  readonly runIndex: number;
  readonly phase: NavigationPhase;
  readonly t: number;
}

export interface ProgressEventMetric {
  readonly type: "metric";
  readonly jobId: string;
  readonly runIndex: number;
  readonly name: string;
  readonly value: number;
  readonly t: number;
}

export interface ProgressEventRunComplete {
  readonly type: "run-complete";
  readonly jobId: string;
  readonly runIndex: number;
  readonly t: number;
}

export interface ProgressEventComplete {
  readonly type: "complete";
  readonly jobId: string;
  readonly report: import("@ohmyperf/core").Report;
  readonly t: number;
}

export interface ProgressEventError {
  readonly type: "error";
  readonly jobId: string;
  readonly code: ErrorCode;
  readonly message: string;
  readonly t: number;
}

export interface ProgressEventCancelled {
  readonly type: "cancelled";
  readonly jobId: string;
  readonly code: "job/cancelled";
  readonly t: number;
}

/**
 * Discriminated union of all SSE / port-stream events emitted during a measurement.
 * Consumers SHOULD switch on `type` and treat unknown values as no-ops (forward-compatibility).
 */
export type ProgressEvent =
  | ProgressEventQueued
  | ProgressEventRunStart
  | ProgressEventNavigation
  | ProgressEventMetric
  | ProgressEventRunComplete
  | ProgressEventComplete
  | ProgressEventError
  | ProgressEventCancelled;

export type ErrorCode =
  | "ssrf/blocked-range"
  | "ssrf/dns-failure"
  | "navigation/timeout"
  | "navigation/cert-error"
  | "navigation/csp-blocked"
  | "navigation/network"
  | "job/not-found"
  | "job/cancelled"
  | "rate-limit/exceeded"
  | "validation/bad-request"
  | "internal/error"
  | "extension/devtools-attached"
  | "extension/target-tab-closed"
  | "extension/self-measurement-refused"
  | "extension/multi-run-unsupported";

export interface ErrorEnvelope {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly requestId: string;
    readonly details?: Readonly<Record<string, unknown>>;
  };
}

export interface HealthResponse {
  readonly ok: true;
  readonly version: string;
  readonly engine: string;
  readonly browser: {
    readonly source: "bundled" | "system" | "extension-host";
    readonly version: string;
  };
}

export interface MeasureAcceptedResponse {
  readonly jobId: string;
  readonly status: "queued";
}

export interface JobPollResponse {
  readonly id: string;
  readonly status: JobStatus;
  readonly report?: import("@ohmyperf/core").Report;
  readonly error?: { readonly code: ErrorCode; readonly message: string };
}

export type ExtensionRequest =
  | { readonly type: "ohmyperf/ping" }
  | { readonly type: "ohmyperf/measure"; readonly request: MeasureRequest }
  | { readonly type: "ohmyperf/cancel"; readonly jobId: string };

export type ExtensionResponse =
  | { readonly type: "ohmyperf/pong"; readonly ok: true; readonly version: string }
  | { readonly type: "ohmyperf/accepted"; readonly jobId: string }
  | { readonly type: "ohmyperf/error"; readonly code: ErrorCode; readonly message: string };

export type ExtensionPortMessage = ProgressEvent;

// Phase δ — Extension bridge envelopes (externally_connectable).
// PROTOCOL_VERSION is bumped only on breaking changes; bridge rejects mismatched majors.

export const PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

export interface BaseEnvelope {
  readonly protocolVersion: ProtocolVersion;
}

export type BridgeErrorCode =
  | "extension/invalid-request"
  | "extension/unsupported-runs"
  | "extension/self-measurement-refused"
  | "extension/devtools-attached"
  | "extension/target-tab-closed"
  | "extension/debugger-detached"
  | "extension/tab-create-failed"
  | "extension/engine-error"
  | "extension/cancelled"
  | "extension/internal";

export interface BridgeError {
  readonly code: BridgeErrorCode;
  readonly message: string;
  readonly retriable: boolean;
}

export type BridgeCapability =
  | "single-run"
  | "real-mode"
  | "ci-stable-mode"
  | "progress-port-v1";

export interface PingRequest extends BaseEnvelope {
  readonly type: "ohmyperf/ping";
}
export interface PingResponse extends BaseEnvelope {
  readonly type: "ohmyperf/ping/response";
  readonly ok: true;
  readonly version: string;
  readonly capabilities: ReadonlyArray<BridgeCapability>;
}

export interface BridgeMeasureRequest extends BaseEnvelope {
  readonly type: "ohmyperf/measure";
  readonly url: string;
  readonly runs: 1;
  readonly mode: "real" | "ci-stable";
  readonly cacheMode?: CacheMode;
  readonly includeTrace?: boolean;
}
export interface MeasureAck extends BaseEnvelope {
  readonly type: "ohmyperf/measure/ack";
  readonly ok: true;
  readonly jobId: string;
  readonly portName: string;
}

export interface CancelRequest extends BaseEnvelope {
  readonly type: "ohmyperf/cancel";
  readonly jobId: string;
}
export interface CancelResponse extends BaseEnvelope {
  readonly type: "ohmyperf/cancel/response";
  readonly ok: boolean;
}

export interface BridgeErrorResponse extends BaseEnvelope {
  readonly type: "ohmyperf/error";
  readonly ok: false;
  readonly error: BridgeError;
}

export type BridgeRequestEnvelope = PingRequest | BridgeMeasureRequest | CancelRequest;
export type BridgeResponseEnvelope =
  | PingResponse
  | MeasureAck
  | CancelResponse
  | BridgeErrorResponse;

export type PortEvent =
  | { readonly protocolVersion: ProtocolVersion; readonly type: "queued"; readonly jobId: string; readonly ts: number }
  | {
      readonly protocolVersion: ProtocolVersion;
      readonly type: "run-start";
      readonly jobId: string;
      readonly runIndex: 0;
      readonly totalRuns: 1;
      readonly ts: number;
    }
  | {
      readonly protocolVersion: ProtocolVersion;
      readonly type: "navigation";
      readonly jobId: string;
      readonly runIndex: 0;
      readonly phase: NavigationPhase;
      readonly ts: number;
    }
  | {
      readonly protocolVersion: ProtocolVersion;
      readonly type: "metric";
      readonly jobId: string;
      readonly runIndex: 0;
      readonly name: string;
      readonly value: number;
      readonly ts: number;
    }
  | {
      readonly protocolVersion: ProtocolVersion;
      readonly type: "run-complete";
      readonly jobId: string;
      readonly runIndex: 0;
      readonly ts: number;
    }
  | {
      readonly protocolVersion: ProtocolVersion;
      readonly type: "complete";
      readonly jobId: string;
      readonly report: import("@ohmyperf/core").Report;
      readonly ts: number;
    }
  | {
      readonly protocolVersion: ProtocolVersion;
      readonly type: "error";
      readonly jobId: string;
      readonly error: BridgeError;
      readonly ts: number;
    };
