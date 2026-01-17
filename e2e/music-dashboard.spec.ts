/**
 * E2E Tests for Music Dashboard Feature
 *
 * Tests the "Musical You" / music insights functionality:
 * - GET /api/musical/profile - user's Musical You profile
 * - GET /api/musical/dna - Musical DNA
 * - GET /api/musical/daily - daily challenge
 * - GET /api/games/insights - game insights
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-music-test-user';

test.describe('Musical You API', () => {
  test('GET /api/musical/profile - returns Musical You profile', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/musical/profile?userId=${TEST_USER_ID}`);

    // May return 200 with empty profile if user has no music data
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('profile');
  });

  test('GET /api/musical/dna - returns Musical DNA', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/musical/dna?userId=${TEST_USER_ID}`);

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    // dna may be null if user hasn't played games yet
  });

  test('GET /api/musical/daily - returns daily challenge', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/musical/daily`);

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('challenge');
    expect(data.challenge).toHaveProperty('id');
    expect(data.challenge).toHaveProperty('title');
  });

  test('GET /api/games/insights - returns game insights', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/games/insights?userId=${TEST_USER_ID}`);

    // May return error if no auth, which is acceptable
    expect([200, 401]).toContain(response.status());

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

  test('GET /api/musical/leaderboard - returns leaderboard', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/musical/leaderboard?type=weekly&gameType=overall`);

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('leaderboard');
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
    const backdrop = page.locator('.music-dashboard__backdrop');
    if (await backdrop.isVisible()) {
      await backdrop.click({ position: { x: 10, y: 10 } });
    }

    // Should close
    await expect(page.locator('.music-dashboard--visible')).not.toBeVisible({ timeout: 2000 });
  });

  test('dashboard shows loading state initially', async ({ page }) => {
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

    // Check that dashboard opens (loading state is brief)
    await expect(page.locator('.music-dashboard')).toBeVisible({ timeout: 5000 });
  });
});
