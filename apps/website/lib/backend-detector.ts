import { PROTOCOL_VERSION } from '@ohmyperf/shared-types';

import { env } from './env';

export type Backend =
  | { kind: 'extension'; extensionId: string; version: string }
  | { kind: 'runner'; baseUrl: string; version: string; engine?: string; browser?: { source: string; version: string } }
  | { kind: 'none' };

const RUNNER_HOSTS = [
  `http://127.0.0.1:${env.NEXT_PUBLIC_RUNNER_PORT}`,
  `http://localhost:${env.NEXT_PUBLIC_RUNNER_PORT}`,
];

const DETECTION_TIMEOUT_MS = 800;

export async function detectBackend(signal?: AbortSignal): Promise<Backend> {
  if (typeof window === 'undefined') return { kind: 'none' };

  const ac = new AbortController();
  const linkedSignal = signal ? mergeSignals([ac.signal, signal]) : ac.signal;
  const timer = setTimeout(() => { ac.abort('detection timeout'); }, DETECTION_TIMEOUT_MS);

  try {
    const [extResult, runnerResult] = await Promise.allSettled([
      pingExtension(linkedSignal),
      pingRunner(linkedSignal),
    ]);

    if (extResult.status === 'fulfilled' && extResult.value) {
      return extResult.value;
    }
    if (runnerResult.status === 'fulfilled' && runnerResult.value) {
      return runnerResult.value;
    }
    return { kind: 'none' };
  } finally {
    clearTimeout(timer);
  }
}

async function pingExtension(signal: AbortSignal): Promise<Backend | null> {
  const id = env.NEXT_PUBLIC_EXTENSION_ID;
  const runtime = window.chrome?.runtime;
  if (!id || !runtime || typeof runtime.sendMessage !== 'function') return null;

  return new Promise<Backend | null>((resolve) => {
    let settled = false;
    const onAbort = () => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      runtime.sendMessage(
        id,
        { protocolVersion: PROTOCOL_VERSION, type: 'ohmyperf/ping' },
        (response: unknown) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);

          if (runtime.lastError) {
            resolve(null);
            return;
          }
          if (
            response !== null &&
            typeof response === 'object' &&
            'ok' in response &&
            (response as { ok: unknown }).ok === true &&
            'version' in response &&
            typeof (response as { version: unknown }).version === 'string' &&
            'protocolVersion' in response &&
            (response as { protocolVersion: unknown }).protocolVersion === PROTOCOL_VERSION
          ) {
            resolve({
              kind: 'extension',
              extensionId: id,
              version: (response as { version: string }).version,
            });
          } else {
            resolve(null);
          }
        },
      );
    } catch {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }
  });
}

async function pingRunner(signal: AbortSignal): Promise<Backend | null> {
  for (const baseUrl of RUNNER_HOSTS) {
    try {
      const res = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal,
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { ok?: boolean; version?: string; engine?: string; browser?: { source: string; version: string } };
      if (body.ok === true && typeof body.version === 'string') {
        const result: Backend = {
          kind: 'runner',
          baseUrl,
          version: body.version,
          ...(body.engine !== undefined ? { engine: body.engine } : {}),
          ...(body.browser !== undefined ? { browser: body.browser } : {}),
        };
        return result;
      }
    } catch {
      /* empty */
    }
  }
  return null;
}

function mergeSignals(signals: AbortSignal[]): AbortSignal {
  const ac = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      ac.abort(s.reason);
      return ac.signal;
    }
    s.addEventListener('abort', () => { ac.abort(s.reason); }, { once: true });
  }
  return ac.signal;
}
