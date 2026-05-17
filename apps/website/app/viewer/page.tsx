'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { SiteHeader } from '@/components/layout/site-header';
import { saveReport } from '@/lib/storage';
import type { Report } from '@ohmyperf/core';

function isValidReport(obj: unknown): obj is Report {
  if (!obj || typeof obj !== 'object') return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r.schemaVersion === 'string' &&
    typeof r.meta === 'object' &&
    r.meta !== null &&
    Array.isArray(r.runs) &&
    Array.isArray(r.audits)
  );
}

export default function ViewerPage() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      toast.error('Only .json report files are supported.');
      return;
    }
    setLoading(true);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!isValidReport(parsed)) {
        toast.error('Invalid OhMyPerf report format.');
        return;
      }
      const id = await saveReport(parsed);
      router.push(`/report/${id}/`);
    } catch {
      toast.error('Could not parse report file.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file).catch(() => undefined);
  }, [handleFile]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file).catch(() => undefined);
  }, [handleFile]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold mb-2">Report Viewer</h1>
        <p className="text-muted-foreground mb-8">
          Drop a{' '}
          <code className="text-sm bg-muted text-foreground px-1 rounded">report.json</code>{' '}
          file to view it locally. No upload — runs entirely in your browser.
        </p>

        <label
          className={`block rounded-lg border-2 border-dashed p-16 text-center cursor-pointer transition-colors ${
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
          } ${loading ? 'opacity-50 pointer-events-none' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={onFileInput}
            disabled={loading}
          />
          {loading ? (
            <p className="text-muted-foreground">Loading report…</p>
          ) : (
            <>
              <p className="text-lg mb-2 text-muted-foreground">
                {dragging ? 'Drop to load report' : 'Drop report.json here'}
              </p>
              <p className="text-sm text-muted-foreground">or click to browse</p>
            </>
          )}
        </label>
      </main>
    </>
  );
}
