Task Result

Task ID: bg_fd36c7a6
Description: Phase γ deep-dive: Metrics + viewer port + IndexedDB
Duration: 5m 24s
Session ID: ses_1dfd15916ffevgb7oP8k4j70yY

---

I'll start by reading the key files to ground this spec in the actual codebase.

Now reading remaining files I need:

I have enough context. Now I'll produce the deliverable.

---

# Phase γ Code-Level Spec — Measurement-Result Rendering Layer

Working tree: `/Users/nhonh/Documents/personal/ohmyperf`
All client paths are `apps/website/...` unless noted. References below to `types.ts` are `packages/core/src/types.ts`.

---

## 0. Cross-cutting decisions (read first)

- **Shared types** live in `packages/shared-types/` (created in α.1). It re-exports `Report` from `@ohmyperf/core` and adds `MeasureRequest`, `JobStatus`, `ProgressEvent`, `RunnerError`, `ExtensionMessage`, `ReportSummary`. Both the SPA, runner, and extension consume this — no duplicate definitions.
- **Backend abstraction**: `runner-client.ts` and `extension-bridge.ts` both expose the same shape `MeasureBackend` (see §A). UI components consume `MeasureBackend`, not either concrete client. This is what makes the rest of the rendering tree backend-agnostic.
- **One-time imports**: Recharts and uPlot are *never* imported statically from a route entry. Always via `next/dynamic({ ssr: false })`. Treat this as a CI lint rule (depcruise or ESLint custom).
- **No `dangerouslySetInnerHTML`** anywhere in the React port — satisfies R7. The static `renderReportHtml` keeps its existing escape functions and remains the only HTML-string source.

---

## A. `apps/website/lib/runner-client.ts`

### A.1 Module shape & types

```ts
// apps/website/lib/runner-client.ts
import type {
  MeasureRequest,
  ProgressEvent,
  Job,
  Report,
  RunnerError,
} from "@ohmyperf/shared-types";

export interface RunnerClientOptions {
  readonly baseUrl: string;                // e.g. "http://localhost:5174"
  readonly fetch?: typeof globalThis.fetch; // injected for tests
  readonly maxReconnectMs?: number;        // default 30_000
  readonly initialBackoffMs?: number;      // default 500
}

export interface MeasureHandle {
  readonly jobId: string;
  /** AsyncIterable consumed by progress-stream.tsx */
  events(): AsyncIterable<ProgressEvent>;
  cancel(): Promise<void>;
}

export interface MeasureBackend {                          // shared with extension-bridge
  readonly kind: "runner" | "extension";
  ping(): Promise<{ ok: true; version: string }>;
  measure(req: MeasureRequest): Promise<MeasureHandle>;
  getJob(id: string): Promise<Job>;
  cancelJob(id: string): Promise<void>;
}
```

### A.2 Skeleton

```ts
export class RunnerClient implements MeasureBackend {
  readonly kind = "runner" as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxReconnectMs: number;
  private readonly initialBackoffMs: number;

  constructor(opts: RunnerClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxReconnectMs = opts.maxReconnectMs ?? 30_000;
    this.initialBackoffMs = opts.initialBackoffMs ?? 500;
  }

  async ping(): Promise<{ ok: true; version: string }> {
    const res = await this.json<{ ok: true; version: string }>(
      "GET",
      "/api/health",
      undefined,
      { timeoutMs: 800 },
    );
    return res;
  }

  async measure(req: MeasureRequest): Promise<MeasureHandle> {
    const { jobId } = await this.json<{ jobId: string }>(
      "POST",
      "/api/measure",
      req,
    );
    return {
      jobId,
      events: () => this.streamEvents(jobId),
      cancel: () => this.cancelJob(jobId),
    };
  }

  async getJob(id: string): Promise<Job> {
    return this.json<Job>("GET", `/api/jobs/${encodeURIComponent(id)}`);
  }

  async cancelJob(id: string): Promise<void> {
    await this.json<void>("DELETE", `/api/jobs/${encodeURIComponent(id)}`);
  }

  /** Public so tests can drive it directly. */
  async *streamEvents(jobId: string): AsyncIterable<ProgressEvent> {
    let lastEventId: string | undefined;
    let attempt = 0;

    // External controller may be wired by caller via .return() on the iterator.
    while (true) {
      const ac = new AbortController();
      try {
        const url = new URL(
          `/api/jobs/${encodeURIComponent(jobId)}/events`,
          this.baseUrl,
        );
        const headers: Record<string, string> = { accept: "text/event-stream" };
        if (lastEventId) headers["last-event-id"] = lastEventId;

        const res = await this.fetchImpl(url, {
          signal: ac.signal,
          headers,
          credentials: "omit",
          cache: "no-store",
        });
        if (!res.ok || !res.body) {
          throw await this.parseHttpError(res);
        }
        attempt = 0; // reset backoff on a successful open

        for await (const ev of parseSseStream(res.body, (id) => {
          lastEventId = id;
        })) {
          yield ev;
          if (ev.type === "complete" || ev.type === "error") return;
        }
        // Server closed cleanly without complete/error → reconnect.
      } catch (err) {
        if (isAbort(err)) return;
        if (!isTransient(err)) throw err;
      } finally {
        ac.abort();
      }
      // exponential backoff with jitter, capped
      const wait = Math.min(
        this.maxReconnectMs,
        this.initialBackoffMs * 2 ** attempt,
      );
      attempt++;
      await sleep(wait + Math.random() * 250);
    }
  }

  // --- private helpers below ---
  private async json<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
    opts: { timeoutMs?: number } = {},
  ): Promise<T> {
    const ac = new AbortController();
    const t = opts.timeoutMs
      ? setTimeout(() => ac.abort(), opts.timeoutMs)
      : undefined;
    try {
      const res = await this.fetchImpl(new URL(path, this.baseUrl), {
        method,
        signal: ac.signal,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        credentials: "omit",
      });
      if (!res.ok) throw await this.parseHttpError(res);
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } finally {
      if (t) clearTimeout(t);
    }
  }

  private async parseHttpError(res: Response): Promise<RunnerError> {
    let payload: unknown;
    try { payload = await res.json(); } catch { /* ignore */ }
    return mapHttpToRunnerError(res.status, payload);
  }
}
```

### A.3 SSE parsing + replay handling

```ts
/** Streaming SSE parser. Yields parsed ProgressEvent objects.
 *  Tracks `id:` lines via the onId callback so the outer loop can resume
 *  with last-event-id on reconnect. Skips heartbeat comments (`:`). */
async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  onId: (id: string) => void,
): AsyncIterable<ProgressEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      const ev = parseSseFrame(raw);
      if (!ev) continue;          // heartbeat or invalid → skip
      if (ev.id) onId(ev.id);
      if (ev.data) {
        try {
          yield JSON.parse(ev.data) as ProgressEvent;
        } catch { /* drop malformed event */ }
      }
    }
  }
}

function parseSseFrame(raw: string): { id?: string; data?: string } | null {
  if (raw.startsWith(":")) return null;  // comment / heartbeat
  let id: string | undefined;
  let data = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("id:")) id = line.slice(3).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trimStart() + "\n";
  }
  return data || id ? { id, data: data.trim() || undefined } : null;
}
```

**Replay semantics**: Runner SSE route is required to honor the `Last-Event-ID` header (per α.9 fan-out + replay buffer in REVIEW C3). The client only needs to (a) record `id:` on each event, (b) re-send via header on reconnect. De-duplication is the server's responsibility; the client does *not* keep a seen-set.

### A.4 Cancellation contract

- `streamEvents` is an `AsyncIterable`. When the consumer calls `iterator.return()` (e.g. React effect cleanup), the inner `AbortController` aborts the fetch; the loop exits via `isAbort(err)` and the generator terminates. No leaked sockets.
- `MeasureHandle.cancel()` issues `DELETE /api/jobs/:id`. The runner then emits a final `error` event with `code: 'runner/cancelled'`, the SSE stream closes, and the iterator completes.

### A.5 `mapHttpToRunnerError`

Single switch translating `(status, payload.code)` → `RunnerError` codes consumed by §J: `runner/ssrf-refused` (403), `runner/rate-limited` (429), `runner/validation` (400), `runner/internal` (500), `runner/not-found` (404), `runner/offline` (network/ECONNREFUSED). Keep this in `lib/errors.ts` so extension-bridge can reuse the same `RunnerError` type.

---

## B. `apps/website/lib/extension-bridge.ts`

### B.1 Skeleton

