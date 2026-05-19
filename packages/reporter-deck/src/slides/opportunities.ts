import type { Report } from "@ohmyperf/core";
import { renderHorizontalBars } from "@ohmyperf/viewer/charts";
import { slideWrapper } from "../deck-shell.js";
import { renderEmptyStateSlide } from "./empty-slide.js";

export function renderOpportunitiesSlide(report: Report): string {
  const opps = report.opportunities ?? [];
  if (opps.length === 0) {
    return renderEmptyStateSlide(3, {
      title: "Top opportunities",
      eyebrow: "Section 03 · Opportunities",
      message: "No opportunities detected. The page is well-optimised.",
    });
  }
  const top = [...opps]
    .sort((a, b) => (b.wastedMs ?? 0) - (a.wastedMs ?? 0))
    .slice(0, 5)
    .map((o) => ({ label: o.title, value: o.wastedMs ?? 0, suffix: "ms saved" }));

  const chart = renderHorizontalBars(top, {
    width: 1500,
    barHeight: 56,
    gap: 16,
    ariaLabel: "Top 5 performance opportunities ranked by potential savings",
  });

  const totalSavings = top.reduce((s, t) => s + t.value, 0);
  const inner = `  <h2 class="slide-title">Top opportunities</h2>
  <p class="slide-subtitle">Up to <strong>${String(Math.round(totalSavings))} ms</strong> of potential savings identified across ${String(opps.length)} opportunity${opps.length === 1 ? "" : "ies"}.</p>
  <div class="slide-body" style="margin-top:24px;">${chart}</div>
  <footer class="slide-footer"><span>Sorted by wastedMs · top 5 shown</span><span>OhMyPerf</span></footer>`;
  return slideWrapper(3, inner, { eyebrow: "Section 03 · Opportunities" });
}
