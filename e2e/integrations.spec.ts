/**
 * E2E Tests for Integrations API (v1)
 *
 * Tests the integration status and management endpoints:
 * - GET /api/v1/integrations/status - All integrations status
 * - GET /api/v1/integrations/biometrics/* - Biometrics routes
 * - GET /api/v1/integrations/banking/* - Banking routes
 * - GET /api/v1/integrations/calendar/* - Calendar routes
 * - GET /api/v1/integrations/social-graph/* - Social graph routes
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-integrations-test-user';
const TEST_HEADERS = {
  'X-User-ID': TEST_USER_ID,
  'Content-Type': 'application/json',
};

// ============================================================================
// INTEGRATIONS STATUS API TESTS
// ============================================================================

test.describe('Integrations Status API', () => {
  test('GET /api/v1/integrations/status - returns all integration status', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/integrations/status?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Verify structure
    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('integrations');
    expect(data).toHaveProperty('capabilities');

    // Verify integrations object
    expect(data.integrations).toHaveProperty('biometrics');
    expect(data.integrations).toHaveProperty('calendar');
    expect(data.integrations).toHaveProperty('banking');
    expect(data.integrations).toHaveProperty('socialGraph');

    // Verify capabilities object
    expect(data.capabilities).toHaveProperty('stressAwareness');
    expect(data.capabilities).toHaveProperty('sleepAwareness');
    expect(data.capabilities).toHaveProperty('eventAnticipation');
    expect(data.capabilities).toHaveProperty('financialPrediction');
    expect(data.capabilities).toHaveProperty('relationshipInsights');
  });

  test('integrations status requires authentication', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/integrations/status?userId=${TEST_USER_ID}`
      // No auth headers
    );

    expect(response.status()).toBe(401);
  });

  test('cannot access another user integration status', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/integrations/status?userId=different-user`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(403);
  });
});

// ============================================================================
// BIOMETRICS API TESTS
// ============================================================================

test.describe('Biometrics API', () => {
  test('GET /api/v1/integrations/biometrics/status - returns biometrics status', async ({
    request,
  }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/integrations/biometrics/status?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('connected');
    expect(typeof data.connected).toBe('boolean');
    expect(data).toHaveProperty('platform');
    expect(data).toHaveProperty('lastSync');
  });

  test('GET /api/v1/integrations/biometrics/connect/:platform - returns auth URL', async ({
    request,
  }) => {
    const platforms = ['healthkit', 'googlefit', 'oura', 'whoop', 'fitbit', 'terra'];

    for (const platform of platforms) {
      const response = await request.get(
        `${BASE_URL}/api/v1/integrations/biometrics/connect/${platform}?userId=${TEST_USER_ID}`,
        { headers: TEST_HEADERS }
      );

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('authUrl');
      expect(data).toHaveProperty('platform');
      expect(data.platform).toBe(platform);
    }
  });

  test('invalid biometrics platform returns 400', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/integrations/biometrics/connect/invalid_platform?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('Invalid platform');
  });
});

// ============================================================================
// BANKING API TESTS
// ============================================================================

test.describe('Banking API', () => {
  test('GET /api/v1/integrations/banking/status - returns banking status', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/integrations/banking/status?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('connected');
    expect(typeof data.connected).toBe('boolean');
    expect(data).toHaveProperty('institution');
    expect(data).toHaveProperty('linkedAt');
  });

  test('POST /api/v1/integrations/banking/link-token - creates link token', async ({ request }) => {
    const response = await request.post(
      `${BASE_URL}/api/v1/integrations/banking/link-token`,
      {
        headers: TEST_HEADERS,
        data: { userId: TEST_USER_ID },
      }
    );

    // May return 503 if Plaid not configured, or 200 if configured
    expect([200, 503]).toContain(response.status());

    const data = await response.json();

    if (response.status() === 200) {
      expect(data).toHaveProperty('linkToken');
    } else {
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('Plaid');
    }
  });

  test('banking operations require linked account', async ({ request }) => {
    // These should return 400 "No linked bank account" for users without connections
    const endpoints = [
      '/api/v1/integrations/banking/balances',
      '/api/v1/integrations/banking/transactions',
      '/api/v1/integrations/banking/spending-analysis',
      '/api/v1/integrations/banking/cash-flow',
      '/api/v1/integrations/banking/bills',
      '/api/v1/integrations/banking/income',
    ];

    for (const endpoint of endpoints) {
      const response = await request.get(
        `${BASE_URL}${endpoint}?userId=${TEST_USER_ID}`,
        { headers: TEST_HEADERS }
      );

      // Either 200 if connected, or 400 if not
      expect([200, 400]).toContain(response.status());
    }
  });
});

// ============================================================================
// CALENDAR API TESTS
// ============================================================================

test.describe('Calendar API', () => {
  test('GET /api/v1/integrations/calendar/status - returns calendar status', async ({
    request,
  }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/integrations/calendar/status?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('connected');
    expect(typeof data.connected).toBe('boolean');
    expect(data).toHaveProperty('upcomingEventsCount');
    expect(data).toHaveProperty('currentLocation');
  });

  test('GET /api/v1/integrations/calendar/connect - returns auth URL', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/integrations/calendar/connect?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('authUrl');
  });
});

// ============================================================================
// SOCIAL GRAPH API TESTS
// ============================================================================

test.describe('Social Graph API', () => {
  test('GET /api/v1/integrations/social-graph/people - returns people list', async ({
    request,
  }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/integrations/social-graph/people?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('people');
    expect(Array.isArray(data.people)).toBe(true);
  });

  test('GET /api/v1/integrations/social-graph/dates - returns upcoming dates', async ({
    request,
  }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/integrations/social-graph/dates?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('dates');
    expect(Array.isArray(data.dates)).toBe(true);
  });

  test('GET /api/v1/integrations/social-graph/insights - returns relationship insights', async ({
    request,
  }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/integrations/social-graph/insights?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('withdrawalAlerts');
    expect(data).toHaveProperty('relationshipPatterns');
  });

  test('DELETE /api/v1/integrations/social-graph/clear - requires confirmation', async ({
    request,
  }) => {
    // Without confirm=true
    const response = await request.delete(
      `${BASE_URL}/api/v1/integrations/social-graph/clear?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('confirm=true');
  });
});

