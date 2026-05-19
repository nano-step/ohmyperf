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
      toast.error('No backend detected. Install the extension or start the local runner.');
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
