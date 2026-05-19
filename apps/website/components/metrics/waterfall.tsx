'use client';

import dynamic from 'next/dynamic';
import type { Resource } from '@ohmyperf/core';

const WaterfallChart = dynamic(() => import('./waterfall-chart').then((m) => m.WaterfallChart), {
  ssr: false,
  loading: () => (
    <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
      Loading waterfall…
    </div>
  ),
});

interface Props {
  resources: ReadonlyArray<Resource>;
}

export function Waterfall({ resources }: Props) {
  if (resources.length === 0) return null;
  return <WaterfallChart resources={resources} />;
}
