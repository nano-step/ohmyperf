import type { Report } from "@ohmyperf/core";
import { BRAND_MANIFEST, getBrandCss, resolveTheme, type BrandId } from "@ohmyperf/design-tokens";
import { escapeHtml, escapeJsonForHtml } from "@ohmyperf/viewer/escape";
import { DECK_CSS, DECK_NAV_SCRIPT } from "./styles.js";

export interface RenderDeckShellOptions {
  readonly title: string;
  readonly report: Report;
  readonly embedReportPayload?: boolean;
  readonly style?: BrandId;
  readonly theme?: "light" | "dark" | "system";
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
  const style: BrandId = opts.style ?? "calibre";
  const resolvedTheme = resolveTheme(style, { theme: opts.theme ?? "system" });
  const overlayCss = getBrandCss(style, resolvedTheme);
  const isCalibre = style === "calibre";
  const manifest = BRAND_MANIFEST[style];
  const attributionComment = isCalibre
    ? ""
    : `<!-- Styled like ${style} via Open Design Library (Apache-2.0) · upstream ${manifest.upstreamSha ?? "n/a"} -->`;

  return `<!doctype html>
<html lang="en" class="theme-${resolvedTheme}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="generator" content="@ohmyperf/reporter-deck 0.0.0-pre" />
<meta name="referrer" content="no-referrer" />
<meta name="ohmyperf-style" content="${escapeHtml(style)}" />
<title>${escapeHtml(opts.title)}</title>
<style>${DECK_CSS}
${overlayCss}</style>
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
${attributionComment}
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
