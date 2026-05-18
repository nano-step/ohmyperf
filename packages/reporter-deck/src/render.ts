import type { Report } from "@ohmyperf/core";
import { renderDeckShell } from "./deck-shell.js";
import {
  renderCoverSlide,
  renderCwvSlide,
  renderLongTasksSlide,
  renderMethodologySlide,
  renderOpportunitiesSlide,
  renderThirdPartiesSlide,
} from "./slides/index.js";

export interface RenderDeckOptions {
  readonly title?: string;
  readonly embedReportPayload?: boolean;
}

export function renderReportDeck(report: Report, opts: RenderDeckOptions = {}): string {
  const title = opts.title ?? `OhMyPerf — ${shortenUrl(report.meta.url)}`;
  const slides = [
    renderCoverSlide(report),
    renderCwvSlide(report),
    renderOpportunitiesSlide(report),
    renderThirdPartiesSlide(report),
    renderLongTasksSlide(report),
    renderMethodologySlide(report),
  ];
  return renderDeckShell(slides, {
    title,
    report,
    ...(opts.embedReportPayload === false ? { embedReportPayload: false } : {}),
  });
}

function shortenUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return `${parsed.hostname}${parsed.pathname.length > 1 ? parsed.pathname : ""}`;
  } catch {
    return u;
  }
}
