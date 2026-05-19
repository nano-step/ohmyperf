'use client';

import type { ProgressEvent } from '@ohmyperf/shared-types';

interface Props {
  events: ProgressEvent[];
  runIndex: number;
  totalRuns: number;
}

type StepStatus = 'done' | 'active' | 'pending';

interface Step {
  label: string;
  status: StepStatus;
  detail?: string | undefined;
}

export function ProgressStream({ events, runIndex, totalRuns }: Props) {
  const steps = buildSteps(events, runIndex, totalRuns);
  const eta = estimateEta(events);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          Run {String(runIndex + 1)} of {String(totalRuns)}
        </span>
        {eta !== null && (
          <span className="text-xs text-muted-foreground">~{String(eta)}s remaining</span>
        )}
      </div>

      <div className="w-full bg-muted rounded-full h-1.5">
        <div
          className="bg-primary h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${String(progressPercent(events, runIndex, totalRuns))}%` }}
        />
      </div>

      <ul className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <StepIcon status={s.status} />
            <span className={s.status === 'pending' ? 'text-muted-foreground' : ''}>{s.label}</span>
            {s.detail && <span className="text-xs text-muted-foreground">{s.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'done') {
    return (
      <svg className="w-4 h-4 text-green-500 shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
      </svg>
    );
  }
  if (status === 'active') {
    return (
      <svg className="w-4 h-4 text-primary shrink-0 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="8" cy="8" r="6" strokeDasharray="30" strokeDashoffset="10" />
      </svg>
    );
  }
  return <span className="w-4 h-4 rounded-full border border-muted-foreground/30 shrink-0 inline-block" />;
}

function buildSteps(events: ProgressEvent[], runIndex: number, totalRuns: number): Step[] {
  const types = new Set(events.map((e) => e.type));
  const navPhases = new Set(
    events
      .filter((e): e is Extract<ProgressEvent, { type: 'navigation' }> => e.type === 'navigation')
      .map((e) => e.phase),
  );
  const isComplete = types.has('complete');
  const isRunning = types.has('run-start') && !isComplete;

  const steps: Step[] = [
    {
      label: 'Queued',
      status: types.has('queued') ? 'done' : 'pending',
    },
    {
      label: `Run ${String(runIndex + 1)} of ${String(totalRuns)} started`,
      status: types.has('run-start') ? (isComplete ? 'done' : 'active') : 'pending',
    },
    {
      label: 'Navigating',
      status: navPhases.has('idle')
        ? 'done'
        : navPhases.has('loaded') || navPhases.has('committed') || navPhases.has('started')
        ? (isComplete ? 'done' : 'active')
        : 'pending',
    },
    {
      label: 'Collecting metrics',
      status: types.has('metric')
        ? isComplete
          ? 'done'
          : 'active'
        : isRunning && navPhases.has('idle')
        ? 'active'
        : 'pending',
      detail: metricsSummary(events),
    },
    {
      label: 'Complete',
      status: isComplete ? 'done' : 'pending',
    },
  ];

  return steps;
}

function metricsSummary(events: ProgressEvent[]): string | undefined {
  const metrics = events.filter(
    (e): e is Extract<ProgressEvent, { type: 'metric' }> => e.type === 'metric',
  );
  if (metrics.length === 0) return undefined;
  const names = [...new Set(metrics.map((m) => m.name))];
  return names.slice(0, 4).join(', ') + (names.length > 4 ? `… +${String(names.length - 4)}` : '');
}

function progressPercent(events: ProgressEvent[], runIndex: number, totalRuns: number): number {
  const types = new Set(events.map((e) => e.type));
  if (types.has('complete')) return 100;

  const perRun = 100 / Math.max(totalRuns, 1);
  const runBase = runIndex * perRun;

  if (!types.has('run-start')) return 0;

  const navPhases = new Set(
    events
      .filter((e): e is Extract<ProgressEvent, { type: 'navigation' }> => e.type === 'navigation')
      .map((e) => e.phase),
  );

  let withinRun = 0;
  if (navPhases.has('idle')) withinRun = 0.8;
  else if (navPhases.has('loaded')) withinRun = 0.6;
  else if (navPhases.has('committed')) withinRun = 0.4;
  else if (navPhases.has('started')) withinRun = 0.2;
  else withinRun = 0.1;

  return Math.round(runBase + perRun * withinRun);
}

function estimateEta(events: ProgressEvent[]): number | null {
  const start = events.find((e) => e.type === 'run-start');
  if (!start) return null;

  const now = Date.now();
  const elapsed = (now - start.t) / 1000;
  if (elapsed < 2) return null;

  const navIdle = events.find(
    (e): e is Extract<ProgressEvent, { type: 'navigation' }> =>
      e.type === 'navigation' && e.phase === 'idle',
  );
  if (!navIdle) return Math.max(0, Math.round(10 - elapsed));

  const metricCount = events.filter((e) => e.type === 'metric').length;
  if (metricCount === 0) return Math.max(0, Math.round(5 - elapsed));
  return null;
}
