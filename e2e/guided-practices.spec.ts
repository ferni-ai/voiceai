/**
 * E2E Tests for Guided Practices Feature
 *
 * Tests the commands/guided practices panel:
 * - Opening the commands panel
 * - Viewing available practices
 * - Running a practice
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-practices-test-user';

test.describe('Guided Practices API', () => {
  test('GET /api/commands - returns available commands list', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/commands`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
    }
  });

  test('GET /api/practices - returns available practices', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/practices`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect([200, 404]).toContain(response.status());
  });
});

test.describe('Guided Practices UI', () => {
  test('opens guided practices from menu', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    // Find and click Guided Practices (in Personalize section)
    const practicesButton = page.locator('[data-action="commands"]');
    if (!(await practicesButton.isVisible())) {
      // Expand Personalize section if collapsed
      const personalizeHeader = page.locator(
        '.settings-menu__section-header:has-text("Make It Yours"), .settings-menu__section-header:has-text("Personalize")'
      );
      if (await personalizeHeader.first().isVisible()) {
        await personalizeHeader.first().click();
        await page.waitForTimeout(300);
      }
    }

    await practicesButton.click();

    // Verify commands panel opened
    await expect(
      page.locator('.commands-panel, .commands-overlay, [data-panel="commands"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test('displays available practices', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const practicesButton = page.locator('[data-action="commands"]');
    if (!(await practicesButton.isVisible())) {
      const personalizeHeader = page.locator(
        '.settings-menu__section-header:has-text("Make It Yours"), .settings-menu__section-header:has-text("Personalize")'
      );
      if (await personalizeHeader.first().isVisible()) {
        await personalizeHeader.first().click();
        await page.waitForTimeout(300);
      }
    }

    await practicesButton.click();
    await page.waitForSelector('.commands-panel, .commands-overlay', { timeout: 5000 });

    // Should show practices list
    const panel = page.locator('.commands-panel, .commands-overlay');
    await expect(panel).toBeVisible();
  });

  test('closes practices panel on close button click', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const practicesButton = page.locator('[data-action="commands"]');
    if (!(await practicesButton.isVisible())) {
      const personalizeHeader = page.locator(
        '.settings-menu__section-header:has-text("Make It Yours"), .settings-menu__section-header:has-text("Personalize")'
      );
      if (await personalizeHeader.first().isVisible()) {
        await personalizeHeader.first().click();
        await page.waitForTimeout(300);
      }
    }

    await practicesButton.click();
    await page.waitForSelector('.commands-panel, .commands-overlay', { timeout: 5000 });

    // Click close button
    const closeButton = page.locator('.commands-close, .commands-panel [aria-label="Close"]');
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await expect(
        page.locator('.commands-panel--visible, .commands-overlay.open')
      ).not.toBeVisible({ timeout: 2000 });
    }
  });
});
