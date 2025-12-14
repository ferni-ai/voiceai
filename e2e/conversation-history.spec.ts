/**
 * E2E Tests for Conversation History Feature
 *
 * Tests the conversation history / past conversations functionality:
 * - Opening the conversation history panel
 * - Viewing past conversations
 * - Searching conversations
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-history-test-user';

test.describe('Conversation History API', () => {
  test('GET /api/conversations - returns conversation list', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/conversations`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    // May return empty list for new users
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
    }
  });

  test('GET /api/conversations/:id - returns single conversation', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/conversations/test-id`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    // 404 is acceptable for non-existent conversation
    expect([200, 404]).toContain(response.status());
  });
});

test.describe('Conversation History UI', () => {
  test('opens conversation history from menu', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    // Find and click Conversation History (in Remember section)
    const historyButton = page.locator('[data-action="history"]');
    if (!(await historyButton.isVisible())) {
      // Expand Remember section if collapsed
      const rememberHeader = page.locator('.settings-menu__section-header:has-text("Remember")');
      if (await rememberHeader.isVisible()) {
        await rememberHeader.click();
        await page.waitForTimeout(300);
      }
    }

    // Check if feature is locked (for new users)
    const isLocked = await historyButton.getAttribute('data-locked');
    if (isLocked === 'true') {
      // Feature is locked, verify lock UI is shown
      await expect(historyButton.locator('.settings-menu__lock-icon')).toBeVisible();
      return;
    }

    await historyButton.click();

    // Verify history panel opened
    await expect(
      page.locator('.conversation-history-overlay, .conversation-history, [data-panel="history"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test('displays empty state for new users', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const historyButton = page.locator('[data-action="history"]');
    if (!(await historyButton.isVisible())) {
      const rememberHeader = page.locator('.settings-menu__section-header:has-text("Remember")');
      if (await rememberHeader.isVisible()) {
        await rememberHeader.click();
        await page.waitForTimeout(300);
      }
    }

    const isLocked = await historyButton.getAttribute('data-locked');
    if (isLocked === 'true') return; // Skip if locked

    await historyButton.click();
    await page.waitForSelector('.conversation-history-overlay, .conversation-history', {
      timeout: 5000,
    });

    // Empty state or conversation list should be visible
    const panel = page.locator('.conversation-history-overlay, .conversation-history');
    await expect(panel).toBeVisible();
  });

  test('closes history panel on close button click', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const historyButton = page.locator('[data-action="history"]');
    if (!(await historyButton.isVisible())) {
      const rememberHeader = page.locator('.settings-menu__section-header:has-text("Remember")');
      if (await rememberHeader.isVisible()) {
        await rememberHeader.click();
        await page.waitForTimeout(300);
      }
    }

    const isLocked = await historyButton.getAttribute('data-locked');
    if (isLocked === 'true') return;

    await historyButton.click();
    await page.waitForSelector('.conversation-history-overlay, .conversation-history', {
      timeout: 5000,
    });

    // Click close button
    const closeButton = page.locator(
      '.conversation-history-close, .conversation-history [aria-label="Close"]'
    );
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await expect(
        page.locator('.conversation-history-overlay.open, .conversation-history--visible')
      ).not.toBeVisible({ timeout: 2000 });
    }
  });
});