```ts
// apps/website/lib/extension-bridge.ts
import type {
  MeasureRequest,
  ProgressEvent,
  Job,
  ExtensionMessage,
  ExtensionResponse,
} from "@ohmyperf/shared-types";
import type { MeasureBackend, MeasureHandle } from "./runner-client";

declare global {
  interface Window { chrome?: {
    runtime?: {
      sendMessage: (
        extensionId: string, msg: unknown,
        cb: (resp: unknown) => void,
      ) => void;
      connect: (
        extensionId: string, info: { name: string },
      ) => chrome.runtime.Port;
      lastError?: { message: string };
    };
  }}
}

export interface ExtensionBridgeOptions {
  readonly extensionId: string;
  readonly pingTimeoutMs?: number;       // default 800
}

export class ExtensionBridge implements MeasureBackend {
  readonly kind = "extension" as const;
  constructor(private readonly opts: ExtensionBridgeOptions) {}

  ping(): Promise<{ ok: true; version: string }> {
    return this.send<{ ok: true; version: string }>(
      { type: "ohmyperf/ping" },
      this.opts.pingTimeoutMs ?? 800,
    );
  }

  async measure(req: MeasureRequest): Promise<MeasureHandle> {
    // D4: single-run clamp. Runner allows 1..10; extension only 1.
    if ((req.runs ?? 1) > 1) {
      throw extError("extension/single-run-only",
        "Extension supports single-run only. Install local runner for multi-run.");
    }
    const clamped: MeasureRequest = { ...req, runs: 1 };

    const ack = await this.send<{ jobId: string }>({
      type: "ohmyperf/measure", request: clamped,
    });
    return {
      jobId: ack.jobId,
      events: () => this.streamPort(ack.jobId),
      cancel: () => this.cancelJob(ack.jobId),
    };
  }

  async getJob(id: string): Promise<Job> {
    return this.send<Job>({ type: "ohmyperf/getJob", jobId: id });
  }
  async cancelJob(id: string): Promise<void> {
    await this.send<void>({ type: "ohmyperf/cancel", jobId: id });
  }

  // ------- private -------

  private send<T>(msg: ExtensionMessage, timeoutMs = 10_000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const w = window.chrome?.runtime;
      if (!w?.sendMessage) {
        return reject(extError("extension/offline",
          "Chrome extension not installed or disabled"));
      }
      const t = setTimeout(() => reject(extError(
        "extension/timeout", "Extension did not respond in time")), timeoutMs);
      w.sendMessage(this.opts.extensionId, msg, (resp: unknown) => {
        clearTimeout(t);
        const last = w.lastError?.message;
        if (last) return reject(extError("extension/offline", last));
        const r = resp as ExtensionResponse<T>;
        if (r?.ok === false) return reject(extError(r.code, r.message));
        resolve(r.value as T);
      });
    });
  }

  private async *streamPort(jobId: string): AsyncIterable<ProgressEvent> {
    const port = window.chrome!.runtime!.connect(
      this.opts.extensionId, { name: `ohmyperf/job/${jobId}` });

    const queue: ProgressEvent[] = [];
    const waiters: Array<(v: IteratorResult<ProgressEvent>) => void> = [];
    let done = false;
    let lastError: unknown;

    port.onMessage.addListener((m: ProgressEvent) => {
      queue.push(m);
      waiters.shift()?.({ value: m, done: false });
      if (m.type === "complete" || m.type === "error") {
        done = true;
        for (const w of waiters.splice(0)) w({ value: undefined as any, done: true });
        port.disconnect();
      }
    });
    port.onDisconnect.addListener(() => {
      const err = window.chrome?.runtime?.lastError;
      if (err) lastError = extError("extension/disconnected", err.message);
      done = true;
      for (const w of waiters.splice(0)) w({ value: undefined as any, done: true });
    });

    try {
      while (true) {
        if (queue.length) yield queue.shift()!;
        else if (done) {
          if (lastError) throw lastError;
          return;
        } else {
          yield await new Promise<ProgressEvent>((res, rej) => {
            waiters.push((r) => (r.done ? rej(lastError ?? new Error("closed")) : res(r.value)));
          });
        }
      }
    } finally {
      try { port.disconnect(); } catch { /* noop */ }
    }
  }
}

function extError(code: string, message: string) {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}
```

### B.2 Detection ping vs measure separation

`ping()` uses `sendMessage` with a short 800ms timeout — pure capability probe, no side effects. `measure()` is the only message that opens a tab / attaches debugger / consumes capabilities. This separation is what `backend-detector.ts` (β.10) relies on: it calls `ping()` from both `RunnerClient` and `ExtensionBridge` in parallel; first success wins, ties broken by `kind === "extension"` preferred.

---

## C. `apps/website/lib/storage.ts` — IndexedDB via `idb`

### C.1 Schema (D6) — versioned, future-aware

```ts
// apps/website/lib/storage.ts
import { openDB, IDBPDatabase, DBSchema, IDBPTransaction } from "idb";
import type { Report } from "@ohmyperf/core";

export interface ReportRecord {
  readonly id: string;            // crypto.randomUUID()
  readonly url: string;
  readonly createdAt: number;     // Date.now()
  readonly mode: "real" | "ci-stable";
  readonly sizeBytes: number;     // JSON byte length of report payload
  readonly report: Report;
}

export interface ReportSummary {
  readonly id: string;
  readonly url: string;
  readonly createdAt: number;
  readonly mode: "real" | "ci-stable";
  readonly sizeBytes: number;
}

export interface JobRecord {
  readonly id: string;
  readonly url: string;
  readonly status: "queued" | "running" | "done" | "error";
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly reportId?: string;
  readonly error?: string;
}

interface OhMyPerfDB extends DBSchema {
  reports: {
    key: string;
    value: ReportRecord;
    indexes: { "by-createdAt": number; "by-url": string };
  };
  jobs: { key: string; value: JobRecord };
}

const DB_NAME = "ohmyperf";
const DB_VERSION = 1;
const QUOTA_BYTES = 200 * 1024 * 1024;   // 200 MB total
const EVICT_FRACTION = 0.25;             // R8

let dbPromise: Promise<IDBPDatabase<OhMyPerfDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<OhMyPerfDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OhMyPerfDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const reports = db.createObjectStore("reports", { keyPath: "id" });
          reports.createIndex("by-createdAt", "createdAt");
          reports.createIndex("by-url", "url");
          db.createObjectStore("jobs", { keyPath: "id" });
        }
        // v2 migration stub (diff/comparison)
        // if (oldVersion < 2) {
        //   const reports = tx.objectStore("reports");
        //   reports.createIndex("by-measurementId", "report.meta.measurementId");
        //   db.createObjectStore("comparisons", { keyPath: "id" });
        // }
      },
      blocking() {
        // Another tab opened a newer version; close so it can upgrade.
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}
```

### C.2 Migration strategy (v2 for diff)

