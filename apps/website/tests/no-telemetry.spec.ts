import { test, expect, type Page } from '@playwright/test';

const TRACKER_DOMAINS = [
  'google-analytics.com',
  'googletagmanager.com',
  'analytics.google.com',
  'doubleclick.net',
  'googlesyndication.com',
  'segment.com',
  'cdn.segment.com',
  'api.segment.io',
  'mixpanel.com',
  'api.mixpanel.com',
  'cdn.mxpnl.com',
  'hotjar.com',
  'script.hotjar.com',
  'sentry.io',
  'ingest.sentry.io',
  'datadoghq.com',
  'browser.rum.datadoghq.com',
  'posthog.com',
  'eu.posthog.com',
  'app.posthog.com',
  'connect.facebook.net',
  'analytics.tiktok.com',
  'business.tiktok.com',
  'static.ads-twitter.com',
  'analytics.twitter.com',
  'plausible.io',
  'umami.is',
  'static.cloudflareinsights.com',
  'vercel-insights.com',
  'vitals.vercel-insights.com',
  'amplitude.com',
  'api.amplitude.com',
  'cdn.heapanalytics.com',
  'heapanalytics.com',
  'fullstory.com',
  'rs.fullstory.com',
  'clarity.ms',
  'bat.bing.com',
  'sc-static.net',
  'snap.licdn.com',
];

function isTracker(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return TRACKER_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

interface Flow {
  name: string;
  steps: (page: Page) => Promise<void>;
}

const FLOWS: Flow[] = [
  {
    name: 'landing-only',
    steps: async (page) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
    },
  },
  {
    name: 'submit-form',
    steps: async (page) => {
      await page.goto('/measure');
      await page.waitForLoadState('networkidle');
    },
  },
  {
    name: 'viewer-route',
    steps: async (page) => {
      await page.goto('/viewer');
      await page.waitForLoadState('networkidle');
    },
  },
  {
    name: 'history-route',
    steps: async (page) => {
      await page.goto('/report');
      await page.waitForLoadState('networkidle');
    },
  },
];

for (const flow of FLOWS) {
  test(`no telemetry: ${flow.name}`, async ({ page }) => {
    const trackerRequests: string[] = [];
    page.on('request', (req) => {
      if (isTracker(req.url())) trackerRequests.push(req.url());
    });
    await flow.steps(page);
    expect(
      trackerRequests,
      `Tracker requests detected in flow "${flow.name}"`,
    ).toEqual([]);
  });
}
