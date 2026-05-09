export const VIEWER_CSS = `
*, *::before, *::after { box-sizing: border-box; }
:root {
  color-scheme: light dark;
  --bg: #f7f7f8;
  --panel: #ffffff;
  --border: #e5e7eb;
  --muted: #6b7280;
  --text: #111827;
  --accent: #4338ca;
  --good: #15803d;
  --warn: #b45309;
  --bad: #b91c1c;
  --code-bg: #f3f4f6;
  --code-border: #e5e7eb;
  --table-stripe: #fafafa;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b1020;
    --panel: #111827;
    --border: #1f2937;
    --muted: #94a3b8;
    --text: #e5e7eb;
    --accent: #818cf8;
    --good: #4ade80;
    --warn: #fbbf24;
    --bad: #f87171;
    --code-bg: #0f172a;
    --code-border: #1f2937;
    --table-stripe: #0d1525;
  }
}
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  padding: 24px;
}
.container { max-width: 1100px; margin: 0 auto; }
h1, h2, h3 { margin-top: 0; }
h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
h2 { font-size: 16px; font-weight: 600; margin: 28px 0 12px; letter-spacing: -0.005em; }
h3 { font-size: 13px; font-weight: 600; margin: 0 0 8px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
.muted { color: var(--muted); }
.mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; font-size: 12.5px; }
.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 18px;
  margin-bottom: 16px;
}
.meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
}
.meta dt { color: var(--muted); }
.meta dd { margin: 0; word-break: break-all; }
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.tile {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
}
.tile .name { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
.tile .value { font-size: 22px; font-weight: 600; margin-top: 4px; }
.tile .sub { color: var(--muted); font-size: 11.5px; margin-top: 2px; }
.tile.unstable { border-color: var(--warn); }
.tile.unstable .sub { color: var(--warn); }
.unstable-banner {
  background: color-mix(in srgb, var(--warn) 15%, var(--panel));
  border-left: 3px solid var(--warn);
  padding: 12px 14px;
  border-radius: 6px;
  margin-bottom: 16px;
}
table { width: 100%; border-collapse: collapse; }
th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border); }
th { font-weight: 600; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
tbody tr:nth-child(even) { background: var(--table-stripe); }
.tag { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
.tag.pass { background: color-mix(in srgb, var(--good) 18%, transparent); color: var(--good); }
.tag.fail { background: color-mix(in srgb, var(--bad)  20%, transparent); color: var(--bad); }
.tag.warn { background: color-mix(in srgb, var(--warn) 20%, transparent); color: var(--warn); }
details { margin: 0; }
details > summary { cursor: pointer; font-weight: 600; padding: 6px 0; }
pre.code {
  background: var(--code-bg);
  border: 1px solid var(--code-border);
  border-radius: 8px;
  padding: 12px 14px;
  overflow-x: auto;
  white-space: pre;
  margin: 8px 0 0;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 12px;
}
.frame-tree ul { list-style: none; padding-left: 18px; margin: 4px 0; }
.frame-tree li { margin: 4px 0; }
.frame-tree .frame-url { color: var(--muted); font-family: ui-monospace, monospace; font-size: 11.5px; }
.foot { color: var(--muted); font-size: 12px; margin-top: 24px; }
.foot a { color: var(--accent); }
`;
