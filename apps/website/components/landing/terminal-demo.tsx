'use client';

import { useEffect, useRef, useState } from 'react';

const SCRIPT: ReadonlyArray<{ text: string; delay: number; cls?: string }> = [
  { text: '$ npx -y @ohmyperf/cli@latest run https://tradeit.gg --runs 3', delay: 0, cls: 'text-foreground' },
  { text: '[ohmyperf] INFO  Launching Chromium 148.0.7778.0 (bundled)', delay: 480, cls: 'text-muted-foreground' },
  { text: '[ohmyperf] INFO  run 1/3 …', delay: 760, cls: 'text-muted-foreground' },
  { text: '[ohmyperf] INFO  run 2/3 …', delay: 1380, cls: 'text-muted-foreground' },
  { text: '[ohmyperf] INFO  run 3/3 …', delay: 2020, cls: 'text-muted-foreground' },
  { text: '[ohmyperf] INFO  aggregated:', delay: 2700, cls: 'text-foreground font-semibold' },
  { text: '[ohmyperf] INFO    lcp        median= 2716.0 ms  cov=32.0%  n=3', delay: 2820, cls: 'text-amber-500' },
  { text: '[ohmyperf] INFO    cls        median=  0.0005  cov=11.1%  n=3', delay: 2920, cls: 'text-emerald-500' },
  { text: '[ohmyperf] INFO    fcp        median= 2360.0 ms  cov=39.5%  n=3', delay: 3020, cls: 'text-amber-500' },
  { text: '[ohmyperf] INFO    ttfb       median= 1471.7 ms  cov=31.5%  n=3', delay: 3120, cls: 'text-amber-500' },
  { text: '[ohmyperf] INFO    tbt        median=  129.0 ms  cov=34.3%  n=3', delay: 3220, cls: 'text-emerald-500' },
  { text: '[ohmyperf] INFO  audits: 1', delay: 3380, cls: 'text-muted-foreground' },
  { text: '[ohmyperf] INFO    ✓ third-parties — 11 entities  865 KB transferred', delay: 3500, cls: 'text-muted-foreground' },
  { text: '[ohmyperf] INFO  opportunities: 1', delay: 3640, cls: 'text-foreground' },
  { text: '[ohmyperf] INFO    render-blocking-resources  4636 ms wasted  340 KB', delay: 3760, cls: 'text-amber-500' },
  { text: '[ohmyperf] INFO    └─ 35 resources blocking FCP', delay: 3880, cls: 'text-muted-foreground' },
  { text: '[ohmyperf] INFO  Wrote ohmyperf-out/report.json', delay: 4100, cls: 'text-foreground' },
  { text: '[ohmyperf] INFO  ✓ done in 28.9s', delay: 4280, cls: 'text-emerald-500 font-semibold' },
];

const TOTAL_DURATION = SCRIPT[SCRIPT.length - 1]!.delay + 1400;

export function TerminalDemo() {
  const [revealed, setRevealed] = useState<number>(0);
  const [loopKey, setLoopKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    SCRIPT.forEach((_, i) => {
      timers.push(setTimeout(() => setRevealed((r) => Math.max(r, i + 1)), SCRIPT[i]!.delay));
    });
    timers.push(setTimeout(() => {
      setRevealed(0);
      setLoopKey((k) => k + 1);
    }, TOTAL_DURATION));
    return () => { for (const t of timers) clearTimeout(t); };
  }, [loopKey]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-border bg-[oklch(0.18_0.01_240)] dark:bg-[oklch(0.13_0.01_240)] p-4 sm:p-5 font-mono text-[12.5px] leading-[1.55] shadow-2xl shadow-black/20 overflow-hidden"
      aria-label="OhMyPerf CLI demo — animated"
    >
      <div className="flex items-center gap-1.5 pb-3 mb-3 border-b border-white/5">
        <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.65_0.18_25)]" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.80_0.15_75)]" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.70_0.16_145)]" aria-hidden />
        <span className="ml-auto text-[10.5px] uppercase tracking-wider text-white/40">ohmyperf · live demo</span>
      </div>
      <div className="min-h-[420px]">
        {SCRIPT.slice(0, revealed).map((line, i) => (
          <pre key={`${loopKey}-${i}`} className={`${line.cls ?? 'text-white/80'} whitespace-pre-wrap break-words`}>{line.text}</pre>
        ))}
        {revealed < SCRIPT.length && (
          <span className="inline-block h-3.5 w-1.5 bg-emerald-400/80 align-middle animate-pulse" aria-hidden />
        )}
      </div>
    </div>
  );
}
