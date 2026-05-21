'use client';

import { Suspense, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UrlForm } from '@/components/measure/url-form';
import { BackendCard } from '@/components/measure/backend-card';
import { ProgressStream } from '@/components/measure/progress-stream';
import { ErrorState } from '@/components/measure/error-state';
import { SiteHeader } from '@/components/layout/site-header';
import { useStore } from '@/lib/store';
import { submitMeasure, streamJob, RunnerClientError, type StreamHandle } from '@/lib/runner-client';
import {
  startMeasure as extStartMeasure,
  cancelJob as extCancelJob,
  streamPort as extStreamPort,
  ExtensionBridgeError,
  type StreamPortHandle,
} from '@/lib/extension-bridge';
import { saveReport, saveJob } from '@/lib/storage';
import type { MeasureRequest, Report } from '@ohmyperf/shared-types';

function MeasureContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const url = searchParams.get('url') ?? '';

  const { backend, currentJob, setJobSubmitting, setJobStreaming, appendJobEvent, setJobDone, setJobError, setJobCancelled, setJobIdle, prependReport } = useStore();
  const runnerHandleRef = useRef<StreamHandle | null>(null);
  const extensionHandleRef = useRef<StreamPortHandle | null>(null);
  const extensionJobIdRef = useRef<string | null>(null);

  const handleCancel = useCallback(() => {
    if (runnerHandleRef.current) {
      runnerHandleRef.current.cancel();
      runnerHandleRef.current = null;
      return;
    }
    if (extensionHandleRef.current) {
      extensionHandleRef.current.close();
      extensionHandleRef.current = null;
      const jobId = extensionJobIdRef.current;
      extensionJobIdRef.current = null;
      if (jobId) {
        void extCancelJob(jobId).catch(() => undefined);
      }
    }
  }, []);

  const persistReport = useCallback(async (jobId: string, measureUrl: string, report: Report) => {
    const reportId = await saveReport(report);
    setJobDone(jobId, reportId);
    prependReport({
      id: report.meta.measurementId,
      url: report.meta.url,
      createdAt: Date.now(),
      mode: report.meta.mode as 'real' | 'ci-stable',
      sizeBytes: new TextEncoder().encode(JSON.stringify(report)).length,
      report,
    });
    await saveJob({ id: jobId, url: measureUrl, status: 'done', startedAt: Date.now(), reportId });
    router.push(`/report/?id=${reportId}`);
  }, [setJobDone, prependReport, router]);

  const runViaRunner = useCallback(async (
    baseUrl: string,
    measureUrl: string,
    request: MeasureRequest,
  ) => {
    let jobId: string;
    try {
      jobId = await submitMeasure({ baseUrl }, request);
    } catch (err) {
      const code = err instanceof RunnerClientError ? err.code : 'internal/error';
      const message = err instanceof Error ? err.message : String(err);
      setJobError(code, message);
      return;
    }

    setJobStreaming(jobId);
    await saveJob({ id: jobId, url: measureUrl, status: 'running', startedAt: Date.now() });

    const handle = streamJob({ baseUrl }, jobId, (event) => { appendJobEvent(event); });
    runnerHandleRef.current = handle;

    try {
      const report = await handle.done;
      await persistReport(jobId, measureUrl, report);
    } catch (err) {
      const code = err instanceof RunnerClientError ? err.code : 'internal/error';
      const message = err instanceof Error ? err.message : String(err);
      if (code === 'runner/cancelled') {
        setJobCancelled();
        await saveJob({ id: jobId, url: measureUrl, status: 'cancelled', startedAt: Date.now() });
      } else {
        setJobError(code, message, jobId);
        await saveJob({ id: jobId, url: measureUrl, status: 'error', startedAt: Date.now(), error: message });
      }
    } finally {
      runnerHandleRef.current = null;
    }
  }, [setJobError, setJobStreaming, appendJobEvent, setJobCancelled, persistReport]);

  const runViaExtension = useCallback(async (
    measureUrl: string,
    request: MeasureRequest,
  ) => {
    if ((request.runs ?? 1) > 1) {
      toast.warning('Extension supports single-run only — using runs=1. For multi-run, start the local runner.');
    }
    const extRequest: MeasureRequest = { ...request, runs: 1 };

    let jobId: string;
    let portName: string;
    try {
      const ack = await extStartMeasure(extRequest);
      jobId = ack.jobId;
      portName = ack.portName;
    } catch (err) {
      const code = err instanceof ExtensionBridgeError ? err.code : 'extension/internal';
      const message = err instanceof Error ? err.message : String(err);
      setJobError(code, message);
      return;
    }

    extensionJobIdRef.current = jobId;
    setJobStreaming(jobId);
    await saveJob({ id: jobId, url: measureUrl, status: 'running', startedAt: Date.now() });

    let handle: StreamPortHandle;
    try {
      handle = extStreamPort(portName);
    } catch (err) {
      const code = err instanceof ExtensionBridgeError ? err.code : 'extension/internal';
      const message = err instanceof Error ? err.message : String(err);
      setJobError(code, message, jobId);
      return;
    }
    extensionHandleRef.current = handle;

    let report: Report | null = null;
    let errorEvent: { code: string; message: string } | null = null;

    try {
      for await (const event of handle.events) {
        appendJobEvent(event);
        if (event.type === 'complete') {
          report = event.report;
        } else if (event.type === 'error') {
          errorEvent = { code: event.code, message: event.message };
        }
      }
    } catch (err) {
      console.error('[measure] extension stream error', err);
      const code = err instanceof ExtensionBridgeError ? err.code : 'extension/internal';
      const message = err instanceof Error ? err.message : String(err);
      errorEvent = { code, message };
    } finally {
      extensionHandleRef.current = null;
      extensionJobIdRef.current = null;
    }

    if (report) {
      try {
        await persistReport(jobId, measureUrl, report);
      } catch (err) {
        console.error('[measure] persistReport failed', err);
        const message = err instanceof Error ? `${err.message} (at ${err.stack?.split('\n')[1]?.trim() ?? 'unknown'})` : String(err);
        setJobError('persist/failed', message, jobId);
        await saveJob({ id: jobId, url: measureUrl, status: 'error', startedAt: Date.now(), error: message });
      }
      return;
    }
    if (errorEvent) {
      if (errorEvent.code === 'job/cancelled') {
        setJobCancelled();
        await saveJob({ id: jobId, url: measureUrl, status: 'cancelled', startedAt: Date.now() });
      } else {
        setJobError(errorEvent.code, errorEvent.message, jobId);
        await saveJob({ id: jobId, url: measureUrl, status: 'error', startedAt: Date.now(), error: errorEvent.message });
      }
      return;
    }
    setJobError('extension/internal', 'Extension closed without delivering a report.', jobId);
    await saveJob({ id: jobId, url: measureUrl, status: 'error', startedAt: Date.now(), error: 'no report' });
  }, [setJobError, setJobStreaming, appendJobEvent, setJobCancelled, persistReport]);

  const handleMeasure = useCallback(async (measureUrl: string, options?: Partial<MeasureRequest>) => {
    if (backend.kind === 'none') {
      toast.info('No backend detected — see options below or run the CLI locally.');
      return;
    }

    setJobSubmitting();

    const request: MeasureRequest = {
      url: measureUrl,
      runs: options?.runs ?? 5,
      mode: options?.mode ?? 'real',
      cacheMode: options?.cacheMode ?? 'cold-then-warm',
    };

    if (backend.kind === 'runner') {
      await runViaRunner(backend.baseUrl, measureUrl, request);
      return;
    }
    if (backend.kind === 'extension') {
      await runViaExtension(measureUrl, request);
      return;
    }
  }, [backend, setJobSubmitting, runViaRunner, runViaExtension]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold mb-6">Measure</h1>

        <div className="space-y-4">
          <UrlForm
            defaultUrl={url}
            autoFocus={!url}
            onSubmit={(u) => handleMeasure(u)}
            disabled={currentJob.phase === 'submitting' || currentJob.phase === 'streaming'}
          />
          <BackendCard />
        </div>

        <div className="mt-8">
          {currentJob.phase === 'streaming' && (
            <div className="space-y-3">
              <ProgressStream
                events={currentJob.events}
                runIndex={currentJob.runIndex}
                totalRuns={currentJob.totalRuns}
              />
              <div className="flex justify-end">
                <button
                  onClick={handleCancel}
                  className="text-sm text-muted-foreground hover:text-destructive transition-colors underline underline-offset-2"
                  aria-label="Cancel measurement"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {currentJob.phase === 'submitting' && (
            <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground animate-pulse">
              Submitting measurement…
            </div>
          )}
          {currentJob.phase === 'error' && (
            <ErrorState
              code={currentJob.code}
              message={currentJob.message}
              onRetry={setJobIdle}
            />
          )}
          {currentJob.phase === 'cancelled' && (
            <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              Measurement cancelled.{' '}
              <button onClick={setJobIdle} className="underline underline-offset-2 hover:text-foreground">
                Try again
              </button>
            </div>
          )}
          {currentJob.phase === 'idle' && backend.kind === 'none' && (
            <NoBackendGuide url={url} />
          )}
          {currentJob.phase === 'idle' && backend.kind !== 'none' && (
            <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
              <p className="text-sm">Enter a URL above and click Measure to start.</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function NoBackendGuide({ url }: { url: string }) {
  const command = url
    ? `npx -y @ohmyperf/cli@latest run ${url} --runs 5`
    : `npx -y @ohmyperf/cli@latest run https://your-site.com --runs 5`;
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="bg-muted/40 px-5 py-3 border-b border-border">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          {url ? 'Ready when a backend is connected' : 'How to measure'}
        </p>
        <p className="mt-1 text-sm">
          {url
            ? <>To measure <code className="font-mono text-foreground">{url}</code>, pick one of the three paths below.</>
            : 'This page is a thin client for the OhMyPerf engine — it needs a backend that owns a real Chromium. Pick a path:'}
        </p>
      </div>

      <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-[oklch(0.55_0.18_245)]/12 text-[oklch(0.40_0.18_245)] dark:text-[oklch(0.82_0.18_245)] text-xs font-semibold">1</span>
            <h3 className="font-semibold text-sm">Run the CLI now</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Single command. Drops a <code className="font-mono">report.json</code> you can drag onto <a href="/viewer/" className="underline underline-offset-2 hover:text-foreground">/viewer</a>.
          </p>
          <pre className="rounded-md bg-muted/60 px-3 py-2 text-[11px] font-mono text-foreground/85 overflow-x-auto">{command}</pre>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-[oklch(0.55_0.16_70)]/12 text-[oklch(0.40_0.16_70)] dark:text-[oklch(0.82_0.16_70)] text-xs font-semibold">2</span>
            <h3 className="font-semibold text-sm">Load the Chrome extension</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Direct download (54 KB). Web Store listing pending — meanwhile, load it unpacked.
          </p>
          <a
            href={`${process.env['NEXT_PUBLIC_BASE_PATH'] ?? ''}/downloads/ohmyperf-extension-v0.2.0.zip`}
            download
            className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1.5 rounded-md bg-[oklch(0.55_0.16_70)] dark:bg-[oklch(0.65_0.16_70)] text-white text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            ↓ Download v0.2.0.zip
          </a>
          <ol className="mt-2 text-[11px] text-muted-foreground list-decimal list-inside leading-relaxed space-y-0.5">
            <li>Unzip the download</li>
            <li>Open <code className="font-mono">chrome://extensions</code></li>
            <li>Enable <strong className="text-foreground">Developer mode</strong> (top-right)</li>
            <li>Click <strong className="text-foreground">Load unpacked</strong> → pick the folder</li>
            <li>Reload this page — auto-detected</li>
          </ol>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-[oklch(0.55_0.17_145)]/12 text-[oklch(0.40_0.17_145)] dark:text-[oklch(0.82_0.17_145)] text-xs font-semibold">3</span>
            <h3 className="font-semibold text-sm">Use the MCP server</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Drop into Claude / OpenCode / Cursor — 16 tools including <code className="font-mono">measure</code> + <code className="font-mono">verify_fix</code>.
          </p>
          <pre className="rounded-md bg-muted/60 px-3 py-2 text-[11px] font-mono text-foreground/85 overflow-x-auto">npx -y @ohmyperf/mcp-server</pre>
        </div>
      </div>

      <ExtensionIdPaste />

      <div className="bg-muted/20 px-5 py-3 border-t border-border text-xs text-muted-foreground">
        Already have a <code className="font-mono text-foreground">report.json</code>?{' '}
        <a href="/viewer/" className="underline underline-offset-2 hover:text-foreground font-medium">
          Drop it on the viewer →
        </a>
      </div>
    </div>
  );
}

function ExtensionIdPaste() {
  return (
    <details className="bg-muted/10 px-5 py-3 border-t border-border text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
        Extension installed but still not detected? Paste its ID
      </summary>
      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. mdlgknjbmkjondofohmbpkmlnmncbjmg"
          pattern="[a-p]{32}"
          maxLength={32}
          aria-label="Chrome extension ID (32 lowercase a-p chars)"
          className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-[12px] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id="ext-id-paste"
        />
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById('ext-id-paste') as HTMLInputElement | null;
            const id = el?.value.trim().toLowerCase() ?? '';
            if (!/^[a-p]{32}$/.test(id)) {
              alert('Invalid Chrome extension ID. It must be exactly 32 lowercase letters a-p (32 chars).');
              return;
            }
            try {
              localStorage.setItem('ohmyperf:extension-id', id);
            } catch {
              alert('Could not save to localStorage. Try a non-incognito window.');
              return;
            }
            window.location.reload();
          }}
          className="h-8 px-3 rounded-md bg-foreground text-background text-[12px] font-medium hover:opacity-90"
        >
          Save + reload
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
        Find your ID at <code className="font-mono">chrome://extensions</code> — it&apos;s the 32-char string under <strong className="text-foreground">OhMyPerf</strong>. After saving, the page reloads and the extension is detected automatically. (Unpacked extensions get a per-machine ID — the bundled default only works if you used Chrome Web Store install.)
      </p>
    </details>
  );
}

export default function MeasurePage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading…</div>}>
      <MeasureContent />
    </Suspense>
  );
}
