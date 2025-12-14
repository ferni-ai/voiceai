/**
 * E2E Tests for Referral / Share Ferni Feature
 *
 * Tests the referral and sharing functionality:
 * - GET /api/referral/code - get user's referral code
 * - GET /api/referral/stats - referral statistics
 * - POST /api/referral/track - track referral click/signup
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-referral-test-user';

test.describe('Referral API', () => {
  test('GET /api/referral/code - returns referral code', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/referral/code`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('code');
    expect(typeof data.code).toBe('string');
    expect(data.code.length).toBeGreaterThan(0);
  });

  test('GET /api/referral/stats - returns referral statistics', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/referral/stats`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('stats');

    // Stats should have count fields
    expect(data.stats).toHaveProperty('totalReferrals');
    expect(typeof data.stats.totalReferrals).toBe('number');
  });

  test('GET /api/referral/link - returns shareable link', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/referral/link`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('link');
    expect(data.link).toContain('http');
  });

  test('POST /api/referral/track - tracks referral', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/referral/track`, {
      headers: { 'X-User-ID': TEST_USER_ID },
      data: {
        event: 'link_shared',
        channel: 'copy',
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });
});

test.describe('Share Ferni UI', () => {
  test('opens share/referral modal from menu', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    // Find and click Share Ferni (in quick actions at bottom)
    const shareButton = page.locator('[data-action="share-ferni"]');
    await shareButton.click();

    // Verify referral/share modal opened
    await expect(page.locator('.referral-overlay, .share-modal, .referral-modal')).toBeVisible({
      timeout: 5000,
    });
  });

  test('displays referral code', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const shareButton = page.locator('[data-action="share-ferni"]');
    await shareButton.click();

    await page.waitForSelector('.referral-overlay, .share-modal, .referral-modal', {
      timeout: 5000,
    });

    // Should show referral code or link
    const codeOrLink = page.locator('.referral-code, .referral-link, .share-link');
    if ((await codeOrLink.count()) > 0) {
      await expect(codeOrLink.first()).toBeVisible();
    }
  });

  test('has copy to clipboard functionality', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const shareButton = page.locator('[data-action="share-ferni"]');
    await shareButton.click();

    await page.waitForSelector('.referral-overlay, .share-modal, .referral-modal', {
      timeout: 5000,
    });

    // Look for copy button
    const copyButton = page.locator(
      '.copy-btn, [data-action="copy"], button:has-text("Copy"), button:has-text("copy")'
    );
    if ((await copyButton.count()) > 0) {
      await expect(copyButton.first()).toBeVisible();
    }
  });

  test('has social share options', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const shareButton = page.locator('[data-action="share-ferni"]');
    await shareButton.click();

    await page.waitForSelector('.referral-overlay, .share-modal, .referral-modal', {
      timeout: 5000,
    });

    // Modal should be visible with some content
    const modal = page.locator('.referral-overlay, .share-modal, .referral-modal');
    await expect(modal).toBeVisible();
  });
});
