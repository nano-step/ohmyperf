import { create } from 'zustand';
import type { Backend } from './backend-detector';
import type { ProgressEvent } from '@ohmyperf/shared-types';
import type { StoredReport } from './storage';

export type JobPhase =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'streaming'; jobId: string; events: ProgressEvent[]; runIndex: number; totalRuns: number }
  | { phase: 'done'; jobId: string; reportId: string }
  | { phase: 'error'; jobId?: string; code: string; message: string }
  | { phase: 'cancelled' };

interface OhMyPerfStore {
  backend: Backend;
  setBackend: (b: Backend) => void;

  currentJob: JobPhase;
  setJobIdle: () => void;
  setJobSubmitting: () => void;
  setJobStreaming: (jobId: string) => void;
  appendJobEvent: (event: ProgressEvent) => void;
  setJobDone: (jobId: string, reportId: string) => void;
  setJobError: (code: string, message: string, jobId?: string) => void;
  setJobCancelled: () => void;

  recentReports: StoredReport[];
  setRecentReports: (reports: StoredReport[]) => void;
  prependReport: (report: StoredReport) => void;
  removeReport: (id: string) => void;
}

export const useStore = create<OhMyPerfStore>((set) => ({
  backend: { kind: 'none' },
  setBackend: (b) => set({ backend: b }),

  currentJob: { phase: 'idle' },
  setJobIdle: () => set({ currentJob: { phase: 'idle' } }),
  setJobSubmitting: () => set({ currentJob: { phase: 'submitting' } }),
  setJobStreaming: (jobId) =>
    set({ currentJob: { phase: 'streaming', jobId, events: [], runIndex: 0, totalRuns: 1 } }),
  appendJobEvent: (event) =>
    set((s) => {
      if (s.currentJob.phase !== 'streaming') return {};
      const next = { ...s.currentJob, events: [...s.currentJob.events, event] };
      if (event.type === 'run-start') {
        next.runIndex = event.runIndex;
        next.totalRuns = event.totalRuns;
      }
      return { currentJob: next };
    }),
  setJobDone: (jobId, reportId) =>
    set({ currentJob: { phase: 'done', jobId, reportId } }),
  setJobError: (code, message, jobId) =>
    set({ currentJob: jobId !== undefined ? { phase: 'error', code, message, jobId } : { phase: 'error', code, message } }),
  setJobCancelled: () => set({ currentJob: { phase: 'cancelled' } }),

  recentReports: [],
  setRecentReports: (reports) => set({ recentReports: reports }),
  prependReport: (report) =>
    set((s) => ({ recentReports: [report, ...s.recentReports] })),
  removeReport: (id) =>
    set((s) => ({ recentReports: s.recentReports.filter((r) => r.id !== id) })),
}));
