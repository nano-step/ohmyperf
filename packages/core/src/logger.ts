import type { Logger } from "./types.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface ConsoleLoggerOptions {
  readonly level?: LogLevel;
  readonly prefix?: string;
  readonly stream?: NodeJS.WritableStream;
  readonly errStream?: NodeJS.WritableStream;
  readonly json?: boolean;
}

export function createConsoleLogger(opts: ConsoleLoggerOptions = {}): Logger {
  const minLevel = LEVEL_RANK[opts.level ?? "info"];
  const prefix = opts.prefix ?? "ohmyperf";
  const out = opts.stream ?? process.stderr;
  const err = opts.errStream ?? process.stderr;
  const asJson = opts.json ?? false;

  const emit = (
    level: LogLevel,
    message: string,
    fields: Record<string, unknown> | undefined,
  ): void => {
    if (LEVEL_RANK[level] < minLevel) return;
    const target = level === "error" ? err : out;
    if (asJson) {
      const line = JSON.stringify({
        time: new Date().toISOString(),
        level,
        prefix,
        message,
        ...(fields ?? {}),
      });
      target.write(line + "\n");
      return;
    }
    const fieldsTail = fields && Object.keys(fields).length > 0 ? " " + JSON.stringify(fields) : "";
    target.write(`[${prefix}] ${level.toUpperCase()} ${message}${fieldsTail}\n`);
  };

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
  };
}

export function createSilentLogger(): Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}
