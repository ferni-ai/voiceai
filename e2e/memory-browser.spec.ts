/**
 * Memory Browser E2E Tests
 *
 * Tests the Memory Browser feature end-to-end:
 * - Memory summary endpoint
 * - Conversation history endpoint
 * - Conversation context endpoint
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3003';

// Test user ID - should have some conversation data
const TEST_USER_ID = process.env.TEST_USER_ID || 'e2e-test-user';

test.describe('Memory Browser API', () => {
  test('GET /api/voice/memory - returns memory summary', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/voice/memory`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Should have the expected structure
    expect(data).toHaveProperty('hasMemory');
    expect(data).toHaveProperty('totalConversations');

    if (data.hasMemory) {
      expect(typeof data.totalConversations).toBe('number');
      expect(data.totalConversations).toBeGreaterThanOrEqual(0);
    }
  });

  test('GET /api/voice/memory - returns 401 without user ID', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/voice/memory`);

    expect(response.status()).toBe(401);
  });

  test('GET /api/voice/memory/conversations - returns conversation list', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/voice/memory/conversations?limit=5`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('conversations');
    expect(Array.isArray(data.conversations)).toBe(true);

    // If there are conversations, check structure
    if (data.conversations.length > 0) {
      const conv = data.conversations[0];
      expect(conv).toHaveProperty('id');
      expect(conv).toHaveProperty('startedAt');
      expect(conv).toHaveProperty('turnCount');
    }
  });

  test('GET /api/voice/memory/context - returns conversation context', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/voice/memory/context`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Should have the expected structure
    expect(data).toHaveProperty('recentTopics');
    expect(data).toHaveProperty('unfinishedThreads');
    expect(data).toHaveProperty('rememberedDetails');
    expect(data).toHaveProperty('suggestedFollowUps');

    expect(Array.isArray(data.recentTopics)).toBe(true);
    expect(Array.isArray(data.unfinishedThreads)).toBe(true);
    expect(Array.isArray(data.rememberedDetails)).toBe(true);
    expect(Array.isArray(data.suggestedFollowUps)).toBe(true);
  });
});

test.describe('Memory Browser UI', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto(BASE_URL);

    // Wait for app to load
    await page.waitForLoadState('networkidle');
  });

  test('can open Memory Browser from settings menu', async ({ page }) => {
    // Click the settings menu trigger
    const settingsTrigger = page.locator('.settings-trigger');
    if (await settingsTrigger.isVisible()) {
      await settingsTrigger.click();

      // Look for the Memory Browser menu item
      const memoryItem = page.locator('[data-action="conversation-memory"]');
      if (await memoryItem.isVisible()) {
        await memoryItem.click();

        // Wait for memory modal to appear
        const memoryModal = page.locator('.memory-modal-overlay.visible');
        await expect(memoryModal).toBeVisible({ timeout: 5000 });

        // Check for key UI elements
        await expect(page.locator('.memory-modal__title')).toBeVisible();
        await expect(page.locator('.memory-tabs')).toBeVisible();
      }
    }
  });

  test('Memory Browser shows conversations tab', async ({ page }) => {
    // Skip if settings menu not present
    const settingsTrigger = page.locator('.settings-trigger');
    if (!(await settingsTrigger.isVisible())) {
      test.skip();
      return;
    }

    await settingsTrigger.click();

    const memoryItem = page.locator('[data-action="conversation-memory"]');
    if (!(await memoryItem.isVisible())) {
      test.skip();
      return;
    }

    await memoryItem.click();

    // Check conversations tab is active by default
    const conversationsTab = page.locator('.memory-tab[data-tab="conversations"]');
    await expect(conversationsTab).toHaveClass(/active/);
  });

  test('can close Memory Browser', async ({ page }) => {
    const settingsTrigger = page.locator('.settings-trigger');
    if (!(await settingsTrigger.isVisible())) {
      test.skip();
      return;
    }

    await settingsTrigger.click();

    const memoryItem = page.locator('[data-action="conversation-memory"]');
    if (!(await memoryItem.isVisible())) {
      test.skip();
      return;
    }

    await memoryItem.click();

    // Wait for modal
    await page.waitForSelector('.memory-modal-overlay.visible');

    // Click close button
    const closeButton = page.locator('.memory-modal__close');
    await closeButton.click();

    // Modal should be hidden
    await expect(page.locator('.memory-modal-overlay.visible')).not.toBeVisible();
  });
});
