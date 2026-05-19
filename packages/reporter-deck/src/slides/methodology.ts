import type { Report } from "@ohmyperf/core";
import { escapeHtml } from "@ohmyperf/viewer/escape";
import { slideWrapper } from "../deck-shell.js";

export function renderMethodologySlide(report: Report): string {
  const m = report.meta;
  const rows: Array<[string, string]> = [
    ["Mode", `${m.mode} · ${String(m.runs)} run${m.runs === 1 ? "" : "s"}`],
    ["Browser", `${m.browser.name} ${m.browser.version} (${m.browser.source})`],
    ["Parity", m.parity.mode],
    ["Host", `${m.host.os} · ${m.host.arch} · Node ${m.host.nodeVersion}`],
    ["Started", m.startedAt],
    ["Duration", `${String(m.durationMs)} ms`],
  ];
  if (m.calibration) {
    rows.push([
      "Calibration",
      `${String(m.calibration.throttleRate)}× · ${m.calibration.networkProfile}${m.calibration.cacheHit ? " · cached" : ""}`,
    ]);
  }
  if (m.protocol) rows.push(["Protocol", m.protocol]);
  if (m.servedBy) rows.push(["Served by", m.servedBy]);
  if (m.unstable) {
    rows.push([
      "Stability",
      "⚠ unstable — at least one CWV has CoV > 20%; results should be re-run with more samples",
    ]);
  }
  const tbody = rows
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join("");
  const inner = `  <h2 class="slide-title">Methodology</h2>
  <p class="slide-subtitle">How this measurement was captured. All values are reproducible from the same Report JSON.</p>
  <div class="slide-body" style="margin-top:32px; max-width: 90ch;">
    <table class="kv-table">
      <tbody>${tbody}</tbody>
    </table>
  </div>
  <footer class="slide-footer"><span>OhMyPerf v${escapeHtml(report.schemaVersion)}</span><span>Measurement ID ${escapeHtml(m.measurementId)}</span></footer>`;
  return slideWrapper(6, inner, { eyebrow: "Section 06 · Methodology" });
}