- Bump `DB_VERSION = 2`. In `upgrade`, on `oldVersion < 2`: add `by-measurementId` index on the `reports` store and create a new `comparisons` store. Existing records are unaffected (object-store rows don't need re-write for new indexes — `idb` populates indexes incrementally as records are read/written, but if we *require* the new index immediately on existing rows, we must iterate via `tx.objectStore('reports').openCursor()` inside `upgrade` and re-put each record).
- Never delete columns; mark as optional in the type. The schema is rolled forward, not sideways.
- `blocking()` callback (above) — when *another* tab opens v2, this tab's v1 connection blocks the upgrade. We resolve by closing on `blocking` and resetting `dbPromise`; the next call to `getDb` opens fresh against v2.

### C.3 Atomic operations (C4) and quota handling (R8)

```ts
export async function saveReport(report: Report): Promise<ReportRecord> {
  const json = JSON.stringify(report);
  const rec: ReportRecord = {
    id: crypto.randomUUID(),
    url: report.meta.url,
    createdAt: Date.now(),
    mode: report.meta.mode,
    sizeBytes: byteLengthUtf8(json),
    report,
  };

  return await withQuotaRetry(async () => {
    const db = await getDb();
    // C4: single transaction — put then evict in one atomic op.
    const tx = db.transaction("reports", "readwrite");
    const store = tx.objectStore("reports");
    await store.put(rec);
    // Run eviction AFTER put (REVIEW C4) and INSIDE the same tx so the
    // total budget reflects the just-added record.
    await evictOldestWithinTx(tx, QUOTA_BYTES);
    await tx.done;
    return rec;
  });
}

async function withQuotaRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    // R8: evict 25% oldest in a separate tx, retry once.
    await evictFractionByAge(EVICT_FRACTION);
    try {
      return await fn();
    } catch (err2) {
      if (isQuotaError(err2)) {
        throw new StorageFullError(
          "Browser storage full. Clear some reports from the history page.",
        );
      }
      throw err2;
    }
  }
}

function isQuotaError(err: unknown): boolean {
  const n = err && (err as DOMException).name;
  return n === "QuotaExceededError" || n === "NS_ERROR_DOM_QUOTA_REACHED";
}

export class StorageFullError extends Error {
  readonly code = "storage/quota-full" as const;
  constructor(msg: string) { super(msg); this.name = "StorageFullError"; }
}

async function evictOldestWithinTx(
  tx: IDBPTransaction<OhMyPerfDB, ["reports"], "readwrite">,
  budgetBytes: number,
): Promise<void> {
  const store = tx.objectStore("reports");
  const idx = store.index("by-createdAt");
  let total = 0;
  // First pass: tally.
  for await (const cur of idx.iterate(null, "next")) {
    total += cur.value.sizeBytes;
  }
  if (total <= budgetBytes) return;
  // Second pass: delete oldest until under.
  for await (const cur of idx.iterate(null, "next")) {
    if (total <= budgetBytes) break;
    total -= cur.value.sizeBytes;
    await cur.delete();
  }
}

async function evictFractionByAge(fraction: number): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("reports", "readwrite");
  const idx = tx.objectStore("reports").index("by-createdAt");
  const all = await idx.getAllKeys();
  const cutoff = Math.ceil(all.length * fraction);
  for (let i = 0; i < cutoff; i++) {
    await tx.objectStore("reports").delete(all[i]);
  }
  await tx.done;
}

function byteLengthUtf8(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}
```

### C.4 Read API (used by §K, §L, §M)

```ts
export async function getReport(id: string): Promise<ReportRecord | undefined> {
  return (await getDb()).get("reports", id);
}

/** Summaries only (no `report` payload) — used by /report index for cheap list. */
export async function listReportSummaries(
  limit = 100,
): Promise<ReportSummary[]> {
  const db = await getDb();
  const tx = db.transaction("reports", "readonly");
  const idx = tx.objectStore("reports").index("by-createdAt");
  const out: ReportSummary[] = [];
  // Newest first
  for await (const cur of idx.iterate(null, "prev")) {
    const { report: _r, ...summary } = cur.value;
    out.push(summary);
    if (out.length >= limit) break;
  }
  return out;
}

export async function deleteReport(id: string): Promise<void> {
  await (await getDb()).delete("reports", id);
}

export async function clearAllReports(): Promise<void> {
  await (await getDb()).clear("reports");
}

/* Job records reused by store.ts persistence. */
export async function upsertJob(job: JobRecord): Promise<void> {
  await (await getDb()).put("jobs", job);
}
export async function getJob(id: string): Promise<JobRecord | undefined> {
  return (await getDb()).get("jobs", id);
}
```

> Note on the listing: stripping `report` from the cursor value still materializes the full record in memory per iteration (idb cursors deserialize whole objects). For 200MB worth of reports this is wasteful. **Acceptable for v1** (100-row limit caps the cost). When list becomes slow, move to keeping a separate `reportSummaries` store updated transactionally with `reports` — flag in design.md as a future optimization.

---

## D. `apps/website/lib/store.ts` — zustand

```ts
// apps/website/lib/store.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Backend } from "./backend-detector";
import type { ReportSummary } from "./storage";
import type { ProgressEvent } from "@ohmyperf/shared-types";

export interface JobState {
  readonly id: string;
  readonly url: string;
  readonly status: "queued" | "running" | "done" | "error";
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly reportId?: string;
  readonly error?: { code: string; message: string };
  readonly events: ProgressEvent[];        // bounded ring (last 200)
  readonly currentRunIndex?: number;
  readonly totalRuns?: number;
}

interface UiPrefs {
  readonly defaultRuns: number;
  readonly defaultMode: "real" | "ci-stable";
  readonly theme: "system" | "light" | "dark";
}

export interface Store {
  /* Persisted */
  backend: Backend | null;
  uiPrefs: UiPrefs;

  /* In-memory only */
  currentJobId?: string;
  jobs: Record<string, JobState>;
  recentReports: ReportSummary[];

  /* actions */
  setBackend: (b: Backend | null) => void;
  setUiPrefs: (p: Partial<UiPrefs>) => void;

  startJob: (init: Pick<JobState, "id" | "url" | "totalRuns">) => void;
  updateJob: (id: string, ev: ProgressEvent) => void;
  completeJob: (id: string, reportId: string) => void;
  errorJob: (id: string, error: { code: string; message: string }) => void;

  hydrateRecentReports: (rs: ReportSummary[]) => void;
}

const EVENT_RING = 200;

export const useStore = create<Store>()(
  persist(
    (set) => ({
      backend: null,
      uiPrefs: { defaultRuns: 5, defaultMode: "real", theme: "system" },
      jobs: {},
      recentReports: [],

      setBackend: (b) => set({ backend: b }),
      setUiPrefs: (p) => set((s) => ({ uiPrefs: { ...s.uiPrefs, ...p } })),

      startJob: ({ id, url, totalRuns }) =>
        set((s) => ({
          currentJobId: id,
          jobs: {
            ...s.jobs,
            [id]: {
              id, url, status: "running", startedAt: Date.now(),
              events: [], totalRuns,
            },
          },
        })),

      updateJob: (id, ev) =>
        set((s) => {
          const j = s.jobs[id]; if (!j) return s;
          const events = j.events.length >= EVENT_RING
            ? [...j.events.slice(1), ev]
            : [...j.events, ev];
          const next: JobState = { ...j, events };
          if (ev.type === "run-start") {
            (next as any).currentRunIndex = ev.runIndex;
            (next as any).totalRuns = ev.totalRuns;
          }
          return { jobs: { ...s.jobs, [id]: next } };
        }),

      completeJob: (id, reportId) =>
        set((s) => {
          const j = s.jobs[id]; if (!j) return s;
          return {
            jobs: {
              ...s.jobs,
              [id]: { ...j, status: "done", finishedAt: Date.now(), reportId },
            },
          };
        }),

      errorJob: (id, error) =>
        set((s) => {
          const j = s.jobs[id]; if (!j) return s;
          return {
            jobs: {
              ...s.jobs,
              [id]: { ...j, status: "error", finishedAt: Date.now(), error },
            },
          };
        }),

      hydrateRecentReports: (rs) => set({ recentReports: rs }),
    }),
    {
      name: "ohmyperf.spa.v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ backend: s.backend, uiPrefs: s.uiPrefs }),
    },
  ),
);
```

**Persistence split**:
- **localStorage** (via `persist` + `partialize`): `backend` last-detected kind/version (used for faster initial render before re-ping completes), `uiPrefs`.
- **In-memory only**: `jobs`, `currentJobId`, `recentReports`. Jobs aren't persisted in zustand — they're persisted in IndexedDB `jobs` store via `upsertJob` (see §C.4), and `recentReports` is hydrated from IndexedDB on mount.

A second tiny module `lib/store-bindings.ts` wires `storage.upsertJob` to `startJob`/`completeJob`/`errorJob` via `useStore.subscribe` so the persistence side-effect is centralized.

---

## E. Viewer React port — `packages/viewer/src/react/`

### E.1 Architecture decision: **extract format helpers, then write React components**, do *not* full-rewrite the string renderer

Reasons:
- `render.ts` is 348 lines; ~80 of those are formatting logic (`formatBytes`, `shortenUrl`, `isUnstable`, `HEADLINE_METRICS`, `collectMetricNames`, CoV threshold). Extracting these is mechanical and lossless.
- The HTML string renderer is consumed by `@ohmyperf/reporter-html` (`packages/reporter-html/src/index.ts` line 4: `import { renderReportHtml } from "@ohmyperf/viewer"`). Touching its public output breaks the CLI's golden HTML.
- The parity test (`render.test.ts`) asserts the *string* output. We must keep `renderReportHtml` byte-stable. Extracting formatters does not change its output.

### E.2 File layout

```
packages/viewer/src/
├── escape.ts                    (unchanged)
├── styles.ts                    (unchanged — VIEWER_CSS)
├── format.ts                    NEW — pure formatters (no deps)
├── render.ts                    refactored to import from format.ts
├── render.test.ts               unchanged (parity test still passes)
└── react/
    ├── index.ts                 NEW — re-exports
    ├── ReportViewer.tsx         NEW — top-level composition
    ├── ReportHeader.tsx
    ├── UnstableBanner.tsx
    ├── CwvSummary.tsx           tiles (text-only; gauge lives in SPA)
    ├── AuditsList.tsx
    ├── ResourcesTable.tsx
    ├── FrameTree.tsx
    ├── RunsTable.tsx
    ├── PluginData.tsx
    └── RawJson.tsx
```

### E.3 `format.ts` extraction

Move these from `render.ts` verbatim (no behavior change), export them:

```ts
// packages/viewer/src/format.ts
import type { Report } from "@ohmyperf/core";

export const UNSTABLE_COV_THRESHOLD = 0.2;

export const HEADLINE_METRICS = [
  { name: "lcp",  unit: "ms",    digits: 1 },
  { name: "fcp",  unit: "ms",    digits: 1 },
  { name: "ttfb", unit: "ms",    digits: 1 },
  { name: "inp",  unit: "ms",    digits: 1 },
  { name: "cls",  unit: "score", digits: 3 },
  { name: "tbt",  unit: "ms",    digits: 1 },
] as const;

export function formatBytes(bytes: number): string { /* moved from render.ts L213-218 */ }
export function shortenUrl(url: string): string  { /* moved from render.ts L341-348 */ }
export function isUnstable(report: Report): boolean { /* L91-98 */ }
export function collectMetricNames(report: Report): string[] { /* L290-296 */ }

/** Google CWV thresholds (Good / Needs-Improvement boundaries) */
export const CWV_THRESHOLDS = {
  lcp:  { good: 2500, ni: 4000 },     // ms
  inp:  { good: 200,  ni: 500  },     // ms
  cls:  { good: 0.1,  ni: 0.25 },     // unitless
  fcp:  { good: 1800, ni: 3000 },     // ms
  ttfb: { good: 800,  ni: 1800 },     // ms
} as const;

export type CwvRating = "good" | "ni" | "poor";
export function rateCwv(name: keyof typeof CWV_THRESHOLDS, value: number): CwvRating {
  const t = CWV_THRESHOLDS[name];
  return value <= t.good ? "good" : value <= t.ni ? "ni" : "poor";
}
```

`render.ts` imports these and replaces inline definitions. The string output is unchanged (the test passes unmodified).

### E.4 `ReportViewer.tsx` skeleton

```tsx
// packages/viewer/src/react/ReportViewer.tsx
import * as React from "react";
import type { Report } from "@ohmyperf/core";
import { ReportHeader } from "./ReportHeader";
import { UnstableBanner } from "./UnstableBanner";
import { CwvSummary } from "./CwvSummary";
import { AuditsList } from "./AuditsList";
import { ResourcesTable } from "./ResourcesTable";
import { FrameTree } from "./FrameTree";
import { RunsTable } from "./RunsTable";
import { PluginData } from "./PluginData";
import { RawJson } from "./RawJson";

export interface ReportViewerProps {
  readonly report: Report;
  /** Slot for the SPA's gauge component — keeps `@ohmyperf/viewer`
   *  free of uPlot dependency. */
  readonly renderGauge?: (props: {
    metric: "lcp" | "inp" | "cls" | "fcp" | "ttfb";
    value: number;
  }) => React.ReactNode;
  /** Slot for the SPA's waterfall — keeps Recharts out of the viewer pkg. */
  readonly renderWaterfall?: (props: { report: Report }) => React.ReactNode;
  readonly className?: string;
}

export function ReportViewer({
  report, renderGauge, renderWaterfall, className,
}: ReportViewerProps): React.ReactElement {
  return (
    <div className={className ?? "ohmyperf-viewer"}>
      <ReportHeader meta={report.meta} schemaVersion={report.schemaVersion} />
      <UnstableBanner report={report} />
      <CwvSummary report={report} renderGauge={renderGauge} />
      <AuditsList audits={report.audits} />
      <ResourcesTable report={report} />
      {renderWaterfall?.({ report })}
      <FrameTree tree={report.frames} />
      <RunsTable report={report} />
      <PluginData data={report.pluginData} />
      <RawJson report={report} />
    </div>
  );
}
```

Each sub-component is a direct React translation of its `render.ts` counterpart, swapping `escapeHtml(x)` for `{x}` (React escapes by default), and substituting CSS classnames that match the SPA's Tailwind token system (kept compatible with the existing `VIEWER_CSS` class names so the existing styles still apply when the React component is rendered standalone for documentation/tests).

### E.5 Package.json updates

```jsonc
// packages/viewer/package.json
{
  "name": "@ohmyperf/viewer",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".":        { "types": "./dist/index.d.ts",         "import": "./dist/index.js" },
    "./format": { "types": "./dist/format.d.ts",        "import": "./dist/format.js" },
    "./react":  { "types": "./dist/react/index.d.ts",   "import": "./dist/react/index.js" }
  },
  "peerDependencies": {
    "@ohmyperf/core": "workspace:*",
    "react": ">=18 <20"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true }
  }
}
```

- Root export keeps the existing string-renderer surface (CLI keeps working unmodified).
- `./format` exports the helpers — the SPA imports from `@ohmyperf/viewer/format` for `rateCwv`, `CWV_THRESHOLDS`, `formatBytes`.
- `./react` is the new component surface — the SPA imports `<ReportViewer />` from `@ohmyperf/viewer/react`. React is an *optional* peer to avoid forcing CLI consumers to install React.

### E.6 Parity strategy

Add **one new test file**: `packages/viewer/src/react/render-parity.test.tsx`. It:

1. Renders `<ReportViewer report={makeReport()} />` to a string via `react-dom/server.renderToStaticMarkup`.
2. Strips wrapping `<div class="ohmyperf-viewer">` and any whitespace differences.
3. Asserts the React output contains the same **semantic anchors** as the HTML output: `>LCP<`, `OOPIF`, `cross-origin`, `a11y.axe-violations`, `FAIL`, `Unstable run` (only on unstable fixture), `id="ohmyperf-report-payload"` (when slot for raw JSON is enabled).

We *do not* attempt byte-for-byte parity with `renderReportHtml` because the React tree omits `<!doctype>`/inline `<style>`/the embedded script payload (those belong to the standalone HTML report only). The shared `format.ts` is what enforces numeric/textual equivalence; the existing `render.test.ts` continues to lock the HTML output.

---

## F. CWV gauge — `apps/website/components/metrics/cwv-gauge.tsx`

uPlot is a canvas library; the gauge here is **bar-style threshold indicators** (not a chart), so we use uPlot as a thin horizontal-bar renderer. If a true dial is desired, drop uPlot and use plain SVG — see "Watch out for" below.

### F.1 Skeleton

```tsx
// apps/website/components/metrics/cwv-gauge.tsx
"use client";
import * as React from "react";
import uPlot, { type Options } from "uplot";
import "uplot/dist/uPlot.min.css";
import { CWV_THRESHOLDS, rateCwv, type CwvRating } from "@ohmyperf/viewer/format";

type CwvMetric = "lcp" | "inp" | "cls" | "fcp" | "ttfb";

export interface CwvGaugeProps {
  readonly metric: CwvMetric;
  readonly value: number;
  /** Optional p75/p95 markers, drawn as ticks. */
  readonly p75?: number;
  readonly p95?: number;
  readonly className?: string;
}

const COLORS: Record<CwvRating, string> = {
  good: "#15803d",
  ni:   "#b45309",
  poor: "#b91c1c",
};

export function CwvGauge({ metric, value, p75, p95, className }: CwvGaugeProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const plotRef = React.useRef<uPlot | null>(null);

  React.useEffect(() => {
    if (!hostRef.current) return;
    const t = CWV_THRESHOLDS[metric];
    const max = Math.max(t.ni * 1.4, value * 1.2, p95 ?? 0);

    const opts: Options = {
      width: hostRef.current.clientWidth,
      height: 64,
      class: "cwv-gauge",
      cursor: { show: false },
      legend: { show: false },
      scales: { x: { time: false, range: [0, max] }, y: { range: [0, 1] } },
      axes: [
        { stroke: "#94a3b8", grid: { show: false }, ticks: { show: false } },
        { show: false },
      ],
      series: [
        {},
        { stroke: COLORS[rateCwv(metric, value)], width: 12, points: { show: false } },
      ],
      hooks: {
        draw: [
          (u) => {
            // Draw Good/NI/Poor threshold bands behind the bar.
            const ctx = u.ctx;
            const y = u.bbox.top + u.bbox.height / 2;
            for (const [lo, hi, col] of [
              [0,       t.good, COLORS.good],
              [t.good,  t.ni,   COLORS.ni],
              [t.ni,    max,    COLORS.poor],
            ] as const) {
              const x1 = u.valToPos(lo, "x", true);
              const x2 = u.valToPos(hi, "x", true);
              ctx.fillStyle = col + "22"; // 13% alpha
              ctx.fillRect(x1, y - 6, x2 - x1, 12);
            }
          },
        ],
      },
    };

    plotRef.current = new uPlot(opts, [[0, value], [0.5, 0.5]], hostRef.current);

    const ro = new ResizeObserver(([entry]) => {
      plotRef.current?.setSize({ width: entry.contentRect.width, height: 64 });
    });
    ro.observe(hostRef.current);

    return () => { ro.disconnect(); plotRef.current?.destroy(); plotRef.current = null; };
  }, [metric, value, p75, p95]);

  return (
    <div className={className} aria-label={`${metric.toUpperCase()} gauge: ${value}`}>
      <div ref={hostRef} role="img" />
    </div>
  );
}
```

### F.2 Color thresholds (canonical)

Already encoded in `CWV_THRESHOLDS` (§E.3). Mirrors web.dev: LCP good ≤2500ms, NI ≤4000ms; INP good ≤200ms, NI ≤500ms; CLS good ≤0.1, NI ≤0.25; FCP good ≤1800ms, NI ≤3000ms; TTFB good ≤800ms, NI ≤1800ms. **All three of LCP/INP/CLS must be Good** for the page to pass overall (industry consensus; surface this in `CwvSummary` as an aggregate badge).

### F.3 Bundle impact

uPlot is ~40KB gz (acceptable per design.md D11 for `/measure` 200KB and `/report` 250KB budgets). For the landing `/` 150KB budget, **uPlot does NOT enter the bundle** — landing never shows gauges; it only contains the URL form + backend detector + (optionally) marketing copy. Confirm via `@next/bundle-analyzer` in β.14.

### F.4 Watch out for

- uPlot's CSS import (`"uplot/dist/uPlot.min.css"`) is the only style import in the SPA besides Tailwind — verify CSP `style-src 'self' 'unsafe-inline'` covers it (it should, since Next inlines via Webpack).
- If you decide gauges should be radial/dial-style instead of horizontal bars, **drop uPlot entirely** and render with raw SVG (~0 bundle cost). The chosen design here uses uPlot mostly to share rendering infra with the waterfall — but Recharts already covers the chart need, so SVG-only is a valid pivot if landing's 150KB budget proves tight.

---

## G. Waterfall — `apps/website/components/metrics/waterfall.tsx`

### G.1 Dynamic boundary

```tsx
// apps/website/components/metrics/waterfall.tsx (entry, no chart deps)
"use client";
import dynamic from "next/dynamic";
import type { Report } from "@ohmyperf/core";

const WaterfallChart = dynamic(() => import("./waterfall.impl"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-md bg-muted" />,
});

export function Waterfall({ report }: { report: Report }) {
  return <WaterfallChart report={report} />;
}
```

### G.2 Implementation — `waterfall.impl.tsx`

```tsx
// apps/website/components/metrics/waterfall.impl.tsx
"use client";
import * as React from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from "recharts";
import type { Report, RunReport, Resource } from "@ohmyperf/core";
import { formatBytes } from "@ohmyperf/viewer/format";

interface Row {
  readonly url: string;
  readonly start: number;
  readonly end: number;
  readonly duration: number;
  readonly color: string;
  readonly resource: Resource;
}

const COLOR = {
  renderBlocking: "#b91c1c",
  cached:         "#15803d",
  normal:         "#4338ca",
  thirdParty:     "#a16207",
};

function transform(report: Report): Row[] {
  // Prefer warm run for waterfall (matches render.ts resource picking logic).
  const run: RunReport | undefined =
    report.runs.find((r) => !r.cold) ?? report.runs.find((r) => r.cold) ?? report.runs[0];
  if (!run) return [];

  const origin = safeOrigin(report.meta.url);
  return run.resources
    .slice()
    .sort((a, b) => a.requestMs - b.requestMs)
    .slice(0, 60)                          // cap rows for chart legibility
    .map<Row>((r) => {
      const start = r.requestMs;
      const end = r.requestMs + r.responseMs;
      const isThirdParty = origin && safeOrigin(r.url) && safeOrigin(r.url) !== origin;
      const color = r.renderBlocking ? COLOR.renderBlocking
        : r.cacheHit                  ? COLOR.cached
        : isThirdParty                ? COLOR.thirdParty
        :                               COLOR.normal;
      return { url: r.url, start, end, duration: end - start, color, resource: r };
    });
}

export default function WaterfallChart({ report }: { report: Report }) {
  const rows = React.useMemo(() => transform(report), [report]);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.end));

  return (
    <div style={{ width: "100%", height: Math.max(220, rows.length * 14 + 40) }}>
      <ResponsiveContainer>
        <BarChart layout="vertical" data={rows} margin={{ left: 8, right: 24, top: 8, bottom: 24 }}>
          <XAxis type="number" domain={[0, max]} tickFormatter={(v) => `${v|0}ms`} />
          <YAxis type="category" dataKey="url" width={280} tick={{ fontSize: 10 }} interval={0}
                 tickFormatter={(s: string) => shortenForAxis(s)} />
          <ReferenceLine x={max} stroke="#94a3b8" strokeDasharray="3 3" />
          {/* "start" is invisible offset; "duration" is the visible segment */}
          <Bar dataKey="start"    stackId="t" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="duration" stackId="t" isAnimationActive={false}>
            {rows.map((r, i) => <Cell key={i} fill={r.color} />)}
          </Bar>
          <Tooltip content={<ResourceTooltip />} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ResourceTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Row;
  if (!row) return null;
  const r = row.resource;
  return (
    <div className="rounded-md border bg-popover p-2 text-xs shadow">
      <div className="break-all font-mono">{r.url}</div>
      <div>{r.mimeType} · {formatBytes(r.encodedSizeBytes)}</div>
      <div>req {r.requestMs.toFixed(1)}ms · resp {r.responseMs.toFixed(1)}ms</div>
      {r.renderBlocking && <div className="text-red-600">render-blocking</div>}
      {r.cacheHit && <div className="text-green-700">cache hit</div>}
    </div>
  );
}

function shortenForAxis(u: string): string {
  try { const x = new URL(u); return x.pathname.slice(-32) || x.host; } catch { return u.slice(-32); }
}
function safeOrigin(u: string): string | null { try { return new URL(u).origin; } catch { return null; } }
```

The "stack offset" trick (`start` transparent + `duration` visible) is the canonical Recharts pattern for Gantt-style bars (Recharts has no native Gantt).

---

## H. Frame tree — `apps/website/components/metrics/frame-tree.tsx`

Per types.ts L69-88, `FrameNode` has `children: readonly string[]` (IDs into `FrameTree.nodes`). Recursion is therefore by ID lookup, not by embedded objects.

```tsx
// apps/website/components/metrics/frame-tree.tsx
"use client";
import * as React from "react";
import type { FrameTree as FrameTreeT, FrameNode, Metric } from "@ohmyperf/core";
import { ChevronRight } from "lucide-react";

export function FrameTree({ tree }: { tree: FrameTreeT }) {
  if (!tree?.root || !tree.nodes[tree.root]) return null;
  return (
    <section aria-label="Frame tree" className="rounded-md border p-3">
      <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Frame tree</h2>
      <FrameRow nodes={tree.nodes} frameId={tree.root} depth={0} defaultOpen />
    </section>
  );
}

function FrameRow({
  nodes, frameId, depth, defaultOpen,
}: { nodes: FrameTreeT["nodes"]; frameId: string; depth: number; defaultOpen?: boolean }) {
  const node = nodes[frameId];
  const [open, setOpen] = React.useState(defaultOpen ?? depth < 2);
  if (!node) return null;
  const hasChildren = node.children.length > 0;

  return (
    <div style={{ marginLeft: depth * 16 }} className="my-1">
      <div className="flex items-center gap-1">
        {hasChildren ? (
          <button type="button" aria-expanded={open}
                  onClick={() => setOpen((o) => !o)}
                  className="rounded p-0.5 hover:bg-accent">
            <ChevronRight size={14}
                          className={open ? "rotate-90 transition-transform" : "transition-transform"} />
          </button>
        ) : <span className="inline-block w-[18px]" />}
        <span className="font-mono text-xs">{node.frameId}</span>
        <FrameBadges node={node} />
      </div>
      <div className="ml-5 font-mono text-[11px] text-muted-foreground break-all">
        {node.url || "(empty)"}
      </div>
      <FrameMetricBadges metrics={node.metrics} />
      {open && hasChildren && (
        <ul className="list-none">
          {node.children.map((id) => (
            <li key={id}>
              <FrameRow nodes={nodes} frameId={id} depth={depth + 1} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FrameBadges({ node }: { node: FrameNode }) {
  const tags: string[] = [];
  if (node.isOOPIF)        tags.push("OOPIF");
  if (node.isCrossOrigin)  tags.push("cross-origin");
  if (node.isSrcdoc)       tags.push("srcdoc");
  if (node.isFenced)       tags.push("fenced");
  if (node.detachedAt !== undefined) tags.push("detached");
  const opaque = node.inFrameMetrics?.available === false ? node.inFrameMetrics.reason : null;
  return (
    <span className="ml-2 flex flex-wrap gap-1">
      {tags.map((t) => <Badge key={t} tone="warn">{t}</Badge>)}
      {opaque && <Badge tone="warn">opaque: {opaque}</Badge>}
    </span>
  );
}

function FrameMetricBadges({ metrics }: { metrics: Readonly<Record<string, Metric>> }) {
  const entries = Object.values(metrics);
  if (entries.length === 0) return null;
  return (
    <div className="ml-5 mt-0.5 flex flex-wrap gap-1">
      {entries.map((m) => (
        <Badge key={m.name} tone="info">
          {m.name.toUpperCase()} {m.value.toFixed(m.unit === "score" ? 3 : 1)}
        </Badge>
      ))}
    </div>
  );
}
```

`Badge` is the shadcn primitive from β.5.

---

## I. Progress stream — `apps/website/components/measure/progress-stream.tsx`

```tsx
"use client";
import * as React from "react";
import type { MeasureBackend } from "@/lib/runner-client";
import type { ProgressEvent } from "@ohmyperf/shared-types";
import type { Report, Metric } from "@ohmyperf/core";
import { useStore } from "@/lib/store";
import { saveReport } from "@/lib/storage";
import { Progress } from "@/components/ui/progress";
import { ErrorState } from "./error-state";
import { useRouter } from "next/navigation";

interface Props {
  readonly backend: MeasureBackend;
  readonly jobId: string;
}

export function ProgressStream({ backend, jobId }: Props) {
  const router = useRouter();
  const job = useStore((s) => s.jobs[jobId]);
  const updateJob = useStore((s) => s.updateJob);
  const completeJob = useStore((s) => s.completeJob);
  const errorJob = useStore((s) => s.errorJob);

  React.useEffect(() => {
    let cancelled = false;
    const iter = backend.kind === "runner"
      ? (backend as any).streamEvents(jobId) as AsyncIterable<ProgressEvent>
      : backend.measure ? (undefined as never) /* re-use the iterator returned earlier */ : undefined;
    // NOTE: in practice the caller passes the iterator down, see §K wiring.
    // Shown inline for clarity:
    (async () => {
      try {
        const it = iter ?? (await backend.measure({ url: job.url, runs: job.totalRuns ?? 1 })).events();
        const events = it[Symbol.asyncIterator]();
        let report: Report | undefined;
        while (!cancelled) {
          const { value, done } = await events.next();
          if (done) break;
          updateJob(jobId, value);
          if (value.type === "complete") { report = value.report; break; }
          if (value.type === "error")    { errorJob(jobId, { code: value.code, message: value.message }); return; }
        }
        if (report) {
          const rec = await saveReport(report);
          completeJob(jobId, rec.id);
          router.push(`/report/${rec.id}/`);
        }
      } catch (err) {
        errorJob(jobId, { code: (err as any)?.code ?? "unknown", message: (err as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, [backend, jobId]);

  if (!job) return null;
  if (job.status === "error" && job.error) {
    return <ErrorState backend={backend.kind} error={job.error} onRetry={() => location.reload()} />;
  }

  const phase = currentPhase(job.events);
  const pct = computePct(job);
  const eta = estimateEta(job);

  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <div className="flex justify-between text-xs">
        <span>{phase ?? "Starting…"}</span>
        <span>
          Run {(job.currentRunIndex ?? 0) + 1} / {job.totalRuns ?? "?"}
          {eta !== null && <> · ETA {Math.ceil(eta / 1000)}s</>}
        </span>
      </div>
      <Progress value={pct} />
      <PerRunMetrics events={job.events} />
    </div>
  );
}

function PerRunMetrics({ events }: { events: ProgressEvent[] }) {
  // Surface metrics as soon as they arrive per run, not only on final aggregate.
  const byRun = new Map<number, Metric[]>();
  for (const e of events) {
    if (e.type === "metric") {
      const arr = byRun.get(e.runIndex) ?? [];
      arr.push({ name: e.name, value: e.value, unit: "ms" });
      byRun.set(e.runIndex, arr);
    }
  }
  if (byRun.size === 0) return null;
  return (
    <ul className="text-xs font-mono space-y-0.5">
      {[...byRun.entries()].map(([i, ms]) => (
        <li key={i}>run {i}: {ms.map((m) => `${m.name}=${m.value.toFixed(1)}`).join("  ")}</li>
      ))}
    </ul>
  );
}

function currentPhase(events: ProgressEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "navigation") return `Navigating: ${e.phase}`;
    if (e.type === "run-start")  return `Run ${e.runIndex + 1} starting`;
    if (e.type === "run-complete") return `Run ${e.runIndex + 1} complete`;
    if (e.type === "queued")     return "Queued";
  }
  return null;
}

function computePct(job: ReturnType<typeof useStore.getState>["jobs"][string]): number {
  const total = job.totalRuns ?? 1;
  const cur = (job.currentRunIndex ?? 0);
  const phases = ["started", "committed", "loaded", "idle"];
  const lastNav = [...job.events].reverse().find((e) => e.type === "navigation") as any;
  const intra = lastNav ? (phases.indexOf(lastNav.phase) + 1) / phases.length : 0;
  return Math.min(100, ((cur + intra) / total) * 100);
}

function estimateEta(job: ReturnType<typeof useStore.getState>["jobs"][string]): number | null {
  if (!job.totalRuns || !job.currentRunIndex || job.currentRunIndex === 0) return null;
  const elapsed = Date.now() - job.startedAt;
  const perRun = elapsed / job.currentRunIndex;
  return perRun * (job.totalRuns - job.currentRunIndex);
}
```

> The `streamEvents` consumption above is shown inline. In practice the iterator returned by `backend.measure()` is created once at the *caller* (the page or form component) and passed to `ProgressStream` as a prop so React StrictMode double-invocation doesn't re-trigger the measurement. I'd recommend the simpler shape: pass `iterator: AsyncIterator<ProgressEvent>` as a prop and have `ProgressStream` own only the consumption + render concern.

---

## J. Error state — `apps/website/components/measure/error-state.tsx`

```tsx
"use client";
import * as React from "react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type ErrorCode =
  | "runner/timeout"
  | "runner/csp-blocked"
  | "runner/dns-error"
  | "runner/cors-blocked"
  | "runner/pna-blocked"
  | "runner/offline"
  | "runner/ssrf-refused"
  | "runner/rate-limited"
  | "runner/validation"
  | "runner/internal"
  | "runner/restarted"
  | "runner/cancelled"
  | "extension/offline"
  | "extension/devtools-attached"
  | "extension/target-tab-closed"
  | "extension/self-measurement-refused"
  | "extension/single-run-only"
  | "extension/timeout"
  | "unknown";

interface Remediation {
  readonly title: string;
  readonly body: React.ReactNode;
  readonly retry?: boolean;
  readonly helpHref?: string;
}

const REMEDIATIONS: Record<ErrorCode, Remediation> = {
  "runner/timeout": {
    title: "Measurement timed out",
    body: "The page took too long to reach idle. Try with --mode ci-stable or pick a faster page.",
    retry: true,
  },
  "runner/csp-blocked": {
    title: "Page Content-Security-Policy blocked the probe",
    body: <>The target page CSP prevented script injection. Try the Chrome extension path, which uses <code>chrome.debugger</code> (CSP-immune).</>,
    helpHref: "/docs/troubleshooting#csp",
  },
  "runner/dns-error": {
    title: "Couldn't resolve hostname",
    body: "DNS lookup failed. Check the URL and your network.",
    retry: true,
  },
  "runner/cors-blocked": {
    title: "Browser blocked the request to your local runner (CORS)",
    body: <>Your runner's CORS allowlist doesn't include this origin. Add it via <code>OHMYPERF_RUNNER_CORS_ORIGINS</code>.</>,
    helpHref: "/docs/runner#cors",
  },
  "runner/pna-blocked": {
    title: "Browser blocked HTTPS → localhost (Private Network Access)",
    body: <>Chrome 130+ requires PNA preflight. Either: (1) run the SPA at <code>http://localhost:3000</code>, or (2) install the Chrome extension.</>,
    helpHref: "/docs/runner#pna",
  },
  "runner/offline": {
    title: "Local runner not reachable",
    body: <>Start it with <code>docker compose up</code> in the runner repo, or install the Chrome extension instead.</>,
    retry: true,
  },
  "runner/ssrf-refused": {
    title: "Refused to measure private address",
    body: <>The runner refuses private/loopback IPs by default. Set <code>OHMYPERF_RUNNER_ALLOW_PRIVATE=1</code> if you're sure.</>,
  },
  "runner/rate-limited": {
    title: "Too many measurements",
    body: "You hit the rate limit (default 10/hour). Wait or raise OHMYPERF_RUNNER_RATE_LIMIT.",
  },
  "runner/validation": { title: "Invalid request", body: "The URL or options didn't validate.", retry: false },
  "runner/internal":   { title: "Runner internal error", body: "Check runner logs.", retry: true },
  "runner/restarted":  {
    title: "Runner restarted mid-measurement",
    body: "Measurements are not persisted across runner restarts. Start a new measurement.",
    retry: true,
  },
  "runner/cancelled":  { title: "Measurement cancelled", body: "You cancelled this measurement.", retry: true },

  "extension/offline": {
    title: "Chrome extension not detected",
    body: <>Install the extension from <code>chrome://extensions</code> (Developer mode → Load unpacked) or use the local runner.</>,
    helpHref: "/docs/extension",
  },
  "extension/devtools-attached": {
    title: "Close DevTools on the target page",
    body: <>Only one debugger can attach to a tab. Close DevTools and retry.</>,
    retry: true,
  },
  "extension/target-tab-closed": {
    title: "The target tab was closed before measurement finished",
    body: "Re-run; keep the spawned tab open until completion.",
    retry: true,
  },
  "extension/self-measurement-refused": {
    title: "Can't measure ohmyperf.dev from itself",
    body: "Measure a different URL.",
  },
  "extension/single-run-only": {
    title: "Extension supports single-run only",
    body: <>For multi-run statistics, install the local runner: <code>docker compose up</code>.</>,
    helpHref: "/docs/runner",
  },
  "extension/timeout": { title: "Extension did not respond", body: "Reload the extension and retry.", retry: true },
  "unknown":           { title: "Unknown error", body: "Check the console for details.", retry: true },
};

interface Props {
  readonly backend: "runner" | "extension";
  readonly error: { code: string; message: string };
  readonly onRetry?: () => void;
  readonly onCancel?: () => void;
}

export function ErrorState({ backend, error, onRetry, onCancel }: Props) {
  const code = (error.code in REMEDIATIONS ? error.code : "unknown") as ErrorCode;
  const r = REMEDIATIONS[code];
  return (
    <Alert variant="destructive">
      <AlertTitle>{r.title}</AlertTitle>
      <AlertDescription className="space-y-2">
        <div>{r.body}</div>
        <details className="text-xs">
          <summary>Technical details</summary>
          <pre className="overflow-x-auto rounded bg-muted p-2">
{JSON.stringify({ backend, code: error.code, message: error.message }, null, 2)}
          </pre>
        </details>
        <div className="flex gap-2 pt-1">
          {r.retry && onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}
          {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
          {r.helpHref && <Button asChild size="sm" variant="link"><a href={r.helpHref}>Learn more</a></Button>}
        </div>
      </AlertDescription>
    </Alert>
  );
}
```

The full set covers every code mentioned across `design.md`, REVIEW.md C5/C6, and the Phase γ/δ tasks. Unknown codes fall through to `"unknown"` — never surface a raw error string to the user.

---

## K. `apps/website/app/report/[[...id]]/page.tsx`

```tsx
// apps/website/app/report/[[...id]]/page.tsx
"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getReport, type ReportRecord } from "@/lib/storage";
import { ReportViewer } from "@ohmyperf/viewer/react";
import { CwvGauge } from "@/components/metrics/cwv-gauge";
import { Skeleton } from "@/components/ui/skeleton";

// Recharts via dynamic boundary only — never enters this route's initial chunk
// statically.
const Waterfall = dynamic(() => import("@/components/metrics/waterfall.impl"), { ssr: false });

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() { return []; }

export default function ReportPage() {
  const params = useParams<{ id?: string[] }>();
  const id = params?.id?.[0];

  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "ready"; rec: ReportRecord }
    | { kind: "missing" }
  >({ kind: "loading" });

  React.useEffect(() => {
    if (!id) { setState({ kind: "missing" }); return; }
    let cancelled = false;
    (async () => {
      const rec = await getReport(id);
      if (cancelled) return;
      setState(rec ? { kind: "ready", rec } : { kind: "missing" });
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (state.kind === "loading") {
    return (
      <div className="container space-y-4 py-8">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (state.kind === "missing") {
    return (
      <div className="container py-16 text-center space-y-4">
        <h1 className="text-xl font-semibold">Report not found</h1>
        <p className="text-muted-foreground">
          This report isn't in your local browser storage.
        </p>
        <Link href="/" className="underline">Measure something →</Link>
      </div>
    );
  }
  return (
    <div className="container py-8">
      <ReportViewer
        report={state.rec.report}
        renderGauge={({ metric, value }) =>
          <CwvGauge metric={metric as any} value={value} />}
        renderWaterfall={({ report }) => <Waterfall report={report} />}
      />
    </div>
  );
}
```

Per design D10: `dynamic = 'force-static'` + `dynamicParams = false` + empty `generateStaticParams` builds **one** static HTML shell for `/report/`. The browser fills the `[id]` segment client-side. If Next 15 misbehaves (REVIEW notes the fallback) drop `[[...id]]` and use `app/report/page.tsx` reading `?id=` via `useSearchParams()`.

---

## L. `apps/website/app/viewer/page.tsx`

**Decision**: **render ephemerally first, save explicitly.** Reasons:
- Users drop reports from external sources (CLI runs, shared by colleagues). Auto-saving every drop pollutes their history and silently consumes quota.
- One-click "Save to history" is the lightest possible UX cost.

```tsx
"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { saveReport } from "@/lib/storage";
import { ReportViewer } from "@ohmyperf/viewer/react";
import { CwvGauge } from "@/components/metrics/cwv-gauge";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Report } from "@ohmyperf/core";

const Waterfall = dynamic(() => import("@/components/metrics/waterfall.impl"), { ssr: false });

const SUPPORTED_MAJOR = /^1\.\d+\.\d+$/;     // R2

export default function ViewerPage() {
  const router = useRouter();
  const [state, setState] = React.useState<
    | { kind: "idle" }
    | { kind: "parsing" }
    | { kind: "error"; message: string }
    | { kind: "ready"; report: Report; fileName: string; saved: boolean }
  >({ kind: "idle" });

  async function ingest(file: File) {
    setState({ kind: "parsing" });
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const validated = validateReport(parsed);
      if (!validated.ok) return setState({ kind: "error", message: validated.message });
      setState({ kind: "ready", report: validated.report, fileName: file.name, saved: false });
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  return (
    <div className="container py-8 space-y-4">
      {state.kind !== "ready" && (
        <DropZone onFile={ingest} />
      )}
      {state.kind === "parsing" && <p>Parsing…</p>}
      {state.kind === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load that report</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.kind === "ready" && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Viewing <code>{state.fileName}</code> (not saved)
            </span>
            <Button size="sm" disabled={state.saved}
                    onClick={async () => {
                      const rec = await saveReport(state.report);
                      setState((s) => s.kind === "ready" ? { ...s, saved: true } : s);
                      router.push(`/report/${rec.id}/`);
                    }}>
              {state.saved ? "Saved" : "Save to history"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setState({ kind: "idle" })}>
              Drop another
            </Button>
          </div>
          <ReportViewer
            report={state.report}
            renderGauge={(p) => <CwvGauge metric={p.metric as any} value={p.value} />}
            renderWaterfall={(p) => <Waterfall report={p.report} />}
          />
        </>
      )}
    </div>
  );
}

function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const [over, setOver] = React.useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const f = e.dataTransfer.files?.[0]; if (f) onFile(f);
      }}
      className={`flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 ${
        over ? "border-primary bg-primary/5" : "border-muted-foreground/30"
      }`}
    >
      <span className="text-sm">Drop a OhMyPerf <code>report.json</code> here, or click to browse</span>
      <input type="file" accept="application/json,.json" className="hidden"
             onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) onFile(f); }} />
    </label>
  );
}

function validateReport(x: unknown):
  | { ok: true; report: Report }
  | { ok: false; message: string } {
  if (!x || typeof x !== "object")             return { ok: false, message: "Not a JSON object" };
  const o = x as any;
  if (typeof o.schemaVersion !== "string")     return { ok: false, message: "Missing schemaVersion" };
  if (!SUPPORTED_MAJOR.test(o.schemaVersion))  return { ok: false, message: `Unsupported schemaVersion ${o.schemaVersion}. This viewer supports 1.x.` };
  if (!o.meta?.url || !Array.isArray(o.runs))  return { ok: false, message: "Report is missing required fields (meta.url, runs[])" };
  if (!o.frames?.root)                          return { ok: false, message: "Report is missing frames.root" };
  return { ok: true, report: o as Report };
}
```

Choosing `@react-aria/dnd`? Not needed — native HTML5 drag/drop is ~20 LOC and keeps the bundle small. `@react-aria/dnd` adds ~12KB for accessibility tweaks that the `<input type="file">` fallback already covers (label-click → file picker is keyboard-accessible).

---

## M. `apps/website/app/report/page.tsx` (history index)

```tsx
"use client";
import * as React from "react";
import Link from "next/link";
import { listReportSummaries, deleteReport, clearAllReports, type ReportSummary } from "@/lib/storage";
import { formatBytes } from "@ohmyperf/viewer/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";

export const dynamic = "force-static";

export default function ReportIndexPage() {
  const recent = useStore((s) => s.recentReports);
  const hydrate = useStore((s) => s.hydrateRecentReports);

  React.useEffect(() => {
    (async () => hydrate(await listReportSummaries(100)))();
  }, [hydrate]);

  async function onDelete(id: string) {
    await deleteReport(id);
    hydrate(await listReportSummaries(100));
  }
  async function onClearAll() {
    await clearAllReports();
    hydrate([]);
  }

  if (recent.length === 0) {
    return (
      <div className="container py-16 text-center space-y-3">
        <h1 className="text-xl font-semibold">No reports yet</h1>
        <p className="text-muted-foreground">Measurements you take are saved here in your browser.</p>
        <Link href="/" className="underline">Measure something →</Link>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Report history ({recent.length})</h1>
        <Dialog>
          <DialogTrigger asChild><Button variant="destructive" size="sm">Clear all…</Button></DialogTrigger>
          <DialogContent>
            <DialogTitle>Delete all saved reports?</DialogTitle>
            <p className="text-sm text-muted-foreground">This cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost">Cancel</Button>
              <Button size="sm" variant="destructive" onClick={onClearAll}>Delete all</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr>
            <th className="py-2 text-left">Date</th>
            <th className="text-left">URL</th>
            <th className="text-left">Mode</th>
            <th className="text-right">Size</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {recent.map((r: ReportSummary) => (
            <tr key={r.id} className="border-t">
              <td className="py-2"><time dateTime={new Date(r.createdAt).toISOString()}>
                {new Date(r.createdAt).toLocaleString()}
              </time></td>
              <td>
                <Link href={`/report/${r.id}/`} className="underline font-mono text-xs">{r.url}</Link>
              </td>
              <td>{r.mode}</td>
              <td className="text-right font-mono text-xs">{formatBytes(r.sizeBytes)}</td>
              <td className="text-right">
                <Button size="sm" variant="ghost" onClick={() => onDelete(r.id)}>Delete</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## N. Bundle budgets per route — concrete boundaries

| Route | Budget (gz) | Static imports allowed | MUST be dynamic |
|---|---|---|---|
| `/` (landing) | **150 KB** | React, zustand, idb (lazy), url-form (RHF+zod), backend-detector | uPlot, Recharts, `ReportViewer`, `@ohmyperf/viewer/react`, `@react-aria/*` |
| `/measure` | **200 KB** | Above + `progress-stream`, `error-state`, `cwv-gauge` (uPlot OK) | Recharts, `ReportViewer` |
| `/report/[[...id]]` | **250 KB** | Above + `@ohmyperf/viewer/react`, `cwv-gauge`, `frame-tree` | `waterfall.impl` (Recharts) |
| `/viewer` | **250 KB** | Same as `/report/[[...id]]` | Same |
| `/report` (index) | **100 KB** | React, zustand (subset), idb, shadcn `table`/`dialog`/`button` | uPlot, Recharts, `ReportViewer` |

**Enforcement** (extends β.14 / γ.17 / ε.8):

1. Configure `@next/bundle-analyzer` to emit per-route JSON to `apps/website/.bundle-stats.json`.
2. Add `apps/website/scripts/assert-bundle-budgets.mjs` that parses the JSON and asserts `firstLoadJS[route] <= budget`.
3. Wire into `apps/website` CI: `pnpm build` → `node scripts/assert-bundle-budgets.mjs` → fail PR on regression.

**Concrete dynamic-import boundaries (one place each, must not be bypassed):**

- `apps/website/components/metrics/waterfall.tsx` — *only* place Recharts is imported, behind `next/dynamic({ ssr: false })`.
- `apps/website/components/metrics/cwv-gauge.tsx` — uPlot import is direct (it's allowed on `/measure` and beyond), but on landing it must not be imported. Achieve this by *not* importing `cwv-gauge` from `app/page.tsx` or any of its dependencies.
- `apps/website/components/metrics/frame-tree.tsx` — pure React, no chart deps; can be statically imported on report pages.
- `@ohmyperf/viewer/react` — never imported from landing. Only from `app/report/.../page.tsx`, `app/viewer/page.tsx`.

ESLint rule (recommended; small custom rule or `no-restricted-imports`): in `app/page.tsx` and `app/measure/page.tsx`, forbid imports of `@ohmyperf/viewer/react`, `recharts`, and `@/components/metrics/waterfall.impl`.

---

## O. Open questions for the implementer

1. **Viewer color theme origin**: `packages/viewer/src/styles.ts` defines its own CSS custom properties (`--bg`, `--panel`, `--accent` etc., see file). The React port should *not* re-declare these — instead, the SPA's Tailwind theme tokens map onto the same names so the React components style identically inside the SPA and standalone. **Action**: when shadcn is installed (β.5), align its `globals.css` tokens to the viewer's palette (or vice versa) and document the mapping in `packages/viewer/src/react/README.md`. Confirm: should the SPA's dark mode be `prefers-color-scheme` (matches viewer) or `next-themes` class-based? If class-based, the standalone HTML viewer's `@media (prefers-color-scheme: dark)` (styles.ts L18) diverges — not a blocker, but flag explicitly.

2. **`Report.frames` structure**: confirmed recursive-by-ID. See `types.ts` lines 69-88 (`FrameNode.children: readonly string[]`) and 85-88 (`FrameTree.root: string`, `nodes: Record<string, FrameNode>`). `inFrameMetrics` (L82) is `{ available: false; reason: string }` only when opacity/cross-origin blocks in-frame metric collection — there is **no** "available: true" variant in the type; presence-absent means metrics in `node.metrics` are valid. The render.test.ts fixture (L58, 69) confirms `metrics: {}` is the normal shape when nothing was emitted yet.

3. **INP shape**: `Metric` is `{ name, value, unit }` (`types.ts` L46-52). INP is exactly the same shape as LCP/CLS — there is no special discriminator. **It may be absent entirely** from `runs[].metrics` and from `aggregated` when no user-interaction simulation ran (which is the common case for the SPA's vanilla measure flow). The React `CwvSummary` should:
   - Iterate the headline list (`HEADLINE_METRICS` in format.ts) and *skip* any name not present in `report.aggregated` (existing `renderTile` already does this — line 120: `if (!agg) return ""`).
   - When INP is missing on the gauge grid, show a placeholder tile "INP — no interaction recorded" rather than rendering nothing, so users don't think the gauge is broken.

---

## Effort estimate

**Large (3d+)** for Phase γ as a whole — broken down:

- A+B+C+D (lib layer): ~1 day. Self-contained; can ship and unit-test before any UI.
- E (viewer port): ~1 day. The extraction is mechanical; the new tests are small.
- F+G+H (chart/tree components): ~1 day. uPlot canvas tuning and Recharts Gantt layout are the unknowns.
- I+J (progress + errors): ~0.5 day.
- K+L+M (pages): ~0.5 day.
- N (budget enforcement script + lint rule): ~0.5 day. Worth doing first so the rest of the work stays in budget.

REVIEW correctly flagged that the 5-6 session estimate is optimistic; recommend splitting per its suggestion: **γ1 = A+B+C+D+N**, **γ2 = E+F+G+H+I+J+K+L+M**, with γ1 merged before γ2 starts so the budget enforcement is live during component-build.

## Watch out for

- **uPlot bundle on landing**: cvw-gauge must not be imported (even transitively) from `app/page.tsx`. The ESLint `no-restricted-imports` rule is the cheapest enforcement.
- **`idb` cursors materialize whole records** — the listing query reads the full `report` payload per row. Acceptable up to ~100 rows / 200MB; if either grows, add a parallel `reportSummaries` store maintained in the same transaction as `reports`.
- **React StrictMode double-mounting** the iterator in `<ProgressStream>` will trigger the measurement twice in development. Always create the `MeasureHandle` at the caller (the form submission handler), pass `handle.events()` as a prop, and rely on `useEffect`'s cleanup to cancel — never call `backend.measure()` inside `useEffect`.

## Optional future considerations

- Move report summaries to a dedicated IndexedDB store written transactionally with `reports` — cheaper history list, room for v2 search/filter on size/url.
- Replace Recharts in the waterfall with `visx` or hand-rolled SVG when Recharts becomes the next bundle-budget pressure point (~80KB gz). Hand-rolled SVG is ~5KB and gives finer Gantt control.