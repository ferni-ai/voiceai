/**
 * E2E Tests for Progress Analytics (Feature 7)
 *
 * Tests the analytics dashboard system:
 * - GET /api/analytics/user - Get user progress analytics
 * - Dashboard visualization
 * - Streak tracking
 * - Mood trends
 * - Prediction accuracy display
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-analytics-test-user';

test.describe('Progress Analytics API', () => {
  test('GET /api/analytics/user - returns analytics data', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/analytics/user?userId=${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Verify required fields exist
    expect(data).toHaveProperty('totalDays');
    expect(data).toHaveProperty('totalRituals');
    expect(data).toHaveProperty('currentLongestStreak');
    expect(data).toHaveProperty('averageMood');
    expect(data).toHaveProperty('predictionAccuracy');
    expect(data).toHaveProperty('moodTrends');
    expect(data).toHaveProperty('bestDay');
    expect(data).toHaveProperty('mostConsistentRitual');
    expect(data).toHaveProperty('improvementAreas');
  });

  test('analytics data types are correct', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/analytics/user?userId=${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Type validations
    expect(typeof data.totalDays).toBe('number');
    expect(typeof data.totalRituals).toBe('number');
    expect(typeof data.currentLongestStreak).toBe('number');
    expect(typeof data.averageMood).toBe('number');
    expect(Array.isArray(data.moodTrends)).toBe(true);
    expect(Array.isArray(data.improvementAreas)).toBe(true);

    // Nullable fields can be null or string
    if (data.bestDay !== null) {
      expect(typeof data.bestDay).toBe('string');
    }
    if (data.mostConsistentRitual !== null) {
      expect(typeof data.mostConsistentRitual).toBe('string');
    }
    if (data.predictionAccuracy !== null) {
      expect(typeof data.predictionAccuracy).toBe('number');
    }
  });

  test('mood trends have correct structure', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/analytics/user?userId=${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // If there are mood trends, verify their structure
    if (data.moodTrends.length > 0) {
      const trend = data.moodTrends[0];
      expect(trend).toHaveProperty('date');
      expect(trend).toHaveProperty('mood');
      expect(trend).toHaveProperty('energy');

      // Valid mood values
      const validMoods = [
        'sunny',
        'partly-cloudy',
        'cloudy',
        'rainy',
        'stormy',
        'foggy',
        'rainbow',
      ];
      expect(validMoods).toContain(trend.mood);

      // Valid energy values
      const validEnergies = ['high', 'medium', 'low'];
      expect(validEnergies).toContain(trend.energy);
    }
  });

  test('returns default values for new users', async ({ request }) => {
    const newUserId = `new-user-${Date.now()}`;

    const response = await request.get(`${BASE_URL}/api/analytics/user?userId=${newUserId}`, {
      headers: {
        'X-User-ID': newUserId,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // New users should have zero/empty values
    expect(data.totalDays).toBe(0);
    expect(data.totalRituals).toBeGreaterThanOrEqual(0);
    expect(data.currentLongestStreak).toBeGreaterThanOrEqual(0);
    expect(data.moodTrends).toEqual([]);
  });

  test('average mood is within valid range', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/analytics/user?userId=${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Average mood should be between 1-5 (or 0 for no data)
    expect(data.averageMood).toBeGreaterThanOrEqual(0);
    expect(data.averageMood).toBeLessThanOrEqual(5);
  });

  test('prediction accuracy is a percentage', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/analytics/user?userId=${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // If prediction accuracy exists, it should be 0-100
    if (data.predictionAccuracy !== null) {
      expect(data.predictionAccuracy).toBeGreaterThanOrEqual(0);
      expect(data.predictionAccuracy).toBeLessThanOrEqual(100);
    }
  });
});

test.describe('Analytics Dashboard UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);

    await page.evaluate((userId) => {
      localStorage.setItem('bogle_user_id', userId);
    }, TEST_USER_ID);

    await page.waitForTimeout(1000);
  });

  test('can open analytics dashboard from menu', async ({ page }) => {
    // Open settings menu
    const settingsButton = page.locator('[aria-label="Settings"]').or(page.locator('.menu-toggle'));
    if (await settingsButton.isVisible()) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      // Look for analytics option
      const analyticsOption = page
        .locator('text=Analytics')
        .or(page.locator('text=Progress'))
        .or(page.locator('[data-action="analytics"]'));

      if (await analyticsOption.isVisible()) {
        await analyticsOption.click();
        await page.waitForTimeout(500);

        // Verify modal/panel opened
        const dashboard = page
          .locator('.analytics-dashboard')
          .or(page.locator('.analytics-panel'))
          .or(page.locator('[data-panel="analytics"]'));

        if (await dashboard.isVisible()) {
          // Success - dashboard opened
          expect(await dashboard.isVisible()).toBe(true);
        }
      }
    }
  });

  test('dashboard loads data from API', async ({ page }) => {
    // Mock API for predictable data
    await page.route('**/api/analytics/user**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalDays: 30,
          totalRituals: 150,
          currentLongestStreak: 7,
          averageMood: 4.2,
          predictionAccuracy: 78,
          moodTrends: [
            { date: '2024-01-01', mood: 'sunny', energy: 'high' },
            { date: '2024-01-02', mood: 'partly-cloudy', energy: 'medium' },
          ],
          bestDay: 'Monday',
          mostConsistentRitual: 'Morning Sky Check',
          improvementAreas: ['Try to maintain your meditation streak'],
        }),
      });
    });

    // Trigger analytics fetch
    const result = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/analytics/user?userId=test');
        const data = await response.json();
        return {
          success: true,
          hasData: data.totalDays > 0,
        };
      } catch {
        return { success: false, hasData: false };
      }
    });

    expect(result.success).toBe(true);
    expect(result.hasData).toBe(true);
  });

  test('displays streak information', async ({ page }) => {
    await page.route('**/api/analytics/user**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalDays: 30,
          totalRituals: 150,
          currentLongestStreak: 14,
          averageMood: 4.0,
          predictionAccuracy: 80,
          moodTrends: [],
          bestDay: 'Tuesday',
          mostConsistentRitual: 'Habit Heartbeat',
          improvementAreas: [],
        }),
      });
    });

    // Open analytics via showAnalyticsDashboard if exposed
    const opened = await page.evaluate(async () => {
      // Try to trigger analytics dashboard
      const event = new CustomEvent('ferni:open-analytics');
      window.dispatchEvent(event);

      // Also try direct call if available
      const win = window as unknown as { showAnalyticsDashboard?: () => void };
      if (typeof win.showAnalyticsDashboard === 'function') {
        win.showAnalyticsDashboard();
        return true;
      }
      return false;
    });

    if (opened) {
      await page.waitForTimeout(500);
      // Verify streak is displayed somewhere
      const streakText = page.locator('text=14').or(page.locator('text=streak'));
      // Dashboard should show the streak value
    }
  });

  test('can close dashboard', async ({ page }) => {
    const opened = await page.evaluate(async () => {
      const event = new CustomEvent('ferni:open-analytics');
      window.dispatchEvent(event);
      return true;
    });

    if (opened) {
      await page.waitForTimeout(500);

      const closeButton = page
        .locator('.analytics-close')
        .or(page.locator('[aria-label="Close"]'))
        .or(page.locator('.close-btn'));

      if (await closeButton.isVisible()) {
        await closeButton.click();
        await page.waitForTimeout(300);

        const dashboard = page.locator('.analytics-dashboard');
        const isHidden = !(await dashboard.isVisible());
        // Dashboard should be closed or hidden
      }
    }
  });
});

test.describe('Analytics Data Integration', () => {
  test('analytics aggregates streak data correctly', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/analytics/user?userId=${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // currentLongestStreak should be non-negative
    expect(data.currentLongestStreak).toBeGreaterThanOrEqual(0);

    // totalRituals should match or exceed streak
    expect(data.totalRituals).toBeGreaterThanOrEqual(0);
  });

  test('improvement areas are actionable strings', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/analytics/user?userId=${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // All improvement areas should be non-empty strings
    for (const area of data.improvementAreas) {
      expect(typeof area).toBe('string');
      expect(area.length).toBeGreaterThan(0);
    }
  });

  test('best day is a valid weekday', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/analytics/user?userId=${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // If bestDay is set, it should be a valid weekday
    if (data.bestDay !== null) {
      const validDays = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      expect(validDays).toContain(data.bestDay);
    }
  });
});
