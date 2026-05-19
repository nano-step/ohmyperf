'use client';

import type { Resource } from '@ohmyperf/core';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface Props {
  resources: ReadonlyArray<Resource>;
}

const MIME_COLORS: Record<string, string> = {
  'text/html':        '#6366f1',
  'text/css':         '#0ea5e9',
  'application/javascript': '#f59e0b',
  'text/javascript':  '#f59e0b',
  'image/':           '#10b981',
  'font/':            '#8b5cf6',
};

function colorForMime(mime?: string): string {
  if (!mime) return '#94a3b8';
  for (const [prefix, color] of Object.entries(MIME_COLORS)) {
    if (mime.startsWith(prefix)) return color;
  }
  return '#94a3b8';
}

export function WaterfallChart({ resources }: Props) {
  const shown = [...resources]
    .sort((a, b) => a.requestMs + a.responseMs - (b.requestMs + b.responseMs))
    .slice(0, 50);

  const data = shown.map((r, i) => ({
    name: String(i + 1),
    url: r.url,
    totalMs: Math.round(r.requestMs + r.responseMs),
    mime: r.mimeType ?? '',
  }));

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={Math.max(200, shown.length * 18)}>
        <BarChart data={data} layout="vertical" margin={{ left: 32, right: 16 }}>
          <XAxis type="number" unit="ms" tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={24} />
          <Tooltip
            formatter={(value: number) => [`${String(value)} ms`, 'Total']}
            labelFormatter={(label: string, payload) => {
              const item = payload?.[0]?.payload as { url?: string } | undefined;
              return item?.url ?? label;
            }}
          />
          <Bar dataKey="totalMs" radius={[0, 2, 2, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={colorForMime(d.mime)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {resources.length > 50 && (
        <p className="text-xs text-muted-foreground mt-1">
          Showing slowest 50 of {String(resources.length)} resources.
        </p>
      )}
    </div>
  );
}
