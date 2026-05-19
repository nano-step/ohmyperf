import type {
  MeasureRequest,
  ProgressEvent,
  JobStatus,
  ErrorCode,
  MeasureAcceptedResponse,
  JobPollResponse,
  HealthResponse,
  Report,
} from '@ohmyperf/shared-types';

export type { ProgressEvent };

export interface RunnerClientOptions {
  baseUrl: string;
  maxReconnects?: number;
  reconnectDelayMs?: number;
}

export type RunnerErrorCode =
  | ErrorCode
  | 'runner/network-error'
  | 'runner/sse-failed'
  | 'runner/cancelled'
  | 'runner/cors-blocked'
  | 'runner/bad-response';

export class RunnerClientError extends Error {
  readonly code: RunnerErrorCode;
  constructor(code: RunnerErrorCode, message: string) {
    super(message);
    this.name = 'RunnerClientError';
    this.code = code;
  }
}

export interface StreamHandle {
  readonly done: Promise<Report>;
  cancel(): void;
}

export async function submitMeasure(
  opts: RunnerClientOptions,
  request: MeasureRequest,
  signal?: AbortSignal,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl}/api/measure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: signal ?? null,
      credentials: 'omit',
      mode: 'cors',
    });
  } catch (err) {
    throw classifyFetchError(err);
  }

  if (res.status === 429) throw new RunnerClientError('rate-limit/exceeded', 'Rate limit exceeded.');
  if (res.status === 403) throw new RunnerClientError('ssrf/blocked-range', 'URL blocked by SSRF guard.');
  if (res.status === 400) {
    const body = await safeJson(res);
    const msg = (body as { error?: { message?: string } })?.error?.message ?? 'Invalid request.';
    throw new RunnerClientError('validation/bad-request', msg);
  }
  if (!res.ok) throw new RunnerClientError('internal/error', `Runner returned ${String(res.status)}.`);

  const body = (await res.json()) as MeasureAcceptedResponse;
  return body.jobId;
}

export async function pollJob(
  opts: RunnerClientOptions,
  jobId: string,
  signal?: AbortSignal,
): Promise<JobPollResponse> {
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl}/api/jobs/${jobId}`, {
      method: 'GET',
      credentials: 'omit',
      mode: 'cors',
      cache: 'no-store',
      signal: signal ?? null,
    });
  } catch (err) {
    throw classifyFetchError(err);
  }
  if (res.status === 404) throw new RunnerClientError('job/not-found', `Job ${jobId} not found.`);
  if (!res.ok) throw new RunnerClientError('internal/error', `Poll returned ${String(res.status)}.`);
  return (await res.json()) as JobPollResponse;
}

export async function fetchHealth(
  opts: RunnerClientOptions,
  signal?: AbortSignal,
): Promise<HealthResponse> {
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl}/api/health`, {
      method: 'GET',
      credentials: 'omit',
      mode: 'cors',
      cache: 'no-store',
      signal: signal ?? null,
    });
  } catch (err) {
    throw classifyFetchError(err);
  }
  if (!res.ok) throw new RunnerClientError('internal/error', `Health check failed: ${String(res.status)}.`);
  return (await res.json()) as HealthResponse;
}

export function streamJob(
  opts: RunnerClientOptions,
  jobId: string,
  onEvent: (event: ProgressEvent) => void,
  signal?: AbortSignal,
): StreamHandle {
  const maxReconnects = opts.maxReconnects ?? 3;
  const baseDelay = opts.reconnectDelayMs ?? 500;

  let cancelled = false;
  let cancelFn: (() => void) | null = null;

  const done = new Promise<Report>((resolve, reject) => {
    const ac = new AbortController();

    if (signal) {
      if (signal.aborted) {
        cancelled = true;
        reject(new RunnerClientError('runner/cancelled', 'Cancelled before start.'));
        return;
      }
      signal.addEventListener('abort', () => {
        cancelled = true;
        ac.abort('cancelled');
        reject(new RunnerClientError('runner/cancelled', 'Measurement cancelled.'));
      }, { once: true });
    }

    cancelFn = () => {
      cancelled = true;
      ac.abort('cancelled');
      reject(new RunnerClientError('runner/cancelled', 'Measurement cancelled.'));
    };

    connectWithRetry(opts, jobId, onEvent, ac.signal, maxReconnects, baseDelay)
      .then(resolve)
      .catch((err: unknown) => {
        if (!cancelled) reject(err);
      });
  });

  return {
    done,
    cancel() { cancelFn?.(); },
  };
}

