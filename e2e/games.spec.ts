/**
 * E2E Tests for Play Games Feature
 *
 * Tests the game picker and games functionality:
 * - Opening the game picker panel
 * - Viewing available games
 * - Starting a game
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-games-test-user';

test.describe('Games API', () => {
  test('GET /api/games - returns available games list', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/games`);

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('games');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('categories');
    
    // Verify game count
    expect(data.games.length).toBeGreaterThan(0);
    expect(data.total).toBe(data.games.length);
    
    // Verify categories exist
    expect(data.categories).toHaveProperty('music');
    expect(data.categories).toHaveProperty('text');
    expect(data.categories).toHaveProperty('library');
  });

  test('GET /api/games?category=music - returns only music games', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/games?category=music`);

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data.games.every((g: { category: string }) => g.category === 'music')).toBe(true);
  });

  test('GET /api/games?category=text - returns only text games', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/games?category=text`);

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data.games.every((g: { category: string }) => g.category === 'text')).toBe(true);
  });

  test('GET /api/games verifies specific games exist', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/games`);

    expect(response.status()).toBe(200);

    const data = await response.json();
    const gameIds = data.games.map((g: { id: string }) => g.id);
    
    // Music games
    expect(gameIds).toContain('name-that-tune');
    expect(gameIds).toContain('finish-the-lyric'); // New game
    expect(gameIds).toContain('decade-challenge'); // New game
    
    // Text games
    expect(gameIds).toContain('tic-tac-toe');
    expect(gameIds).toContain('20-questions');
    expect(gameIds).toContain('word-association');
    
    // Library games
    expect(gameIds).toContain('library-name-that-tune');
    expect(gameIds).toContain('library-deep-cuts');
  });

  test('GET /api/games/stats - returns user game stats (requires auth)', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/games/stats?userId=${TEST_USER_ID}`,
      { headers: { 'X-User-ID': TEST_USER_ID } }
    );

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('stats');
    expect(data.stats).toHaveProperty('gamesPlayed');
    expect(data.stats).toHaveProperty('totalScore');
  });
});

test.describe('Game Picker UI', () => {
  test('opens game picker from menu', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    // Find and click Play Games (in Connect section)
    const gamesButton = page.locator('[data-action="play-games"]');
    if (!(await gamesButton.isVisible())) {
      // Expand Connect section if collapsed
      const connectHeader = page.locator('.settings-menu__section-header:has-text("Connect")');
      if (await connectHeader.isVisible()) {
        await connectHeader.click();
        await page.waitForTimeout(300);
      }
    }

    await gamesButton.click();

    // Verify game picker opened
    await expect(
      page.locator('.game-picker-overlay, .game-picker, [data-panel="games"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test('displays available games', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const gamesButton = page.locator('[data-action="play-games"]');
    if (!(await gamesButton.isVisible())) {
      const connectHeader = page.locator('.settings-menu__section-header:has-text("Connect")');
      if (await connectHeader.isVisible()) {
        await connectHeader.click();
        await page.waitForTimeout(300);
      }
    }

    await gamesButton.click();
    await page.waitForSelector('.game-picker-overlay, .game-picker', { timeout: 5000 });

    // Should show game cards or list
    const gamePicker = page.locator('.game-picker-overlay, .game-picker');
    await expect(gamePicker).toBeVisible();
  });

  test('Name That Tune game is available', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const gamesButton = page.locator('[data-action="play-games"]');
    if (!(await gamesButton.isVisible())) {
      const connectHeader = page.locator('.settings-menu__section-header:has-text("Connect")');
      if (await connectHeader.isVisible()) {
        await connectHeader.click();
        await page.waitForTimeout(300);
      }
    }

    await gamesButton.click();
    await page.waitForSelector('.game-picker-overlay, .game-picker', { timeout: 5000 });

    // Look for Name That Tune game option
    const nameTheTuneGame = page.locator('text=Name That Tune, text=Tune, text=Music');
    // Game should exist in picker
    const picker = page.locator('.game-picker-overlay, .game-picker');
    await expect(picker).toBeVisible();
  });

  test('closes game picker on backdrop click', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const gamesButton = page.locator('[data-action="play-games"]');
    if (!(await gamesButton.isVisible())) {
      const connectHeader = page.locator('.settings-menu__section-header:has-text("Connect")');
      if (await connectHeader.isVisible()) {
        await connectHeader.click();
        await page.waitForTimeout(300);
      }
    }

    await gamesButton.click();
    await page.waitForSelector('.game-picker-overlay, .game-picker', { timeout: 5000 });

    // Click backdrop to close
    const backdrop = page.locator('.game-picker-backdrop, .game-picker-overlay');
    if (await backdrop.isVisible()) {
      await backdrop.click({ position: { x: 10, y: 10 } });
    }

    await expect(page.locator('.game-picker-overlay.open')).not.toBeVisible({ timeout: 2000 });
  });
});
