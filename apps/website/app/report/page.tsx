'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { SiteHeader } from '@/components/layout/site-header';
import { ReportViewer } from '@/components/viewer/report-viewer';
import { CwvGauge } from '@/components/metrics/cwv-gauge';
import { InsightsSection } from '@/components/insights/insights-section';
import { ShareButton } from '@/components/report/share-button';
import { ExportMenu } from '@/components/report/export-menu';
import { StylePicker } from '@/components/report/style-picker';
import { BrandStyleInjector } from '@/components/report/brand-style-injector';
import { EmptyState } from '@/components/empty-state';
import { ReportHistoryList } from '@/components/report/report-history-list';
import { ReportHistoryToolbar, type ModeFilter } from '@/components/report/report-history-toolbar';
import {
  listReportsPage,
  deleteReports,
  deleteReport,
  getReport,
  type ReportSummary,
  type StoredReport,
} from '@/lib/storage';
import type { Report } from '@ohmyperf/core';

function ReportContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  if (id) return <SingleReport id={id} />;
  return <ReportHistory />;
}

function SingleReport({ id }: { id: string }) {
  const [stored, setStored] = useState<StoredReport | null | undefined>(undefined);

  useEffect(() => {
    getReport(id).then((r) => setStored(r ?? null)).catch(() => setStored(null));
  }, [id]);

  if (stored === undefined) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-5xl px-6 py-12">
          <div className="text-muted-foreground">Loading report…</div>
        </main>
      </>
    );
  }

  if (!stored) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <EmptyState
            title="Report not found"
            description="Reports are stored locally in your browser and may have been cleared."
            ctaLabel="All reports"
            ctaHref="/report"
          />
        </main>
      </>
    );
  }

  return <ReportDisplay report={stored.report} />;
}

function ReportDisplay({ report }: { report: Report }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        <BrandStyleInjector />
        <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-background/90 backdrop-blur border-b flex items-center justify-end gap-2">
          <StylePicker />
          <ShareButton report={report} />
          <ExportMenu report={report} />
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold truncate max-w-xl">{report.meta.url}</h1>
          <Link href="/report" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← All reports
          </Link>
        </div>
        <CwvGauge report={report} />
        <InsightsSection report={report} />
        <ReportViewer report={report} />
      </main>
    </>
  );
}

function ReportHistory() {
  const [items, setItems] = useState<ReportSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<ModeFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const confirmRef = useRef<HTMLDialogElement>(null);

  const load = useCallback(async (q: string, m: ModeFilter, reset: boolean) => {
    const opts: Parameters<typeof listReportsPage>[0] = { limit: 20 };
    if (q) opts.urlSubstring = q;
    if (m !== 'all') opts.mode = m;
    const result = await listReportsPage(opts);
    if (reset) {
      setItems(result.items);
      setSelected(new Set());
    } else {
      setItems((prev) => [...(prev ?? []), ...result.items]);
    }
    setNextCursor(result.nextCursor);
  }, []);

  useEffect(() => {
    load(query, mode, true).catch(() => setItems([]));
  }, [load, query, mode]);

  const loadMore = async () => {
    if (!nextCursor) return;
    const opts: Parameters<typeof listReportsPage>[0] = { cursorKey: nextCursor, limit: 20 };
    if (query) opts.urlSubstring = query;
    if (mode !== 'all') opts.mode = mode;
    const result = await listReportsPage(opts);
    setItems((prev) => [...(prev ?? []), ...result.items]);
    setNextCursor(result.nextCursor);
  };

  const handleDelete = async (id: string) => {
    await deleteReport(id);
    setItems((prev) => prev?.filter((r) => r.id !== id) ?? []);
    setSelected((prev) => { const s = new Set(prev); s.delete(id); return s; });
    toast.success('Report deleted.');
  };

  const handleToggleSelect = (id: string) => {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const handleBulkDeleteConfirm = () => {
    setShowConfirm(true);
    setTimeout(() => confirmRef.current?.showModal?.(), 0);
  };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    await deleteReports(ids);
    setItems((prev) => prev?.filter((r) => !selected.has(r.id)) ?? []);
    setSelected(new Set());
    setShowConfirm(false);
    toast.success(`${ids.length} report${ids.length > 1 ? 's' : ''} deleted.`);
  };

  const handleQueryChange = (q: string) => setQuery(q);
  const handleModeChange = (m: ModeFilter) => setMode(m);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold mb-6">Report History</h1>

        <ReportHistoryToolbar
          query={query}
          onQueryChange={handleQueryChange}
          mode={mode}
          onModeChange={handleModeChange}
          selectedCount={selected.size}
          onBulkDelete={handleBulkDeleteConfirm}
        />

        {items === null ? (
          <div className="text-muted-foreground text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No reports yet — measure your first URL."
            ctaLabel="Measure a URL"
            ctaHref="/measure"
          />
        ) : (
          <>
            <ReportHistoryList
              items={items}
              selected={selected}
              onToggleSelect={handleToggleSelect}
              onDelete={handleDelete}
            />
            {nextCursor && (
              <button
                onClick={loadMore}
                className="mt-6 w-full rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors"
              >
                Load more
              </button>
            )}
          </>
        )}
      </main>

      {showConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        >
          <div className="bg-background rounded-lg border p-6 max-w-sm w-full mx-4 space-y-4">
            <h2 id="confirm-title" className="text-base font-semibold">
              Delete {selected.size} report{selected.size > 1 ? 's' : ''}?
            </h2>
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm rounded-md border hover:bg-muted transition-colors"
                autoFocus
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading…</div>}>
      <ReportContent />
    </Suspense>
  );
}
