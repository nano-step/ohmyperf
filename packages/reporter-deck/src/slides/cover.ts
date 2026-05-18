import type { Report } from "@ohmyperf/core";
import { escapeHtml } from "@ohmyperf/viewer/escape";
import { slideWrapper } from "../deck-shell.js";

export function renderCoverSlide(report: Report): string {
  const m = report.meta;
  const started = formatDate(m.startedAt);
  const inner = `  <h1 class="slide-title">Performance Report</h1>
  <p class="slide-subtitle">${escapeHtml(m.url)}</p>
  <div class="slide-body">
    <table class="kv-table" style="max-width:60ch;">
      <tbody>
        <tr><th>Measured</th><td>${escapeHtml(started)}</td></tr>
        <tr><th>Mode</th><td>${escapeHtml(m.mode)} · ${escapeHtml(String(m.runs))} run${m.runs === 1 ? "" : "s"} · ${escapeHtml(m.parity.mode)}</td></tr>
        <tr><th>Browser</th><td>${escapeHtml(`${m.browser.name} ${m.browser.version}`)} <span style="color:var(--color-muted-foreground)">(${escapeHtml(m.browser.source)})</span></td></tr>
        <tr><th>Host</th><td>${escapeHtml(`${m.host.os} · ${m.host.arch}`)}</td></tr>
        <tr><th>Measurement ID</th><td class="mono">${escapeHtml(m.measurementId)}</td></tr>
      </tbody>
    </table>
  </div>
  <footer class="slide-footer"><span>OhMyPerf</span><span>Schema v${escapeHtml(report.schemaVersion)}</span></footer>`;
  return slideWrapper(1, inner, { eyebrow: "Overview" });
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toUTCString();
  } catch {
    return iso;
  }
}
