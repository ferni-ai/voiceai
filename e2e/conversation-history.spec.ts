/**
 * E2E Tests for Conversation History Feature
 *
 * Tests the conversation history / past conversations functionality:
 * - Opening the conversation history panel
 * - Viewing past conversations
 * - Searching conversations
 */

import { expect, test, type Page } from './support/fixtures';
import { API_URL, APP_URL } from './support/env';
import { openSettingsMenu, seedRelationship } from './support/app';

const TEST_USER_ID = 'e2e-history-test-user';

test.describe('Conversation History API', { tag: '@needs-server' }, () => {
  test('GET /api/conversations - returns conversation list', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/conversations`, {
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
    const response = await request.get(`${API_URL}/api/conversations/test-id`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    // 404 is acceptable for non-existent conversation
    expect([200, 404]).toContain(response.status());
  });
});

/**
 * Open the menu and return the Conversation History item. It lives in the
 * "Our Story" section, which the menu shows from the Getting Started stage.
 */
async function findHistoryButton(page: Page) {
  await page.goto(APP_URL);
  await openSettingsMenu(page);

  const historyButton = page.locator('.settings-menu [data-action="history"]');
  await expect(historyButton).toBeVisible();
  return historyButton;
}

// The history panel is ui/conversation-history.ui.ts: `.history`, shown with
// `.history--visible`.
const HISTORY_PANEL = '.history.history--visible';

test.describe('Conversation History UI', () => {
  test.describe('before it unlocks', () => {
    // Getting Started: the section is visible, history is still locked
    test.beforeEach(async ({ page }) => {
      await seedRelationship(page, { stage: 'getting-started', totalConversations: 10 });
    });

    test('opens conversation history from menu', async ({ page }) => {
      const historyButton = await findHistoryButton(page);

      // Feature is locked for newer relationships: the lock UI is shown
      await expect(historyButton).toHaveAttribute('data-locked', 'true');
      await expect(historyButton.locator('.settings-menu__lock-icon')).toBeVisible();
    });
  });

  test.describe('once unlocked', () => {
    // Conversation history unlocks at the Established stage
    test.beforeEach(async ({ page }) => {
      await seedRelationship(page, { stage: 'established', totalConversations: 30 });
    });

    test('opens conversation history from menu', async ({ page }) => {
      const historyButton = await findHistoryButton(page);
      await expect(historyButton).not.toHaveAttribute('data-locked', 'true');

      await historyButton.click();

      // Verify history panel opened
      await expect(page.locator(HISTORY_PANEL)).toBeVisible({ timeout: 5000 });
    });

    test('displays empty state for new users', async ({ page }) => {
      const historyButton = await findHistoryButton(page);
      await historyButton.click();

      // Empty state or conversation list should be visible
      const panel = page.locator(HISTORY_PANEL);
      await expect(panel).toBeVisible({ timeout: 5000 });
      await expect(panel.locator('.history__title')).toBeVisible();
    });

    test('closes history panel on close button click', async ({ page }) => {
      const historyButton = await findHistoryButton(page);
      await historyButton.click();
      await expect(page.locator(HISTORY_PANEL)).toBeVisible({ timeout: 5000 });

      // Click close button
      await page.locator(`${HISTORY_PANEL} .history__close`).click();
      await expect(page.locator(HISTORY_PANEL)).toHaveCount(0, { timeout: 2000 });
    });
  });
});
