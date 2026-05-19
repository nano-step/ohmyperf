import { PALETTE_CSS } from "@ohmyperf/design-tokens";

const DECK_STRUCTURAL_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; /* token-unsafe: css-reset */ padding: 0; /* token-unsafe: css-reset */ background: var(--color-background); color: var(--color-foreground); font-family: var(--font-display); }
.deck {
  scroll-snap-type: y mandatory;
  overflow-y: auto;
  height: 100vh;
  width: 100vw;
  background: var(--surface-warm);
}
.slide {
  width: 1920px;
  height: 1080px;
  transform: scale(var(--fit, 1));
  transform-origin: top left;
  background: var(--color-background);
  color: var(--color-foreground);
  padding: 80px 96px; /* token-unsafe: slide canvas padding — fixed presentation canvas units not screen spacing tokens */
  display: grid;
  grid-template-columns: repeat(16, 1fr);
  grid-template-rows: max-content 1fr max-content;
  gap: var(--space-6);
  scroll-snap-align: start;
  position: relative;
  margin: 0 /* token-unsafe: css-reset */ auto;
}
.slide::after {
  content: attr(data-slide-counter);
  position: absolute;
  right: 56px; /* token-unsafe: slide canvas position — fixed presentation canvas units */
  bottom: 40px; /* token-unsafe: slide canvas position — fixed presentation canvas units */
  font-size: var(--text-lg);
  color: var(--meta);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em; /* token-unsafe: slide counter label tracking */
}
.slide .accent-stripe {
  grid-column: 1 / -1;
  height: 6px; /* token-unsafe: visual accent bar height — not a spacing token */
  background: var(--accent);
  border-radius: 3px; /* token-unsafe: tiny indicator — not a card/surface radius */
  align-self: start;
}
.slide .slide-eyebrow {
  grid-column: 1 / -1;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.18em; /* token-unsafe: eyebrow tracking — above schema range by design */
  text-transform: uppercase;
}
.slide h1.slide-title {
  grid-column: 1 / -1;
  font-size: 76px; /* token-unsafe: slide hero H1 — beyond --text-4xl; presentation canvas size, not screen token */
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-display);
  font-weight: 700;
  margin: 0; /* token-unsafe: heading reset */
}
.slide h2.slide-title {
  grid-column: 1 / -1;
  font-size: 56px; /* token-unsafe: slide H2 — aligns with --text-4xl but presentation canvas specific */
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-display);
  font-weight: 700;
  margin: 0; /* token-unsafe: heading reset */
}
.slide .slide-subtitle {
  grid-column: 1 / -1;
  font-size: var(--text-xl);
  color: var(--meta);
  line-height: 1.4; /* token-unsafe: slide subtitle rhythm — between leading-tight and leading-body */
  margin: 0; /* token-unsafe: heading reset */
}
.slide .slide-body { grid-column: 1 / -1; align-self: start; }
.slide .slide-footer {
  grid-column: 1 / -1;
  align-self: end;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: var(--text-base);
  color: var(--meta);
  border-top: 1px solid var(--border);
  padding-top: var(--space-4);
}
.deck-nav {
  position: fixed;
  bottom: var(--space-4);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  box-shadow: var(--elev-raised);
  font-size: 13px; /* token-unsafe: 0.5-step */
  z-index: 10;
}
.deck-nav button {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--color-foreground);
  font-size: var(--text-sm);
  width: 28px; /* token-unsafe: nav button fixed size — not a spacing token */
  height: 28px; /* token-unsafe: nav button fixed size — not a spacing token */
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.deck-nav button:hover { background: var(--surface-warm); }
.deck-nav .counter { font-variant-numeric: tabular-nums; letter-spacing: 0.06em; /* token-unsafe: counter tracking */ color: var(--meta); }
.cwv-grid-large {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 28px; /* token-unsafe: slide canvas grid gap — between --space-6 (24) and --space-8 (32), presentation canvas specific */
  width: 100%;
  margin-top: var(--space-4);
}
.cwv-tile {
  border: 1px solid var(--border);
  border-left-width: 6px; /* token-unsafe: accent stripe left border — not a spacing/shadow token */
  border-radius: var(--radius-lg);
  padding: 28px var(--space-8); /* token-unsafe: 28px between --space-6 and --space-8, slide canvas density */
  background: var(--surface);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: var(--elev-raised);
}
.cwv-tile[data-cwv-status="good"] { border-left-color: var(--success); }
.cwv-tile[data-cwv-status="needs-improvement"] { border-left-color: var(--warn); }
.cwv-tile[data-cwv-status="poor"] { border-left-color: var(--danger); }
.cwv-tile[data-cwv-status="unknown"] { border-left-color: var(--border); }
.cwv-tile .label { font-size: var(--text-base); color: var(--meta); letter-spacing: 0.12em; /* token-unsafe: tile label tracking */ text-transform: uppercase; font-weight: 600; }
.cwv-tile .value { font-size: 84px; /* token-unsafe: slide metric value — presentation canvas size far beyond schema */ font-weight: 700; line-height: 1; letter-spacing: -0.03em; /* token-unsafe: metric value compression */ margin-top: var(--space-5); }
.cwv-tile .meta { font-size: var(--text-base); color: var(--meta); margin-top: var(--space-3); display: flex; gap: var(--space-4); align-items: center; }
.cwv-tile .icon { font-size: var(--space-8); line-height: 1; /* token-unsafe: icon line-height 1 = unitless reset */ }
.cwv-tile[data-cwv-status="good"] .icon { color: var(--success); }
.cwv-tile[data-cwv-status="needs-improvement"] .icon { color: var(--warn); }
.cwv-tile[data-cwv-status="poor"] .icon { color: var(--danger); }
.kv-table { width: 100%; border-collapse: collapse; font-size: 22px; /* token-unsafe: slide KV table size — presentation canvas density */ }
.kv-table th, .kv-table td { text-align: left; padding: var(--space-4) 0; border-bottom: 1px solid var(--border); }
.kv-table th { font-weight: 600; color: var(--meta); font-size: var(--text-base); text-transform: uppercase; letter-spacing: 0.1em; /* token-unsafe: KV header tracking */ }
.kv-table td.mono { font-family: var(--font-mono); font-size: var(--text-lg); }
.summary-line { grid-column: 1 / -1; font-size: 22px; /* token-unsafe: slide summary — between --text-xl (24) and --text-lg (18), presentation canvas */ line-height: var(--leading-body); color: var(--color-foreground); margin-top: var(--space-3); max-width: 70ch; }
.summary-line strong { color: var(--accent); font-weight: 600; }
.empty-slide-body {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: 60px 0; /* token-unsafe: slide canvas padding — between --space-12 (48px) and section-y values */
}
.empty-slide-icon { font-size: 96px; /* token-unsafe: slide icon — presentation canvas size */ color: var(--success); line-height: 1; }
.empty-slide-body p { font-size: 28px; /* token-unsafe: slide body — between --text-xl (24px) and --text-2xl (32px), presentation canvas */ color: var(--meta); margin: 0; /* token-unsafe: paragraph reset */ text-align: center; }
.deck-third-parties { display: grid; grid-template-columns: 320px 1fr; gap: 64px; /* token-unsafe: slide layout column gap — section-y-desktop scale, presentation canvas */ align-items: start; }
.deck-third-parties .legend { list-style: none; padding: 0; /* token-unsafe: css-reset */ margin: 0; /* token-unsafe: css-reset */ display: flex; flex-direction: column; gap: var(--space-3); font-size: 20px; /* token-unsafe: slide legend — between --text-lg (18px) and --text-xl (24px), presentation canvas */ }
.deck-third-parties .legend li { display: flex; align-items: center; gap: var(--space-3); }
.deck-third-parties .legend .swatch { width: var(--space-4); height: var(--space-4); border-radius: var(--radius-sm); flex-shrink: 0; }
.deck-third-parties .legend .pct { color: var(--meta); font-variant-numeric: tabular-nums; min-width: 100px; /* token-unsafe: fixed table alignment width */ text-align: right; }
@page { size: 1920px 1080px landscape; margin: 0; /* token-unsafe: @page reset — print layout directive */ }
@media print {
  html, body { background: #fff; color: #000; }
  .deck { overflow: visible; height: auto; width: auto; scroll-snap-type: none; }
  .slide {
    transform: none;
    page-break-after: always;
    margin: 0; /* token-unsafe: print slide reset */
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

export const DECK_CSS = `${PALETTE_CSS}
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
