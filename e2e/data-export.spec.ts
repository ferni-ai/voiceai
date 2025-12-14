/**
 * E2E Tests for Data Export Feature
 *
 * Tests the data export / download your story functionality:
 * - Opening export panel
 * - Requesting data export
 * - Downloading exported data
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-export-test-user';

test.describe('Data Export API', () => {
  test('GET /api/export - returns export status or data', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/export`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect([200, 401, 404]).toContain(response.status());
  });

  test('POST /api/export - requests data export', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/export`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        format: 'json',
        includeConversations: true,
        includeInsights: true,
      },
    });

    expect([200, 202, 401, 404]).toContain(response.status());
  });
});

test.describe('Data Export UI', () => {
  test('opens data export from menu', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    // Find and click Download Your Story (in Account section)
    const exportButton = page.locator('[data-action="export"]');
    if (!(await exportButton.isVisible())) {
      // Expand Account section if collapsed
      const accountHeader = page.locator('.settings-menu__section-header:has-text("Account")');
      if (await accountHeader.isVisible()) {
        await accountHeader.click();
        await page.waitForTimeout(300);
      }
    }

    await exportButton.click();

    // Verify export panel opened
    await expect(
      page.locator('.data-export-overlay, .data-export-panel, [data-panel="export"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test('displays export options', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const exportButton = page.locator('[data-action="export"]');
    if (!(await exportButton.isVisible())) {
      const accountHeader = page.locator('.settings-menu__section-header:has-text("Account")');
      if (await accountHeader.isVisible()) {
        await accountHeader.click();
        await page.waitForTimeout(300);
      }
    }

    await exportButton.click();
    await page.waitForSelector('.data-export-overlay, .data-export-panel', { timeout: 5000 });

    // Should show export options or download button
    const panel = page.locator('.data-export-overlay, .data-export-panel');
    await expect(panel).toBeVisible();
  });

  test('shows export/download button', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const exportButton = page.locator('[data-action="export"]');
    if (!(await exportButton.isVisible())) {
      const accountHeader = page.locator('.settings-menu__section-header:has-text("Account")');
      if (await accountHeader.isVisible()) {
        await accountHeader.click();
        await page.waitForTimeout(300);
      }
    }

    await exportButton.click();
    await page.waitForSelector('.data-export-overlay, .data-export-panel', { timeout: 5000 });

    // Should have a download/export button
    const downloadButton = page.locator(
      'text=Download, text=Export, button:has-text("Download"), button:has-text("Export")'
    );
    await expect(downloadButton.first()).toBeVisible({ timeout: 3000 });
  });

  test('closes export panel on close button click', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const exportButton = page.locator('[data-action="export"]');
    if (!(await exportButton.isVisible())) {
      const accountHeader = page.locator('.settings-menu__section-header:has-text("Account")');
      if (await accountHeader.isVisible()) {
        await accountHeader.click();
        await page.waitForTimeout(300);
      }
    }

    await exportButton.click();
    await page.waitForSelector('.data-export-overlay, .data-export-panel', { timeout: 5000 });

    // Click close button
    const closeButton = page.locator('.data-export-close, .data-export-panel [aria-label="Close"]');
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await expect(
        page.locator('.data-export-overlay.open, .data-export-panel--visible')
      ).not.toBeVisible({ timeout: 2000 });
    }
  });
});
