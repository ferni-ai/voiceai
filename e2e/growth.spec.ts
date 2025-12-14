/**
 * E2E Tests for Growth Visibility API
 *
 * Tests the growth insights and visualization system:
 * - GET /api/growth/insights - Get growth insights
 * - GET /api/growth/summary - Get growth summary
 * - GET /api/growth/reflection - Get a growth reflection
 * - POST /api/growth/reaction - Record reaction to insight
 * - POST /api/growth/snapshot - Capture growth snapshot
 * - GET /api/growth/types - Get growth type definitions
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-growth-test-user';

test.describe('Growth Insights API', () => {
  test('GET /api/growth/types - returns growth type definitions', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/growth/types`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('types');

    // Verify all growth types are defined
    const expectedTypes = [
      'capability_growth',
      'topic_comfort',
      'pattern_break',
      'consistency_improvement',
      'depth_increase',
      'emotional_regulation',
      'self_awareness',
    ];

    for (const type of expectedTypes) {
      expect(data.types).toHaveProperty(type);
      expect(data.types[type]).toHaveProperty('name');
      expect(data.types[type]).toHaveProperty('description');
      expect(data.types[type]).toHaveProperty('icon');
    }
  });

  test('GET /api/growth/insights - returns insights for user', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/growth/insights`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('insights');
    expect(data).toHaveProperty('total');
    expect(Array.isArray(data.insights)).toBe(true);
    expect(typeof data.total).toBe('number');

    // If there are insights, verify structure
    if (data.insights.length > 0) {
      const insight = data.insights[0];
      expect(insight).toHaveProperty('id');
      expect(insight).toHaveProperty('type');
      expect(insight).toHaveProperty('userId');
      expect(insight).toHaveProperty('area');
      expect(insight).toHaveProperty('before');
      expect(insight).toHaveProperty('after');
      expect(insight).toHaveProperty('evidence');
      expect(insight).toHaveProperty('timespan');
      expect(insight).toHaveProperty('confidence');
    }
  });

  test('GET /api/growth/insights - supports type filter', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/growth/insights?type=self_awareness`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);

    // All returned insights should be of the requested type
    for (const insight of data.insights) {
      expect(insight.type).toBe('self_awareness');
    }
  });

  test('GET /api/growth/insights - supports limit param', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/growth/insights?limit=5`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.insights.length).toBeLessThanOrEqual(5);
  });

  test('GET /api/growth/insights - requires authentication', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/growth/insights`, {
      headers: {
        // Missing X-User-ID
      },
    });

    expect(response.status()).toBe(401);
  });
});

test.describe('Growth Summary API', () => {
  test('GET /api/growth/summary - returns summary for user', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/growth/summary`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('summary');

    const { summary } = data;
    expect(summary).toHaveProperty('userId');
    expect(summary).toHaveProperty('totalInsights');
    expect(summary).toHaveProperty('surfacedInsights');
    expect(summary).toHaveProperty('resonatedInsights');
    expect(summary).toHaveProperty('byType');
    expect(summary).toHaveProperty('topGrowthAreas');
    expect(summary).toHaveProperty('recentInsights');
    expect(summary).toHaveProperty('growthScore');

    // Growth score should be 0-100
    expect(summary.growthScore).toBeGreaterThanOrEqual(0);
    expect(summary.growthScore).toBeLessThanOrEqual(100);

    // topGrowthAreas should be an array
    expect(Array.isArray(summary.topGrowthAreas)).toBe(true);

    // recentInsights should be an array
    expect(Array.isArray(summary.recentInsights)).toBe(true);
  });

  test('GET /api/growth/summary - requires authentication', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/growth/summary`, {
      headers: {
        // Missing X-User-ID
      },
    });

    expect(response.status()).toBe(401);
  });
});

test.describe('Growth Reflection API', () => {
  test('GET /api/growth/reflection - returns reflection or null', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/growth/reflection`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('hasReflection');

    if (data.hasReflection) {
      expect(data).toHaveProperty('reflection');
      expect(data.reflection).toHaveProperty('id');
      expect(data.reflection).toHaveProperty('text');
      expect(data.reflection).toHaveProperty('ssml');
      expect(data.reflection).toHaveProperty('suggestedMoment');
      expect(data.reflection).toHaveProperty('type');
      expect(data.reflection).toHaveProperty('area');
      expect(data.reflection).toHaveProperty('confidence');
    } else {
      expect(data.reflection).toBeNull();
    }
  });

  test('GET /api/growth/reflection - accepts context params', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/growth/reflection?topic=career&sessionStart=true`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });
});

test.describe('Growth Reaction API', () => {
  test('POST /api/growth/reaction - requires insightId and reaction', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/growth/reaction`, {
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

  test('POST /api/growth/reaction - validates reaction value', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/growth/reaction`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        insightId: 'test-insight-id',
        reaction: 'invalid',
      },
    });

    expect(response.status()).toBe(400);
  });

  test('POST /api/growth/reaction - accepts valid reactions', async ({ request }) => {
    const validReactions = ['resonated', 'neutral', 'dismissed'];

    for (const reaction of validReactions) {
      const response = await request.post(`${BASE_URL}/api/growth/reaction`, {
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          insightId: `test-insight-${Date.now()}`,
          reaction,
        },
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
    }
  });
});

test.describe('Growth Snapshot API', () => {
  test('POST /api/growth/snapshot - captures snapshot', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/growth/snapshot`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('newInsightsDetected');
    expect(typeof data.newInsightsDetected).toBe('number');
  });

  test('POST /api/growth/snapshot - requires authentication', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/growth/snapshot`, {
      headers: {
        'Content-Type': 'application/json',
        // Missing X-User-ID
      },
      data: {},
    });

    expect(response.status()).toBe(401);
  });
});

test.describe('Growth Integration', () => {
  test('growth summary and insights are consistent', async ({ request }) => {
    // Get summary
    const summaryResponse = await request.get(`${BASE_URL}/api/growth/summary`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });
    expect(summaryResponse.status()).toBe(200);
    const { summary } = await summaryResponse.json();

    // Get insights
    const insightsResponse = await request.get(`${BASE_URL}/api/growth/insights`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });
    expect(insightsResponse.status()).toBe(200);
    const { total } = await insightsResponse.json();

    // Summary total should match insights total
    expect(summary.totalInsights).toBe(total);
  });

  test('growth workflow: snapshot -> detect -> get insights', async ({ request }) => {
    // 1. Capture snapshot
    const snapshotResponse = await request.post(`${BASE_URL}/api/growth/snapshot`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {},
    });
    expect(snapshotResponse.status()).toBe(200);

    // 2. Get summary (includes detection)
    const summaryResponse = await request.get(`${BASE_URL}/api/growth/summary`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });
    expect(summaryResponse.status()).toBe(200);

    // 3. Get insights
    const insightsResponse = await request.get(`${BASE_URL}/api/growth/insights`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });
    expect(insightsResponse.status()).toBe(200);

    // All should succeed
    const { success } = await insightsResponse.json();
    expect(success).toBe(true);
  });
});
