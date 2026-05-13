'use client';

import { useRef } from 'react';

export type ModeFilter = 'all' | 'real' | 'ci-stable';

interface ReportHistoryToolbarProps {
  query: string;
  onQueryChange: (q: string) => void;
  mode: ModeFilter;
  onModeChange: (m: ModeFilter) => void;
  selectedCount: number;
  onBulkDelete: () => void;
}

export function ReportHistoryToolbar({
  query,
  onQueryChange,
  mode,
  onModeChange,
  selectedCount,
  onBulkDelete,
}: ReportHistoryToolbarProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onQueryChange(v), 200);
  }

  return (
    <div className="flex flex-wrap gap-3 mb-6 items-center">
      <input
        type="search"
        placeholder="Search by URL…"
        defaultValue={query}
        onChange={handleInput}
        autoFocus
        aria-label="Search reports by URL"
        className="flex-1 min-w-48 rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <select
        value={mode}
        onChange={(e) => onModeChange(e.target.value as ModeFilter)}
        aria-label="Filter by mode"
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="all">All modes</option>
        <option value="real">Real</option>
        <option value="ci-stable">CI stable</option>
      </select>
      {selectedCount > 0 && (
        <button
          onClick={onBulkDelete}
          className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground hover:opacity-90 transition-opacity"
          aria-label={`Delete ${selectedCount} selected report${selectedCount > 1 ? 's' : ''}`}
        >
          Delete {selectedCount}
        </button>
      )}
    </div>
  );
}
