import type { Report } from "@ohmyperf/core";
import {
  classifyCwv,
  cwvStatusIcon,
  cwvStatusLabel,
  formatCwvValue,
  type CwvStatus,
} from "@ohmyperf/viewer/charts";
import { escapeHtml } from "@ohmyperf/viewer/escape";
import { slideWrapper } from "../deck-shell.js";

const CWV_ORDER: ReadonlyArray<string> = ["lcp", "inp", "cls", "fcp", "ttfb", "tbt"];

export function renderCwvSlide(report: Report): string {
  const tiles: string[] = [];
  const counts: Record<CwvStatus, number> = { good: 0, "needs-improvement": 0, poor: 0, unknown: 0 };
  for (const metric of CWV_ORDER) {
    const agg = report.aggregated[metric];
    if (!agg) continue;
    const status = classifyCwv(metric, agg.median);
    counts[status]++;
    const valueStr = formatCwvValue(metric, agg.median);
    tiles.push(`<div class="cwv-tile" data-cwv-status="${escapeHtml(status)}">
      <div>
        <div class="label">${escapeHtml(metric.toUpperCase())}</div>
        <div class="value">${escapeHtml(valueStr)}</div>
      </div>
      <div class="meta">
        <span class="icon" aria-hidden="true">${escapeHtml(cwvStatusIcon(status))}</span>
        <span>${escapeHtml(cwvStatusLabel(status))} · p75 ${escapeHtml(formatCwvValue(metric, agg.p75))} · CoV ${(agg.cov * 100).toFixed(1)}%</span>
      </div>
    </div>`);
  }
  const summary = buildSummary(counts);
  const inner = `  <h2 class="slide-title">Core Web Vitals</h2>
  <p class="slide-subtitle">${escapeHtml(report.meta.url)}</p>
  <div class="slide-body">
    <p class="summary-line">${summary}</p>
    <div class="cwv-grid-large">${tiles.join("")}</div>
  </div>
  <footer class="slide-footer"><span>Median across ${escapeHtml(String(report.meta.runs))} run${report.meta.runs === 1 ? "" : "s"} · mode ${escapeHtml(report.meta.mode)}</span><span>OhMyPerf</span></footer>`;
  return slideWrapper(2, inner, { eyebrow: "Section 02 · CWV" });
}

function buildSummary(counts: Record<CwvStatus, number>): string {
  const parts: string[] = [];
  if (counts.good > 0) parts.push(`<strong>${String(counts.good)} good</strong>`);
  if (counts["needs-improvement"] > 0) parts.push(`<strong>${String(counts["needs-improvement"])} need${counts["needs-improvement"] === 1 ? "s" : ""} improvement</strong>`);
  if (counts.poor > 0) parts.push(`<strong>${String(counts.poor)} poor</strong>`);
  if (parts.length === 0) return "No Core Web Vitals captured.";
  return `${parts.join(" · ")} across the headline metrics.`;
}
