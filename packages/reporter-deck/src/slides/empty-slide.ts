import { escapeHtml } from "@ohmyperf/viewer/escape";
import { slideWrapper } from "../deck-shell.js";

export function renderEmptyStateSlide(
  index: number,
  opts: { title: string; eyebrow: string; message: string; icon?: string },
): string {
  const icon = opts.icon ?? "✓";
  const inner = `  <h2 class="slide-title">${escapeHtml(opts.title)}</h2>
  <div class="slide-body">
    <div class="empty-slide-body">
      <div class="empty-slide-icon" aria-hidden="true">${escapeHtml(icon)}</div>
      <p>${escapeHtml(opts.message)}</p>
    </div>
  </div>
  <footer class="slide-footer"><span>${escapeHtml(opts.eyebrow)}</span><span>OhMyPerf</span></footer>`;
  return slideWrapper(index, inner, { eyebrow: opts.eyebrow });
}
