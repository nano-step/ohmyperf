'use client';

import type { RunnerErrorCode } from '@/lib/runner-client';
import type { ErrorCode } from '@ohmyperf/shared-types';
import Link from 'next/link';

type AnyErrorCode = RunnerErrorCode | ErrorCode | string;

interface Props {
  code: AnyErrorCode;
  message: string;
  onRetry?: () => void;
}

interface ErrorInfo {
  title: string;
  guidance: string;
}

function getErrorInfo(code: AnyErrorCode, message: string): ErrorInfo {
  switch (code) {
    case 'navigation/timeout':
      return { title: 'Navigation Timed Out', guidance: 'The page took too long to load. Check if the URL is correct and the server is reachable.' };
    case 'navigation/cert-error':
      return { title: 'SSL Certificate Error', guidance: 'The page has an invalid SSL certificate. Verify the site is accessible in a browser.' };
    case 'navigation/csp-blocked':
      return { title: 'CSP Blocked', guidance: 'The page blocked the measurement via Content Security Policy.' };
    case 'navigation/network':
      return { title: 'Network Error', guidance: 'Could not reach the target URL. Check your network connection.' };
    case 'ssrf/blocked-range':
      return { title: 'Private URL Blocked', guidance: 'The runner blocked this URL (private/loopback address). Set OHMYPERF_RUNNER_ALLOW_PRIVATE=1 to override.' };
    case 'ssrf/dns-failure':
      return { title: 'DNS Resolution Failed', guidance: 'The hostname could not be resolved. Check the URL is correct.' };
    case 'rate-limit/exceeded':
      return { title: 'Rate Limit Exceeded', guidance: 'Too many measurements. Wait a minute and try again.' };
    case 'runner/network-error':
      return { title: 'Runner Offline', guidance: 'Cannot reach the local runner. Make sure it is running: docker compose up -d.' };
    case 'runner/browser-missing':
      return {
        title: 'Browser Not Installed',
        guidance: 'The runner needs Playwright Chromium. Run this in the project root:\n\n  pnpm exec playwright install chromium\n\nThen retry the measurement (no need to restart the runner).',
      };
    case 'internal/error':
      return { title: 'Internal Error', guidance: 'An unexpected error occurred. See the message and DevTools Console for details.' };
    case 'persist/failed':
      return { title: 'Could Not Save Report', guidance: 'Measurement succeeded but saving to local storage failed. See the message below and DevTools Console for stack trace.' };
    case 'extension/internal':
      return { title: 'Extension Error', guidance: 'The Chrome extension reported an internal error. See the message below.' };
    case 'runner/cors-blocked':
    case 'runner/pna-blocked':
      return { title: 'CORS / Private Network Access Blocked', guidance: 'The browser blocked the connection to the local runner. Ensure the runner version supports PNA headers.' };
    case 'runner/sse-failed':
      return { title: 'Stream Failed', guidance: 'The event stream disconnected unexpectedly. Try again.' };
    case 'runner/cancelled':
    case 'job/cancelled':
      return { title: 'Measurement Cancelled', guidance: 'The measurement was cancelled.' };
    case 'extension/devtools-attached':
      return { title: 'DevTools Open on Target Tab', guidance: 'Close DevTools on the target tab and retry.' };
    case 'extension/target-tab-closed':
      return { title: 'Target Tab Closed', guidance: 'The tab was closed during measurement. Open a new measurement.' };
    case 'extension/self-measurement-refused':
      return { title: 'Cannot Measure This Page', guidance: 'The extension refuses to measure ohmyperf.dev itself. Use a different URL.' };
    case 'extension/multi-run-unsupported':
      return { title: 'Multi-Run Not Supported', guidance: 'The extension supports single-run only. Use the local runner for multi-run statistics.' };
    case 'validation/bad-request':
      return { title: 'Invalid Request', guidance: 'The measurement request was invalid. Check the URL and settings.' };
    case 'job/not-found':
      return { title: 'Job Not Found', guidance: 'The measurement job could not be found. It may have been evicted.' };
    default:
      return { title: 'Measurement Failed', guidance: message };
  }
}

export function ErrorState({ code, message, onRetry }: Props) {
  const info = getErrorInfo(code, message);
  return (
    <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-5 space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-red-500 mt-0.5 text-lg">✕</span>
        <div className="flex-1">
          <p className="font-semibold text-red-900 dark:text-red-300">{info.title}</p>
          <p className="text-sm text-red-700 dark:text-red-400 mt-0.5 whitespace-pre-line">{info.guidance}</p>
          <p className="text-xs text-red-500 dark:text-red-500 mt-1 font-mono">
            <code>code: {String(code)}</code>
          </p>
          {message !== info.guidance && (
            <p className="text-xs text-red-500 dark:text-red-500 mt-1 font-mono break-all">
              <code>{message}</code>
            </p>
          )}
          <p className="text-xs text-red-400 dark:text-red-500 mt-2">
            Check DevTools Console for the full stack trace.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-sm px-3 py-1.5 rounded-md bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-800 dark:text-red-300 transition-colors"
          >
            Retry
          </button>
        )}
        <Link
          href="/"
          className="text-sm px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