async function connectWithRetry(
  opts: RunnerClientOptions,
  jobId: string,
  onEvent: (event: ProgressEvent) => void,
  signal: AbortSignal,
  maxReconnects: number,
  baseDelay: number,
): Promise<Report> {
  let attempt = 0;

  for (;;) {
    if (signal.aborted) throw new RunnerClientError('runner/cancelled', 'Cancelled.');

    try {
      return await consumeSSE(opts, jobId, onEvent, signal);
    } catch (err) {
      if (signal.aborted) throw new RunnerClientError('runner/cancelled', 'Cancelled.');
      if (err instanceof RunnerClientError && isTerminalError(err.code)) throw err;

      attempt++;
      if (attempt > maxReconnects) throw err;

      await sleep(baseDelay * Math.pow(2, attempt - 1), signal);
    }
  }
}

async function consumeSSE(
  opts: RunnerClientOptions,
  jobId: string,
  onEvent: (event: ProgressEvent) => void,
  signal: AbortSignal,
): Promise<Report> {
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl}/api/jobs/${jobId}/events`, {
      method: 'GET',
      headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
      credentials: 'omit',
      mode: 'cors',
      cache: 'no-store',
      signal: signal ?? null,
    });
  } catch (err) {
    throw classifyFetchError(err);
  }

  if (res.status === 404) throw new RunnerClientError('job/not-found', `Job ${jobId} not found.`);
  if (!res.ok) throw new RunnerClientError('runner/sse-failed', `SSE stream returned ${String(res.status)}.`);

  const body = res.body;
  if (!body) throw new RunnerClientError('runner/sse-failed', 'No response body for SSE stream.');

  return new Promise<Report>((resolve, reject) => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const onAbort = () => {
      reader.cancel().catch(() => undefined);
      reject(new RunnerClientError('runner/cancelled', 'Cancelled.'));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    function processBuffer() {
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      let dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          dataLines.push(line.slice(6));
        } else if (line === '') {
          if (dataLines.length > 0) {
            const raw = dataLines.join('\n');
            dataLines = [];
            try {
              const event = JSON.parse(raw) as ProgressEvent;
              onEvent(event);
              if (event.type === 'complete') {
                signal.removeEventListener('abort', onAbort);
                reader.cancel().catch(() => undefined);
                resolve(event.report);
                return;
              }
              if (event.type === 'error') {
                signal.removeEventListener('abort', onAbort);
                reader.cancel().catch(() => undefined);
                reject(new RunnerClientError(event.code, event.message));
                return;
              }
              if (event.type === 'cancelled') {
                signal.removeEventListener('abort', onAbort);
                reader.cancel().catch(() => undefined);
                reject(new RunnerClientError('runner/cancelled', 'Job cancelled by server.'));
                return;
              }
            } catch {
              void 0;
            }
          }
        }
      }
    }

    function pump() {
      reader.read().then(({ done: d, value }) => {
        if (signal.aborted) return;
        if (d) {
          reject(new RunnerClientError('runner/sse-failed', 'SSE stream ended unexpectedly.'));
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
        pump();
      }).catch((err: unknown) => {
        if (!signal.aborted) reject(classifyFetchError(err));
      });
    }

    pump();
  });
}

function isTerminalError(code: RunnerErrorCode): boolean {
  return (
    code === 'job/not-found' ||
    code === 'ssrf/blocked-range' ||
    code === 'validation/bad-request' ||
    code === 'rate-limit/exceeded' ||
    code === 'runner/cancelled'
  );
}

function classifyFetchError(err: unknown): RunnerClientError {
  if (err instanceof RunnerClientError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return new RunnerClientError('runner/network-error', 'Cannot reach local runner. Is it running?');
  }
  if (msg.toLowerCase().includes('cors')) {
    return new RunnerClientError('runner/cors-blocked', 'CORS blocked. Ensure runner allows this origin.');
  }
  return new RunnerClientError('runner/network-error', msg);
}

async function safeJson(res: Response): Promise<unknown> {
  try { return await res.json(); } catch { return {}; }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new RunnerClientError('runner/cancelled', 'Cancelled.')); return; }
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new RunnerClientError('runner/cancelled', 'Cancelled.'));
    }, { once: true });
  });
}

export function jobStatusLabel(status: JobStatus): string {
  switch (status) {
    case 'queued': return 'Queued';
    case 'running': return 'Running';
    case 'done': return 'Done';
    case 'error': return 'Error';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}
