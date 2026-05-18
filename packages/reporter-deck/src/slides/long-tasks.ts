import type { Report } from "@ohmyperf/core";
import { renderHorizontalBars } from "@ohmyperf/viewer/charts";
import { escapeHtml } from "@ohmyperf/viewer/escape";
import { slideWrapper } from "../deck-shell.js";
import { renderEmptyStateSlide } from "./empty-slide.js";

export function renderLongTasksSlide(report: Report): string {
  const firstRun = report.runs[0];
  const tasks = firstRun ? firstRun.longTasks : [];
  if (tasks.length === 0) {
    return renderEmptyStateSlide(5, {
      title: "Long tasks",
      eyebrow: "Section 05 · Long tasks",
      message: "No long tasks recorded. The main thread stayed responsive.",
    });
  }
  const top = [...tasks].sort((a, b) => b.duration - a.duration).slice(0, 5);
  const items = top.map((t) => ({
    label: t.attributionRich?.url ? labelFromUrl(t.attributionRich.url) : t.attribution,
    value: t.duration,
    suffix: "ms",
  }));
  const chart = renderHorizontalBars(items, {
    width: 1500,
    barHeight: 56,
    gap: 16,
    ariaLabel: "Top 5 long tasks ranked by duration",
  });
  const totalMs = top.reduce((s, t) => s + t.duration, 0);
  const inner = `  <h2 class="slide-title">Long tasks</h2>
  <p class="slide-subtitle"><strong>${escapeHtml(String(tasks.length))}</strong> task${tasks.length === 1 ? "" : "s"} ≥ 50 ms blocked the main thread for a total of <strong>${escapeHtml(String(Math.round(totalMs)))} ms</strong>.</p>
  <div class="slide-body" style="margin-top:24px;">${chart}</div>
  <footer class="slide-footer"><span>Top 5 shown · sorted by duration</span><span>OhMyPerf</span></footer>`;
  return slideWrapper(5, inner, { eyebrow: "Section 05 · Long tasks" });
}

function labelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 1 ? u.pathname : "";
    return `${u.hostname}${path}`;
  } catch {
    return url;
  }
}
