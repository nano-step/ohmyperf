import type { Report } from "@ohmyperf/core";
import { renderCwvCard } from "../charts/cwv-traffic-light.js";

const CWV_ORDER: ReadonlyArray<string> = ["lcp", "inp", "cls", "fcp", "ttfb", "tbt"];
const UNSTABLE_COV_THRESHOLD = 0.2;

export function renderCwvGrid(report: Report): string {
  const cards: string[] = [];
  for (const metric of CWV_ORDER) {
    const agg = report.aggregated[metric];
    if (!agg) continue;
    const unstable = agg.cov > UNSTABLE_COV_THRESHOLD;
    cards.push(renderCwvCard(agg, { metric, unstable }));
  }
  if (cards.length === 0) return "";
  return `<section class="cwv-grid" aria-label="Core Web Vitals">${cards.join("")}</section>`;
}
