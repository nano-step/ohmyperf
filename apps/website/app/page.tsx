import { ArrowRight, Chrome, Container } from 'lucide-react';
import { UrlFormLanding } from '@/components/measure/url-form-landing';
import { BackendCardLazy } from '@/components/measure/backend-card-lazy';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

const CAPABILITIES = [
  { key: 'realNumbers', title: 'Real numbers from real browsers', body: 'Chromium runs on your machine; no synthetic CPU throttle by default.' },
  { key: 'iframeCoverage', title: 'Cross-origin iframe deep-inspection', body: 'CDP Target.setAutoAttach delivers ~99% measurable signals across OOPIFs.' },
  { key: 'pluginFirst', title: 'Plugin-first', body: 'Every metric, audit, reporter is a plugin: web-vitals, axe-core, custom metrics.' },
  { key: 'honestVariance', title: 'Honest variance', body: 'Every report carries CoV. Unstable runs (CoV>20%) get a visible banner.' },
  { key: 'ciStable', title: 'CI-Stable mode', body: 'Pre-flight CPU calibration so numbers compare across runners.' },
  { key: 'inertShares', title: 'Inert shared reports', body: 'Public viewers never re-execute plugin code.' },
] as const;

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-12 md:py-16">
        <section className="mb-16">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">OhMyPerf</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            Real-machine, real-browser web performance measurement with ~99% cross-origin iframe coverage. Runs on your hardware, not a synthetic datacenter CPU.
          </p>
          <div className="mt-8 max-w-2xl">
            <UrlFormLanding autoFocus />
            <BackendCardLazy className="mt-4" />
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6">What you get</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CAPABILITIES.map(({ key, title, body }) => (
              <div key={key} className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm font-semibold mb-1">{title}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-16 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Container className="h-4 w-4" />
              <span className="text-sm font-medium">Install the CLI</span>
              <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded-full">CLI</span>
            </div>
            <pre tabIndex={0} role="region" aria-label="CLI install commands" className="rounded-md bg-muted p-3 text-xs overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"><code>{`npm i -g @ohmyperf/cli\nohmyperf install-browser\nohmyperf run https://example.com`}</code></pre>
            <p className="text-xs text-muted-foreground mt-2">Requires Node.js 20+ on macOS, Linux, or Windows.</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Chrome className="h-4 w-4" />
              <span className="text-sm font-medium">Chrome extension</span>
              <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded-full">Extension</span>
            </div>
            <p className="text-sm text-muted-foreground">Install the extension, click the toolbar icon on any tab to measure it.</p>
            <a href="https://chrome.google.com/webstore/detail/ohmyperf" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm border border-border rounded-md px-3 py-1.5 hover:bg-muted transition-colors">
              Get it <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Container className="h-4 w-4" />
              <span className="text-sm font-medium">Self-hosted runner</span>
              <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded-full">Docker</span>
            </div>
            <pre tabIndex={0} role="region" aria-label="Self-hosted runner commands" className="rounded-md bg-muted p-3 text-xs overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"><code>{`git clone github.com/ohmyperf/ohmyperf\ndocker compose -f apps/runner/docker-compose.yml up`}</code></pre>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-4">Drop an existing report</h2>
          <p className="text-muted-foreground">
            Already have a <code className="text-sm bg-muted text-foreground px-1 rounded">report.json</code>?{' '}
            <a href="/viewer/" className="underline underline-offset-4 hover:text-foreground transition-colors">Open the drag-drop viewer</a>{' '}
            — no upload, runs entirely in your browser, zero network requests.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
