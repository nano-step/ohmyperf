export interface Config {
  readonly bind: string;
  readonly port: number;
  readonly corsOrigins: ReadonlyArray<string>;
  readonly allowPrivate: boolean;
  readonly rateLimitPerHour: number;
  readonly concurrency: number;
  readonly jobTtlMs: number;
  readonly sseHeartbeatMs: number;
  readonly replayBufferSize: number;
  readonly browserVersion: string;
}

const DEFAULT_ORIGINS: ReadonlyArray<string> = [
  "https://ohmyperf.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const corsRaw = env["OHMYPERF_RUNNER_CORS_ORIGINS"]?.trim();
  const corsOrigins = corsRaw
    ? corsRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : DEFAULT_ORIGINS;

  return {
    bind: env["OHMYPERF_RUNNER_BIND"] ?? "127.0.0.1",
    port: toInt(env["OHMYPERF_RUNNER_PORT"], 5174),
    corsOrigins,
    allowPrivate: env["OHMYPERF_RUNNER_ALLOW_PRIVATE"] === "1",
    rateLimitPerHour: toInt(env["OHMYPERF_RUNNER_RATE_LIMIT"], 10),
    concurrency: toInt(env["OHMYPERF_RUNNER_CONCURRENCY"], 1),
    jobTtlMs: toInt(env["OHMYPERF_RUNNER_JOB_TTL_MS"], 60 * 60 * 1000),
    sseHeartbeatMs: toInt(env["OHMYPERF_RUNNER_SSE_HEARTBEAT_MS"], 15_000),
    replayBufferSize: toInt(env["OHMYPERF_RUNNER_REPLAY_BUFFER"], 50),
    browserVersion: env["OHMYPERF_RUNNER_BROWSER_VERSION"] ?? "playwright@1.59.1",
  };
}

function toInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) ? n : fallback;
}
