import type { Report } from "@ohmyperf/core";
import { escapeHtml, escapeJsonForHtml } from "@ohmyperf/viewer/escape";
import { DECK_CSS, DECK_NAV_SCRIPT } from "./styles.js";

export interface RenderDeckShellOptions {
  readonly title: string;
  readonly report: Report;
  readonly embedReportPayload?: boolean;
}

export function renderDeckShell(slides: ReadonlyArray<string>, opts: RenderDeckShellOptions): string {
  const slideCount = slides.length;
  const numbered = slides
    .map((s, i) => {
      const counter = `${String(i + 1).padStart(2, "0")} / ${String(slideCount).padStart(2, "0")}`;
      return s.replace("__SLIDE_INDEX__", String(i + 1)).replace("__SLIDE_COUNTER__", counter);
    })
    .join("\n");
  const embed = opts.embedReportPayload !== false;
  return `<!doctype html>
<html lang="en" class="theme-light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="generator" content="@ohmyperf/reporter-deck 0.0.0-pre" />
<meta name="referrer" content="no-referrer" />
<title>${escapeHtml(opts.title)}</title>
<style>${DECK_CSS}</style>
</head>
<body>
<main class="deck" id="deck">
${numbered}
</main>
<nav class="deck-nav" aria-label="Slide navigation">
  <button class="prev" type="button" aria-label="Previous slide">‹</button>
  <span class="counter" aria-live="polite">1 / ${String(slideCount)}</span>
  <button class="next" type="button" aria-label="Next slide">›</button>
</nav>
${embed ? `<script type="application/json" id="ohmyperf-report-payload">${escapeJsonForHtml(opts.report)}</script>` : ""}
<script>${DECK_NAV_SCRIPT}</script>
</body>
</html>
`;
}

export function slideWrapper(
  index: number,
  inner: string,
  opts: { eyebrow?: string } = {},
): string {
  const eyebrow = opts.eyebrow ? `<div class="slide-eyebrow">${escapeHtml(opts.eyebrow)}</div>` : "";
  return `<section class="slide" id="slide-__SLIDE_INDEX__" data-slide-counter="__SLIDE_COUNTER__" aria-label="Slide ${String(index)}">
  <div class="accent-stripe" aria-hidden="true"></div>
  ${eyebrow}
${inner}
</section>`;
}
