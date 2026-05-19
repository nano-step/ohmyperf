import { PALETTE_CSS } from "@ohmyperf/design-tokens";

const STRUCTURAL_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; /* token-unsafe: css-reset */ padding: 0; /* token-unsafe: css-reset */ }
body {
  background: var(--color-background);
  color: var(--color-foreground);
  font: var(--text-sm)/var(--leading-body) var(--font-display);
  padding: var(--space-6);
}
.container { max-width: var(--container-max); margin: 0 /* token-unsafe: css-reset */ auto; }
h1, h2, h3 { margin-top: 0; }
h1 { font-size: var(--text-xl); font-weight: 600; letter-spacing: var(--tracking-display); margin-bottom: var(--space-1); }
h2 { font-size: var(--text-base); font-weight: 600; margin: var(--space-8) 0 var(--space-3); letter-spacing: -0.005em; /* token-unsafe: 0.5-step between tracking-display and zero */ }
h3 { font-size: var(--text-xs); font-weight: 600; margin: 0 0 var(--space-2); color: var(--meta); text-transform: uppercase; letter-spacing: 0.06em; /* token-unsafe: heading-label tracking above schema range */ }
.muted { color: var(--meta); }
.mono { font-family: var(--font-mono); font-size: 12.5px; /* token-unsafe: 0.5-step between --text-xs and --text-sm */ }
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4) var(--space-5);
  margin-bottom: var(--space-4);
  box-shadow: var(--elev-raised);
}
.hero { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-5) var(--space-6); margin-bottom: var(--space-5); box-shadow: var(--elev-raised); }
.hero h1 { color: var(--color-foreground); }
.hero .url { color: var(--meta); font-family: var(--font-mono); font-size: 13px; /* token-unsafe: 0.5-step between --text-xs and --text-sm */ word-break: break-all; margin: var(--space-1) 0 var(--space-3) 0; }
.hero .badges { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
.badge { display: inline-flex; align-items: center; gap: 6px; /* token-unsafe: tiny gap between badge icon and label */ padding: 3px /* token-unsafe: 0.75-step */ var(--space-2); border-radius: var(--radius-pill); font-size: var(--text-xs); font-weight: 500; background: var(--surface-warm); color: var(--color-foreground); border: 1px solid var(--border); }
.badge.accent { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
.meta { display: grid; grid-template-columns: max-content 1fr; row-gap: var(--space-1); column-gap: var(--space-4); }
.meta dt { color: var(--meta); }
.meta dd { margin: 0; /* token-unsafe: dl reset */ word-break: break-all; }
.cwv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}
.cwv-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  border-left-width: 4px; /* token-unsafe: accent-stripe left border — not a shadow/elevation, structural rule */
  position: relative;
  box-shadow: var(--elev-raised);
}
.cwv-card .name { color: var(--meta); font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; /* token-unsafe: label tracking above schema range */ }
.cwv-card .value { font-size: 26px; /* token-unsafe: data value — between --text-xl (24px) and --text-2xl (32px), intentional mid-step */ font-weight: 600; margin-top: 6px; /* token-unsafe: tight gap within card cell */ letter-spacing: -0.02em; /* token-unsafe: numeric display tracking, brand-neutral */ }
.cwv-card .sub { color: var(--meta); font-size: 11.5px; /* token-unsafe: 0.5-step between --text-xs and --text-sm */ margin-top: var(--space-1); }
.cwv-card .icon { position: absolute; top: var(--space-3); right: var(--space-4); font-size: var(--text-base); line-height: 1; /* token-unsafe: icon line-height 1 = unitless reset, no token equivalent */ }
.cwv-card[data-cwv-status="good"] { border-left-color: var(--success); }
.cwv-card[data-cwv-status="good"] .icon { color: var(--success); }
.cwv-card[data-cwv-status="needs-improvement"] { border-left-color: var(--warn); }
.cwv-card[data-cwv-status="needs-improvement"] .icon { color: var(--warn); }
.cwv-card[data-cwv-status="poor"] { border-left-color: var(--danger); }
.cwv-card[data-cwv-status="poor"] .icon { color: var(--danger); }
.cwv-card[data-cwv-status="unknown"] { border-left-color: var(--border); }
.cwv-card.unstable { border-style: dashed; }
.unstable-banner {
  background: color-mix(in srgb, var(--warn) 15%, var(--surface));
  border-left: 3px solid var(--warn);
  padding: var(--space-3) var(--space-3);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-4);
}
.empty-state {
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4) var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
  color: var(--meta);
  font-size: 13px; /* token-unsafe: 0.5-step between --text-xs and --text-sm */
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.empty-state[data-tone="success"] {
  border-color: color-mix(in srgb, var(--success) 35%, transparent);
  background: color-mix(in srgb, var(--success) 5%, var(--surface));
}
.empty-state .icon { color: var(--success); font-weight: 600; }
.third-parties { display: grid; grid-template-columns: 240px 1fr; gap: var(--space-6); align-items: start; }
.third-parties svg { display: block; }
.third-parties .legend { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; /* token-unsafe: tight gap between legend items */ }
.third-parties .legend li { display: flex; align-items: center; gap: var(--space-2); font-size: 13px; /* token-unsafe: 0.5-step */ }
.third-parties .legend .swatch { width: var(--space-3); height: var(--space-3); border-radius: 3px; /* token-unsafe: tiny indicator — non-interactive chrome */ flex-shrink: 0; background: var(--surface-warm); }
.ohmyperf-donut [data-donut-empty="1"] { stroke: var(--surface-warm); }
[data-donut-slice="0"] { stroke: var(--accent); background: var(--accent); }
[data-donut-slice="1"] { stroke: var(--success); background: var(--success); }
[data-donut-slice="2"] { stroke: var(--warn); background: var(--warn); }
[data-donut-slice="3"] { stroke: var(--danger); background: var(--danger); }
[data-donut-slice="4"] { stroke: var(--meta); background: var(--meta); }
[data-donut-slice="5"] { stroke: var(--fg); background: var(--fg); }
.ohmyperf-bars [data-bar="label"] { fill: var(--color-foreground); }
.ohmyperf-bars [data-bar="track"] { fill: var(--surface-warm); }
.ohmyperf-bars [data-bar="filled"] { fill: var(--accent); }
.ohmyperf-bars [data-bar="value-text"] { fill: var(--meta); }
.third-parties .legend .label { flex: 1; word-break: break-word; }
.third-parties .legend .pct { color: var(--meta); font-variant-numeric: tabular-nums; font-size: var(--text-xs); }
@media (max-width: 640px) { /* token-unsafe: breakpoint px — responsive rule, not spacing token */ .third-parties { grid-template-columns: 1fr; } }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 9px /* token-unsafe: 2.25-step between --space-2 (8px) and --space-3 (12px) — data table density */ var(--space-2); text-align: left; border-bottom: 1px solid var(--border); }
th { font-weight: 600; color: var(--meta); font-size: 11.5px; /* token-unsafe: 0.5-step */ text-transform: uppercase; letter-spacing: 0.05em; /* token-unsafe: table header tracking */ }
tbody tr:nth-child(even) { background: color-mix(in srgb, var(--surface-warm) 50%, transparent); }
.tag { display: inline-block; padding: 1px /* token-unsafe: 0.25-step */ var(--space-2); border-radius: var(--radius-pill); font-size: 11px; /* token-unsafe: below --text-xs 12px intentionally compact badge */ font-weight: 600; }
.tag.pass { background: color-mix(in srgb, var(--success) 18%, transparent); color: var(--success); }
.tag.fail { background: color-mix(in srgb, var(--danger)  20%, transparent); color: var(--danger); }
.tag.warn { background: color-mix(in srgb, var(--warn) 22%, transparent); color: var(--warn); }
details { margin: 0; /* token-unsafe: css-reset */ }
details > summary { cursor: pointer; font-weight: 600; padding: 6px /* token-unsafe: tight summary row padding */ 0; }
pre.code {
  background: var(--surface-warm);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-3);
  overflow-x: auto;
  white-space: pre;
  margin: var(--space-2) 0 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
