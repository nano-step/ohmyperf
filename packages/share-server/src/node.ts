import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createApp, type AppEnv } from "./app.js";
import { type ShareRecord, type ShareStorage } from "./storage.js";

export interface NodeServerOptions {
  readonly port?: number;
  readonly host?: string;
  readonly dataDir?: string;
  readonly publicBaseUrl?: string;
  readonly defaultTtlDays?: number;
  readonly maxTtlDays?: number;
  readonly rateLimitPerHour?: number;
  readonly maxBodyBytes?: number;
}

export class FileSystemStorage implements ShareStorage {
  private readonly uploadsPath: string;

  constructor(private readonly dataDir: string) {
    this.uploadsPath = join(dataDir, "uploads.json");
  }

  private async ensureDirs(): Promise<void> {
    await mkdir(join(this.dataDir, "reports"), { recursive: true });
    await mkdir(join(this.dataDir, "records"), { recursive: true });
  }

  async putReport(id: string, body: Uint8Array): Promise<void> {
    await this.ensureDirs();
    await writeFile(join(this.dataDir, "reports", `${id}.json`), body);
  }

  async getReport(id: string): Promise<Uint8Array | undefined> {
    try {
      const buf = await readFile(join(this.dataDir, "reports", `${id}.json`));
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      return undefined;
    }
  }

  async putRecord(rec: ShareRecord): Promise<void> {
    await this.ensureDirs();
    await writeFile(join(this.dataDir, "records", `${rec.id}.json`), JSON.stringify(rec));
  }

  async getRecord(id: string): Promise<ShareRecord | undefined> {
    try {
      const body = await readFile(join(this.dataDir, "records", `${id}.json`), "utf8");
      return JSON.parse(body) as ShareRecord;
    } catch {
      return undefined;
    }
  }

  async deleteReport(id: string): Promise<void> {
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(join(this.dataDir, "reports", `${id}.json`)).catch(() => undefined);
      await unlink(join(this.dataDir, "records", `${id}.json`)).catch(() => undefined);
    } catch {
      /* noop */
    }
  }

  async countByIp(ip: string, sinceMs: number): Promise<number> {
    if (!existsSync(this.uploadsPath)) return 0;
    try {
      const body = await readFile(this.uploadsPath, "utf8");
      const arr = JSON.parse(body) as Array<{ ip: string; id: string; at: number }>;
      return arr.filter((u) => u.ip === ip && u.at >= sinceMs).length;
    } catch {
      return 0;
    }
  }

  async recordUpload(ip: string, id: string, at: number): Promise<void> {
    await this.ensureDirs();
    let arr: Array<{ ip: string; id: string; at: number }> = [];
    try {
      const body = await readFile(this.uploadsPath, "utf8");
      arr = JSON.parse(body) as Array<{ ip: string; id: string; at: number }>;
    } catch {
      arr = [];
    }
    arr.push({ ip, id, at });
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    arr = arr.filter((u) => u.at >= cutoff);
    await writeFile(this.uploadsPath, JSON.stringify(arr));
  }
}

export async function startNodeServer(opts: NodeServerOptions = {}): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const port = opts.port ?? 4170;
  const host = opts.host ?? "127.0.0.1";
  const dataDir = resolve(opts.dataDir ?? "./.ohmyperf-share-data");
  const publicBaseUrl = opts.publicBaseUrl ?? `http://${host}:${String(port)}`;
  const env: AppEnv = {
    storage: new FileSystemStorage(dataDir),
    maxBodyBytes: opts.maxBodyBytes ?? 10 * 1024 * 1024,
    defaultTtlMs: (opts.defaultTtlDays ?? 30) * 24 * 60 * 60 * 1000,
    maxTtlMs: (opts.maxTtlDays ?? 365) * 24 * 60 * 60 * 1000,
    rateLimit: { perIpPerHour: opts.rateLimitPerHour ?? 10 },
    publicBaseUrl,
  };
  const app = createApp(env);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);
      const init: RequestInit = {
        method: req.method ?? "GET",
        headers: req.headers as HeadersInit,
      };
      if (req.method && req.method !== "GET" && req.method !== "HEAD") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        (init as { body?: BodyInit }).body = Buffer.concat(chunks).toString("utf8");
      }
      const request = new Request(url.toString(), init);
      const response = await app.fetch(request);
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      const body = await response.text();
      res.end(body);
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "internal", message: err instanceof Error ? err.message : String(err) }));
    }
  });

  await new Promise<void>((r) => server.listen(port, host, r));
  return {
    url: publicBaseUrl,
    close: async () => {
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  const opts: NodeServerOptions = {
    port: Number(process.env["PORT"] ?? 4170),
    ...(process.env["OHMYPERF_SHARE_DATA_DIR"]
      ? { dataDir: process.env["OHMYPERF_SHARE_DATA_DIR"] }
      : {}),
    ...(process.env["OHMYPERF_SHARE_PUBLIC_BASE_URL"]
      ? { publicBaseUrl: process.env["OHMYPERF_SHARE_PUBLIC_BASE_URL"] }
      : {}),
  };
  void startNodeServer(opts).then((s) => {
    process.stderr.write(`ohmyperf share-server listening on ${s.url}\n`);
  });
}
