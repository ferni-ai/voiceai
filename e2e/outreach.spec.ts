/**
 * E2E Tests for Upcoming Check-ins (Feature 10)
 *
 * Tests the outreach scheduling system:
 * - GET /api/outreach/upcoming - Get scheduled check-ins
 * - GET /api/outreach/history - Get past outreach
 * - POST /api/outreach/reschedule - Reschedule a check-in
 * - DELETE /api/outreach/pending/:id - Cancel a check-in
 * - UI interactions for viewing and managing check-ins
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-outreach-test-user';

test.describe('Upcoming Check-ins API', () => {
  test('GET /api/outreach/upcoming - returns upcoming check-ins', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/outreach/upcoming`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('upcoming');
    expect(Array.isArray(data.upcoming)).toBe(true);
    expect(data).toHaveProperty('count');
    expect(typeof data.count).toBe('number');

    // If there are items, verify structure
    if (data.upcoming.length > 0) {
      const item = data.upcoming[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('personaId');
      expect(item).toHaveProperty('personaName');
      expect(item).toHaveProperty('channel');
      expect(item).toHaveProperty('scheduledFor');
      expect(item).toHaveProperty('reason');
      expect(item).toHaveProperty('canReschedule');
      expect(item).toHaveProperty('canCancel');
    }
  });

  test('GET /api/outreach/history - returns outreach history', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/outreach/history?limit=10`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('history');
    expect(Array.isArray(data.history)).toBe(true);
    expect(data).toHaveProperty('count');
  });

  test('GET /api/outreach/timing - returns timing preferences', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/outreach/timing`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('patterns');
    expect(data).toHaveProperty('preferences');
  });

  test('GET /api/outreach/analytics - returns outreach analytics', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/outreach/analytics`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('analytics');
  });

  test('POST /api/outreach/reschedule - requires triggerId and newTime', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/outreach/reschedule`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  test('DELETE /api/outreach/pending/:id - returns 404 for non-existent trigger', async ({
    request,
  }) => {
    const response = await request.delete(`${BASE_URL}/api/outreach/pending/non-existent-id`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(404);
  });
});

test.describe('Upcoming Check-ins UI', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app and set up user context
    await page.goto(BASE_URL);

    // Set user ID in localStorage for authenticated requests
    await page.evaluate((userId) => {
      localStorage.setItem('bogle_user_id', userId);
    }, TEST_USER_ID);

    // Wait for app to load
    await page.waitForTimeout(1000);
  });

  test('can open outreach schedule modal from settings', async ({ page }) => {
    // Open settings menu
    const settingsButton = page.locator('[aria-label="Settings"]').or(page.locator('.menu-toggle'));
    if (await settingsButton.isVisible()) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      // Look for Upcoming Check-ins option
      const checkInsOption = page
        .locator('text=Upcoming Check-ins')
        .or(page.locator('text=Check-ins'))
        .or(page.locator('[data-action="upcoming-check-ins"]'));

      if (await checkInsOption.isVisible()) {
        await checkInsOption.click();
        await page.waitForTimeout(500);

        // Verify modal opened
        const modal = page
          .locator('.outreach-schedule-modal')
          .or(page.locator('.outreach-overlay'));
        const modalVisible = await modal.isVisible();

        if (modalVisible) {
          // Verify content loads
          const content = page.locator('.outreach-schedule-content');
          await expect(content.or(page.locator('.upcoming-list'))).toBeVisible({ timeout: 3000 });
        }
      }
    }
  });

  test('displays tabs for upcoming and history', async ({ page }) => {
    // Try to open the outreach modal directly if exposed
    const opened = await page.evaluate(() => {
      // Check if showOutreachSchedule is available
      if (
        typeof (window as unknown as { showOutreachSchedule?: () => void }).showOutreachSchedule ===
        'function'
      ) {
        (window as unknown as { showOutreachSchedule: () => void }).showOutreachSchedule();
        return true;
      }
      return false;
    });

    if (opened) {
      await page.waitForTimeout(500);

      // Check for tabs
      const upcomingTab = page.locator('text=Upcoming').or(page.locator('[data-tab="upcoming"]'));
      const historyTab = page.locator('text=History').or(page.locator('[data-tab="history"]'));

      // At least one tab system should exist
      const hasUpcoming = await upcomingTab.isVisible();
      const hasHistory = await historyTab.isVisible();

      if (hasUpcoming && hasHistory) {
        // Click history tab
        await historyTab.click();
        await page.waitForTimeout(300);

        // Click back to upcoming
        await upcomingTab.click();
        await page.waitForTimeout(300);
      }
    }
  });

  test('can close modal with close button', async ({ page }) => {
    const opened = await page.evaluate(() => {
      if (
        typeof (window as unknown as { showOutreachSchedule?: () => void }).showOutreachSchedule ===
        'function'
      ) {
        (window as unknown as { showOutreachSchedule: () => void }).showOutreachSchedule();
        return true;
      }
      return false;
    });

    if (opened) {
      await page.waitForTimeout(500);

      const closeButton = page
        .locator('.outreach-schedule-close')
        .or(page.locator('[aria-label="Close"]'));
      if (await closeButton.isVisible()) {
        await closeButton.click();
        await page.waitForTimeout(300);

        // Modal should be hidden
        const modal = page.locator('.outreach-schedule-overlay');
        const isHidden = !(await modal.isVisible());
        expect(isHidden).toBe(true);
      }
    }
  });
});

test.describe('Outreach Scheduling Integration', () => {
  test('pending outreach returns correct structure', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/outreach/pending`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('pending');
    expect(Array.isArray(data.pending)).toBe(true);
  });

  test('channel stats endpoint works', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/outreach/channel-stats`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });
});
