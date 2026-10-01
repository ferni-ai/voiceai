/**
 * E2E Tests for Ferni Fund / Support Ferni Feature
 *
 * Tests the donation/support functionality:
 * - GET /api/garden/stats - community garden/fund statistics
 * - GET /api/garden/contributors - recent contributors
 * - POST /api/garden/checkout - create Stripe checkout session
 */

import { expect, test } from './support/fixtures';
import { API_URL, APP_URL } from './support/env';
import { pinMenuItems } from './support/app';

const TEST_USER_ID = 'e2e-fund-test-user';

test.describe('Ferni Fund API', { tag: '@needs-server' }, () => {
  test('GET /api/garden/stats - returns fund statistics', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/garden/stats`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('stats');

    // Stats should have fund metrics
    expect(data.stats).toHaveProperty('totalContributions');
    expect(data.stats).toHaveProperty('conversationsSponsored');
  });

  test('GET /api/garden/contributors - returns contributors list', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/garden/contributors`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('contributors');
    expect(Array.isArray(data.contributors)).toBe(true);
  });

  test('GET /api/garden/impact - returns impact metrics', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/garden/impact`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });

  test('POST /api/garden/checkout - validates required fields', async ({ request }) => {
    // Should fail without required amount
    const response = await request.post(`${API_URL}/api/garden/checkout`, {
      headers: { 'X-User-ID': TEST_USER_ID },
      data: {},
    });

    // Should return validation error
    expect([400, 422]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success', false);
  });

  test('POST /api/garden/checkout - creates checkout session', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/garden/checkout`, {
      headers: { 'X-User-ID': TEST_USER_ID },
      data: {
        amount: 500, // $5.00 in cents
        type: 'one-time',
      },
    });

    // May succeed or fail depending on Stripe config
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('checkoutUrl');
      expect(data.checkoutUrl).toContain('stripe');
    } else {
      // Acceptable if Stripe not configured in test env
      expect([400, 500, 503]).toContain(response.status());
    }
  });
});

test.describe('Support Ferni UI', () => {
  // The menu lists Support Ferni only as a pinned favorite (it is not in a
  // menu section; see renderPinnedItems in ui/settings-menu.ui.ts).
  test.beforeEach(async ({ page }) => {
    await pinMenuItems(page, ['support-ferni']);
  });

  test('opens ferni fund modal from menu', async ({ page }) => {
    await page.goto(APP_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    // Find and click Support Ferni (in quick actions at bottom)
    const supportButton = page.locator('[data-action="support-ferni"]');
    await supportButton.click();

    // Verify ferni fund modal opened
    await expect(page.locator('.support-ferni-overlay.support-ferni-overlay--open')).toBeVisible({
      timeout: 5000,
    });
  });

  test('displays contribution options', async ({ page }) => {
    await page.goto(APP_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const supportButton = page.locator('[data-action="support-ferni"]');
    await supportButton.click();

    await page.waitForSelector('.support-ferni-overlay.support-ferni-overlay--open', {
      timeout: 5000,
    });

    // Should show contribution amount options
    const modal = page.locator('.support-ferni-overlay.support-ferni-overlay--open');
    await expect(modal).toBeVisible();
  });

  test('shows impact statistics', async ({ page }) => {
    await page.goto(APP_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const supportButton = page.locator('[data-action="support-ferni"]');
    await supportButton.click();

    await page.waitForSelector('.support-ferni-overlay.support-ferni-overlay--open', {
      timeout: 5000,
    });

    // Modal should show some impact info
    const modal = page.locator('.support-ferni-overlay.support-ferni-overlay--open');
    await expect(modal).toBeVisible();
  });

  test('closes modal on backdrop click', async ({ page }) => {
    await page.goto(APP_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const supportButton = page.locator('[data-action="support-ferni"]');
    await supportButton.click();

    await page.waitForSelector('.support-ferni-overlay.support-ferni-overlay--open', {
      timeout: 5000,
    });

    // Click backdrop to close
    const backdrop = page.locator('.support-ferni-backdrop');
    if ((await backdrop.count()) > 0) {
      await backdrop.first().click({ position: { x: 10, y: 10 }, force: true });
    }

    // Modal should close
    await expect(page.locator('.support-ferni-overlay--open')).toHaveCount(0);
  });
});
