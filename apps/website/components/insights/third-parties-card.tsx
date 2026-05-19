import type { AuditResult } from '@ohmyperf/core';

interface ThirdPartyItem {
  entity: string;
  category: string;
  transferSize: number;
  mainThreadTime: number;
  urls: Array<{ url: string; transferSize: number; mainThreadTime: number }>;
}

interface ThirdPartyDetails {
  items: ThirdPartyItem[];
}

function hueForCategory(category: string): string {
  const map: Record<string, string> = {
    ad: 'hsl(0, 70%, 90%)',
    analytics: 'hsl(30, 70%, 90%)',
    social: 'hsl(200, 70%, 90%)',
    video: 'hsl(280, 70%, 90%)',
    utility: 'hsl(180, 50%, 90%)',
    hosting: 'hsl(120, 50%, 90%)',
    marketing: 'hsl(330, 70%, 90%)',
    'customer-success': 'hsl(150, 50%, 90%)',
    content: 'hsl(60, 70%, 90%)',
    cdn: 'hsl(220, 50%, 90%)',
    'tag-manager': 'hsl(345, 70%, 85%)',
    'consent-provider': 'hsl(345, 70%, 95%)',
    other: 'hsl(0, 0%, 92%)',
  };
  return map[category] ?? 'hsl(0, 0%, 92%)';
}

interface Props {
  audit: AuditResult | undefined;
}

export function ThirdPartiesCard({ audit }: Props) {
  if (!audit?.details) return null;
  const details = audit.details as ThirdPartyDetails;
  if (!details.items || details.items.length === 0) return null;
  const items = [...details.items].sort((a, b) => b.mainThreadTime - a.mainThreadTime);

  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">{audit.title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-2 py-1">Entity</th>
              <th className="text-left px-2 py-1">Category</th>
              <th className="text-right px-2 py-1">Transfer (KB)</th>
              <th className="text-right px-2 py-1">Main thread (ms)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-2 py-1 font-medium">{it.entity}</td>
                <td className="px-2 py-1">
                  <span
                    className="inline-block rounded border px-2 py-0.5 text-xs"
                    style={{ backgroundColor: hueForCategory(it.category) }}
                  >
                    {it.category}
                  </span>
                </td>
                <td className="px-2 py-1 text-right font-mono">
                  {(it.transferSize / 1024).toFixed(1)}
                </td>
                <td className="px-2 py-1 text-right font-mono">
                  {it.mainThreadTime.toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
