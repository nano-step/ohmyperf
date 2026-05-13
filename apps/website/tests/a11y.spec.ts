import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = [
  { path: '/', name: 'landing' },
  { path: '/measure', name: 'measure' },
  { path: '/viewer', name: 'viewer' },
  { path: '/report', name: 'history' },
  { path: '/report/sample-fixture-id/', name: 'report-detail' },
];

const DISABLED_RULES: string[] = [];

for (const route of ROUTES) {
  test(`a11y: ${route.name} (${route.path})`, async ({ page }) => {
    await page.goto(route.path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(DISABLED_RULES)
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}
