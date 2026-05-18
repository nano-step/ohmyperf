import { PALETTE_CSS_LIGHT_ONLY } from "@ohmyperf/design-tokens";

const DECK_STRUCTURAL_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--color-background); color: var(--color-foreground); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif; }
.deck {
  scroll-snap-type: y mandatory;
  overflow-y: auto;
  height: 100vh;
  width: 100vw;
  background: var(--color-muted);
}
.slide {
  width: 1920px;
  height: 1080px;
  transform: scale(var(--fit, 1));
  transform-origin: top left;
  background: var(--color-background);
  color: var(--color-foreground);
  padding: 80px 96px;
  display: grid;
  grid-template-columns: repeat(16, 1fr);
  grid-template-rows: max-content 1fr max-content;
  gap: 24px;
  scroll-snap-align: start;
  position: relative;
  margin: 0 auto;
}
.slide::after {
  content: attr(data-slide-counter);
  position: absolute;
  right: 56px;
  bottom: 40px;
  font-size: 18px;
  color: var(--color-muted-foreground);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
}
.slide .accent-stripe {
  grid-column: 1 / -1;
  height: 6px;
  background: var(--color-accent-primary);
  border-radius: 3px;
  align-self: start;
}
.slide .slide-eyebrow {
  grid-column: 1 / -1;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-accent-primary);
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.slide h1.slide-title {
  grid-column: 1 / -1;
  font-size: 76px;
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-weight: 700;
  margin: 0;
}
.slide h2.slide-title {
  grid-column: 1 / -1;
  font-size: 56px;
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-weight: 700;
  margin: 0;
}
.slide .slide-subtitle {
  grid-column: 1 / -1;
  font-size: 24px;
  color: var(--color-muted-foreground);
  line-height: 1.4;
  margin: 0;
}
.slide .slide-body { grid-column: 1 / -1; align-self: start; }
.slide .slide-footer {
  grid-column: 1 / -1;
  align-self: end;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 16px;
  color: var(--color-muted-foreground);
  border-top: 1px solid var(--color-border);
  padding-top: 18px;
}
.deck-nav {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  font-size: 13px;
  z-index: 10;
}
.deck-nav button {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-foreground);
  font-size: 14px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
}
.deck-nav button:hover { background: var(--color-muted); }
.deck-nav .counter { font-variant-numeric: tabular-nums; letter-spacing: 0.06em; color: var(--color-muted-foreground); }
.cwv-grid-large {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 28px;
  width: 100%;
  margin-top: 16px;
}
.cwv-tile {
  border: 1px solid var(--color-border);
  border-left-width: 6px;
  border-radius: 12px;
  padding: 28px 32px;
  background: var(--color-card);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.cwv-tile[data-cwv-status="good"] { border-left-color: var(--color-accent-success); }
.cwv-tile[data-cwv-status="needs-improvement"] { border-left-color: var(--color-accent-warning); }
.cwv-tile[data-cwv-status="poor"] { border-left-color: var(--color-accent-danger); }
.cwv-tile[data-cwv-status="unknown"] { border-left-color: var(--color-border); }
.cwv-tile .label { font-size: 16px; color: var(--color-muted-foreground); letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; }
.cwv-tile .value { font-size: 84px; font-weight: 700; line-height: 1; letter-spacing: -0.03em; margin-top: 20px; }
.cwv-tile .meta { font-size: 16px; color: var(--color-muted-foreground); margin-top: 14px; display: flex; gap: 16px; align-items: center; }
.cwv-tile .icon { font-size: 32px; line-height: 1; }
.cwv-tile[data-cwv-status="good"] .icon { color: var(--color-accent-success); }
.cwv-tile[data-cwv-status="needs-improvement"] .icon { color: var(--color-accent-warning); }
.cwv-tile[data-cwv-status="poor"] .icon { color: var(--color-accent-danger); }
.kv-table { width: 100%; border-collapse: collapse; font-size: 22px; }
.kv-table th, .kv-table td { text-align: left; padding: 16px 0; border-bottom: 1px solid var(--color-border); }
.kv-table th { font-weight: 600; color: var(--color-muted-foreground); font-size: 16px; text-transform: uppercase; letter-spacing: 0.1em; }
.kv-table td.mono { font-family: ui-monospace, monospace; font-size: 18px; }
.summary-line { grid-column: 1 / -1; font-size: 22px; line-height: 1.5; color: var(--color-foreground); margin-top: 12px; max-width: 70ch; }
.summary-line strong { color: var(--color-accent-primary); font-weight: 600; }
.empty-slide-body {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 60px 0;
}
.empty-slide-icon { font-size: 96px; color: var(--color-accent-success); line-height: 1; }
.empty-slide-body p { font-size: 28px; color: var(--color-muted-foreground); margin: 0; text-align: center; }
.deck-third-parties { display: grid; grid-template-columns: 320px 1fr; gap: 64px; align-items: start; }
.deck-third-parties .legend { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; font-size: 20px; }
.deck-third-parties .legend li { display: flex; align-items: center; gap: 14px; }
.deck-third-parties .legend .swatch { width: 18px; height: 18px; border-radius: 4px; flex-shrink: 0; }
.deck-third-parties .legend .pct { color: var(--color-muted-foreground); font-variant-numeric: tabular-nums; min-width: 100px; text-align: right; }
@page { size: 1920px 1080px landscape; margin: 0; }
@media print {
  html, body { background: #fff; color: #000; }
  .deck { overflow: visible; height: auto; width: auto; scroll-snap-type: none; }
  .slide {
    transform: none;
    page-break-after: always;
    margin: 0;
    box-shadow: none;
  }
  .slide:last-of-type { page-break-after: auto; }
  .deck-nav { display: none; }
  .cwv-tile[data-cwv-status="good"] .label::after { content: " (good)"; }
  .cwv-tile[data-cwv-status="needs-improvement"] .label::after { content: " (needs improvement)"; }
  .cwv-tile[data-cwv-status="poor"] .label::after { content: " (poor)"; }
  .cwv-tile .icon { color: #000 !important; }
}
`;

export const DECK_CSS = `${PALETTE_CSS_LIGHT_ONLY}
${DECK_STRUCTURAL_CSS}`;

export const DECK_NAV_SCRIPT = `(() => {
  const slides = Array.from(document.querySelectorAll('section.slide'));
  if (slides.length === 0) return;
  const counter = document.querySelector('.deck-nav .counter');
  const fit = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.min(vw / 1920, vh / 1080);
    document.documentElement.style.setProperty('--fit', String(scale));
  };
  const update = (idx) => {
    if (counter) counter.textContent = (idx + 1) + ' / ' + slides.length;
    const target = slides[idx];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const indexFromHash = () => {
    const m = /#slide-(\\d+)/.exec(location.hash);
    if (!m) return 0;
    return Math.max(0, Math.min(slides.length - 1, parseInt(m[1], 10) - 1));
  };
  let current = indexFromHash();
  const goTo = (idx) => {
    current = Math.max(0, Math.min(slides.length - 1, idx));
    history.replaceState(null, '', '#slide-' + (current + 1));
    update(current);
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); goTo(current + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goTo(current - 1); }
    else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
    else if (e.key === 'End') { e.preventDefault(); goTo(slides.length - 1); }
  });
  document.querySelector('.deck-nav .prev')?.addEventListener('click', () => goTo(current - 1));
  document.querySelector('.deck-nav .next')?.addEventListener('click', () => goTo(current + 1));
  window.addEventListener('resize', fit);
  window.addEventListener('hashchange', () => goTo(indexFromHash()));
  fit();
  update(current);
})();`;
