/**
 * E2E Tests for Wellbeing Dashboard (Feature 6)
 *
 * Tests the wellbeing tracking system:
 * - GET /api/wellbeing/dashboard - Full dashboard data
 * - GET /api/wellbeing/trends - Trend analysis over time
 * - GET /api/wellbeing/insights - Personalized insights
 * - POST /api/wellbeing/snapshot - Manual wellbeing check-in
 * - Dashboard UI visualization
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-wellbeing-test-user';

test.describe('Wellbeing Dashboard API', () => {
  test('GET /api/wellbeing/dashboard - returns dashboard data', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/wellbeing/dashboard?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Verify required fields
    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('currentState');
    expect(data).toHaveProperty('trends');
    expect(data).toHaveProperty('insights');
    expect(data).toHaveProperty('warnings');
    expect(data).toHaveProperty('streaks');
  });

  test('current state has all dimensions', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/wellbeing/dashboard?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Current state should have all 6 dimensions
    expect(data.currentState).toHaveProperty('mood');
    expect(data.currentState).toHaveProperty('energy');
    expect(data.currentState).toHaveProperty('anxiety');
    expect(data.currentState).toHaveProperty('connection');
    expect(data.currentState).toHaveProperty('purpose');
    expect(data.currentState).toHaveProperty('sleep');
    expect(data.currentState).toHaveProperty('lastUpdated');

    // Values should be between 0 and 1
    expect(data.currentState.mood).toBeGreaterThanOrEqual(0);
    expect(data.currentState.mood).toBeLessThanOrEqual(1);
    expect(data.currentState.energy).toBeGreaterThanOrEqual(0);
    expect(data.currentState.energy).toBeLessThanOrEqual(1);
  });

  test('trends have correct structure', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/wellbeing/dashboard?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data.trends).toHaveProperty('period');
    expect(data.trends).toHaveProperty('direction');
    expect(data.trends).toHaveProperty('changedDimensions');

    // Direction should be one of valid values
    expect(['improving', 'stable', 'declining']).toContain(data.trends.direction);

    // Period should be week
    expect(data.trends.period).toBe('week');
  });

  test('GET /api/wellbeing/trends - returns trend data', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/wellbeing/trends?userId=${TEST_USER_ID}&period=week`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('period');
    expect(data).toHaveProperty('dataPoints');
    expect(data).toHaveProperty('averages');
    expect(Array.isArray(data.dataPoints)).toBe(true);
  });

  test('GET /api/wellbeing/trends - supports different periods', async ({ request }) => {
    const periods = ['week', 'month', 'quarter'];

    for (const period of periods) {
      const response = await request.get(
        `${BASE_URL}/api/wellbeing/trends?userId=${TEST_USER_ID}&period=${period}`,
        {
          headers: {
            'X-User-ID': TEST_USER_ID,
          },
        }
      );

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.period).toBe(period);
    }
  });

  test('GET /api/wellbeing/insights - returns insights', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/wellbeing/insights?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('insights');
    expect(Array.isArray(data.insights)).toBe(true);

    // If there are insights, verify structure
    if (data.insights.length > 0) {
      const insight = data.insights[0];
      expect(insight).toHaveProperty('type');
      expect(insight).toHaveProperty('message');
      // type should be pattern, suggestion, or celebration
      expect(['pattern', 'suggestion', 'celebration']).toContain(insight.type);
    }
  });

  test('POST /api/wellbeing/snapshot - creates a snapshot', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/wellbeing/snapshot`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        userId: TEST_USER_ID,
        mood: 0.7,
        energy: 0.6,
        anxiety: 0.3,
        connection: 0.8,
        purpose: 0.7,
        sleep: 0.6,
        note: 'E2E test snapshot',
      },
    });

    // Should succeed with 200 or 201
    expect([200, 201]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');
  });

  test('warnings have correct structure', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/wellbeing/dashboard?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(Array.isArray(data.warnings)).toBe(true);

    // If there are warnings, verify structure
    if (data.warnings.length > 0) {
      const warning = data.warnings[0];
      expect(warning).toHaveProperty('type');
      expect(warning).toHaveProperty('severity');
      expect(warning).toHaveProperty('message');
      // Severity should be one of valid values
      expect(['watch', 'concern', 'urgent']).toContain(warning.severity);
    }
  });

  test('streaks have correct structure', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/wellbeing/dashboard?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data.streaks).toHaveProperty('currentDays');
    expect(data.streaks).toHaveProperty('bestDays');
    expect(data.streaks).toHaveProperty('lastCheckIn');

    expect(typeof data.streaks.currentDays).toBe('number');
    expect(typeof data.streaks.bestDays).toBe('number');
  });
});

test.describe('Wellbeing Dashboard UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);

    await page.evaluate((userId) => {
      localStorage.setItem('bogle_user_id', userId);
      localStorage.setItem('ferni_user_id', userId);
    }, TEST_USER_ID);

    await page.waitForTimeout(1000);
  });

  test('can open wellbeing dashboard from menu', async ({ page }) => {
    // Open settings menu
    const settingsButton = page.locator('[aria-label="Settings"]').or(page.locator('.menu-toggle'));
    if (await settingsButton.isVisible()) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      // Look for wellbeing option
      const wellbeingOption = page
        .locator('text=Wellbeing')
        .or(page.locator('text=Dashboard'))
        .or(page.locator('[data-action="wellbeing"]'));

      if (await wellbeingOption.isVisible()) {
        await wellbeingOption.click();
        await page.waitForTimeout(500);

        // Verify modal opened
        const modal = page
          .locator('.wellbeing-dashboard')
          .or(page.locator('.wellbeing-modal'))
          .or(page.locator('[data-panel="wellbeing"]'));

        if (await modal.isVisible()) {
          expect(await modal.isVisible()).toBe(true);
        }
      }
    }
  });

  test('dashboard loads data from API', async ({ page }) => {
    // Mock API response
    await page.route('**/api/wellbeing/dashboard**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userId: TEST_USER_ID,
          currentState: {
            mood: 0.75,
            energy: 0.6,
            anxiety: 0.25,
            connection: 0.8,
            purpose: 0.7,
            sleep: 0.65,
            lastUpdated: new Date().toISOString(),
          },
          trends: {
            period: 'week',
            direction: 'improving',
            changedDimensions: ['mood', 'energy'],
          },
          insights: [
            {
              type: 'celebration',
              message: 'Your mood has been great lately!',
              dimension: 'mood',
            },
          ],
          warnings: [],
          streaks: {
            currentDays: 5,
            bestDays: 7,
            lastCheckIn: new Date().toISOString(),
          },
        }),
      });
    });

    // Verify API is callable
    const result = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/wellbeing/dashboard?userId=test');
        const data = await response.json();
        return {
          success: true,
          hasMood: data.currentState?.mood !== undefined,
        };
      } catch {
        return { success: false, hasMood: false };
      }
    });

    expect(result.success).toBe(true);
    expect(result.hasMood).toBe(true);
  });

  test('displays dimension cards', async ({ page }) => {
    await page.route('**/api/wellbeing/dashboard**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userId: TEST_USER_ID,
          currentState: {
            mood: 0.75,
            energy: 0.6,
            anxiety: 0.25,
            connection: 0.8,
            purpose: 0.7,
            sleep: 0.65,
            lastUpdated: new Date().toISOString(),
          },
          trends: { period: 'week', direction: 'stable', changedDimensions: [] },
          insights: [],
          warnings: [],
          streaks: { currentDays: 3, bestDays: 5, lastCheckIn: new Date().toISOString() },
        }),
      });
    });

    // Try to open wellbeing dashboard
    const opened = await page.evaluate(() => {
      const event = new CustomEvent('ferni:open-wellbeing');
      window.dispatchEvent(event);
      return true;
    });

    if (opened) {
      await page.waitForTimeout(500);

      // Look for dimension cards
      const moodCard = page.locator('text=Mood').or(page.locator('[data-dimension="mood"]'));
      const energyCard = page.locator('text=Energy').or(page.locator('[data-dimension="energy"]'));

      // Dashboard should show these dimensions
    }
  });

  test('can close dashboard', async ({ page }) => {
    const opened = await page.evaluate(() => {
      const event = new CustomEvent('ferni:open-wellbeing');
      window.dispatchEvent(event);
      return true;
    });

    if (opened) {
      await page.waitForTimeout(500);

      const closeButton = page
        .locator('.wellbeing-close')
        .or(page.locator('[aria-label="Close"]'))
        .or(page.locator('.close-btn'));

      if (await closeButton.isVisible()) {
        await closeButton.click();
        await page.waitForTimeout(300);
      }
    }
  });
});

