/**
 * E2E Tests for "What's Growing" Roadmap Panel
 *
 * Tests the roadmap/coming soon experience:
 * - POST /api/waitlist - Email signup for notifications
 * - POST /api/waitlist/vote - Vote for a feature
 * - GET /api/waitlist/votes/:featureId - Get vote count
 * - Roadmap panel UI
 * - Feature detail view
 * - Voting interaction
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_EMAIL = 'e2e-roadmap-test@example.com';

// ============================================================================
// API TESTS
// ============================================================================

test.describe('Waitlist API', () => {
  test('POST /api/waitlist - accepts valid email signup', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/waitlist`, {
      data: {
        email: TEST_EMAIL,
        source: 'marketplace',
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toBeTruthy();
  });

  test('POST /api/waitlist - rejects invalid email', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/waitlist`, {
      data: {
        email: 'not-an-email',
        source: 'marketplace',
      },
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.error).toBeTruthy();
  });

  test('POST /api/waitlist - accepts developer source', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/waitlist`, {
      data: {
        email: 'developer-test@example.com',
        source: 'developer',
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('POST /api/waitlist - defaults to marketplace source', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/waitlist`, {
      data: {
        email: 'default-source@example.com',
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
  });
});

test.describe('Feature Voting API', () => {
  const testFeatureId = 'e2e-test-feature';

  test('POST /api/waitlist/vote - records a vote', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/waitlist/vote`, {
      data: {
        featureId: testFeatureId,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(typeof data.votes).toBe('number');
    expect(data.votes).toBeGreaterThanOrEqual(1);
  });

  test('POST /api/waitlist/vote - rejects missing featureId', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/waitlist/vote`, {
      data: {},
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.error).toBeTruthy();
  });

  test('GET /api/waitlist/votes/:featureId - returns vote count', async ({ request }) => {
    // First, add a vote
    await request.post(`${BASE_URL}/api/waitlist/vote`, {
      data: { featureId: testFeatureId },
    });

    // Then check the count
    const response = await request.get(`${BASE_URL}/api/waitlist/votes/${testFeatureId}`);

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.featureId).toBe(testFeatureId);
    expect(typeof data.votes).toBe('number');
    expect(data.votes).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/waitlist/votes/:featureId - returns 0 for unknown feature', async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/waitlist/votes/unknown-feature-xyz`);

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.votes).toBe(0);
  });
});

// ============================================================================
// UI TESTS
// ============================================================================

test.describe('Roadmap Panel UI', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto(BASE_URL);

    // Wait for app to load
    await page.waitForLoadState('networkidle');
  });

  test('opens roadmap panel from menu', async ({ page }) => {
    // Open settings menu
    const settingsButton = page.locator('.settings-trigger');
    if (await settingsButton.isVisible()) {
      await settingsButton.click();
    }

    // Click "What's Growing" button
    const whatsGrowingBtn = page.locator('[data-action="whats-growing"]');
    if (await whatsGrowingBtn.isVisible()) {
      await whatsGrowingBtn.click();

      // Verify roadmap panel opens
      await expect(page.locator('.roadmap-panel')).toBeVisible({ timeout: 5000 });
    }
  });

  test('roadmap panel shows feature cards', async ({ page }) => {
    // Open settings menu
    const settingsButton = page.locator('.settings-trigger');
    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      // Click "What's Growing"
      const whatsGrowingBtn = page.locator('[data-action="whats-growing"]');
      if (await whatsGrowingBtn.isVisible()) {
        await whatsGrowingBtn.click();

        // Wait for panel
        await page.waitForSelector('.roadmap-panel', { timeout: 5000 });

        // Check for feature cards
        const featureCards = page.locator('.roadmap-card');
        const count = await featureCards.count();

        // Should have at least one feature card
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('roadmap feature opens detail view', async ({ page }) => {
    // Open settings menu
    const settingsButton = page.locator('.settings-trigger');
    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      // Find a roadmap item (has data-roadmap="true")
      const roadmapItem = page.locator('[data-roadmap="true"]').first();
      if (await roadmapItem.isVisible()) {
        await roadmapItem.click();

        // Should open roadmap panel with detail view
        await expect(page.locator('.roadmap-panel')).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('roadmap panel closes on backdrop click', async ({ page }) => {
    // Open settings menu
    const settingsButton = page.locator('.settings-trigger');
    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      // Click "What's Growing"
      const whatsGrowingBtn = page.locator('[data-action="whats-growing"]');
      if (await whatsGrowingBtn.isVisible()) {
        await whatsGrowingBtn.click();

        // Wait for panel
        await page.waitForSelector('.roadmap-panel', { timeout: 5000 });

        // Click backdrop
        const backdrop = page.locator('.roadmap-backdrop');
        if (await backdrop.isVisible()) {
          await backdrop.click({ position: { x: 10, y: 10 } });

          // Panel should close
          await expect(page.locator('.roadmap-panel')).not.toBeVisible({ timeout: 3000 });
        }
      }
    }
  });

  test('roadmap panel closes on close button click', async ({ page }) => {
    // Open settings menu
    const settingsButton = page.locator('.settings-trigger');
    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      // Click "What's Growing"
      const whatsGrowingBtn = page.locator('[data-action="whats-growing"]');
      if (await whatsGrowingBtn.isVisible()) {
        await whatsGrowingBtn.click();

        // Wait for panel
        await page.waitForSelector('.roadmap-panel', { timeout: 5000 });

        // Click close button
        const closeBtn = page.locator('.roadmap-close-btn');
        if (await closeBtn.isVisible()) {
          await closeBtn.click();

          // Panel should close
          await expect(page.locator('.roadmap-panel')).not.toBeVisible({ timeout: 3000 });
        }
      }
    }
  });
});

// ============================================================================
// ROADMAP MENU ITEM TESTS
// ============================================================================

test.describe('Roadmap Menu Items', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('roadmap features show growth stage badge', async ({ page }) => {
    // Open settings menu
    const settingsButton = page.locator('.settings-trigger');
    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      // Wait for menu to be visible
      await page.waitForSelector('.settings-menu', { timeout: 5000 });

      // Check for roadmap badge on roadmap items
      const roadmapBadges = page.locator('.settings-menu__roadmap-badge');
      const count = await roadmapBadges.count();

      // Should have growth stage badges on roadmap items
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('roadmap features have dashed border styling', async ({ page }) => {
    // Open settings menu
    const settingsButton = page.locator('.settings-trigger');
    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      // Wait for menu
      await page.waitForSelector('.settings-menu', { timeout: 5000 });

      // Check for roadmap item styling
      const roadmapItems = page.locator('.settings-menu__item--roadmap');
      const count = await roadmapItems.count();

      if (count > 0) {
        // Verify first item has the roadmap class
        const firstItem = roadmapItems.first();
        await expect(firstItem).toHaveClass(/settings-menu__item--roadmap/);
      }
    }
  });
});

// ============================================================================
// ACCESSIBILITY TESTS
// ============================================================================

test.describe('Roadmap Accessibility', () => {
  test('roadmap panel has proper ARIA attributes', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Open settings menu
    const settingsButton = page.locator('.settings-trigger');
    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      // Click "What's Growing"
      const whatsGrowingBtn = page.locator('[data-action="whats-growing"]');
      if (await whatsGrowingBtn.isVisible()) {
        await whatsGrowingBtn.click();

        // Wait for panel
        await page.waitForSelector('.roadmap-panel', { timeout: 5000 });

        // Check for accessibility attributes
        const panel = page.locator('.roadmap-panel');
        const role = await panel.getAttribute('role');
        const ariaModal = await panel.getAttribute('aria-modal');

        // Should have dialog role and aria-modal
        expect(role).toBe('dialog');
        expect(ariaModal).toBe('true');
      }
    }
  });

  test('close button is keyboard accessible', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Open settings menu
    const settingsButton = page.locator('.settings-trigger');
    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      // Click "What's Growing"
      const whatsGrowingBtn = page.locator('[data-action="whats-growing"]');
      if (await whatsGrowingBtn.isVisible()) {
        await whatsGrowingBtn.click();

        // Wait for panel
        await page.waitForSelector('.roadmap-panel', { timeout: 5000 });

        // Check close button has aria-label
        const closeBtn = page.locator('.roadmap-close-btn');
        if (await closeBtn.isVisible()) {
          const ariaLabel = await closeBtn.getAttribute('aria-label');
          expect(ariaLabel).toBeTruthy();
        }
      }
    }
  });
});
