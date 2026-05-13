import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Report } from '@ohmyperf/shared-types';

export interface StoredReport {
  id: string;
  url: string;
  createdAt: number;
  mode: 'real' | 'ci-stable';
  sizeBytes: number;
  report: Report;
}

export interface ReportSummary {
  id: string;
  url: string;
  createdAt: number;
  mode: 'real' | 'ci-stable';
  sizeBytes: number;
}

export interface StoredJob {
  id: string;
  url: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  startedAt: number;
  finishedAt?: number;
  reportId?: string;
  error?: string;
}

interface OmoDB extends DBSchema {
  reports: {
    key: string;
    value: StoredReport;
    indexes: { 'by-createdAt': number; 'by-url': string };
  };
  jobs: {
    key: string;
    value: StoredJob;
  };
}

const DB_NAME = 'ohmyperf';
const DB_VERSION = 1;
const MAX_BYTES = 200 * 1024 * 1024;
const EVICT_FRACTION = 0.25;

let dbPromise: Promise<IDBPDatabase<OmoDB>> | null = null;

function getDb(): Promise<IDBPDatabase<OmoDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OmoDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('reports', { keyPath: 'id' });
        store.createIndex('by-createdAt', 'createdAt');
        store.createIndex('by-url', 'url');
        db.createObjectStore('jobs', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function saveReport(report: Report): Promise<string> {
  const db = await getDb();
  const raw = JSON.stringify(report);
  const sizeBytes = new TextEncoder().encode(raw).length;

  const stored: StoredReport = {
    id: report.meta.measurementId,
    url: report.meta.url,
    createdAt: Date.now(),
    mode: report.meta.mode as 'real' | 'ci-stable',
    sizeBytes,
    report,
  };

  try {
    await evictIfOverQuota(db, sizeBytes);
    const tx = db.transaction('reports', 'readwrite');
    await tx.store.put(stored);
    await tx.done;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      await evictOldest(db, Math.floor(EVICT_FRACTION * (await countReports(db))));
      const tx2 = db.transaction('reports', 'readwrite');
      await tx2.store.put(stored);
      await tx2.done;
    } else {
      throw err;
    }
  }

  return stored.id;
}

export async function getReport(id: string): Promise<StoredReport | undefined> {
  const db = await getDb();
  return db.get('reports', id);
}

export async function listReports(limit = 50): Promise<StoredReport[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('reports', 'by-createdAt');
  return all.reverse().slice(0, limit);
}

export async function deleteReport(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('reports', id);
}

export async function clearAllReports(): Promise<void> {
  const db = await getDb();
  await db.clear('reports');
}

export async function evictIfOverQuota(
  db: IDBPDatabase<OmoDB>,
  incomingBytes: number,
): Promise<number> {
  const all = await db.getAllFromIndex('reports', 'by-createdAt');
  const total = all.reduce((acc, r) => acc + r.sizeBytes, 0) + incomingBytes;
  if (total <= MAX_BYTES) return 0;

  const sorted = [...all].sort((a, b) => a.createdAt - b.createdAt);
  let freed = 0;
  let evicted = 0;
  const tx = db.transaction('reports', 'readwrite');
  for (const r of sorted) {
    if (total - freed <= MAX_BYTES) break;
    await tx.store.delete(r.id);
    freed += r.sizeBytes;
    evicted++;
  }
  await tx.done;
  return evicted;
}

async function evictOldest(db: IDBPDatabase<OmoDB>, count: number): Promise<void> {
  if (count <= 0) return;
  const all = await db.getAllFromIndex('reports', 'by-createdAt');
  const sorted = [...all].sort((a, b) => a.createdAt - b.createdAt).slice(0, count);
  const tx = db.transaction('reports', 'readwrite');
  for (const r of sorted) await tx.store.delete(r.id);
  await tx.done;
}

async function countReports(db: IDBPDatabase<OmoDB>): Promise<number> {
  return db.count('reports');
}

export async function listReportsPage(opts: {
  cursorKey?: number;
  limit?: number;
  mode?: 'real' | 'ci-stable';
  urlSubstring?: string;
}): Promise<{ items: ReportSummary[]; nextCursor: number | null }> {
  const db = await getDb();
  const tx = db.transaction('reports', 'readonly');
  const idx = tx.store.index('by-createdAt');
  const range = opts.cursorKey != null
    ? IDBKeyRange.upperBound(opts.cursorKey, true) : undefined;
  const limit = opts.limit ?? 20;
  const items: ReportSummary[] = [];
  const needle = opts.urlSubstring?.toLowerCase();
  let cursor = await idx.openCursor(range, 'prev');
  while (cursor && items.length < limit) {
    const v = cursor.value;
    const passMode = !opts.mode || v.mode === opts.mode;
    const passUrl = !needle || v.url.toLowerCase().includes(needle);
    if (passMode && passUrl) {
      items.push({
        id: v.id,
        url: v.url,
        createdAt: v.createdAt,
        mode: v.mode,
        sizeBytes: v.sizeBytes,
      });
    }
    cursor = await cursor.continue();
  }
  return {
    items,
    nextCursor: items.length === limit ? (items[items.length - 1]?.createdAt ?? null) : null,
  };
}

export async function deleteReports(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('reports', 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function saveJob(job: StoredJob): Promise<void> {
  const db = await getDb();
  await db.put('jobs', job);
}

export async function getJob(id: string): Promise<StoredJob | undefined> {
  const db = await getDb();
  return db.get('jobs', id);
}
