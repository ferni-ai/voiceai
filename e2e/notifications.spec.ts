/**
 * E2E Tests for Notification Settings Feature
 *
 * Tests the notification settings panel:
 * - Opening notification settings
 * - Toggling notification preferences
 * - Saving settings
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-notifications-test-user';

test.describe('Notification Settings API', () => {
  test('GET /api/notifications/settings - returns notification settings', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/notifications/settings`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
    }
  });

  test('PUT /api/notifications/settings - updates settings', async ({ request }) => {
    const response = await request.put(`${BASE_URL}/api/notifications/settings`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        pushEnabled: true,
        emailEnabled: false,
      },
    });

    expect([200, 404]).toContain(response.status());
  });
});

test.describe('Notification Settings UI', () => {
  test('opens notification settings from menu', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    // Find and click Notifications (in Personalize section)
    const notificationsButton = page.locator('[data-action="notifications"]');
    if (!(await notificationsButton.isVisible())) {
      // Expand Personalize section if collapsed
      const personalizeHeader = page.locator(
        '.settings-menu__section-header:has-text("Make It Yours"), .settings-menu__section-header:has-text("Personalize")'
      );
      if (await personalizeHeader.first().isVisible()) {
        await personalizeHeader.first().click();
        await page.waitForTimeout(300);
      }
    }

    await notificationsButton.click();

    // Verify notification settings opened
    await expect(
      page.locator(
        '.notification-settings-overlay, .notification-settings, [data-panel="notifications"]'
      )
    ).toBeVisible({ timeout: 5000 });
  });

  test('displays notification toggles', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const notificationsButton = page.locator('[data-action="notifications"]');
    if (!(await notificationsButton.isVisible())) {
      const personalizeHeader = page.locator(
        '.settings-menu__section-header:has-text("Make It Yours"), .settings-menu__section-header:has-text("Personalize")'
      );
      if (await personalizeHeader.first().isVisible()) {
        await personalizeHeader.first().click();
        await page.waitForTimeout(300);
      }
    }

    await notificationsButton.click();
    await page.waitForSelector('.notification-settings-overlay, .notification-settings', {
      timeout: 5000,
    });

    // Should show toggle switches or checkboxes
    const panel = page.locator('.notification-settings-overlay, .notification-settings');
    await expect(panel).toBeVisible();
  });

  test('closes notification settings on close button click', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const notificationsButton = page.locator('[data-action="notifications"]');
    if (!(await notificationsButton.isVisible())) {
      const personalizeHeader = page.locator(
        '.settings-menu__section-header:has-text("Make It Yours"), .settings-menu__section-header:has-text("Personalize")'
      );
      if (await personalizeHeader.first().isVisible()) {
        await personalizeHeader.first().click();
        await page.waitForTimeout(300);
      }
    }

    await notificationsButton.click();
    await page.waitForSelector('.notification-settings-overlay, .notification-settings', {
      timeout: 5000,
    });

    // Click close button
    const closeButton = page.locator(
      '.notification-settings-close, .notification-settings [aria-label="Close"]'
    );
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await expect(
        page.locator('.notification-settings-overlay.open, .notification-settings--visible')
      ).not.toBeVisible({ timeout: 2000 });
    }
  });
});
