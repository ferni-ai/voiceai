/**
 * Production smoke tests: run by .github/workflows/e2e-tests.yml after a
 * successful deploy (or manually) against TEST_URL, with
 * playwright.smoke.config.ts. The offline suite in tests/e2e runs on PRs.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'https://ferni-prod.web.app';
const LANDING_URL = process.env.LANDING_URL || 'https://ferni.ai';

test.describe('Ferni App', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Ferni/i);
  });

  test('app shell renders', async ({ page }) => {
    await page.goto(BASE_URL);
    // Wait for app to hydrate
    await page.waitForLoadState('networkidle');
    // Check that main content area exists
    const main = page.locator('main, #app, .app-container').first();
    await expect(main).toBeVisible({ timeout: 10000 });
  });

  test('no console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Filter out known acceptable errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('analytics') && !e.includes('third-party')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('responsive layout works', async ({ page }) => {
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(BASE_URL);
    await expect(page.locator('body')).toBeVisible();

    // Tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await expect(page.locator('body')).toBeVisible();

    // Desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload();
    await expect(page.locator('body')).toBeVisible();
  });

  test('critical assets load', async ({ page }) => {
    const failedRequests: string[] = [];

    page.on('requestfailed', (request) => {
      failedRequests.push(request.url());
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Filter out non-critical failures
    const criticalFailures = failedRequests.filter(
      (url) => url.includes('.js') || url.includes('.css') || url.includes('api/')
    );

    expect(criticalFailures).toHaveLength(0);
  });
});

test.describe('Landing Page', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto(LANDING_URL);
    await expect(page).toHaveTitle(/Ferni/i);
  });

  test('CTA button is visible', async ({ page }) => {
    await page.goto(LANDING_URL);
    // Look for common CTA patterns
    const cta = page
      .locator('a[href*="app"], button:has-text("Start"), button:has-text("Try")')
      .first();
    await expect(cta).toBeVisible({ timeout: 10000 });
  });
});
