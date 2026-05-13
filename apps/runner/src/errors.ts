import type { ErrorCode, ErrorEnvelope } from "@ohmyperf/shared-types";

export type { ErrorCode, ErrorEnvelope };

export function errorEnvelope(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: Readonly<Record<string, unknown>>,
): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      requestId,
      ...(details ? { details } : {}),
    },
  };
}

export function classifyEngineError(err: unknown): { code: ErrorCode; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { code: "navigation/timeout", message };
  }
  if (lower.includes("net::err_cert") || lower.includes("cert") || lower.includes("ssl")) {
    return { code: "navigation/cert-error", message };
  }
  if (lower.includes("content security policy") || lower.includes("csp")) {
    return { code: "navigation/csp-blocked", message };
  }
  if (
    lower.includes("net::") ||
    lower.includes("err_name_not_resolved") ||
    lower.includes("dns") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound")
  ) {
    return { code: "navigation/network", message };
  }
  return { code: "internal/error", message };
}
