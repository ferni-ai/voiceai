/**
 * E2E Tests for Personalize Feature
 *
 * Tests the cosmetics/personalization functionality:
 * - GET /api/cosmetics/catalog - available cosmetic items
 * - GET /api/cosmetics/owned - user's owned cosmetics
 * - GET /api/cosmetics/equipped - currently equipped items
 * - POST /api/cosmetics/equip - equip a cosmetic
 * - POST /api/cosmetics/purchase - purchase a cosmetic with seeds
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-personalize-test-user';

test.describe('Personalize / Cosmetics API', () => {
  test('GET /api/cosmetics/catalog - returns available cosmetics', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/cosmetics/catalog`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('catalog');
    expect(Array.isArray(data.catalog)).toBe(true);

    // Each item should have required properties
    if (data.catalog.length > 0) {
      const item = data.catalog[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('type');
      expect(['avatar-skin', 'ui-theme', 'voice-pack', 'sound-pack', 'emote']).toContain(item.type);
    }
  });

  test('GET /api/cosmetics/owned - returns user owned cosmetics', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/cosmetics/owned`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('owned');
    expect(Array.isArray(data.owned)).toBe(true);
  });

  test('GET /api/cosmetics/equipped - returns equipped cosmetics', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/cosmetics/equipped`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('equipped');
    expect(typeof data.equipped).toBe('object');
  });

  test('POST /api/cosmetics/equip - equips a default cosmetic', async ({ request }) => {
    // First get catalog to find a default (free) cosmetic
    const catalogResponse = await request.get(`${BASE_URL}/api/cosmetics/catalog`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    const catalogData = await catalogResponse.json();
    const defaultItem = catalogData.catalog?.find(
      (item: { priceInSeeds: number | null }) => item.priceInSeeds === null
    );

    if (!defaultItem) {
      test.skip();
      return;
    }

    const response = await request.post(`${BASE_URL}/api/cosmetics/equip`, {
      headers: { 'X-User-ID': TEST_USER_ID },
      data: { itemId: defaultItem.id },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });

  test('POST /api/cosmetics/equip - fails for non-owned paid cosmetic', async ({ request }) => {
    // First get catalog to find a paid cosmetic
    const catalogResponse = await request.get(`${BASE_URL}/api/cosmetics/catalog`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    const catalogData = await catalogResponse.json();
    const paidItem = catalogData.catalog?.find(
      (item: { priceInSeeds: number | null }) => item.priceInSeeds !== null && item.priceInSeeds > 0
    );

    if (!paidItem) {
      test.skip();
      return;
    }

    const response = await request.post(`${BASE_URL}/api/cosmetics/equip`, {
      headers: { 'X-User-ID': TEST_USER_ID },
      data: { itemId: paidItem.id },
    });

    // Should fail because user doesn't own it
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data).toHaveProperty('success', false);
  });
});

test.describe('Personalize UI', () => {
  test('opens personalize modal from menu', async ({ page }) => {
    await page.goto(BASE_URL);

    // Wait for app to load
    await page.waitForSelector('.settings-trigger', { timeout: 10000 });

    // Open settings menu
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    // Find and click Personalize - may need to expand section first
    const personalizeButton = page.locator('[data-action="personalize"]');
    if (!(await personalizeButton.isVisible())) {
      // Expand Customize section if collapsed
      const customizeHeader = page.locator('.settings-menu__section-header:has-text("Customize")');
      if (await customizeHeader.isVisible()) {
        await customizeHeader.click();
      }
    }

    await personalizeButton.click();

    // Verify personalize modal opened
    await expect(page.locator('.personalize-overlay')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.personalize-title')).toContainText('Personalize');
  });

  test('displays category tabs', async ({ page }) => {
    await page.goto(BASE_URL);

    // Open personalize modal (via direct method if available or through menu)
    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const personalizeButton = page.locator('[data-action="personalize"]');
    if (!(await personalizeButton.isVisible())) {
      const customizeHeader = page.locator('.settings-menu__section-header:has-text("Customize")');
      if (await customizeHeader.isVisible()) {
        await customizeHeader.click();
      }
    }
    await personalizeButton.click();

    await page.waitForSelector('.personalize-overlay.open');

    // Check category buttons exist
    await expect(page.locator('.personalize-category-btn:has-text("All")')).toBeVisible();
    await expect(page.locator('.personalize-category-btn:has-text("Styles")')).toBeVisible();
    await expect(page.locator('.personalize-category-btn:has-text("Themes")')).toBeVisible();
  });

  test('closes modal on backdrop click', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const personalizeButton = page.locator('[data-action="personalize"]');
    if (!(await personalizeButton.isVisible())) {
      const customizeHeader = page.locator('.settings-menu__section-header:has-text("Customize")');
      if (await customizeHeader.isVisible()) {
        await customizeHeader.click();
      }
    }
    await personalizeButton.click();

    await page.waitForSelector('.personalize-overlay.open');

    // Click backdrop to close
    await page.click('.personalize-backdrop');

    // Modal should close
    await expect(page.locator('.personalize-overlay.open')).not.toBeVisible({ timeout: 2000 });
  });
});
