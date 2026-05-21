import { ArrowRight, Cog, FlaskConical, Gauge } from 'lucide-react';

const STAGES: ReadonlyArray<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub: string;
  tone: 'measure' | 'propose' | 'verify';
}> = [
  { icon: Gauge, label: 'measure', sub: 'Real CWV · trustScore · servability', tone: 'measure' },
  { icon: Cog, label: 'propose_patch', sub: 'Ranked, applicability-aware fixPlan', tone: 'propose' },
  { icon: FlaskConical, label: 'verify_fix', sub: 'Mann-Whitney U at α=0.05', tone: 'verify' },
];

const TONES: Record<'measure' | 'propose' | 'verify', { ring: string; tint: string; label: string }> = {
  measure: {
    ring: 'ring-[oklch(0.55_0.18_245)]/30 dark:ring-[oklch(0.78_0.18_245)]/30',
    tint: 'bg-[oklch(0.55_0.18_245)]/8',
    label: 'text-[oklch(0.40_0.18_245)] dark:text-[oklch(0.82_0.18_245)]',
  },
  propose: {
    ring: 'ring-[oklch(0.55_0.16_70)]/30 dark:ring-[oklch(0.80_0.16_70)]/30',
    tint: 'bg-[oklch(0.55_0.16_70)]/8',
    label: 'text-[oklch(0.40_0.16_70)] dark:text-[oklch(0.82_0.16_70)]',
  },
  verify: {
    ring: 'ring-[oklch(0.55_0.17_145)]/30 dark:ring-[oklch(0.80_0.17_145)]/30',
    tint: 'bg-[oklch(0.55_0.17_145)]/8',
    label: 'text-[oklch(0.40_0.17_145)] dark:text-[oklch(0.82_0.17_145)]',
  },
};

export function AgentLoopDiagram() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-3 md:gap-4 items-center">
      {STAGES.map((stage, idx) => {
        const tone = TONES[stage.tone];
        return (
          <div key={stage.label} className="contents">
            <div
              className={`group relative rounded-xl border border-border bg-card p-5 ring-1 ${tone.ring} ${tone.tint} transition-shadow hover:shadow-lg hover:shadow-black/5`}
            >
              <stage.icon className={`h-5 w-5 mb-3 ${tone.label}`} aria-hidden />
              <p className={`font-mono text-sm font-semibold ${tone.label}`}>{stage.label}</p>
              <p className="mt-1.5 text-xs text-muted-foreground leading-snug">{stage.sub}</p>
            </div>
            {idx < STAGES.length - 1 && (
              <ArrowRight className="h-5 w-5 text-muted-foreground/40 mx-auto rotate-90 md:rotate-0" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}
