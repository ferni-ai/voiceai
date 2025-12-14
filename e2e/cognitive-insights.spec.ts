/**
 * E2E Tests for Cognitive Insights Feature
 *
 * Tests the "What I've Learned" / cognitive insights functionality:
 * - GET /api/memories/insights - user's cognitive profile and insights
 * - GET /api/memories/themes - detected themes from conversations
 * - GET /api/memories/growth - growth patterns and improvements
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-cognitive-test-user';

test.describe('Cognitive Insights API', () => {
  test('GET /api/memories/insights - returns user insights', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/memories/insights`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);

    // Should have insights structure
    if (data.insights) {
      expect(typeof data.insights).toBe('object');
    }
  });

  test('GET /api/memories/themes - returns detected themes', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/memories/themes`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);

    if (data.themes) {
      expect(Array.isArray(data.themes)).toBe(true);
    }
  });

  test('GET /api/memories/growth - returns growth patterns', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/memories/growth`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });

  test('GET /api/memories/summary - returns memory summary', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/memories/summary`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });
});

test.describe('Cognitive Insights UI', () => {
  test('opens cognitive insights modal from menu', async ({ page }) => {
    await page.goto(BASE_URL);

    // Wait for app to load
    await page.waitForSelector('.settings-trigger', { timeout: 10000 });

    // Open settings menu
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    // Find and click Cognitive Insights - may need to expand section first
    const cognitiveButton = page.locator('[data-action="cognitive"]');
    if (!(await cognitiveButton.isVisible())) {
      // Expand Insights section if collapsed
      const insightsHeader = page.locator('.settings-menu__section-header:has-text("Insights")');
      if (await insightsHeader.isVisible()) {
        await insightsHeader.click();
      }
    }

    await cognitiveButton.click();

    // Verify cognitive insights panel opened
    await expect(page.locator('.cognitive-insights-overlay, .cognitive-panel')).toBeVisible({
      timeout: 5000,
    });
  });

  test('displays insight categories', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const cognitiveButton = page.locator('[data-action="cognitive"]');
    if (!(await cognitiveButton.isVisible())) {
      const insightsHeader = page.locator('.settings-menu__section-header:has-text("Insights")');
      if (await insightsHeader.isVisible()) {
        await insightsHeader.click();
      }
    }
    await cognitiveButton.click();

    // Wait for panel to appear
    await page.waitForSelector('.cognitive-insights-overlay, .cognitive-panel', { timeout: 5000 });

    // Should show some insight content
    const panelContent = page.locator('.cognitive-insights-overlay, .cognitive-panel');
    await expect(panelContent).toBeVisible();
  });
});
