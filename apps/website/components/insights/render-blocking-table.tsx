import type { Opportunity } from '@ohmyperf/core';

interface Props {
  opportunity: Opportunity;
}

export function RenderBlockingTable({ opportunity }: Props) {
  if (opportunity.items.length === 0) return null;
  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold mb-2">
        {opportunity.title}
      </h3>
      {opportunity.description && (
        <p className="text-xs text-muted-foreground mb-3">{opportunity.description}</p>
      )}
      <p className="text-xs mb-3">
        Total wasted: <span className="font-mono">{(opportunity.wastedMs ?? 0).toFixed(0)}ms</span>
        {opportunity.wastedBytes !== undefined && (
          <> · {(opportunity.wastedBytes / 1024).toFixed(1)}KB</>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-2 py-1">Resource</th>
              <th className="text-right px-2 py-1">Wasted (ms)</th>
              <th className="text-right px-2 py-1">Size (KB)</th>
            </tr>
          </thead>
          <tbody>
            {opportunity.items.slice(0, 20).map((it, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-2 py-1 font-mono truncate max-w-xs">{it.url}</td>
                <td className="px-2 py-1 text-right font-mono">
                  {it.wastedMs !== undefined ? it.wastedMs.toFixed(0) : '—'}
                </td>
                <td className="px-2 py-1 text-right font-mono">
                  {it.wastedBytes !== undefined ? (it.wastedBytes / 1024).toFixed(1) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
