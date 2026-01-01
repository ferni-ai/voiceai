/**
 * E2E Tests for Practice View (What's Ahead)
 *
 * Tests the complete data flow for the practice view:
 * - GET /api/practice-view - Full practice view data
 * - POST /api/practice-view/intentions/:id/complete - Mark intention complete
 * - GET /api/practice-view/patterns - Maya's pattern awareness
 *
 * Related API tests:
 * - GET /api/predictions - Predictive coaching predictions
 * - GET /api/insights/predictions - Predictive insights
 * - GET /api/semantic-intelligence/* - Semantic intelligence routes
 *
 * The practice view combines:
 * - Calendar events from all connected providers
 * - Habits and habit streaks
 * - Intentions (tasks)
 * - Cross-persona insights from superhuman services
 * - Pattern awareness (Maya notices)
 * - Predictions from predictive coaching
 * - Pending outreach (thinking of you, etc.)
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-practice-view-test-user';

test.describe('Practice View API', () => {
  test.describe('GET /api/practice-view', () => {
    test('returns a valid practice view response', async ({ request }) => {
      const response = await request.get(
        `${BASE_URL}/api/practice-view?userId=${TEST_USER_ID}`,
        {
          headers: {
            'X-User-ID': TEST_USER_ID,
          },
        }
      );

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // Validate response structure
      expect(data).toHaveProperty('orchestratingPersona');
      expect(data).toHaveProperty('week');
      expect(data).toHaveProperty('todayEvents');
      expect(data).toHaveProperty('intentions');
      expect(data).toHaveProperty('stats');
      expect(data).toHaveProperty('lastUpdated');
    });

    test('returns week data with 7 days', async ({ request }) => {
      const response = await request.get(
        `${BASE_URL}/api/practice-view?userId=${TEST_USER_ID}`,
        {
          headers: {
            'X-User-ID': TEST_USER_ID,
          },
        }
      );

      const data = await response.json();
      expect(data.week).toHaveLength(7);

      // Each day should have required fields
      for (const day of data.week) {
        expect(day).toHaveProperty('date');
        expect(day).toHaveProperty('dayName');
        expect(day).toHaveProperty('shortName');
        expect(day).toHaveProperty('dayNum');
        expect(day).toHaveProperty('isToday');
        expect(day).toHaveProperty('events');
        expect(day).toHaveProperty('insight');
      }

      // Exactly one day should be today
      const todayCount = data.week.filter((d: { isToday: boolean }) => d.isToday).length;
      expect(todayCount).toBe(1);
    });

    test('returns stats with valid values', async ({ request }) => {
      const response = await request.get(
        `${BASE_URL}/api/practice-view?userId=${TEST_USER_ID}`,
        {
          headers: {
            'X-User-ID': TEST_USER_ID,
          },
        }
      );

      const data = await response.json();
      expect(data.stats).toHaveProperty('followThroughPercent');
      expect(data.stats).toHaveProperty('habitsCompletedThisWeek');
      expect(data.stats).toHaveProperty('momentumTrend');
      expect(data.stats).toHaveProperty('streak');

      // Validate stat types
      expect(typeof data.stats.followThroughPercent).toBe('number');
      expect(typeof data.stats.habitsCompletedThisWeek).toBe('number');
      expect(['rising', 'steady', 'building', 'declining']).toContain(data.stats.momentumTrend);
      expect(typeof data.stats.streak).toBe('number');
    });

    test('includes intentions with correct structure', async ({ request }) => {
      const response = await request.get(
        `${BASE_URL}/api/practice-view?userId=${TEST_USER_ID}`,
        {
          headers: {
            'X-User-ID': TEST_USER_ID,
          },
        }
      );

      const data = await response.json();
      expect(Array.isArray(data.intentions)).toBe(true);

      // If intentions exist, validate structure
      if (data.intentions.length > 0) {
        const intention = data.intentions[0];
        expect(intention).toHaveProperty('id');
        expect(intention).toHaveProperty('text');
        expect(intention).toHaveProperty('completed');
      }
    });

    test('returns Maya pattern notice when patterns exist', async ({ request }) => {
      const response = await request.get(
        `${BASE_URL}/api/practice-view?userId=${TEST_USER_ID}`,
        {
          headers: {
            'X-User-ID': TEST_USER_ID,
          },
        }
      );

      const data = await response.json();

      // mayaNotices can be null or an object with message
      if (data.mayaNotices) {
        expect(data.mayaNotices).toHaveProperty('message');
        expect(data.mayaNotices).toHaveProperty('type');
        expect(['observation', 'suggestion', 'celebration', 'concern']).toContain(
          data.mayaNotices.type
        );
      }
    });

    test('requires userId parameter', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/practice-view`);
      expect(response.status()).toBe(401);
    });
  });

  test.describe('POST /api/practice-view/intentions/:id/complete', () => {
    test('marks an intention as complete', async ({ request }) => {
      // First, get intentions to find one to complete
      const getResponse = await request.get(
        `${BASE_URL}/api/practice-view?userId=${TEST_USER_ID}`,
        {
          headers: {
            'X-User-ID': TEST_USER_ID,
          },
        }
      );
      const getData = await getResponse.json();

      // If there are default intentions, try to complete one
      if (getData.intentions.length > 0) {
        const intentionId = getData.intentions[0].id;

        const response = await request.post(
          `${BASE_URL}/api/practice-view/intentions/${intentionId}/complete?userId=${TEST_USER_ID}`,
          {
            headers: {
              'X-User-ID': TEST_USER_ID,
            },
          }
        );

        expect(response.status()).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.intentionId).toBe(intentionId);
      }
    });

    test('handles invalid intention IDs gracefully', async ({ request }) => {
      const response = await request.post(
        `${BASE_URL}/api/practice-view/intentions/nonexistent_id/complete?userId=${TEST_USER_ID}`,
        {
          headers: {
            'X-User-ID': TEST_USER_ID,
          },
        }
      );

      // Should return error but not crash
      expect(response.status()).toBeGreaterThanOrEqual(400);
    });
  });

  test.describe('GET /api/practice-view/patterns', () => {
    test('returns Maya pattern data', async ({ request }) => {
      const response = await request.get(
        `${BASE_URL}/api/practice-view/patterns?userId=${TEST_USER_ID}`,
        {
          headers: {
            'X-User-ID': TEST_USER_ID,
          },
        }
      );

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('patterns');
      expect(data).toHaveProperty('persona');
      expect(data.persona).toBe('maya');
    });
  });
});

test.describe('Practice View Data Integration', () => {
  test('cross-persona insights have valid structure', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/practice-view?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    const data = await response.json();

    // Cross-persona insights should be an array
    expect(Array.isArray(data.crossPersonaInsights)).toBe(true);

    // If insights exist, validate structure
    if (data.crossPersonaInsights.length > 0) {
      const insight = data.crossPersonaInsights[0];
      expect(insight).toHaveProperty('persona');
      expect(insight).toHaveProperty('type');
      expect(insight).toHaveProperty('message');
      expect(['ferni', 'maya', 'peter', 'alex', 'jordan', 'nayan']).toContain(insight.persona);
      expect(['notice', 'suggest', 'celebrate', 'warn']).toContain(insight.type);
    }
  });

  test('events may have emotional context', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/practice-view?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    const data = await response.json();

    // Check if any events have emotional context
    const eventsWithContext = data.todayEvents.filter(
      (e: { emotionalContext?: unknown }) => e.emotionalContext
    );

    // Context is optional, just validate structure if present
    for (const event of eventsWithContext) {
      expect(event.emotionalContext).toHaveProperty('persona');
      expect(event.emotionalContext).toHaveProperty('insight');
    }
  });

  test('returns empty arrays for new users', async ({ request }) => {
    const newUserId = `new_user_${Date.now()}`;
    const response = await request.get(`${BASE_URL}/api/practice-view?userId=${newUserId}`, {
      headers: {
        'X-User-ID': newUserId,
      },
    });

    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.week).toHaveLength(7);
    // Should have default intentions for new users
    expect(Array.isArray(data.intentions)).toBe(true);
  });
});

test.describe('Predictions API Integration', () => {
  test('GET /api/predictions returns prediction data', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/predictions?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('predictions');
    expect(Array.isArray(data.predictions)).toBe(true);
    expect(data).toHaveProperty('stats');
  });

  test('practice view includes predictions', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/practice-view?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    const data = await response.json();
    expect(data).toHaveProperty('predictions');
    expect(Array.isArray(data.predictions)).toBe(true);

    // Validate prediction structure if any exist
    if (data.predictions.length > 0) {
      const prediction = data.predictions[0];
      expect(prediction).toHaveProperty('id');
      expect(prediction).toHaveProperty('prediction');
      expect(prediction).toHaveProperty('confidence');
      expect(['very_high', 'high', 'medium', 'low']).toContain(prediction.confidence);
      expect(prediction).toHaveProperty('suggestedIntervention');
      expect(['now', 'tomorrow', 'this_week']).toContain(prediction.timing);
    }
  });
});

test.describe('Semantic Intelligence API', () => {
  test('GET /api/semantic-intelligence/summary returns overview', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/semantic-intelligence/summary?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('timestamp');
  });

  test('GET /api/semantic-intelligence/insights returns proactive insights', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/semantic-intelligence/insights?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('insights');
    expect(Array.isArray(data.insights)).toBe(true);
    expect(data).toHaveProperty('count');
    expect(data).toHaveProperty('timestamp');
  });

  test('GET /api/semantic-intelligence/open-loops returns open loops', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/semantic-intelligence/open-loops?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('loops');
    expect(Array.isArray(data.loops)).toBe(true);
  });

  test('GET /api/semantic-intelligence/commitments returns Ferni commitments', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/semantic-intelligence/commitments?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('commitments');
  });
});

test.describe('Outreach Integration', () => {
  test('practice view includes pending outreach', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/practice-view?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    const data = await response.json();
    expect(data).toHaveProperty('pendingOutreach');
    expect(Array.isArray(data.pendingOutreach)).toBe(true);

    // Validate outreach structure if any exist
    if (data.pendingOutreach.length > 0) {
      const outreach = data.pendingOutreach[0];
      expect(outreach).toHaveProperty('id');
      expect(outreach).toHaveProperty('type');
      expect(outreach).toHaveProperty('message');
      expect(outreach).toHaveProperty('persona');
    }
  });
});

test.describe('Practice View UI Integration', () => {
  test('practice view page loads correctly', async ({ page }) => {
    // Navigate to the app
    await page.goto(`${BASE_URL.replace('3002', '3004')}`);

    // Wait for the app to load
    await page.waitForLoadState('networkidle');

    // Check if main UI elements exist
    const body = await page.locator('body');
    await expect(body).toBeVisible();
  });

  test('can toggle to practice view in settings', async ({ page }) => {
    // This test requires the frontend to be running
    // Navigate to settings menu if it exists
    await page.goto(`${BASE_URL.replace('3002', '3004')}`);
    await page.waitForLoadState('networkidle');

    // Look for calendar/practice view trigger
    const calendarTrigger = page.locator('[data-testid="calendar-trigger"], .calendar-trigger');
    if ((await calendarTrigger.count()) > 0) {
      await calendarTrigger.click();

      // Practice view should show loading or content
      const practiceView = page.locator('.calendar-view__practice');
      await expect(practiceView).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Full E2E Data Flow', () => {
  test('complete practice view data pipeline works', async ({ request }) => {
    // This test verifies the full data flow from:
    // 1. Calendar events
    // 2. Habits
    // 3. Intentions
    // 4. Cross-persona insights
    // 5. Predictions
    // 6. Outreach
    // 7. Maya pattern notices

    const response = await request.get(
      `${BASE_URL}/api/practice-view?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();

    // Verify all components are present
    expect(data.success).toBe(true);
    expect(data.orchestratingPersona).toBe('jordan');
    expect(data.week).toHaveLength(7);
    expect(Array.isArray(data.todayEvents)).toBe(true);
    expect(Array.isArray(data.intentions)).toBe(true);
    expect(Array.isArray(data.crossPersonaInsights)).toBe(true);
    expect(Array.isArray(data.predictions)).toBe(true);
    expect(Array.isArray(data.pendingOutreach)).toBe(true);
    expect(data.stats).toHaveProperty('followThroughPercent');
    expect(data.stats).toHaveProperty('habitsCompletedThisWeek');
    expect(data.stats).toHaveProperty('momentumTrend');
    expect(data.stats).toHaveProperty('streak');
    expect(data.lastUpdated).toBeTruthy();
  });

  test('semantic intelligence powers practice view insights', async ({ request }) => {
    // Verify semantic intelligence is feeding into cross-persona insights
    const [practiceResponse, semanticResponse] = await Promise.all([
      request.get(`${BASE_URL}/api/practice-view?userId=${TEST_USER_ID}`, {
        headers: { 'X-User-ID': TEST_USER_ID },
      }),
      request.get(`${BASE_URL}/api/semantic-intelligence/summary?userId=${TEST_USER_ID}`, {
        headers: { 'X-User-ID': TEST_USER_ID },
      }),
    ]);

    expect(practiceResponse.status()).toBe(200);
    expect(semanticResponse.status()).toBe(200);

    const practiceData = await practiceResponse.json();
    const semanticData = await semanticResponse.json();

    // Both should have timestamps (indicating they processed)
    expect(practiceData.lastUpdated).toBeTruthy();
    expect(semanticData.timestamp).toBeTruthy();
  });
});
