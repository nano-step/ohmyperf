import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServerHandle } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = resolve(__dirname, "../../../apps/cli/bin/ohmyperf.mjs");

let server: FixtureServerHandle | undefined;
let parentBase = "";
let canRunBrowser = false;
let outputDir = "";

const isCi = process.env["CI"] === "true";
const fullChromium = process.env["OHMYPERF_CHROMIUM_PATH"];

interface SpawnResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runBin(
  argv: ReadonlyArray<string>,
  env: Record<string, string> = {},
): Promise<SpawnResult> {
  return new Promise<SpawnResult>((resolveProc, rejectProc) => {
    const child = spawn("node", [CLI_BIN, ...argv], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => {
      stdout += b.toString("utf8");
    });
    child.stderr.on("data", (b: Buffer) => {
      stderr += b.toString("utf8");
    });
    child.on("error", rejectProc);
    child.on("exit", (code) => {
      resolveProc({ code: code ?? -1, stdout, stderr });
    });
  });
}

beforeAll(async () => {
  server = await startFixtureServer({ originCount: 1 });
  parentBase = server.origins[0]!.base;
  outputDir = join(tmpdir(), `ohmyperf-cli-test-${String(process.pid)}-${String(Date.now())}`);
  await mkdir(outputDir, { recursive: true });

  if (fullChromium) {
    canRunBrowser = true;
  } else {
    try {
      const probe = await runBin(["doctor"]);
      canRunBrowser = probe.code === 0;
    } catch {
      canRunBrowser = false;
    }
  }
}, 60_000);

afterAll(async () => {
  await server?.close();
  if (outputDir.length > 0) {
    await rm(outputDir, { recursive: true, force: true });
  }
});

describe("ohmyperf CLI", () => {
  it("exits 2 on invalid URL before any browser launch", async () => {
    const res = await runBin(["run", "not-a-url"]);
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/invalid url/i);
  });

  it("exits 2 on invalid --runs", async () => {
    const res = await runBin(["run", parentBase, "--runs", "0"]);
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/invalid --runs/i);
  });

  it("exits 2 when --budget is set with --runs=1 and no --allow-single-run", async () => {
    const res = await runBin(["run", parentBase, "--runs", "1", "--budget", "lcp=2500"]);
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/budget refused with --runs=1/i);
  });

  it("list-plugins --json emits a JSON array of 3 built-ins", async () => {
    const res = await runBin(["list-plugins", "--json"]);
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as Array<{ id: string; integrity: string }>;
    expect(parsed).toHaveLength(3);
    expect(parsed.map((p) => p.id).sort()).toEqual([
      "ohmyperf.builtin.axe",
      "ohmyperf.builtin.cwv",
      "ohmyperf.example.custom-metric",
    ]);
    for (const p of parsed) {
      expect(p.integrity).toMatch(/^sha384-/);
    }
  });

  it("doctor prints diagnostics and exits 0 when Node + Playwright are OK", async () => {
    const res = await runBin(["doctor"]);
    expect([0, 2]).toContain(res.code);
    expect(res.stderr + res.stdout).toMatch(/node:/);
  });

  it(
    "run produces a valid JSON report against a real fixture",
    async () => {
      if (!canRunBrowser) {
        console.warn("skipping: Chromium browser not installed");
        return;
      }
      if (!server) throw new Error("fixture server not started");

      const url = `${parentBase}/oopif-3-cross-origin`;
      const isolateList = `http://${server.origins[0]!.host}:${String(server.origins[0]!.port)}`;
      const res = await runBin([
        "run",
        url,
        "--runs",
        "1",
        "--allow-single-run",
        "--output",
        outputDir,
        "--plugins",
        "cwv",
        "--isolate-origins",
        isolateList,
        "--format",
        "json",
        "--json",
        "--quiet",
        ...(fullChromium ? ["--browser-path", fullChromium] : []),
      ]);

      if (res.code !== 0) {
        console.error(`stdout:\n${res.stdout}`);
        console.error(`stderr:\n${res.stderr}`);
      }
      expect(res.code).toBe(0);

      const lastJsonLine = res.stdout.trim().split("\n").pop() ?? "";
      const summary = JSON.parse(lastJsonLine) as {
        schemaVersion: string;
        measurementId: string;
        outputPath: string | null;
        htmlPath: string | null;
      };
      expect(summary.schemaVersion).toBe("1.0.0");
      expect(summary.measurementId.length).toBeGreaterThan(8);
      expect(summary.outputPath).not.toBeNull();
      expect(summary.htmlPath).toBeNull();

      const body = await readFile(summary.outputPath!, "utf8");
      const report = JSON.parse(body) as {
        schemaVersion: string;
        meta: { url: string; runs: number };
        runs: ReadonlyArray<unknown>;
      };
      expect(report.schemaVersion).toBe("1.0.0");
      expect(report.meta.url).toBe(url);
      expect(report.meta.runs).toBe(1);
      expect(report.runs).toHaveLength(1);
    },
    120_000,
  );

  it(
    "run --format json,html writes both report.json and report.html",
    async () => {
      if (!canRunBrowser) {
        console.warn("skipping: Chromium browser not installed");
        return;
      }
      if (!server) throw new Error("fixture server not started");

      const url = `${parentBase}/oopif-3-cross-origin`;
      const isolateList = `http://${server.origins[0]!.host}:${String(server.origins[0]!.port)}`;
      const dualOutDir = join(outputDir, "dual");
      const res = await runBin([
        "run",
        url,
        "--runs",
        "1",
        "--allow-single-run",
        "--output",
        dualOutDir,
        "--plugins",
        "cwv",
        "--isolate-origins",
        isolateList,
        "--format",
        "json,html",
        "--json",
        "--quiet",
        ...(fullChromium ? ["--browser-path", fullChromium] : []),
      ]);

      if (res.code !== 0) {
        console.error(`stdout:\n${res.stdout}`);
        console.error(`stderr:\n${res.stderr}`);
      }
      expect(res.code).toBe(0);

      const lastJsonLine = res.stdout.trim().split("\n").pop() ?? "";
      const summary = JSON.parse(lastJsonLine) as {
        outputPath: string | null;
        htmlPath: string | null;
      };
      expect(summary.outputPath).not.toBeNull();
      expect(summary.htmlPath).not.toBeNull();

      const html = await readFile(summary.htmlPath!, "utf8");
      expect(html.startsWith("<!doctype html>")).toBe(true);
      expect(html).toContain("OhMyPerf v1.0.0 report");
      expect(html).toContain(url);
      expect(html).not.toMatch(/<script[^>]+src\s*=\s*["']https?:/i);
      expect(html).not.toMatch(/<link\b[^>]+rel\s*=\s*["']stylesheet["']/i);
    },
    120_000,
  );

  it("rejects --format with an unknown extension (exit 2)", async () => {
    const res = await runBin([
      "run",
      parentBase,
      "--runs",
      "1",
      "--allow-single-run",
      "--format",
      "json,gif",
    ]);
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/format.*not supported/i);
  });
});
