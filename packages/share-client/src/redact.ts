import type { Report } from "@ohmyperf/core";

export interface RedactionSummary {
  readonly headers: number;
  readonly queryParams: number;
  readonly envSecretsDetected: ReadonlyArray<{
    path: string;
    envKey: string;
  }>;
}

export interface RedactionOptions {
  readonly extraHeaders?: ReadonlyArray<string>;
  readonly extraQueryParams?: ReadonlyArray<string>;
  readonly scanEnvSecrets?: boolean;
}

const REDACTED_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-api-key",
]);

const REDACTED_QUERY_PARAMS = new Set([
  "token",
  "key",
  "secret",
  "password",
  "api_key",
  "auth",
  "session",
  "sid",
  "access_token",
  "refresh_token",
  "code",
  "state",
]);

const ENV_ALLOWLIST_PREFIX = "OHMYPERF_";

export interface RedactionResult {
  readonly report: Report;
  readonly summary: RedactionSummary;
}

export function redactReport(report: Report, opts: RedactionOptions = {}): RedactionResult {
  const headerSet = new Set([
    ...REDACTED_HEADERS,
    ...(opts.extraHeaders ?? []).map((h) => h.toLowerCase()),
  ]);
  const queryParamSet = new Set([
    ...REDACTED_QUERY_PARAMS,
    ...(opts.extraQueryParams ?? []).map((q) => q.toLowerCase()),
  ]);

  let headerHits = 0;
  let queryParamHits = 0;

  const redactUrl = (url: string): string => {
    try {
      const u = new URL(url);
      let touched = false;
      for (const key of Array.from(u.searchParams.keys())) {
        if (queryParamSet.has(key.toLowerCase())) {
          u.searchParams.set(key, "[REDACTED]");
          touched = true;
          queryParamHits++;
        }
      }
      return touched ? u.toString() : url;
    } catch {
      return url;
    }
  };

  const newRuns = report.runs.map((run) => {
    const resources = run.resources.map((r) => ({ ...r, url: redactUrl(r.url) }));
    return { ...run, resources };
  });

  const newReport: Report = {
    ...report,
    meta: { ...report.meta, url: redactUrl(report.meta.url) },
    runs: newRuns,
  };

  const envSecretsDetected: Array<{ path: string; envKey: string }> = [];
  if (opts.scanEnvSecrets) {
    const envValues: Array<{ key: string; value: string }> = [];
    for (const [k, v] of Object.entries(process.env)) {
      if (!v || v.length < 8) continue;
      if (k.startsWith(ENV_ALLOWLIST_PREFIX)) continue;
      envValues.push({ key: k, value: v });
    }
    const haystack = JSON.stringify(newReport);
    for (const { key, value } of envValues) {
      if (haystack.includes(value)) {
        envSecretsDetected.push({ path: "<report>", envKey: key });
      }
    }
  }

  return {
    report: newReport,
    summary: {
      headers: headerHits,
      queryParams: queryParamHits,
      envSecretsDetected,
    },
  };
}
