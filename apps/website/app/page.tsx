import Link from 'next/link';
import { ArrowRight, ExternalLink, Github, Sparkles, Star } from 'lucide-react';

import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { UrlFormLanding } from '@/components/measure/url-form-landing';
import { BackendCardLazy } from '@/components/measure/backend-card-lazy';
import { TerminalDemo } from '@/components/landing/terminal-demo';
import { AgentLoopDiagram } from '@/components/landing/agent-loop-diagram';
import { CwvComparison } from '@/components/landing/cwv-comparison';
import { FeatureGrid } from '@/components/landing/feature-grid';
import { SurfaceGrid } from '@/components/landing/surface-grid';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_-10%,oklch(0.55_0.18_245_/_0.10),transparent_55%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_25%,oklch(0.55_0.17_145_/_0.06),transparent_50%)]" />
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.018] dark:opacity-[0.035]"
              style={{
                backgroundImage:
                  'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
                backgroundSize: '48px 48px',
              }}
            />
          </div>
          <div className="mx-auto max-w-6xl px-6 pt-16 md:pt-24 pb-16 md:pb-24">
            <div className="grid lg:grid-cols-[1fr_1fr] gap-10 lg:gap-16 items-start">
              <div className="flex flex-col">
                <Link
                  href="https://github.com/hoainho/ohmyperf"
                  className="inline-flex items-center gap-1.5 self-start text-xs font-medium px-2.5 py-1 rounded-full border border-border bg-card hover:bg-muted transition-colors"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Sparkles className="h-3 w-3 text-[oklch(0.55_0.16_70)]" aria-hidden />
                  <span>v0.2.0 — agent fix loop · LLM-first signals</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
                </Link>

                <h1 className="mt-6 text-[44px] sm:text-[56px] leading-[1.02] font-semibold tracking-[-0.02em]">
                  The first perf tool an
                  <br />
                  <span className="bg-gradient-to-r from-[oklch(0.55_0.18_245)] to-[oklch(0.55_0.17_145)] bg-clip-text text-transparent">
                    LLM agent
                  </span>{' '}
                  can actually fix
                  <br />
                  your site with.
                </h1>

                <p className="mt-6 text-[17px] sm:text-lg text-muted-foreground leading-relaxed max-w-[560px]">
                  Real-Chromium Core Web Vitals on your hardware. Closed agent fix loop with
                  Mann-Whitney U statistical proof, not vibes. <span className="text-foreground">~99% cross-origin iframe coverage</span> via per-frame CDPSession. <span className="text-foreground">MCP-native</span> for Claude · OpenCode · Cursor.
                </p>

                <div className="mt-8 max-w-[560px]">
                  <UrlFormLanding autoFocus />
                  <BackendCardLazy className="mt-3" />
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
                  <Link
                    href="/viewer/"
                    className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-[oklch(0.50_0.18_245)] dark:hover:text-[oklch(0.78_0.18_245)] transition-colors"
                  >
                    Drop a report.json
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                  <span className="text-muted-foreground/60">·</span>
                  <Link
                    href="https://github.com/hoainho/ohmyperf"
                    className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Github className="h-3.5 w-3.5" aria-hidden />
                    Source on GitHub
                  </Link>
                  <span className="text-muted-foreground/60">·</span>
                  <Link
                    href="https://www.npmjs.com/package/@ohmyperf/cli"
                    className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    target="_blank"
                    rel="noreferrer"
                  >
                    npm
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                </div>
              </div>

              <div className="lg:sticky lg:top-8">
                <TerminalDemo />
                <p className="mt-3 text-xs text-muted-foreground text-center">
                  Real CLI output from <code className="font-mono">tradeit.gg</code> — verified 2026-05-21
                </p>
              </div>
            </div>

            <div className="mt-16 md:mt-20 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl">
              <Stat label="MCP tools" value="16" />
              <Stat label="Surfaces" value="9" />
              <Stat label="Tests passing" value="387" />
              <Stat label="OOPIF coverage" value="~99%" />
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-muted/15">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl mb-10">
              <p className="text-xs uppercase tracking-wider text-[oklch(0.50_0.18_245)] dark:text-[oklch(0.78_0.18_245)] font-semibold mb-3">
                The killer loop
              </p>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                measure → propose_patch → verify_fix
              </h2>
              <p className="mt-3 text-muted-foreground">
                One conversation turn. Mann-Whitney U at α=0.05 proves the patch improved the metric — or it doesn’t,
                and the agent knows.
              </p>
            </div>
            <AgentLoopDiagram />
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl mb-10">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
                Why this exists
              </p>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                Lighthouse measures in a datacenter. OhMyPerf measures where users live.
              </h2>
            </div>
            <CwvComparison />
          </div>
        </section>

        <section className="border-b border-border bg-muted/15">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl mb-10">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
                Capabilities
              </p>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                Every metric is structured. Every signal is actionable.
              </h2>
            </div>
            <FeatureGrid />
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl mb-10">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
                Nine surfaces, one engine
              </p>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                CLI, MCP, SDK, browser ext, editor ext, static viewer, share-server, ESLint plugin, fixer SDK.
              </h2>
              <p className="mt-3 text-muted-foreground">
                All powered by frozen <code className="font-mono text-foreground">@ohmyperf/core</code> 1.0.0 — 45 exports, Playwright + raw CDP, plugin runtime, calibration, outlier rejection, diff.
              </p>
            </div>
            <SurfaceGrid />
          </div>
        </section>

        <section className="border-b border-border bg-gradient-to-b from-background to-muted/30">
          <div className="mx-auto max-w-4xl px-6 py-24 text-center">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-4">
              Get started in 30 seconds
            </p>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-6">
              No signup. No telemetry. Apache-2.0.
            </h2>
            <div className="inline-block rounded-xl border border-border bg-card p-1.5 max-w-2xl text-left">
              <pre className="rounded-lg bg-muted/50 px-5 py-4 text-sm font-mono overflow-x-auto">
{`# CLI
npm install -g @ohmyperf/cli
ohmyperf run https://your-site.com

# MCP server — drop into Claude / OpenCode / Cursor
npx -y @ohmyperf/mcp-server@latest

# Zero-install one-off
npx -y @ohmyperf/cli@latest run https://your-site.com`}
              </pre>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
              <Link
                href="https://github.com/hoainho/ohmyperf"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 font-medium text-background hover:opacity-90 transition-opacity"
              >
                <Star className="h-3.5 w-3.5" aria-hidden />
                Star on GitHub
              </Link>
              <Link
                href="/viewer/"
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 font-medium hover:bg-muted transition-colors"
              >
                Try the viewer
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Requires Node ≥ 22. Playwright Chromium auto-downloads on first run (~150 MB).
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-border pl-4">
      <p className="text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
    </div>
  );
}
