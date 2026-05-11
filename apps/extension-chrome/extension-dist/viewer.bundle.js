// ../../packages/viewer/dist/escape.js
var HTML_REPLACEMENTS = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
function escapeHtml(value) {
  if (value === null || value === void 0)
    return "";
  const s = typeof value === "string" ? value : String(value);
  return s.replace(/[&<>"']/g, (ch) => HTML_REPLACEMENTS[ch] ?? ch);
}
function escapeJsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

// ../../packages/viewer/dist/styles.js
var VIEWER_CSS = `
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

// ../../packages/viewer/dist/render.js
var HEADLINE_METRICS = [
  { name: "lcp", unit: "ms", digits: 1 },
  { name: "fcp", unit: "ms", digits: 1 },
  { name: "ttfb", unit: "ms", digits: 1 },
  { name: "inp", unit: "ms", digits: 1 },
  { name: "cls", unit: "score", digits: 3 },
  { name: "tbt", unit: "ms", digits: 1 }
];
var UNSTABLE_COV_THRESHOLD = 0.2;
function renderReportHtml(report, opts = {}) {
  const title = opts.title ?? `OhMyPerf \u2014 ${shortenUrl(report.meta.url)}`;
  const embedPayload = opts.embedReportPayload !== false;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="generator" content="@ohmyperf/viewer 0.0.0-pre" />
<meta name="referrer" content="no-referrer" />
<title>${escapeHtml(title)}</title>
<style>${VIEWER_CSS}</style>
</head>
<body>
<div class="container">
  ${renderHeader(report)}
  ${renderUnstableBanner(report)}
  ${renderTiles(report)}
  ${renderAudits(report.audits)}
  ${renderResources(report)}
  ${renderFrameTree(report)}
  ${renderRunsTable(report)}
  ${renderPluginData(report.pluginData)}
  ${renderRawJson(report)}
  <p class="foot">
    Generated by <code>@ohmyperf/viewer</code>. This file is self-contained:
    no external network requests are made when you open it.
  </p>
</div>
${embedPayload ? renderInlineReport(report) : ""}
</body>
</html>
`;
}
function renderHeader(report) {
  const m = report.meta;
  return `<div class="panel">
  <h1>OhMyPerf v${escapeHtml(report.schemaVersion)} report</h1>
  <dl class="meta">
    <dt>URL</dt><dd class="mono">${escapeHtml(m.url)}</dd>
    <dt>Started</dt><dd>${escapeHtml(m.startedAt)}</dd>
    <dt>Duration</dt><dd>${escapeHtml(`${String(m.durationMs)} ms`)}</dd>
    <dt>Mode</dt><dd>${escapeHtml(m.mode)} \xB7 runs=${escapeHtml(String(m.runs))} \xB7 ${escapeHtml(m.parity.mode)}</dd>
    <dt>Browser</dt><dd>${escapeHtml(`${m.browser.name} ${m.browser.version} (${m.browser.source})`)}</dd>
    <dt>Host</dt><dd>${escapeHtml(`${m.host.os} (${m.host.arch}) \xB7 Node ${m.host.nodeVersion}`)}</dd>
    <dt>Measurement ID</dt><dd class="mono">${escapeHtml(m.measurementId)}</dd>
  </dl>
</div>`;
}
function renderUnstableBanner(report) {
  const unstable = isUnstable(report);
  if (!unstable)
    return "";
  return `<div class="unstable-banner">
  <strong>Unstable run.</strong> At least one Core Web Vital has CoV &gt; ${escapeHtml(String(UNSTABLE_COV_THRESHOLD * 100))}% across the ${escapeHtml(String(report.runs.length))} run(s). Increase <code>--runs</code> or use <code>--mode ci-stable</code> for budget gating.
</div>`;
}
function isUnstable(report) {
  if (report.meta.unstable === true)
    return true;
  for (const name of ["lcp", "cls", "inp", "fcp", "ttfb"]) {
    const agg = report.aggregated[name];
    if (agg && Number.isFinite(agg.cov) && agg.cov > UNSTABLE_COV_THRESHOLD)
      return true;
  }
  return false;
}
function renderTiles(report) {
  const tiles = HEADLINE_METRICS.map(({ name, unit, digits }) => {
    const agg = report.aggregated[name];
    return renderTile(name, agg, unit, digits);
  }).filter((s) => s.length > 0).join("\n");
  if (tiles.length === 0)
    return "";
  return `<h2>Aggregated metrics</h2>
<div class="tiles">
${tiles}
</div>`;
}
function renderTile(name, agg, unit, digits) {
  if (!agg)
    return "";
  const unstable = Number.isFinite(agg.cov) && agg.cov > UNSTABLE_COV_THRESHOLD;
  const median = agg.median.toFixed(digits);
  const display = unit === "ms" ? `${median} ms` : median;
  const cov = Number.isFinite(agg.cov) ? `${(agg.cov * 100).toFixed(1)}%` : "\u2014";
  return `  <div class="tile${unstable ? " unstable" : ""}">
    <div class="name">${escapeHtml(name.toUpperCase())}</div>
    <div class="value">${escapeHtml(display)}</div>
    <div class="sub">cov ${escapeHtml(cov)} \xB7 n=${escapeHtml(String(agg.runs))}${unstable ? " \xB7 unstable" : ""}</div>
  </div>`;
}
function renderAudits(audits) {
  if (audits.length === 0)
    return "";
  const rows = audits.map((a) => {
    const status = a.passed ? "pass" : "fail";
    const label = a.passed ? "PASS" : "FAIL";
    return `    <tr>
      <td><span class="tag ${escapeHtml(status)}">${escapeHtml(label)}</span></td>
      <td class="mono">${escapeHtml(a.id)}</td>
      <td>${escapeHtml(a.title)}</td>
      <td>${a.score === null ? '<span class="muted">\u2014</span>' : escapeHtml(String(a.score))}</td>
    </tr>`;
  }).join("\n");
  return `<h2>Audits</h2>
<div class="panel" style="padding:0;overflow:hidden;">
  <table>
    <thead><tr><th>Status</th><th>ID</th><th>Title</th><th>Score</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
</div>`;
}
function renderResources(report) {
  const cold = report.runs.find((r) => r.cold);
  const warm = report.runs.find((r) => !r.cold);
  const sourceRun = warm ?? cold ?? report.runs[0];
  if (!sourceRun || sourceRun.resources.length === 0)
    return "";
  const resources = [...sourceRun.resources];
  resources.sort((a, b) => a.requestMs + a.responseMs - (b.requestMs + b.responseMs));
  const totalEncoded = resources.reduce((acc, r) => acc + (r.encodedSizeBytes || 0), 0);
  const totalTransfer = resources.reduce((acc, r) => acc + (r.transferSizeBytes || 0), 0);
  const renderBlocking = resources.filter((r) => r.renderBlocking).length;
  const summary = `${String(resources.length)} resources \xB7 ${formatBytes(totalEncoded)} encoded \xB7 ${formatBytes(totalTransfer)} transfer${renderBlocking > 0 ? ` \xB7 <span class="tag warn">${String(renderBlocking)} render-blocking</span>` : ""}`;
  const rows = resources.slice(0, 100).map((r) => {
    const totalMs = (r.requestMs + r.responseMs).toFixed(1);
    const dns = r.dnsMs !== void 0 ? r.dnsMs.toFixed(1) : "\u2014";
    const tcp = r.tcpMs !== void 0 ? r.tcpMs.toFixed(1) : "\u2014";
    const tls = r.tlsMs !== void 0 ? r.tlsMs.toFixed(1) : "\u2014";
    const tags = [];
    if (r.renderBlocking)
      tags.push(`<span class="tag warn">render-block</span>`);
    if (r.cacheHit)
      tags.push(`<span class="tag pass">cache</span>`);
    return `    <tr>
      <td class="mono" style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(r.url)}">${escapeHtml(r.url)}</td>
      <td>${escapeHtml(r.mimeType || "\u2014")}</td>
      <td class="mono">${escapeHtml(formatBytes(r.encodedSizeBytes))}</td>
      <td class="mono">${escapeHtml(totalMs)}</td>
      <td class="mono">${escapeHtml(dns)}/${escapeHtml(tcp)}/${escapeHtml(tls)}</td>
      <td>${tags.join(" ") || '<span class="muted">\u2014</span>'}</td>
    </tr>`;
  }).join("\n");
  const truncated = resources.length > 100 ? `<p class="muted" style="margin:8px 14px 12px;">Showing first 100 of ${String(resources.length)} resources.</p>` : "";
  return `<h2>Resources</h2>
<div class="panel" style="padding:0;overflow:hidden;">
  <p class="muted" style="margin:12px 14px 4px;">${summary}</p>
  <table>
    <thead><tr>
      <th>URL</th><th>Type</th><th>Size</th><th>Total ms</th><th>DNS/TCP/TLS</th><th>Tags</th>
    </tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  ${truncated}
</div>`;
}
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0)
    return "0 B";
  if (bytes < 1024)
    return `${String(Math.round(bytes))} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
function renderFrameTree(report) {
  const tree = report.frames;
  if (!tree.root || !tree.nodes[tree.root])
    return "";
  const html = renderFrameNode(tree.nodes, tree.root);
  return `<h2>Frame tree</h2>
