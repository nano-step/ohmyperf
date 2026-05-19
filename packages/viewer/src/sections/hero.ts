import type { Report } from "@ohmyperf/core";
import { escapeHtml } from "../escape.js";

export function renderHero(report: Report): string {
  const m = report.meta;
  const badges: string[] = [];
  badges.push(`<span class="badge accent">mode: ${escapeHtml(m.mode)}</span>`);
  badges.push(`<span class="badge">runs: ${escapeHtml(String(m.runs))}</span>`);
  badges.push(`<span class="badge">${escapeHtml(`${m.browser.name} ${m.browser.version}`)}</span>`);
  badges.push(`<span class="badge">${escapeHtml(m.parity.mode)}</span>`);
  if (m.calibration) {
    badges.push(`<span class="badge">calibration: ${escapeHtml(String(m.calibration.throttleRate))}× · ${escapeHtml(m.calibration.networkProfile)}</span>`);
  }
  if (m.unstable) {
    badges.push(`<span class="badge" style="color:var(--color-accent-warning);border-color:color-mix(in srgb, var(--color-accent-warning) 40%, transparent)">⚠ unstable</span>`);
  }

  return `<section class="hero" aria-label="Report summary">
  <h1>Performance Report</h1>
  <div class="url">${escapeHtml(m.url)}</div>
  <div class="badges">${badges.join("")}</div>
  <dl class="meta" style="margin-top:14px;font-size:12.5px">
    <dt>Started</dt><dd>${escapeHtml(m.startedAt)}</dd>
    <dt>Duration</dt><dd>${escapeHtml(`${String(m.durationMs)} ms`)}</dd>
    <dt>Host</dt><dd>${escapeHtml(`${m.host.os} (${m.host.arch}) · Node ${m.host.nodeVersion}`)}</dd>
    <dt>Measurement ID</dt><dd class="mono">${escapeHtml(m.measurementId)}</dd>
  </dl>
</section>`;
}
