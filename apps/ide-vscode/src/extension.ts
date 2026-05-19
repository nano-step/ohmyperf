import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import { renderReportHtml } from "@ohmyperf/viewer";
import type { Report } from "@ohmyperf/core";

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("ohmyperf");
  return {
    cliPath: cfg.get<string>("cliPath", "").trim(),
    defaultUrl: cfg.get<string>("defaultUrl", "http://localhost:3000"),
    defaultRuns: cfg.get<number>("defaultRuns", 3),
    defaultMode: cfg.get<string>("defaultMode", "real") as "real" | "ci-stable",
  };
}

function resolveCliBinary(): string {
  const override = getConfig().cliPath;
  return override.length > 0 ? override : "ohmyperf";
}

function runCli(args: ReadonlyArray<string>): Promise<CliResult> {
  return new Promise<CliResult>((resolve, reject) => {
    const child = spawn(resolveCliBinary(), [...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => {
      stdout += b.toString("utf8");
    });
    child.stderr.on("data", (b: Buffer) => {
      stderr += b.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
  });
}

async function loadReportFromFile(path: string): Promise<Report> {
  const body = await readFile(path, "utf8");
  const parsed = JSON.parse(body) as Report;
  if (parsed.schemaVersion !== "1.0.0") {
    throw new Error(`Unsupported schemaVersion: ${String(parsed.schemaVersion)}`);
  }
  return parsed;
}

function showReportInWebview(context: vscode.ExtensionContext, report: Report): void {
  const panel = vscode.window.createWebviewPanel(
    "ohmyperfReport",
    `OhMyPerf — ${report.meta.url}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: false,
      retainContextWhenHidden: false,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)],
    },
  );
  panel.webview.html = renderReportHtml(report, { title: `OhMyPerf — ${report.meta.url}` });
}

export async function measureUrlCommand(context: vscode.ExtensionContext): Promise<void> {
  const cfg = getConfig();
  const url = await vscode.window.showInputBox({
    prompt: "URL to measure",
    value: cfg.defaultUrl,
    validateInput: (v) => {
      try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:" ? null : "Must be http(s)";
      } catch {
        return "Invalid URL";
      }
    },
  });
  if (!url) return;

  const outDir = join(tmpdir(), `ohmyperf-vscode-${String(process.pid)}-${String(Date.now())}`);
  await mkdir(outDir, { recursive: true });

  try {
    const args = [
      "run",
      url,
      "--runs",
      String(cfg.defaultRuns),
      "--mode",
      cfg.defaultMode,
      "--output",
      outDir,
      "--format",
      "json",
      "--quiet",
    ];
    if (cfg.defaultRuns === 1) args.push("--allow-single-run");

    let res: CliResult;
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `OhMyPerf: measuring ${url}`,
        cancellable: false,
      },
      async () => {
        res = await runCli(args);
      },
    );
    res = res!;

    if (res.exitCode !== 0) {
      const lines = res.stderr.trim().split("\n").slice(-3).join("\n");
      vscode.window.showErrorMessage(
        `OhMyPerf failed (exit ${String(res.exitCode)}): ${lines || "no stderr output"}`,
      );
      return;
    }

    const report = await loadReportFromFile(join(outDir, "report.json"));
    showReportInWebview(context, report);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ENOENT") || message.includes("not found")) {
      const action = await vscode.window.showErrorMessage(
        "OhMyPerf CLI not found on PATH. Install it or set 'ohmyperf.cliPath' in settings.",
        "Open settings",
      );
      if (action === "Open settings") {
        void vscode.commands.executeCommand("workbench.action.openSettings", "ohmyperf");
      }
    } else {
      vscode.window.showErrorMessage(`OhMyPerf error: ${message}`);
    }
  } finally {
    await rm(outDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function openReportCommand(context: vscode.ExtensionContext): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { "OhMyPerf report": ["json"] },
    openLabel: "Open report.json",
  });
  if (!picked || picked.length === 0) return;
  const path = picked[0]!.fsPath;
  try {
    const report = await loadReportFromFile(path);
    showReportInWebview(context, report);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Could not open report: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("ohmyperf.measureUrl", () => measureUrlCommand(context)),
    vscode.commands.registerCommand("ohmyperf.openReport", () => openReportCommand(context)),
  );
}

export function deactivate(): void {
  return undefined;
}