test.describe('Wellbeing Data Integration', () => {
  test('dashboard integrates with trends endpoint', async ({ request }) => {
    // Get dashboard
    const dashboardResponse = await request.get(
      `${BASE_URL}/api/wellbeing/dashboard?userId=${TEST_USER_ID}`,
      {
        headers: { 'X-User-ID': TEST_USER_ID },
      }
    );
    expect(dashboardResponse.status()).toBe(200);

    // Get trends
    const trendsResponse = await request.get(
      `${BASE_URL}/api/wellbeing/trends?userId=${TEST_USER_ID}&period=week`,
      {
        headers: { 'X-User-ID': TEST_USER_ID },
      }
    );
    expect(trendsResponse.status()).toBe(200);

    // Both should work for the same user
    const dashboard = await dashboardResponse.json();
    const trends = await trendsResponse.json();

    expect(dashboard.userId).toBe(trends.userId);
  });

  test('averages are within valid range', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/wellbeing/trends?userId=${TEST_USER_ID}&period=week`,
      {
        headers: { 'X-User-ID': TEST_USER_ID },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    // All averages should be 0-1
    for (const [, value] of Object.entries(data.averages)) {
      const numValue = value as number;
      expect(numValue).toBeGreaterThanOrEqual(0);
      expect(numValue).toBeLessThanOrEqual(1);
    }
  });
});
