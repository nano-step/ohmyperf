'use client';

import { useState } from 'react';
import type { Report } from '@ohmyperf/core';
import { renderMarkdown } from '@ohmyperf/reporter-markdown';
import { toast } from 'sonner';

interface Props {
  report: Report;
}

function downloadBlob(filename: string, body: string, mime: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${label}`);
  } catch {
    toast.error('Clipboard write failed', { description: 'Insecure context or denied permission.' });
  }
}

export function ExportMenu({ report }: Props) {
  const [open, setOpen] = useState(false);
  const reportId = report.meta.measurementId;

  const items: ReadonlyArray<{ key: string; label: string; run: () => void | Promise<void> }> = [
    {
      key: 'json-file',
      label: 'Download JSON',
      run: () =>
        downloadBlob(
          `ohmyperf-${reportId}.json`,
          JSON.stringify(report, null, 2),
          'application/json',
        ),
    },
    {
      key: 'md-file',
      label: 'Download Markdown',
      run: () =>
        downloadBlob(`ohmyperf-${reportId}.md`, renderMarkdown(report), 'text/markdown'),
    },
    {
      key: 'json-copy',
      label: 'Copy as JSON',
      run: () => copyText(JSON.stringify(report), 'JSON'),
    },
    {
      key: 'md-copy',
      label: 'Copy as Markdown',
      run: () => copyText(renderMarkdown(report), 'Markdown'),
    },
  ];

  return (
    <div className="relative inline-block">
      <button
        type="button"
        data-testid="export-menu"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted transition-colors"
      >
        Export
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 top-full mt-2 z-10 w-48 rounded-md border border-border bg-card py-1 shadow-md text-sm"
        >
          {items.map((it) => (
            <li key={it.key} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  setOpen(false);
                  await it.run();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-muted"
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