<div class="panel frame-tree">
${html}
</div>`;
}
function renderFrameNode(nodes, frameId) {
  const node = nodes[frameId];
  if (!node)
    return "";
  const childrenHtml = node.children.length ? `<ul>${node.children.map((id) => `<li>${renderFrameNode(nodes, id)}</li>`).join("")}</ul>` : "";
  const tagBits = [];
  if (node.isOOPIF)
    tagBits.push("OOPIF");
  if (node.isCrossOrigin)
    tagBits.push("cross-origin");
  if (node.isSrcdoc)
    tagBits.push("srcdoc");
  if (node.isFenced)
    tagBits.push("fenced-frame");
  if (node.detachedAt !== void 0)
    tagBits.push("detached");
  const tags = tagBits.length ? ` <span class="tag warn">${escapeHtml(tagBits.join(" \xB7 "))}</span>` : "";
  const opaqueReason = node.inFrameMetrics?.available === false ? node.inFrameMetrics.reason : "";
  const opaque = opaqueReason ? ` <span class="tag warn">opaque: ${escapeHtml(opaqueReason)}</span>` : "";
  return `<div>
  <div><strong>${escapeHtml(node.frameId)}</strong>${tags}${opaque}</div>
  <div class="frame-url">${escapeHtml(node.url || "(empty)")}</div>
  ${childrenHtml}
