import type { LongTask } from '@ohmyperf/core';

interface Props {
  longTasks: ReadonlyArray<LongTask>;
}

function badgeFor(duration: number): { label: string; cls: string } {
  if (duration >= 300) return { label: 'severe', cls: 'bg-red-100 text-red-900 border-red-300' };
  if (duration >= 100) return { label: 'warn', cls: 'bg-amber-100 text-amber-900 border-amber-300' };
  return { label: 'ok', cls: 'bg-muted text-muted-foreground border-border' };
}

export function LongTasksTable({ longTasks }: Props) {
  if (longTasks.length === 0) return null;
  const top = [...longTasks].sort((a, b) => b.duration - a.duration).slice(0, 20);
  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">
        Long main-thread tasks ({String(longTasks.length)} total · showing top {String(top.length)})
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-2 py-1">URL</th>
              <th className="text-right px-2 py-1">Start (ms)</th>
              <th className="text-right px-2 py-1">Duration (ms)</th>
              <th className="text-left px-2 py-1">Severity</th>
            </tr>
          </thead>
          <tbody>
            {top.map((t, i) => {
              const url = t.attributionRich?.url ?? '(anonymous)';
              const badge = badgeFor(t.duration);
              return (
                <tr key={i} className="border-t border-border">
                  <td className="px-2 py-1 font-mono truncate max-w-xs">{url}</td>
                  <td className="px-2 py-1 text-right font-mono">{t.startTime.toFixed(0)}</td>
                  <td className="px-2 py-1 text-right font-mono">{t.duration.toFixed(0)}</td>
                  <td className="px-2 py-1">
                    <span className={`inline-block rounded border px-2 py-0.5 ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
