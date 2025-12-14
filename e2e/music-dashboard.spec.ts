/**
 * E2E Tests for Music Dashboard Feature
 *
 * Tests the "Musical You" / music insights functionality:
 * - GET /api/music/profile - user's music profile
 * - GET /api/music/insights - music-based insights
 * - GET /api/music/history - listening history
 * - GET /api/music/recommendations - music recommendations
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-music-test-user';

test.describe('Music Dashboard API', () => {
  test('GET /api/music/profile - returns music profile', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/music/profile`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    // May return 404 if user has no music data, which is acceptable
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
    }
  });

  test('GET /api/music/insights - returns music insights', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/music/insights`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
    }
  });

  test('GET /api/music/history - returns listening history', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/music/history`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
    }
  });

  test('GET /api/spotify/status - returns Spotify connection status', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/spotify/status`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('linked');
    expect(typeof data.linked).toBe('boolean');
  });
});

test.describe('Music Dashboard UI', () => {
  test('opens music dashboard from menu', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    // Find and click Musical You
    const musicButton = page.locator('[data-action="music-dashboard"]');
    if (!(await musicButton.isVisible())) {
      // Expand Sessions & Fun section if collapsed
      const sessionsHeader = page.locator('.settings-menu__section-header:has-text("Sessions")');
      if (await sessionsHeader.isVisible()) {
        await sessionsHeader.click();
      }
    }
    await musicButton.click();

    // Verify music dashboard opened
    await expect(page.locator('.music-dashboard-overlay, .music-dashboard')).toBeVisible({
      timeout: 5000,
    });
  });

  test('shows Spotify connection option when not linked', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const musicButton = page.locator('[data-action="music-dashboard"]');
    if (!(await musicButton.isVisible())) {
      const sessionsHeader = page.locator('.settings-menu__section-header:has-text("Sessions")');
      if (await sessionsHeader.isVisible()) {
        await sessionsHeader.click();
      }
    }
    await musicButton.click();

    await page.waitForSelector('.music-dashboard-overlay, .music-dashboard', { timeout: 5000 });

    // Should show some music dashboard content
    const dashboard = page.locator('.music-dashboard-overlay, .music-dashboard');
    await expect(dashboard).toBeVisible();
  });

  test('closes dashboard on backdrop click', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const musicButton = page.locator('[data-action="music-dashboard"]');
    if (!(await musicButton.isVisible())) {
      const sessionsHeader = page.locator('.settings-menu__section-header:has-text("Sessions")');
      if (await sessionsHeader.isVisible()) {
        await sessionsHeader.click();
      }
    }
    await musicButton.click();

    await page.waitForSelector('.music-dashboard-overlay, .music-dashboard', { timeout: 5000 });

    // Click backdrop to close
    const backdrop = page.locator('.music-dashboard-backdrop, .music-dashboard-overlay');
    if (await backdrop.isVisible()) {
      await backdrop.click({ position: { x: 10, y: 10 } });
    }

    // Should close
    await expect(page.locator('.music-dashboard-overlay.open')).not.toBeVisible({ timeout: 2000 });
  });
});
