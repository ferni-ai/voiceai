/**
 * E2E Tests for Play Games Feature
 *
 * Tests the game picker and games functionality:
 * - Opening the game picker panel
 * - Viewing available games
 * - Category tab switching
 * - Starting a game
 * - Closing the picker
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-games-test-user';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Open the game picker from the settings menu
 */
async function openGamePicker(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForSelector('.settings-trigger', { timeout: 10000 });
  await page.click('.settings-trigger');
  await page.waitForSelector('.settings-menu--visible');

  // Find and click Play Games
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
  await page.waitForSelector('.game-picker--visible', { timeout: 5000 });
}

// ============================================================================
// API TESTS
// ============================================================================

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

  test('GET /api/games?category=library - returns only library games', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/games?category=library`);

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data.games.every((g: { category: string }) => g.category === 'library')).toBe(true);
    // Library games should require Spotify
    expect(data.games.every((g: { requiresSpotify?: boolean }) => g.requiresSpotify === true)).toBe(
      true
    );
  });

  test('GET /api/games verifies specific games exist', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/games`);

    expect(response.status()).toBe(200);

    const data = await response.json();
    const gameIds = data.games.map((g: { id: string }) => g.id);

    // Music games (7)
    expect(gameIds).toContain('name-that-tune');
    expect(gameIds).toContain('one-word-song');
    expect(gameIds).toContain('desert-island-discs');
    expect(gameIds).toContain('this-or-that');
    expect(gameIds).toContain('mood-dj-challenge');
    expect(gameIds).toContain('finish-the-lyric');
    expect(gameIds).toContain('decade-challenge');

    // Text games (5)
    expect(gameIds).toContain('tic-tac-toe');
    expect(gameIds).toContain('20-questions');
    expect(gameIds).toContain('word-association');
    expect(gameIds).toContain('would-you-rather');
    expect(gameIds).toContain('story-builder');

    // Library games (2)
    expect(gameIds).toContain('library-name-that-tune');
    expect(gameIds).toContain('library-deep-cuts');
  });

  test('GET /api/games/stats - returns user game stats (requires auth)', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/games/stats?userId=${TEST_USER_ID}`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('stats');
    expect(data.stats).toHaveProperty('gamesPlayed');
    expect(data.stats).toHaveProperty('totalScore');
  });

  test('GET /api/games/suggestion - returns game suggestion', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/games/suggestion?userId=${TEST_USER_ID}`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('suggestion');
  });
});

// ============================================================================
// UI TESTS
// ============================================================================

test.describe('Game Picker UI', () => {
  test('opens game picker from menu', async ({ page }) => {
    await page.goto(BASE_URL);
    await openGamePicker(page);

    // Verify game picker is visible
    await expect(page.locator('.game-picker--visible')).toBeVisible();

    // Verify header content
    await expect(page.locator('.game-picker__title')).toHaveText('Games');
    await expect(page.locator('.game-picker__subtitle')).toBeVisible();
  });

  test('displays category tabs', async ({ page }) => {
    await page.goto(BASE_URL);
    await openGamePicker(page);

    // Verify all category tabs exist
    const tabs = page.locator('.game-picker__tab');
    await expect(tabs).toHaveCount(3);

    // Music tab should be active by default
    await expect(page.locator('.game-picker__tab--active')).toContainText('Music');
  });

  test('switches between category tabs', async ({ page }) => {
    await page.goto(BASE_URL);
    await openGamePicker(page);

    // Click Fun (text games) tab
    await page.locator('.game-picker__tab[data-category="text"]').click();
    await expect(page.locator('.game-picker__tab[data-category="text"]')).toHaveClass(
      /game-picker__tab--active/
    );
    await expect(page.locator('.game-picker__section[data-section="text"]')).toHaveClass(
      /game-picker__section--active/
    );

    // Click Library tab
    await page.locator('.game-picker__tab[data-category="library"]').click();
    await expect(page.locator('.game-picker__tab[data-category="library"]')).toHaveClass(
      /game-picker__tab--active/
    );
    await expect(page.locator('.game-picker__section[data-section="library"]')).toHaveClass(
      /game-picker__section--active/
    );
  });

  test('displays game cards with correct structure', async ({ page }) => {
    await page.goto(BASE_URL);
    await openGamePicker(page);

    // Verify game cards exist
    const gameCards = page.locator('.game-card');
    await expect(gameCards.first()).toBeVisible();

    // Verify game card structure
    const firstCard = gameCards.first();
    await expect(firstCard.locator('.game-card__icon')).toBeVisible();
    await expect(firstCard.locator('.game-card__name')).toBeVisible();
    await expect(firstCard.locator('.game-card__description')).toBeVisible();
    await expect(firstCard.locator('.game-card__meta')).toBeVisible();
  });

  test('Name That Tune game is available', async ({ page }) => {
    await page.goto(BASE_URL);
    await openGamePicker(page);

    // Look for Name That Tune game card
    const nameThatTuneCard = page.locator('.game-card[data-game="name-that-tune"]');
    await expect(nameThatTuneCard).toBeVisible();
    await expect(nameThatTuneCard.locator('.game-card__name')).toContainText('Name That Tune');
  });

  test('shows NEW badge on new games', async ({ page }) => {
    await page.goto(BASE_URL);
    await openGamePicker(page);

    // Finish the Lyric and Decade Challenge should have NEW badges
    const finishLyricCard = page.locator('.game-card[data-game="finish-the-lyric"]');
    await expect(finishLyricCard.locator('.game-card__badge--new')).toBeVisible();

    const decadeCard = page.locator('.game-card[data-game="decade-challenge"]');
    await expect(decadeCard.locator('.game-card__badge--new')).toBeVisible();
  });

  test('library games show Spotify badge', async ({ page }) => {
    await page.goto(BASE_URL);
    await openGamePicker(page);

    // Switch to library tab
    await page.locator('.game-picker__tab[data-category="library"]').click();

    // Verify Spotify badge on library games
    const libraryCard = page.locator('.game-card[data-game="library-name-that-tune"]');
    await expect(libraryCard.locator('.game-card__badge--spotify')).toBeVisible();
  });

  test('closes game picker on close button click', async ({ page }) => {
    await page.goto(BASE_URL);
    await openGamePicker(page);

    // Click close button
    await page.locator('.game-picker__close').click();

    // Wait for animation
    await page.waitForTimeout(400);

    // Verify picker is hidden
    await expect(page.locator('.game-picker--visible')).not.toBeVisible();
  });

  test('closes game picker on backdrop click', async ({ page }) => {
    await page.goto(BASE_URL);
    await openGamePicker(page);

    // Click backdrop
    await page.locator('.game-picker__backdrop').click();

    // Wait for animation
    await page.waitForTimeout(400);

    // Verify picker is hidden
    await expect(page.locator('.game-picker--visible')).not.toBeVisible();
  });

  test('closes game picker on Escape key', async ({ page }) => {
    await page.goto(BASE_URL);
    await openGamePicker(page);

    // Press Escape
    await page.keyboard.press('Escape');

    // Wait for animation
    await page.waitForTimeout(400);

    // Verify picker is hidden
    await expect(page.locator('.game-picker--visible')).not.toBeVisible();
  });

  test('help button opens help modal', async ({ page }) => {
    await page.goto(BASE_URL);
    await openGamePicker(page);

    // Click help button
    await page.locator('.game-picker__help-btn').click();

    // Verify help modal opened
    await expect(page.locator('.game-help-modal')).toBeVisible();
    await expect(page.locator('.game-help-modal__title')).toContainText('How to Play');
  });
});
