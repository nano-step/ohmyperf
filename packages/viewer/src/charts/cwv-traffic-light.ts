import type { AggregatedMetric } from "@ohmyperf/core";
import { escapeHtml } from "../escape.js";
import {
  classifyCwv,
  cwvStatusIcon,
  cwvStatusLabel,
  formatCwvThreshold,
  formatCwvValue,
} from "./cwv-thresholds.js";

export interface CwvCardOptions {
  readonly metric: string;
  readonly displayName?: string;
  readonly unstable?: boolean;
}

export function renderCwvCard(
  agg: AggregatedMetric | undefined,
  opts: CwvCardOptions,
): string {
  const metric = opts.metric.toLowerCase();
  const displayName = opts.displayName ?? metric.toUpperCase();
  const value = agg ? agg.median : Number.NaN;
  const status = classifyCwv(metric, value);
  const valueStr = agg ? formatCwvValue(metric, value) : "—";
  const thresholdStr = formatCwvThreshold(metric);
  const subParts: string[] = [];
  if (thresholdStr) subParts.push(thresholdStr);
  if (agg && agg.runs > 1) subParts.push(`p75 ${formatCwvValue(metric, agg.p75)}`);
  if (agg) subParts.push(`n=${String(agg.runs)} · CoV ${(agg.cov * 100).toFixed(1)}%`);
  const unstableClass = opts.unstable ? " unstable" : "";
  return `<article class="cwv-card${unstableClass}" data-cwv-status="${escapeHtml(status)}" role="group" aria-label="${escapeHtml(displayName)} ${escapeHtml(cwvStatusLabel(status))}">
  <div class="name">${escapeHtml(displayName)}</div>
  <div class="value">${escapeHtml(valueStr)}</div>
  <div class="sub">${escapeHtml(subParts.join(" · "))}</div>
  <div class="icon" aria-hidden="true">${escapeHtml(cwvStatusIcon(status))}</div>
</article>`;
}
