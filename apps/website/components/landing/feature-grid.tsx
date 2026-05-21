import {
  Activity,
  Boxes,
  Cpu,
  FileSearch,
  GitBranch,
  Layers,
  PackagePlus,
  Plug,
  Sparkles,
  Target,
  Workflow,
  Zap,
} from 'lucide-react';

const FEATURES: ReadonlyArray<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  meta?: string;
}> = [
  {
    icon: Cpu,
    title: 'Real Chromium, real hardware',
    body: 'Playwright + raw CDP. No synthetic CPU throttle, no datacenter detour. Numbers match what your users feel.',
    meta: 'Chromium 148',
  },
  {
    icon: Layers,
    title: '~99% cross-origin iframe coverage',
    body: 'Target.setAutoAttach + per-frame CDPSession. Lighthouse goes opaque inside OOPIFs — we go all the way in.',
    meta: 'CDP',
  },
  {
    icon: Workflow,
    title: 'Closed agent fix loop',
    body: 'measure → propose_patch → verify_fix in one conversation turn. Mann-Whitney U at α=0.05 proves the fix worked.',
    meta: 'v0.2.0',
  },
  {
    icon: Sparkles,
    title: 'LLM-first report signals',
    body: 'trustScore, fixPlan, servability, originClass precomputed. Agents act in one tool call instead of multi-hop reasoning.',
    meta: 'v0.2.0',
  },
  {
    icon: Target,
    title: 'INP measurable in CI',
    body: 'Synthetic Input.dispatchMouseEvent over CDP fires a trusted-event pipeline. INP attribution lands without humans.',
  },
  {
    icon: FileSearch,
    title: 'Source-map source location',
    body: 'longestScript.sourceLocation lifts script URLs back to repo paths. Stage-2 VLQ decode in v0.3.',
    meta: 'partial',
  },
  {
    icon: GitBranch,
    title: 'Honest about variance',
    body: 'CoV > 20% triggers trustScore: low + recommendedAction. We do not pretend 3-run measurements are precise.',
  },
  {
    icon: Plug,
    title: 'Plugin-first engine',
    body: 'Every metric, audit, reporter is a plugin. cwv, axe-core, third-parties built-in. Bring your own custom-metric plugin.',
  },
  {
    icon: PackagePlus,
    title: '7 CWV-linked ESLint rules',
    body: '@ohmyperf/eslint-plugin catches no-document-write, no-sync-xhr, prefer-loading-lazy at editor-save time.',
    meta: 'v0.2.0',
  },
  {
    icon: Boxes,
    title: 'Static viewer · zero upload',
    body: 'Drag report.json onto /viewer — full LCP/INP/CLS breakdown rendered in browser. No backend required.',
  },
  {
    icon: Activity,
    title: 'Bot-challenge detection',
    body: 'servability classifies real-page vs bot-challenge-suspected vs error-page. Agents skip un-actionable measurements.',
    meta: 'v0.2.0',
  },
  {
    icon: Zap,
    title: 'Two budget modes',
    body: 'real for honest variance, ci-stable for cross-runner comparability (pre-flight CPU calibration + Fast 4G throttle).',
  },
];

export function FeatureGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {FEATURES.map(({ icon: Icon, title, body, meta }) => (
        <article
          key={title}
          className="group relative rounded-xl border border-border bg-card p-5 transition-all hover:border-foreground/20 hover:shadow-sm"
        >
          <div className="flex items-start justify-between mb-3">
            <Icon className="h-4.5 w-4.5 text-foreground/70" aria-hidden />
            {meta && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                {meta}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-sm leading-snug mb-1.5">{title}</h3>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{body}</p>
        </article>
      ))}
    </div>
  );
}
