'use client';

import { useEffect, useRef } from 'react';
import type { Report, AggregatedMetric } from '@ohmyperf/core';
import { rateMetric, RATING_COLORS, formatMs, formatScore } from '@/lib/format';

const GAUGE_METRICS = ['lcp', 'fcp', 'ttfb', 'inp', 'cls'] as const;
type GaugeMetricName = typeof GAUGE_METRICS[number];

interface GaugeProps {
  name: GaugeMetricName;
  agg: AggregatedMetric;
}

function SingleGauge({ name, agg }: GaugeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rating = rateMetric(name, agg.median);
  const color = RATING_COLORS[rating];
  const isScore = name === 'cls';
  const display = isScore ? formatScore(agg.median, 3) : formatMs(agg.median, 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 80;
    const h = 80;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2 + 8;
    const r = 30;
    const startAngle = Math.PI * 0.8;
    const endAngle = Math.PI * 2.2;

    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();

    const goodAngle = startAngle + (endAngle - startAngle) * fillFraction(name, agg.median);
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, goodAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();
  }, [agg.median, color, name]);

  return (
    <div className="flex flex-col items-center gap-1">
      <canvas ref={canvasRef} width={80} height={80} style={{ width: 80, height: 80 }} />
      <div className="text-xs font-mono text-muted-foreground uppercase">{name}</div>
      <div className="text-sm font-bold" style={{ color }}>{display}</div>
    </div>
  );
}

function fillFraction(name: GaugeMetricName, value: number): number {
  const maxes: Record<GaugeMetricName, number> = {
    lcp:  6000,
    fcp:  4000,
    ttfb: 2500,
    inp:  800,
    cls:  0.4,
  };
  const max = maxes[name] ?? 1;
  return Math.min(value / max, 1);
}

export interface CwvGaugeProps {
  report: Report;
}

export function CwvGauge({ report }: CwvGaugeProps) {
  const gauges = GAUGE_METRICS.map((name) => {
    const agg = report.aggregated[name];
    if (!agg) return null;
    return <SingleGauge key={name} name={name} agg={agg} />;
  }).filter(Boolean);

  if (gauges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-6 justify-center py-4">
      {gauges}
    </div>
  );
}