.frame-tree ul { list-style: none; padding-left: var(--space-4); margin: var(--space-1) 0; }
.frame-tree li { margin: var(--space-1) 0; }
.frame-tree .frame-url { color: var(--meta); font-family: var(--font-mono); font-size: 11.5px; /* token-unsafe: 0.5-step */ }
.foot { color: var(--meta); font-size: var(--text-xs); margin-top: var(--space-8); }
.foot a { color: var(--accent); }
@media print {
  body { background: #fff; color: #000; padding: 12mm; /* token-unsafe: print-unit mm */ font-size: 11pt; /* token-unsafe: print-unit pt */ }
  .panel, .hero, .cwv-card, .empty-state { background: #fff; border-color: #888; box-shadow: none; }
  .cwv-card[data-cwv-status="good"]::after { content: " (good)"; }
  .cwv-card[data-cwv-status="needs-improvement"]::after { content: " (needs improvement)"; }
  .cwv-card[data-cwv-status="poor"]::after { content: " (poor)"; }
  .cwv-card .icon { color: #000 !important; }
  table { page-break-inside: avoid; }
  a[href]::after { content: " (" attr(href) ")"; font-size: 0.8em; /* token-unsafe: print relative em — proportional to print font size */ color: #555; }
  .foot { color: #555; }
  details > summary { font-weight: 600; }
  details:not([open]) > *:not(summary) { display: none; }
}
`;

export { STRUCTURAL_CSS };

export const VIEWER_CSS = `${PALETTE_CSS}
${STRUCTURAL_CSS}`;
