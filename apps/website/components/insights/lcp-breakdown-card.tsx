import type { Metric } from '@ohmyperf/core';

interface Props {
  metric: Metric;
}

const SUBPART_COLORS: Record<string, string> = {
  ttfb: 'rgb(34 197 94)',
  loadDelay: 'rgb(234 179 8)',
  loadDuration: 'rgb(168 85 247)',
  renderDelay: 'rgb(244 63 94)',
};

const SUBPART_ORDER = ['ttfb', 'loadDelay', 'loadDuration', 'renderDelay'] as const;

export function LcpBreakdownCard({ metric }: Props) {
  const a = metric.attribution;
  if (!a?.subparts) return null;
  const parts = SUBPART_ORDER.filter((k) => k in a.subparts!).map((k) => ({
    name: k,
    value: a.subparts![k]!,
  }));
  const total = parts.reduce((acc, p) => acc + p.value, 0);
  if (total === 0) return null;

  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">
        LCP breakdown — {metric.value.toFixed(0)}ms
      </h3>
      {a.element && (
        <p className="text-xs font-mono text-muted-foreground mb-2">
          Element: {a.element}
        </p>
      )}
      {a.url && (
        <p className="text-xs font-mono text-muted-foreground mb-2 truncate">
          Resource: {a.url}
        </p>
      )}
      <div
        className="flex w-full h-3 rounded overflow-hidden mb-2"
        role="img"
        aria-label="LCP sub-part bar"
      >
        {parts.map((p) => (
          <div
            key={p.name}
            style={{
              width: `${((p.value / total) * 100).toFixed(2)}%`,
              backgroundColor: SUBPART_COLORS[p.name] ?? '#999',
            }}
            title={`${p.name}: ${p.value.toFixed(0)}ms`}
          />
        ))}
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
        {parts.map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-sm"
              style={{ backgroundColor: SUBPART_COLORS[p.name] ?? '#999' }}
              aria-hidden
            />
            <dt className="text-muted-foreground">{p.name}</dt>
            <dd className="font-mono">{p.value.toFixed(0)}ms</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
