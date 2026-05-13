'use client';

import Link from 'next/link';
import type { ReportSummary } from '@/lib/storage';
import { shortenUrl } from '@/lib/format';

interface ReportHistoryListProps {
  items: ReportSummary[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ReportHistoryList({ items, selected, onToggleSelect, onDelete }: ReportHistoryListProps) {
  return (
    <ul className="space-y-3" role="list" aria-label="Report history">
      {items.map((r) => (
        <li
          key={r.id}
          className="rounded-lg border bg-card p-4 flex items-center gap-3"
        >
          <input
            type="checkbox"
            checked={selected.has(r.id)}
            onChange={() => onToggleSelect(r.id)}
            aria-label={`Select report for ${r.url}`}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <Link
              href={`/report/?id=${encodeURIComponent(r.id)}`}
              className="text-sm font-medium hover:underline truncate block"
            >
              {shortenUrl(r.url)}
            </Link>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
              <span>{r.mode}</span>
              <span>{new Date(r.createdAt).toLocaleString()}</span>
              <span>{(r.sizeBytes / 1024).toFixed(1)} KB</span>
            </div>
          </div>
          <button
            onClick={() => onDelete(r.id)}
            className="shrink-0 text-xs text-muted-foreground hover:text-destructive transition-colors"
            aria-label={`Delete report for ${r.url}`}
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
