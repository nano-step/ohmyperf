import type { Report } from "@ohmyperf/core";
import { redactReport, type RedactionOptions, type RedactionResult } from "./redact.js";

export { redactReport, type RedactionOptions, type RedactionResult, type RedactionSummary } from "./redact.js";

export interface UploadOptions {
  readonly endpoint: string;
  readonly report: Report;
  readonly password?: string;
  readonly expiresInDays?: number;
  readonly private?: boolean;
  readonly skipRedaction?: boolean;
  readonly redactionOptions?: RedactionOptions;
  readonly fetchImpl?: typeof fetch;
}

export interface UploadResult {
  readonly id: string;
  readonly url: string;
  readonly expiresAt: number;
  readonly redaction?: RedactionResult["summary"];
}

export class ShareUploadError extends Error {
  public readonly status: number;
  public override readonly name = "ShareUploadError";
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class ShareSecretLeakError extends Error {
  public override readonly name = "ShareSecretLeakError";
  public readonly leaks: ReadonlyArray<{ path: string; envKey: string }>;
  constructor(leaks: ReadonlyArray<{ path: string; envKey: string }>) {
    super(
      `Refused to upload: env-secret values were detected inside the report (${leaks
        .map((l) => l.envKey)
        .join(", ")}). Set --unsafe-share-with-secrets to override.`,
    );
    this.leaks = leaks;
  }
}

export async function uploadReport(opts: UploadOptions): Promise<UploadResult> {
  const fetchFn = opts.fetchImpl ?? fetch;
  let payloadReport = opts.report;
  let redactionSummary: RedactionResult["summary"] | undefined;
  if (!opts.skipRedaction) {
    const result = redactReport(opts.report, {
      scanEnvSecrets: true,
      ...(opts.redactionOptions ?? {}),
    });
    if (result.summary.envSecretsDetected.length > 0) {
      throw new ShareSecretLeakError(result.summary.envSecretsDetected);
    }
    payloadReport = result.report;
    redactionSummary = result.summary;
  }

  const body: {
    report: Report;
    password?: string;
    expiresInMs?: number;
    private?: boolean;
  } = { report: payloadReport };
  if (opts.password) body.password = opts.password;
  if (opts.expiresInDays && opts.expiresInDays > 0) {
    body.expiresInMs = opts.expiresInDays * 24 * 60 * 60 * 1000;
  }
  if (opts.private) body.private = true;

  const res = await fetchFn(`${opts.endpoint.replace(/\/$/, "")}/api/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      detail = `<no body>`;
    }
    throw new ShareUploadError(
      `Share upload failed: HTTP ${String(res.status)} ${detail.slice(0, 200)}`,
      res.status,
    );
  }
  const parsed = (await res.json()) as { id: string; url: string; expiresAt: number };
  return {
    id: parsed.id,
    url: parsed.url,
    expiresAt: parsed.expiresAt,
    ...(redactionSummary ? { redaction: redactionSummary } : {}),
  };
}