</div>`;
}
function renderRunsTable(report) {
  if (report.runs.length === 0)
    return "";
  const metricNames = collectMetricNames(report);
  if (metricNames.length === 0)
    return "";
  const headerRow = `<tr><th>Run</th><th>Cold</th>${metricNames.map((n) => `<th class="mono">${escapeHtml(n)}</th>`).join("")}</tr>`;
  const bodyRows = report.runs.map((r) => {
    const cells = metricNames.map((n) => {
      const m = r.metrics[n];
      if (!m || !Number.isFinite(m.value))
        return `<td class="muted">\u2014</td>`;
      const digits = n === "cls" ? 3 : 1;
      return `<td class="mono">${escapeHtml(m.value.toFixed(digits))}</td>`;
    }).join("");
    return `<tr><td>${escapeHtml(String(r.runIndex))}</td><td>${r.cold ? `<span class="tag warn">cold</span>` : ""}</td>${cells}</tr>`;
  }).join("\n");
  return `<h2>Per-run values</h2>
<div class="panel" style="padding:0;overflow:hidden;">
  <table>
    <thead>${headerRow}</thead>
    <tbody>${bodyRows}</tbody>
  </table>
</div>`;
}
function collectMetricNames(report) {
  const seen = /* @__PURE__ */ new Set();
  for (const r of report.runs) {
    for (const k of Object.keys(r.metrics))
      seen.add(k);
  }
  return [...seen].sort();
}
function renderPluginData(pluginData) {
  const keys = Object.keys(pluginData);
  if (keys.length === 0)
    return "";
  const blocks = keys.map((k) => {
    const json = JSON.stringify(pluginData[k], null, 2);
    return `<details>
  <summary>${escapeHtml(k)}</summary>
  <pre class="code">${escapeHtml(json)}</pre>
</details>`;
  }).join("\n");
  return `<h2>Plugin data</h2>
<div class="panel">
${blocks}
</div>`;
}
function renderRawJson(report) {
  const json = JSON.stringify(report, null, 2);
  return `<h2>Raw report</h2>
<details>
  <summary>Show raw JSON</summary>
  <pre class="code">${escapeHtml(json)}</pre>
</details>`;
}
function renderInlineReport(report) {
  return `<script type="application/json" id="ohmyperf-report-payload">${escapeJsonForHtml(report)}<\/script>
<script>
  (function () {
    try {
      var el = document.getElementById("ohmyperf-report-payload");
      if (el && el.textContent) {
        window.__OHMYPERF_REPORT__ = JSON.parse(el.textContent);
      }
    } catch (e) {
      console.warn("ohmyperf: could not parse embedded report payload", e);
    }
  })();
<\/script>`;
}
function shortenUrl(url) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

// dist/viewer.js
async function main() {
  const params = new URLSearchParams(window.location.search);
  const measurementId = params.get("m");
  if (!measurementId) {
    document.body.innerHTML = "<p style='font-family:system-ui'>No measurement id in URL.</p>";
    return;
  }
  const key = `measurement:${measurementId}`;
  const stored = await chrome.storage.session.get([key]);
  const value = stored[key];
  if (!value) {
    document.body.innerHTML = "<p style='font-family:system-ui'>Measurement not found in session storage.</p>";
    return;
  }
  if (value.status === "error") {
    document.body.innerHTML = `<p style='font-family:system-ui;color:#b91c1c'>Measurement failed: ${escapeHtml2(value.error ?? "unknown error")}</p>`;
    return;
  }
  if (value.status === "running" || !value.report) {
    document.body.innerHTML = "<p style='font-family:system-ui'>Measurement still running\u2026 reload this page in a moment.</p>";
    return;
  }
  const html = renderReportHtml(value.report, { title: `OhMyPerf \u2014 ${value.url}` });
  document.open();
  document.write(html);
  document.close();
}
function escapeHtml2(s) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}
void main();
