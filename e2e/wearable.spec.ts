/**
 * E2E Tests for Wearable Integration API
 *
 * Tests the wearable/health data functionality:
 * - GET /api/wearable/status
 * - POST /api/wearable/connect
 * - POST /api/wearable/disconnect
 * - GET /api/wearable/data
 * - GET /api/wearable/stress
 * - GET /api/wearable/sleep
 * - GET /api/wearable/activity
 * - GET /api/wearable/coaching-context
 * - POST /api/wearable/sync
 * - POST /api/wearable/config
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-wearable-test-user';

test.describe('Wearable Integration API', () => {
  test('GET /api/wearable/status - returns connection status', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/wearable/status`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('enabledProviders');
    expect(data).toHaveProperty('config');

    expect(data.config).toHaveProperty('syncIntervalMinutes');
    expect(data.config).toHaveProperty('enableStressDetection');
    expect(data.config).toHaveProperty('enableSleepAnalysis');
    expect(data.config).toHaveProperty('enableActivityTracking');
    expect(data.config).toHaveProperty('privacyMode');
  });

  test('POST /api/wearable/connect - initiates provider connection', async ({ request }) => {
    const providers = ['fitbit', 'garmin', 'oura', 'whoop'];

    for (const provider of providers) {
      const response = await request.post(`${BASE_URL}/api/wearable/connect`, {
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: { provider },
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('authUrl');
    }
  });

  test('POST /api/wearable/connect - validates provider', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/wearable/connect`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { provider: 'invalid_provider' },
    });

    expect(response.status()).toBe(400);
  });

  test('POST /api/wearable/connect - requires provider', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/wearable/connect`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(response.status()).toBe(400);
  });

  test('GET /api/wearable/data - returns aggregated metrics', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/wearable/data`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('hasData');

    // If there's data, verify structure
    if (data.hasData && data.metrics) {
      expect(data.metrics).toHaveProperty('restingHeartRate');
      expect(data.metrics).toHaveProperty('heartRateVariability');
    }
  });

  test('GET /api/wearable/stress - returns stress indicators', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/wearable/stress`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('hasData');

    if (data.hasData && data.stress) {
      expect(data.stress).toHaveProperty('stressLevel');
      expect(data.stress).toHaveProperty('isElevated');
      expect(data.stress).toHaveProperty('primaryIndicator');
    }
  });

  test('GET /api/wearable/sleep - returns sleep analysis', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/wearable/sleep`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('hasData');

    if (data.hasData && data.sleep) {
      expect(data.sleep).toHaveProperty('quality');
      expect(data.sleep).toHaveProperty('score');
      expect(data.sleep).toHaveProperty('insights');
    }
  });

  test('GET /api/wearable/activity - returns activity summary', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/wearable/activity`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('hasData');

    if (data.hasData && data.activity) {
      expect(data.activity).toHaveProperty('steps');
      expect(data.activity).toHaveProperty('activeMinutes');
      expect(data.activity).toHaveProperty('caloriesBurned');
      expect(data.activity).toHaveProperty('isGoalMet');
    }
  });

  test('GET /api/wearable/coaching-context - returns context for coaching', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/wearable/coaching-context`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('context');
    expect(data.context).toHaveProperty('hasWearableData');
    expect(data.context).toHaveProperty('suggestedTopics');
    expect(Array.isArray(data.context.suggestedTopics)).toBe(true);
  });

  test('POST /api/wearable/sync - triggers data sync', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/wearable/sync`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('syncedProviders');
    expect(Array.isArray(data.syncedProviders)).toBe(true);
  });

  test('POST /api/wearable/config - updates configuration', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/wearable/config`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        enableStressDetection: false,
        privacyMode: 'insights_only',
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('config');
  });

  test('requires authentication', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/wearable/status`, {
      headers: {
        // Missing X-User-ID
      },
    });

    expect(response.status()).toBe(401);
  });
});
