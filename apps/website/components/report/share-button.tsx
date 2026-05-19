'use client';

import { useState } from 'react';
import { Loader2, Share2 } from 'lucide-react';
import type { Report } from '@ohmyperf/core';
import {
  uploadReport,
  ShareUploadError,
  ShareSecretLeakError,
} from '@ohmyperf/share-client';
import { toast } from 'sonner';
import { getShareEndpoint } from '@/lib/env';

interface Props {
  report: Report;
}

type Status = 'idle' | 'pending' | 'leak-prompt';

export function ShareButton({ report }: Props) {
  // SPA path: env-secret scan is a no-op (browser has no env). The
  // ShareSecretLeakError branch is defensive for CLI-style usage and tests
  // that mock the redaction pipeline; in production browser it never fires.
  const endpoint = getShareEndpoint();
  const [status, setStatus] = useState<Status>('idle');
  const [leakKeys, setLeakKeys] = useState<ReadonlyArray<string>>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  async function doUpload(skipRedaction: boolean) {
    if (!endpoint) {
      setPopoverOpen((v) => !v);
      return;
    }
    setStatus('pending');
    try {
      const res = await uploadReport({ endpoint, report, skipRedaction });
      setStatus('idle');
      try {
        await navigator.clipboard.writeText(res.url);
        toast.success('Share link copied', { description: res.url });
      } catch {
        toast.success('Share link ready', { description: res.url });
      }
    } catch (err) {
      setStatus('idle');
      if (err instanceof ShareSecretLeakError) {
        setLeakKeys(err.leaks.map((l) => l.envKey));
        setStatus('leak-prompt');
        return;
      }
      if (err instanceof ShareUploadError) {
        toast.error(`Upload failed (${String(err.status)})`, { description: err.message });
        return;
      }
      if (err instanceof TypeError) {
        toast.error('Network error', { description: 'Check connection and try again.' });
        return;
      }
      toast.error('Share failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!endpoint) {
    return (
      <div className="relative inline-block">
        <button
          type="button"
          data-testid="share-button"
          onClick={() => setPopoverOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          aria-expanded={popoverOpen}
        >
          <Share2 className="h-4 w-4" aria-hidden />
          Share
        </button>
        {popoverOpen && (
          <div
            role="dialog"
            className="absolute right-0 top-full mt-2 z-10 w-80 rounded-lg border border-border bg-card p-4 text-xs shadow-md"
          >
            <p className="font-medium mb-1">Share endpoint not configured.</p>
            <p className="text-muted-foreground mb-2">
              Set <code className="font-mono">NEXT_PUBLIC_SHARE_ENDPOINT</code> to a deployed{' '}
              <code className="font-mono">@ohmyperf/share-server</code>, or self-host one.
            </p>
            <a
              href="/docs/measurement-spa-deploy.md"
              className="underline underline-offset-2 hover:text-foreground"
            >
              See the deploy guide
            </a>
          </div>
        )}
      </div>
    );
  }

  if (status === 'leak-prompt') {
    return (
      <div
        role="alertdialog"
        className="rounded-lg border border-destructive bg-card p-3 text-xs"
      >
        <p className="font-medium mb-2 text-destructive">Possible secret leak detected</p>
        <ul className="font-mono mb-3 list-disc pl-4">
          {leakKeys.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStatus('idle')}
            className="rounded-md border px-3 py-1 text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => doUpload(true)}
            className="rounded-md border border-destructive bg-destructive/10 text-destructive px-3 py-1 text-sm hover:bg-destructive/20 transition-colors"
          >
            Share anyway (unsafe)
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="share-button"
      disabled={status === 'pending'}
      onClick={() => doUpload(false)}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50 transition-colors"
    >
      {status === 'pending' ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Share2 className="h-4 w-4" aria-hidden />
      )}
      {status === 'pending' ? 'Sharing…' : 'Share'}
    </button>
  );
}
