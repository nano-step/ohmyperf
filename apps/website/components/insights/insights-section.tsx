'use client';

import type { Report } from '@ohmyperf/core';
import { ClsCulpritsList } from './cls-culprits-list';
import { InpBreakdownCard } from './inp-breakdown-card';
import { LcpBreakdownCard } from './lcp-breakdown-card';
import { LongTasksTable } from './long-tasks-table';
import { MetricFilterPills, useMetricFilter, type MetricFilter } from './metric-filter-pills';
import { RenderBlockingTable } from './render-blocking-table';
import { ThirdPartiesCard } from './third-parties-card';

interface Props {
  report: Report;
}

function visibleFor(filter: MetricFilter, metric: string): boolean {
  if (filter === 'all') return true;
  return filter === metric;
}

export function InsightsSection({ report }: Props) {
  const { filter, setFilter } = useMetricFilter();
  const firstRun = report.runs[0];
  if (!firstRun) {
    return (
      <section className="rounded-lg border bg-card p-4" data-testid="insights-section">
        <h2 className="text-base font-semibold mb-2">Insights</h2>
        <p className="text-xs text-muted-foreground">No runs to analyse.</p>
      </section>
    );
  }

  const lcp = firstRun.metrics['lcp'];
  const inp = firstRun.metrics['inp'];
  const cls = firstRun.metrics['cls'];
  const renderBlocking = (firstRun.opportunities ?? []).find(
    (o) => o.id === 'render-blocking-resources',
  );
  const thirdParty = report.audits.find((a) => a.id === 'third-parties');

  const hasAny =
    (lcp?.attribution?.subparts && visibleFor(filter, 'lcp')) ||
    (inp?.attribution?.subparts && visibleFor(filter, 'inp')) ||
    (cls?.attribution && visibleFor(filter, 'cls')) ||
    (renderBlocking && (filter === 'all' || filter === 'fcp')) ||
    (firstRun.longTasks.length > 0 && (filter === 'all' || filter === 'tbt')) ||
    (thirdParty && (filter === 'all' || filter === 'tbt' || filter === 'lcp'));

  return (
    <section className="space-y-4" data-testid="insights-section">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Insights</h2>
        <MetricFilterPills value={filter} onChange={setFilter} />
      </div>
      {!hasAny && (
        <p className="text-xs text-muted-foreground">
          No insights available for this filter. Try re-running the measurement with{' '}
          <code className="font-mono">--collect-trace</code> or pick a different metric.
        </p>
      )}
      {lcp?.attribution?.subparts && visibleFor(filter, 'lcp') && (
        <LcpBreakdownCard metric={lcp} />
      )}
      {inp?.attribution?.subparts && visibleFor(filter, 'inp') && (
        <InpBreakdownCard metric={inp} />
      )}
      {cls?.attribution && visibleFor(filter, 'cls') && <ClsCulpritsList metric={cls} />}
      {renderBlocking && (filter === 'all' || filter === 'fcp') && (
        <RenderBlockingTable opportunity={renderBlocking} />
      )}
      {firstRun.longTasks.length > 0 && (filter === 'all' || filter === 'tbt') && (
        <LongTasksTable longTasks={firstRun.longTasks} />
      )}
      {thirdParty && (filter === 'all' || filter === 'tbt' || filter === 'lcp') && (
        <ThirdPartiesCard audit={thirdParty} />
      )}
    </section>
  );
}
