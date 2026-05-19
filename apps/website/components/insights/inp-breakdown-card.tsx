import type { Metric } from '@ohmyperf/core';

interface Props {
  metric: Metric;
}

const SUBPART_COLORS: Record<string, string> = {
  inputDelay: 'rgb(34 197 94)',
  processing: 'rgb(168 85 247)',
  presentation: 'rgb(244 63 94)',
};
const SUBPART_ORDER = ['inputDelay', 'processing', 'presentation'] as const;

export function InpBreakdownCard({ metric }: Props) {
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
      <h3 className="text-sm font-semibold mb-3">INP breakdown — {metric.value.toFixed(0)}ms</h3>
      {a.element && (
        <p className="text-xs font-mono text-muted-foreground mb-1">Target: {a.element}</p>
      )}
      {a.interactionType && (
        <p className="text-xs text-muted-foreground mb-2">Interaction: {a.interactionType}</p>
      )}
      <div className="flex w-full h-3 rounded overflow-hidden mb-2" role="img" aria-label="INP sub-part bar">
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
      <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
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
      {a.longestScript && (
        <p className="mt-3 text-xs font-mono text-muted-foreground truncate">
          Longest script: {a.longestScript.url ?? '(anonymous)'}
          {' · '}
          {a.longestScript.duration.toFixed(0)}ms in {a.longestScript.subpart}
        </p>
      )}
    </section>
  );
}
