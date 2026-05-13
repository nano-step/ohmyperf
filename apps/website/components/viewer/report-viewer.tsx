'use client';

import type { Report, AggregatedMetric, AuditResult, FrameNode, RunReport } from '@ohmyperf/core';
import {
  HEADLINE_METRICS,
  UNSTABLE_COV_THRESHOLD,
  formatBytes,
  formatMs,
  formatScore,
  formatCov,
  rateMetric,
  RATING_COLORS,
} from '@/lib/format';

export interface ReportViewerProps {
  report: Report;
}

export function ReportViewer({ report }: ReportViewerProps) {
  const unstable = isUnstable(report);
  return (
    <div className="space-y-8">
      <ReportHeader report={report} />
      {unstable && <UnstableBanner runs={report.runs.length} />}
      <MetricTiles report={report} />
      <AuditsList audits={report.audits} />
      <ResourcesTable report={report} />
      <FrameTreeSection report={report} />
      <RunsTable report={report} />
    </div>
  );
}

function ReportHeader({ report }: { report: Report }) {
  const m = report.meta;
  return (
    <div className="rounded-lg border bg-card p-6 space-y-1 text-sm">
      <h2 className="text-lg font-semibold mb-3">OhMyPerf v{report.schemaVersion} Report</h2>
      <MetaRow label="URL" value={m.url} mono />
      <MetaRow label="Started" value={m.startedAt} />
      <MetaRow label="Duration" value={`${String(m.durationMs)} ms`} />
      <MetaRow label="Mode" value={`${m.mode} · runs=${String(m.runs)} · ${m.parity.mode}`} />
      <MetaRow label="Browser" value={`${m.browser.name} ${m.browser.version} (${m.browser.source})`} />
      <MetaRow label="Host" value={`${m.host.os} (${m.host.arch}) · Node ${m.host.nodeVersion}`} />
      <MetaRow label="ID" value={m.measurementId} mono />
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-xs break-all' : ''}>{value}</span>
    </div>
  );
}

function UnstableBanner({ runs }: { runs: number }) {
  return (
    <div className="rounded-md border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
      <strong>Unstable run.</strong> At least one Core Web Vital has CoV &gt;{' '}
      {String(UNSTABLE_COV_THRESHOLD * 100)}% across {String(runs)} run(s).
    </div>
  );
}

function MetricTiles({ report }: { report: Report }) {
  const tiles = HEADLINE_METRICS.map(({ name, unit, digits }) => {
    const agg = report.aggregated[name];
    if (!agg) return null;
    return <MetricTile key={name} name={name} agg={agg} unit={unit} digits={digits} />;
  }).filter(Boolean);
  if (tiles.length === 0) return null;
  return (
    <div>
      <h3 className="text-base font-semibold mb-3">Aggregated Metrics</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">{tiles}</div>
    </div>
  );
}

function MetricTile({
  name,
  agg,
  unit,
  digits,
}: { name: string; agg: AggregatedMetric; unit: 'ms' | 'score'; digits: number }) {
  const unstable = Number.isFinite(agg.cov) && agg.cov > UNSTABLE_COV_THRESHOLD;
  const rating = rateMetric(name, agg.median);
  const color = RATING_COLORS[rating];
  const display = unit === 'ms' ? formatMs(agg.median, digits) : formatScore(agg.median, digits);
  return (
    <div
      className={`rounded-lg border p-3 text-center ${unstable ? 'border-yellow-400' : 'border-border'}`}
      style={{ borderTopColor: color, borderTopWidth: 3 }}
    >
      <div className="text-xs font-mono text-muted-foreground uppercase mb-1">{name}</div>
      <div className="text-xl font-bold" style={{ color }}>{display}</div>
      <div className="text-xs text-muted-foreground mt-1">cov {formatCov(agg.cov)} · n={String(agg.runs)}</div>
    </div>
  );
}

