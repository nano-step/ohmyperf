import type { Metric } from '@ohmyperf/core';

interface Props {
  metric: Metric;
}

export function ClsCulpritsList({ metric }: Props) {
  const a = metric.attribution;
  if (!a) return null;
  if (!a.element && !a.previousRect && !a.cause) return null;
  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">
        CLS culprit — {metric.value.toFixed(3)}
      </h3>
      {a.element && (
        <p className="text-xs font-mono text-muted-foreground mb-1">
          Largest shift target: {a.element}
        </p>
      )}
      {a.cause && (
        <p className="text-xs text-muted-foreground mb-1">
          Cause: <span className="font-mono">{a.cause}</span>
        </p>
      )}
      {a.previousRect && a.currentRect && (
        <p className="text-xs text-muted-foreground">
          Shift: ({a.previousRect.x.toFixed(0)}, {a.previousRect.y.toFixed(0)}) →
          ({a.currentRect.x.toFixed(0)}, {a.currentRect.y.toFixed(0)})
        </p>
      )}
    </section>
  );
}
