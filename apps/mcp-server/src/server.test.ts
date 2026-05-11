import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOhmyperfMcpServer, readReportFromDisk, writeReportToDisk } from "./server.js";

function makeReport(url: string, lcps: number[]) {
  return {
    schemaVersion: "1.0.0" as const,
    meta: {
      url,
      startedAt: "2026-05-11T00:00:00.000Z",
      durationMs: 1000,
      runs: lcps.length,
      mode: "real" as const,
      browser: { name: "chromium", version: "147.0", source: "bundled" as const },
      host: { os: "linux", arch: "x64", nodeVersion: "v22" },
      parity: { mode: "headless" as const, knownDeltas: {} },
      emulation: false as const,
      pluginCapabilityUses: [],
      measurementId: `m_${url.slice(-8)}`,
    },
    runs: lcps.map((v, i) => ({
      runIndex: i,
      cold: i === 0,
      metrics: { lcp: { name: "lcp", value: v, unit: "ms" as const } },
      resources: [],
      longTasks: [],
      meta: {},
    })),
    aggregated: {},
    frames: { root: "r", nodes: { r: { frameId: "r", url, origin: url, parentFrameId: null, isOOPIF: false, isCrossOrigin: false, attachedAt: 0, metrics: {}, children: [] } } },
    audits: [],
    artifacts: {},
    pluginData: {},
  };
}

describe("ohmyperf-mcp server", () => {
  it("createOhmyperfMcpServer() initializes without throwing", () => {
    const server = createOhmyperfMcpServer({ reportsDir: tmpdir() });
    expect(server).toBeDefined();
  });

  it("readReportFromDisk + writeReportToDisk round-trip a report.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ohmyperf-mcp-test-"));
    const path = join(dir, "report.json");
    const report = makeReport("https://example.com", [100, 102, 99]);
    await writeReportToDisk(path, report);
    const back = await readReportFromDisk(path);
    expect(back.schemaVersion).toBe("1.0.0");
    expect(back.meta.url).toBe("https://example.com");
    expect(back.runs).toHaveLength(3);
  });

  it("readReportFromDisk rejects unsupported schemaVersion", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ohmyperf-mcp-test-"));
    const path = join(dir, "bad.json");
    await writeFile(path, JSON.stringify({ schemaVersion: "2.0.0" }));
    await expect(readReportFromDisk(path)).rejects.toThrow(/schemaVersion/i);
  });
});
