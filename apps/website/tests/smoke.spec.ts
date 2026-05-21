import { test, expect } from '@playwright/test';

test.describe('Phase β smoke', () => {
  test('landing renders hero + form', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText(/LLM agent can actually fix/i);
    await expect(page.getByText('OhMyPerf').first()).toBeVisible();
    await expect(page.getByLabel('URL to measure')).toBeVisible();
    await expect(page.getByRole('button', { name: /measure/i })).toBeEnabled();
  });

  test('form submit routes to /measure with url query', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('URL to measure').fill('https://example.com');
    await page.getByRole('button', { name: /measure/i }).click();
    await expect(page).toHaveURL(/\/measure\/\?url=https%3A%2F%2Fexample\.com/);
  });

  test('backend detector card renders "none" state without backend', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/install.*extension|local runner/i)).toBeVisible({ timeout: 2000 });
  });

  test('measure route does not probe local runner before submit', async ({ page }) => {
    const healthRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (/^http:\/\/(localhost|127\.0\.0\.1):5174\/api\/health/.test(url)) {
        healthRequests.push(url);
      }
    });

    await page.goto('/measure/?url=https%3A%2F%2Fexample.com');
    await page.waitForLoadState('networkidle');

    expect(healthRequests).toEqual([]);
  });

  test('CSP meta tag present', async ({ page }) => {
    await page.goto('/');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('http://localhost:5174');
    expect(csp).not.toContain('https://ohmyperf.dev');
  });

  test('private URL triggers soft-warn', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('URL to measure').fill('http://192.168.1.1');
    await page.getByRole('button', { name: /measure/i }).click();
    await expect(page.getByText(/private IP/i)).toBeVisible();
  });
});
