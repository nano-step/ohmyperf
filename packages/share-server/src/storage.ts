export interface ShareRecord {
  readonly id: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly passwordHash?: string;
  readonly private: boolean;
}

export interface ShareStorage {
  putReport(id: string, body: Uint8Array): Promise<void>;
  getReport(id: string): Promise<Uint8Array | undefined>;
  putRecord(rec: ShareRecord): Promise<void>;
  getRecord(id: string): Promise<ShareRecord | undefined>;
  deleteReport(id: string): Promise<void>;
  countByIp(ip: string, sinceMs: number): Promise<number>;
  recordUpload(ip: string, id: string, at: number): Promise<void>;
}

export class InMemoryStorage implements ShareStorage {
  private readonly reports = new Map<string, Uint8Array>();
  private readonly records = new Map<string, ShareRecord>();
  private readonly uploads: Array<{ ip: string; id: string; at: number }> = [];

  async putReport(id: string, body: Uint8Array): Promise<void> {
    this.reports.set(id, body);
  }
  async getReport(id: string): Promise<Uint8Array | undefined> {
    return this.reports.get(id);
  }
  async putRecord(rec: ShareRecord): Promise<void> {
    this.records.set(rec.id, rec);
  }
  async getRecord(id: string): Promise<ShareRecord | undefined> {
    return this.records.get(id);
  }
  async deleteReport(id: string): Promise<void> {
    this.reports.delete(id);
    this.records.delete(id);
  }
  async countByIp(ip: string, sinceMs: number): Promise<number> {
    return this.uploads.filter((u) => u.ip === ip && u.at >= sinceMs).length;
  }
  async recordUpload(ip: string, id: string, at: number): Promise<void> {
    this.uploads.push({ ip, id, at });
  }
}
