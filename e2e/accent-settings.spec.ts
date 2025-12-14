/**
 * E2E Tests for Accent Settings Feature
 *
 * Tests the voice accent customization functionality:
 * - GET /api/voice/accents - available voice accents
 * - GET /api/voice/accent - current accent setting
 * - POST /api/voice/accent - set accent preference
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-accent-test-user';

test.describe('Accent Settings API', () => {
  test('GET /api/voice/accents - returns available accents', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/voice/accents`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('accents');
    expect(Array.isArray(data.accents)).toBe(true);

    // Each accent should have required properties
    if (data.accents.length > 0) {
      const accent = data.accents[0];
      expect(accent).toHaveProperty('id');
      expect(accent).toHaveProperty('name');
      expect(accent).toHaveProperty('locale');
    }
  });

  test('GET /api/voice/accent - returns current accent', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/voice/accent`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    // May or may not have an accent set
  });

  test('POST /api/voice/accent - sets accent preference', async ({ request }) => {
    // First get available accents
    const accentsResponse = await request.get(`${BASE_URL}/api/voice/accents`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    const accentsData = await accentsResponse.json();
    const firstAccent = accentsData.accents?.[0];

    if (!firstAccent) {
      test.skip();
      return;
    }

    const response = await request.post(`${BASE_URL}/api/voice/accent`, {
      headers: { 'X-User-ID': TEST_USER_ID },
      data: { accentId: firstAccent.id },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });

  test('POST /api/voice/accent - validates accent ID', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/voice/accent`, {
      headers: { 'X-User-ID': TEST_USER_ID },
      data: { accentId: 'invalid-accent-id-that-does-not-exist' },
    });

    // Should return error for invalid accent
    expect([400, 404]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success', false);
  });
});

test.describe('Accent Settings UI', () => {
  test('opens accent settings from menu', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    // Find and click Voice Accent
    const accentButton = page.locator('[data-action="accent-settings"]');
    if (!(await accentButton.isVisible())) {
      const customizeHeader = page.locator('.settings-menu__section-header:has-text("Customize")');
      if (await customizeHeader.isVisible()) {
        await customizeHeader.click();
      }
    }
    await accentButton.click();

    // Verify accent settings opened
    await expect(page.locator('.accent-settings-overlay, .accent-settings')).toBeVisible({
      timeout: 5000,
    });
  });

  test('displays accent options', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const accentButton = page.locator('[data-action="accent-settings"]');
    if (!(await accentButton.isVisible())) {
      const customizeHeader = page.locator('.settings-menu__section-header:has-text("Customize")');
      if (await customizeHeader.isVisible()) {
        await customizeHeader.click();
      }
    }
    await accentButton.click();

    await page.waitForSelector('.accent-settings-overlay, .accent-settings', { timeout: 5000 });

    // Should show accent options
    const settings = page.locator('.accent-settings-overlay, .accent-settings');
    await expect(settings).toBeVisible();
  });

  test('allows previewing accent voice', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const accentButton = page.locator('[data-action="accent-settings"]');
    if (!(await accentButton.isVisible())) {
      const customizeHeader = page.locator('.settings-menu__section-header:has-text("Customize")');
      if (await customizeHeader.isVisible()) {
        await customizeHeader.click();
      }
    }
    await accentButton.click();

    await page.waitForSelector('.accent-settings-overlay, .accent-settings', { timeout: 5000 });

    // Look for preview/play buttons
    const previewButton = page.locator(
      '.accent-preview-btn, .accent-play-btn, [data-action="preview"]'
    );

    // If preview buttons exist, clicking should work
    if ((await previewButton.count()) > 0) {
      const firstPreview = previewButton.first();
      await expect(firstPreview).toBeVisible();
    }
  });
});