function AuditsList({ audits }: { audits: ReadonlyArray<AuditResult> }) {
  if (audits.length === 0) return null;
  const sorted = [...audits].sort((a, b) => (a.passed ? 1 : 0) - (b.passed ? 1 : 0));
  return (
    <div>
      <h3 className="text-base font-semibold mb-3">Audits</h3>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 w-16">Status</th>
              <th className="text-left px-3 py-2 w-48">ID</th>
              <th className="text-left px-3 py-2">Title</th>
              <th className="text-right px-3 py-2 w-16">Score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a, i) => (
              <tr key={`${a.id}-${i}`} className="border-t">
                <td className="px-3 py-2">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${a.passed ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>
                    {a.passed ? 'PASS' : 'FAIL'}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{a.id}</td>
                <td className="px-3 py-2">{a.title}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{a.score === null ? '—' : String(a.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResourcesTable({ report }: { report: Report }) {
  const cold = report.runs.find((r) => r.cold);
  const warm = report.runs.find((r) => !r.cold);
  const sourceRun: RunReport | undefined = warm ?? cold ?? report.runs[0];
  if (!sourceRun || sourceRun.resources.length === 0) return null;
  const resources = [...sourceRun.resources].sort(
    (a, b) => a.requestMs + a.responseMs - (b.requestMs + b.responseMs),
  );
  const shown = resources.slice(0, 100);
  const totalEncoded = resources.reduce((acc, r) => acc + (r.encodedSizeBytes || 0), 0);
  const renderBlocking = resources.filter((r) => r.renderBlocking).length;
  return (
    <div>
      <h3 className="text-base font-semibold mb-1">Resources</h3>
      <p className="text-xs text-muted-foreground mb-3">
        {String(resources.length)} resources · {formatBytes(totalEncoded)} encoded
        {renderBlocking > 0 && (
          <span className="ml-1 px-1 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 text-xs">
            {String(renderBlocking)} render-blocking
          </span>
        )}
      </p>
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-2 py-2">URL</th>
              <th className="text-left px-2 py-2">Type</th>
              <th className="text-right px-2 py-2">Size</th>
              <th className="text-right px-2 py-2">ms</th>
              <th className="text-left px-2 py-2">Tags</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-2 py-1 font-mono max-w-xs truncate" title={r.url}>{r.url}</td>
                <td className="px-2 py-1 text-muted-foreground">{r.mimeType ?? '—'}</td>
                <td className="px-2 py-1 text-right">{formatBytes(r.encodedSizeBytes)}</td>
                <td className="px-2 py-1 text-right">{(r.requestMs + r.responseMs).toFixed(1)}</td>
                <td className="px-2 py-1">
                  {r.renderBlocking && <span className="mr-1 px-1 py-0.5 rounded bg-yellow-100 text-yellow-700 text-xs">render-block</span>}
                  {r.cacheHit && <span className="px-1 py-0.5 rounded bg-green-100 text-green-700 text-xs">cache</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {resources.length > 100 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Showing first 100 of {String(resources.length)} resources.
          </p>
        )}
      </div>
    </div>
  );
}

function FrameTreeSection({ report }: { report: Report }) {
  const tree = report.frames;
  if (!tree.root || !tree.nodes[tree.root]) return null;
  return (
    <div>
      <h3 className="text-base font-semibold mb-3">Frame Tree</h3>
      <div className="rounded-lg border p-4 text-sm">
        <FrameNodeItem nodes={tree.nodes} frameId={tree.root} depth={0} />
      </div>
    </div>
  );
}

function FrameNodeItem({
  nodes,
  frameId,
  depth,
}: { nodes: Readonly<Record<string, FrameNode>>; frameId: string; depth: number }) {
  const node = nodes[frameId];
  if (!node) return null;
  const tags: string[] = [];
  if (node.isOOPIF) tags.push('OOPIF');
  if (node.isCrossOrigin) tags.push('cross-origin');
  if (node.isSrcdoc) tags.push('srcdoc');
  if (node.isFenced) tags.push('fenced-frame');
  if (node.detachedAt !== undefined) tags.push('detached');
  return (
    <div style={{ marginLeft: depth * 16 }} className="mb-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs text-muted-foreground">{frameId}</span>
        {tags.map((t) => (
          <span key={t} className="px-1 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 text-xs">{t}</span>
        ))}
      </div>
      <div className="text-xs text-muted-foreground truncate">{node.url || '(empty)'}</div>
      {node.children.map((id) => (
        <FrameNodeItem key={id} nodes={nodes} frameId={id} depth={depth + 1} />
      ))}
    </div>
  );
}

function RunsTable({ report }: { report: Report }) {
  if (report.runs.length === 0) return null;
  const names = [...new Set(report.runs.flatMap((r) => Object.keys(r.metrics)))].sort();
  if (names.length === 0) return null;
  return (
    <div>
      <h3 className="text-base font-semibold mb-3">Per-Run Values</h3>
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-2 py-2">Run</th>
              <th className="text-left px-2 py-2">Cold</th>
              {names.map((n) => <th key={n} className="text-right px-2 py-2 font-mono">{n}</th>)}
            </tr>
          </thead>
          <tbody>
            {report.runs.map((r) => (
              <tr key={r.runIndex} className="border-t">
                <td className="px-2 py-1">{String(r.runIndex)}</td>
                <td className="px-2 py-1">{r.cold ? <span className="px-1 py-0.5 rounded bg-blue-100 text-blue-700 text-xs">cold</span> : ''}</td>
                {names.map((n) => {
                  const m = r.metrics[n];
                  return (
                    <td key={n} className="px-2 py-1 text-right font-mono">
                      {m && Number.isFinite(m.value) ? m.value.toFixed(n === 'cls' ? 3 : 1) : <span className="text-muted-foreground">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function isUnstable(report: Report): boolean {
  if (report.meta.unstable === true) return true;
  for (const name of ['lcp', 'cls', 'inp', 'fcp', 'ttfb']) {
    const agg = report.aggregated[name];
    if (agg && Number.isFinite(agg.cov) && agg.cov > UNSTABLE_COV_THRESHOLD) return true;
  }
  return false;
}
