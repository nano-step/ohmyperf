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
import { saveReport, saveJob } from '@/lib/storage';
import type { MeasureRequest } from '@ohmyperf/shared-types';

function MeasureContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const url = searchParams.get('url') ?? '';

  const { backend, currentJob, setJobSubmitting, setJobStreaming, appendJobEvent, setJobDone, setJobError, setJobCancelled, setJobIdle, prependReport } = useStore();
  const streamHandleRef = useRef<StreamHandle | null>(null);

  const handleCancel = useCallback(() => {
    streamHandleRef.current?.cancel();
    streamHandleRef.current = null;
  }, []);

  const handleMeasure = useCallback(async (measureUrl: string, options?: Partial<MeasureRequest>) => {
    if (backend.kind === 'none') {
      toast.error('No backend detected. Install the extension or start the local runner.');
      return;
    }
    if (backend.kind !== 'runner') {
      toast.error('Extension path not yet implemented. Please use the local runner.');
      return;
    }

    setJobSubmitting();

    const request: MeasureRequest = {
      url: measureUrl,
      runs: options?.runs ?? 5,
      mode: options?.mode ?? 'real',
      cacheMode: options?.cacheMode ?? 'cold-then-warm',
    };

    let jobId: string;
    try {
      jobId = await submitMeasure({ baseUrl: backend.baseUrl }, request);
    } catch (err) {
      const code = err instanceof RunnerClientError ? err.code : 'internal/error';
      const message = err instanceof Error ? err.message : String(err);
      setJobError(code, message);
      return;
    }

    setJobStreaming(jobId);

    await saveJob({
      id: jobId,
      url: measureUrl,
      status: 'running',
      startedAt: Date.now(),
    });

    const handle = streamJob(
      { baseUrl: backend.baseUrl },
      jobId,
      (event) => { appendJobEvent(event); },
    );
    streamHandleRef.current = handle;

    try {
      const report = await handle.done;
      const reportId = await saveReport(report);
      setJobDone(jobId, reportId);

      const stored = {
        id: report.meta.measurementId,
        url: report.meta.url,
        createdAt: Date.now(),
        mode: report.meta.mode as 'real' | 'ci-stable',
        sizeBytes: new TextEncoder().encode(JSON.stringify(report)).length,
        report,
      };
      prependReport(stored);

      await saveJob({ id: jobId, url: measureUrl, status: 'done', startedAt: Date.now(), reportId });
      router.push(`/report/?id=${reportId}`);
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
      streamHandleRef.current = null;
    }
  }, [backend, setJobSubmitting, setJobStreaming, appendJobEvent, setJobDone, setJobError, setJobCancelled, prependReport, router]);

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
          {currentJob.phase === 'idle' && (
            <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
              <p className="text-sm">Enter a URL above to start measuring.</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

export default function MeasurePage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading…</div>}>
      <MeasureContent />
    </Suspense>
  );
}
