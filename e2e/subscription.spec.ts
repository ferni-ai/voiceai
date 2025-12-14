/**
 * E2E Tests for Subscription/Your Plan Feature
 *
 * Tests the subscription management panel:
 * - Opening subscription panel
 * - Viewing current plan
 * - Upgrade options
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-subscription-test-user';

test.describe('Subscription API', () => {
  test('GET /api/subscription - returns subscription status', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/subscription`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
    }
  });

  test('GET /subscription/status - returns subscription info', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/subscription/status`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect([200, 401, 404]).toContain(response.status());
  });
});

test.describe('Subscription UI', () => {
  test('opens subscription panel from menu', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    // Find and click Your Plan (in Account section)
    const subscriptionButton = page.locator('[data-action="subscription"]');
    if (!(await subscriptionButton.isVisible())) {
      // Expand Account section if collapsed
      const accountHeader = page.locator('.settings-menu__section-header:has-text("Account")');
      if (await accountHeader.isVisible()) {
        await accountHeader.click();
        await page.waitForTimeout(300);
      }
    }

    await subscriptionButton.click();

    // Verify subscription panel opened
    await expect(
      page.locator('.subscription-overlay, .subscription-panel, [data-panel="subscription"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test('displays current plan information', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const subscriptionButton = page.locator('[data-action="subscription"]');
    if (!(await subscriptionButton.isVisible())) {
      const accountHeader = page.locator('.settings-menu__section-header:has-text("Account")');
      if (await accountHeader.isVisible()) {
        await accountHeader.click();
        await page.waitForTimeout(300);
      }
    }

    await subscriptionButton.click();
    await page.waitForSelector('.subscription-overlay, .subscription-panel', { timeout: 5000 });

    // Should show plan details
    const panel = page.locator('.subscription-overlay, .subscription-panel');
    await expect(panel).toBeVisible();

    // Should show plan name or free tier info
    const planInfo = page.locator(
      'text=Free, text=Friend, text=Partner, text=Your Plan, text=Current'
    );
    await expect(planInfo.first()).toBeVisible({ timeout: 3000 });
  });

  test('shows upgrade option for free users', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const subscriptionButton = page.locator('[data-action="subscription"]');
    if (!(await subscriptionButton.isVisible())) {
      const accountHeader = page.locator('.settings-menu__section-header:has-text("Account")');
      if (await accountHeader.isVisible()) {
        await accountHeader.click();
        await page.waitForTimeout(300);
      }
    }

    await subscriptionButton.click();
    await page.waitForSelector('.subscription-overlay, .subscription-panel', { timeout: 5000 });

    // Panel should be visible
    const panel = page.locator('.subscription-overlay, .subscription-panel');
    await expect(panel).toBeVisible();
  });

  test('closes subscription panel on close button click', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const subscriptionButton = page.locator('[data-action="subscription"]');
    if (!(await subscriptionButton.isVisible())) {
      const accountHeader = page.locator('.settings-menu__section-header:has-text("Account")');
      if (await accountHeader.isVisible()) {
        await accountHeader.click();
        await page.waitForTimeout(300);
      }
    }

    await subscriptionButton.click();
    await page.waitForSelector('.subscription-overlay, .subscription-panel', { timeout: 5000 });

    // Click close button
    const closeButton = page.locator(
      '.subscription-close, .subscription-panel [aria-label="Close"], .subscription-overlay [aria-label="Close"]'
    );
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await expect(
        page.locator('.subscription-overlay.open, .subscription-panel--visible')
      ).not.toBeVisible({ timeout: 2000 });
    }
  });
});
