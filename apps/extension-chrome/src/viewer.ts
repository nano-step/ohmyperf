import { renderReportHtml } from "@ohmyperf/viewer";
import type { Report } from "@ohmyperf/core";

interface ChromeStorageAPI {
  session: { get(keys: string[]): Promise<Record<string, unknown>> };
}

declare const chrome: { storage: ChromeStorageAPI };

interface StoredMeasurement {
  status: "running" | "done" | "error";
  url: string;
  report?: Report;
  error?: string;
}

async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const measurementId = params.get("m");
  if (!measurementId) {
    document.body.innerHTML = "<p style='font-family:system-ui'>No measurement id in URL.</p>";
    return;
  }
  const key = `measurement:${measurementId}`;
  const stored = await chrome.storage.session.get([key]);
  const value = stored[key] as StoredMeasurement | undefined;
  if (!value) {
    document.body.innerHTML = "<p style='font-family:system-ui'>Measurement not found in session storage.</p>";
    return;
  }
  if (value.status === "error") {
    document.body.innerHTML = `<p style='font-family:system-ui;color:#b91c1c'>Measurement failed: ${escapeHtml(value.error ?? "unknown error")}</p>`;
    return;
  }
  if (value.status === "running" || !value.report) {
    document.body.innerHTML = "<p style='font-family:system-ui'>Measurement still running… reload this page in a moment.</p>";
    return;
  }
  const html = renderReportHtml(value.report, { title: `OhMyPerf — ${value.url}` });
  document.open();
  document.write(html);
  document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
  );
}

void main();
