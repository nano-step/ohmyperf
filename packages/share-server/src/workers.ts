import { createApp, type AppEnv } from "./app.js";
import type { ShareRecord, ShareStorage } from "./storage.js";

interface R2Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array | string): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...args: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<{ success: boolean }>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}

export interface WorkersBindings {
  REPORTS: R2Bucket;
  RECORDS: D1Database;
  OHMYPERF_PUBLIC_BASE_URL?: string;
}

class R2D1Storage implements ShareStorage {
  constructor(private readonly r2: R2Bucket, private readonly d1: D1Database) {}

  async putReport(id: string, body: Uint8Array): Promise<void> {
    await this.r2.put(`reports/${id}.json`, body);
  }

  async getReport(id: string): Promise<Uint8Array | undefined> {
    const obj = await this.r2.get(`reports/${id}.json`);
    if (!obj) return undefined;
    const buf = await obj.arrayBuffer();
    return new Uint8Array(buf);
  }

  async putRecord(rec: ShareRecord): Promise<void> {
    await this.d1
      .prepare(
        "INSERT OR REPLACE INTO share_records (id, created_at, expires_at, password_hash, private) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(rec.id, rec.createdAt, rec.expiresAt, rec.passwordHash ?? null, rec.private ? 1 : 0)
      .run();
  }

  async getRecord(id: string): Promise<ShareRecord | undefined> {
    const row = await this.d1
      .prepare(
        "SELECT id, created_at, expires_at, password_hash, private FROM share_records WHERE id = ?",
      )
      .bind(id)
      .first<{
        id: string;
        created_at: number;
        expires_at: number;
        password_hash: string | null;
        private: number;
      }>();
    if (!row) return undefined;
    return {
      id: row.id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      ...(row.password_hash !== null ? { passwordHash: row.password_hash } : {}),
      private: row.private === 1,
    };
  }

  async deleteReport(id: string): Promise<void> {
    await this.r2.delete(`reports/${id}.json`).catch(() => undefined);
    await this.d1.prepare("DELETE FROM share_records WHERE id = ?").bind(id).run();
  }

  async countByIp(ip: string, sinceMs: number): Promise<number> {
    const row = await this.d1
      .prepare("SELECT COUNT(*) AS n FROM share_uploads WHERE ip = ? AND at >= ?")
      .bind(ip, sinceMs)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async recordUpload(ip: string, id: string, at: number): Promise<void> {
    await this.d1
      .prepare("INSERT INTO share_uploads (ip, id, at) VALUES (?, ?, ?)")
      .bind(ip, id, at)
      .run();
  }
}

export default {
  async fetch(request: Request, bindings: WorkersBindings): Promise<Response> {
    const env: AppEnv = {
      storage: new R2D1Storage(bindings.REPORTS, bindings.RECORDS),
      maxBodyBytes: 10 * 1024 * 1024,
      defaultTtlMs: 30 * 24 * 60 * 60 * 1000,
      maxTtlMs: 365 * 24 * 60 * 60 * 1000,
      rateLimit: { perIpPerHour: 10 },
      publicBaseUrl: bindings.OHMYPERF_PUBLIC_BASE_URL ?? "https://ohmyperf.dev",
    };
    return createApp(env).fetch(request);
  },
};

export const D1_SCHEMA = `
CREATE TABLE IF NOT EXISTS share_records (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  password_hash TEXT,
  private INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS share_uploads (
  ip TEXT NOT NULL,
  id TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_uploads_ip_at ON share_uploads (ip, at);
` as const;
