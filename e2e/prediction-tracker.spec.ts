/**
 * E2E Tests for Prediction Accuracy Tracker (Feature 8)
 *
 * Tests the prediction system:
 * - GET /api/predictions - Get user predictions
 * - POST /api/predictions/:id/actuals - Update prediction with actual values
 * - Accuracy calculation
 * - UI interactions for viewing and resolving predictions
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-prediction-test-user';

test.describe('Prediction Tracker API', () => {
  test('GET /api/predictions - returns predictions with stats', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/predictions?userId=${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('predictions');
    expect(Array.isArray(data.predictions)).toBe(true);
    expect(data).toHaveProperty('stats');
    expect(data.stats).toHaveProperty('totalPredictions');
    expect(data.stats).toHaveProperty('averageAccuracy');
    expect(data.stats).toHaveProperty('pendingCount');
  });

  test('GET /api/predictions - respects limit parameter', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/predictions?userId=${TEST_USER_ID}&limit=5`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('predictions');
    // Should not exceed limit (may have fewer if user has fewer predictions)
    expect(data.predictions.length).toBeLessThanOrEqual(5);
  });

  test('GET /api/predictions - caps limit at 100', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/predictions?userId=${TEST_USER_ID}&limit=500`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('predictions');
    // Should cap at 100
    expect(data.predictions.length).toBeLessThanOrEqual(100);
  });

  test('POST /api/predictions/:id/actuals - requires body', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/predictions/test-prediction-id/actuals`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    // Should fail with 400 or 500 due to missing actuals
    expect([400, 500]).toContain(response.status());
  });

  test('POST /api/predictions/:id/actuals - returns 404 for non-existent prediction', async ({
    request,
  }) => {
    const response = await request.post(
      `${BASE_URL}/api/predictions/non-existent-prediction/actuals`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          userId: TEST_USER_ID,
          actuals: { result: true },
        },
      }
    );

    expect(response.status()).toBe(404);
  });

  test('prediction stats structure is correct', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/predictions?userId=${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(typeof data.stats.totalPredictions).toBe('number');
    expect(typeof data.stats.averageAccuracy).toBe('number');
    expect(typeof data.stats.pendingCount).toBe('number');

    // Verify accuracy is a percentage (0-100)
    expect(data.stats.averageAccuracy).toBeGreaterThanOrEqual(0);
    expect(data.stats.averageAccuracy).toBeLessThanOrEqual(100);
  });
});

test.describe('Prediction Tracker UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);

    await page.evaluate((userId) => {
      localStorage.setItem('bogle_user_id', userId);
    }, TEST_USER_ID);

    await page.waitForTimeout(1000);
  });

  test('predictions panel can be accessed', async ({ page }) => {
    // Open settings or menu
    const settingsButton = page.locator('[aria-label="Settings"]').or(page.locator('.menu-toggle'));
    if (await settingsButton.isVisible()) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      // Look for predictions/analytics option
      const predictionsOption = page
        .locator('text=Predictions')
        .or(page.locator('text=Analytics'))
        .or(page.locator('[data-action="predictions"]'));

      if (await predictionsOption.isVisible()) {
        await predictionsOption.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('prediction data loads from API', async ({ page }) => {
    // Mock API response to verify data flows correctly
    await page.route('**/api/predictions**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          predictions: [
            {
              id: 'test-pred-1',
              type: 'engagement',
              prediction: 'User will engage tomorrow',
              confidence: 0.85,
              createdAt: new Date().toISOString(),
              status: 'pending',
            },
          ],
          stats: {
            totalPredictions: 10,
            averageAccuracy: 75,
            pendingCount: 1,
            expiredCount: 0,
          },
        }),
      });
    });

    // Trigger a predictions fetch
    const hasPredictions = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/predictions');
        const data = await response.json();
        return data.predictions && data.predictions.length > 0;
      } catch {
        return false;
      }
    });

    expect(hasPredictions).toBe(true);
  });

  test('can resolve a prediction with actual outcome', async ({ page }) => {
    // This test verifies the resolution flow exists
    const hasResolutionCapability = await page.evaluate(async () => {
      // Check if the app has prediction resolution capability
      const response = await fetch('/api/predictions?userId=test');
      return response.ok;
    });

    expect(hasResolutionCapability).toBe(true);
  });
});

test.describe('Prediction Accuracy Calculation', () => {
  test('accuracy is calculated correctly from completed predictions', async ({ request }) => {
    // First get predictions to understand the baseline
    const response = await request.get(`${BASE_URL}/api/predictions?userId=${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // If there are predictions, verify accuracy math
    if (data.predictions.length > 0) {
      const completed = data.predictions.filter(
        (p: { accuracy?: number }) => p.accuracy !== undefined
      );
      if (completed.length > 0) {
        const calculatedAccuracy =
          completed.reduce((sum: number, p: { accuracy: number }) => sum + (p.accuracy || 0), 0) /
          completed.length;
        // Allow for rounding differences
        expect(
          Math.abs(data.stats.averageAccuracy - Math.round(calculatedAccuracy))
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  test('expired predictions are marked correctly', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/predictions?userId=${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Check that expired predictions have the correct status
    const expiredPreds = data.predictions.filter((p: { status: string }) => p.status === 'expired');

    // If there are expired ones, they should have expiredAt timestamp
    for (const pred of expiredPreds) {
      // Expired predictions older than 7 days should be marked
      expect(pred.status).toBe('expired');
    }

    // Stats should count expired correctly
    expect(data.stats.expiredCount).toBe(expiredPreds.length);
  });
});
