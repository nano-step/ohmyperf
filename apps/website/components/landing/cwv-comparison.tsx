import { Cpu, Globe, Layers, Microscope, Scale, ShieldCheck, Sparkles, Zap } from 'lucide-react';

const ROWS: ReadonlyArray<{
  icon: React.ComponentType<{ className?: string }>;
  concern: string;
  lighthouse: string;
  ohmyperf: string;
}> = [
  {
    icon: Cpu,
    concern: 'Where measurement runs',
    lighthouse: 'Synthetic CPU in a Google datacenter',
    ohmyperf: 'Your hardware, your browser, your network',
  },
  {
    icon: Layers,
    concern: 'Cross-origin iframes',
    lighthouse: 'Network-only — opaque inside',
    ohmyperf: 'Per-frame CDPSession · ~99% coverage',
  },
  {
    icon: Sparkles,
    concern: 'Agent-callable',
    lighthouse: 'None',
    ohmyperf: '16 MCP tools — Claude, OpenCode, Cursor',
  },
  {
    icon: Scale,
    concern: 'Statistical proof of fix',
    lighthouse: 'Threshold gates (flake-prone)',
    ohmyperf: 'Mann-Whitney U at α=0.05 · per metric',
  },
  {
    icon: Globe,
    concern: 'First-party vs CDN classification',
    lighthouse: 'Eyeball the host column',
    ohmyperf: 'originClass + same-org tier · OHMYPERF_ORG_DOMAINS',
  },
  {
    icon: ShieldCheck,
    concern: 'Bot-challenge detection',
    lighthouse: 'Treats interstitials as real pages',
    ohmyperf: 'servability: bot-challenge-suspected',
  },
  {
    icon: Microscope,
    concern: 'Honest about variance',
    lighthouse: 'One number, take or leave',
    ohmyperf: 'trustScore + per-metric CoV + recommendedAction',
  },
  {
    icon: Zap,
    concern: 'INP in CI',
    lighthouse: 'Field-only (real interactions)',
    ohmyperf: 'Synthetic Input.dispatchMouseEvent · CDP trusted-event',
  },
];

export function CwvComparison() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-12 border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <div className="col-span-4 sm:col-span-3 px-4 py-3">Concern</div>
        <div className="col-span-4 sm:col-span-4 px-4 py-3 border-l border-border">Lighthouse / PSI</div>
        <div className="col-span-4 sm:col-span-5 px-4 py-3 border-l border-border">
          <span className="text-[oklch(0.55_0.18_245)] dark:text-[oklch(0.78_0.18_245)]">OhMyPerf</span>
        </div>
      </div>
      <div className="divide-y divide-border">
        {ROWS.map(({ icon: Icon, concern, lighthouse, ohmyperf }, idx) => (
          <div key={concern} className={`grid grid-cols-12 text-sm ${idx % 2 === 0 ? 'bg-card' : 'bg-muted/15'}`}>
            <div className="col-span-4 sm:col-span-3 px-4 py-4 flex items-center gap-2 font-medium">
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
              <span className="truncate">{concern}</span>
            </div>
            <div className="col-span-4 sm:col-span-4 px-4 py-4 border-l border-border text-muted-foreground">
              {lighthouse}
            </div>
            <div className="col-span-4 sm:col-span-5 px-4 py-4 border-l border-border">
              <span className="text-foreground">{ohmyperf}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
