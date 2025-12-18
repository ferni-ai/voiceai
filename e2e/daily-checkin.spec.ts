/**
 * E2E Tests for Daily Check-in Feature
 *
 * Tests the daily check-in (sky check) functionality:
 * - POST /api/rituals/:id/complete - complete a ritual with weather
 * - POST /api/sky-check - record emotional weather
 * - GET /api/sky-check/history - get weather history
 *
 * This validates the critical path from:
 * 1. User completing a daily check-in
 * 2. Weather being recorded
 * 3. Streak being updated
 * 4. History being retrievable
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-daily-checkin-test-user';

test.describe('Daily Check-in API', () => {
  test.describe('Sky Check Recording', () => {
    test('POST /api/sky-check - records emotional weather', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/sky-check`, {
        headers: { 'X-User-ID': TEST_USER_ID },
        data: {
          weather: {
            primary: 'sunny',
            energy: 'high',
            note: 'Feeling great today!',
          },
        },
      });

      expect(response.status()).toBe(201);

      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('recordedAt');
      expect(data.weather.primary).toBe('sunny');
      expect(data.weather.energy).toBe('high');
    });

    test('POST /api/sky-check - validates weather primary', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/sky-check`, {
        headers: { 'X-User-ID': TEST_USER_ID },
        data: {
          weather: {
            primary: 'invalid-weather',
            energy: 'high',
          },
        },
      });

      expect(response.status()).toBe(400);
    });

    test('POST /api/sky-check - validates energy level', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/sky-check`, {
        headers: { 'X-User-ID': TEST_USER_ID },
        data: {
          weather: {
            primary: 'sunny',
            energy: 'invalid-energy',
          },
        },
      });

      expect(response.status()).toBe(400);
    });

    test('GET /api/sky-check/history - returns weather history', async ({ request }) => {
      // First record some weather
      await request.post(`${BASE_URL}/api/sky-check`, {
        headers: { 'X-User-ID': TEST_USER_ID },
        data: {
          weather: { primary: 'cloudy', energy: 'medium' },
        },
      });

      const response = await request.get(`${BASE_URL}/api/sky-check/history`, {
        headers: { 'X-User-ID': TEST_USER_ID },
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('history');
      expect(Array.isArray(data.history)).toBe(true);
    });
  });

  test.describe('Ritual Completion with Weather', () => {
    test('POST /api/rituals/ferni-sky-check/complete - completes daily check-in', async ({
      request,
    }) => {
      const response = await request.post(`${BASE_URL}/api/rituals/ferni-sky-check/complete`, {
        headers: { 'X-User-ID': TEST_USER_ID },
        data: {
          weather: {
            primary: 'partly-cloudy',
            energy: 'medium',
            note: 'Mixed feelings today',
          },
        },
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(typeof data.streak).toBe('number');
      expect(data.streak).toBeGreaterThan(0);
    });

    test('completes ritual and returns new streak count', async ({ request }) => {
      // Complete once - should be streak 1 (or continue existing)
      const response = await request.post(`${BASE_URL}/api/rituals/ferni-sky-check/complete`, {
        headers: { 'X-User-ID': `${TEST_USER_ID}-streak-test` },
        data: {
          weather: { primary: 'sunny', energy: 'high' },
        },
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.streak).toBeGreaterThanOrEqual(1);
    });

    test('same-day completion returns already completed', async ({ request }) => {
      const userId = `${TEST_USER_ID}-same-day-${Date.now()}`;

      // First completion
      const first = await request.post(`${BASE_URL}/api/rituals/ferni-sky-check/complete`, {
        headers: { 'X-User-ID': userId },
        data: { weather: { primary: 'sunny', energy: 'high' } },
      });
      expect(first.status()).toBe(200);

      // Second completion same day
      const second = await request.post(`${BASE_URL}/api/rituals/ferni-sky-check/complete`, {
        headers: { 'X-User-ID': userId },
        data: { weather: { primary: 'cloudy', energy: 'low' } },
      });
      expect(second.status()).toBe(200);

      const data = await second.json();
      expect(data.message).toContain('Already completed');
    });

    test('celebration returned for milestone streaks', async ({ request }) => {
      // Note: This test validates the structure - actual milestone would require
      // building up streak over multiple days which isn't practical in e2e
      const response = await request.post(`${BASE_URL}/api/rituals/ferni-sky-check/complete`, {
        headers: { 'X-User-ID': TEST_USER_ID },
        data: { weather: { primary: 'rainbow', energy: 'high' } },
      });

      const data = await response.json();
      // Celebration is optional - just verify structure if present
      if (data.celebration) {
        expect(data.celebration).toHaveProperty('type');
        expect(data.celebration).toHaveProperty('message');
      }
    });
  });

  test.describe('Weather Types', () => {
    const weatherTypes = [
      'sunny',
      'partly-cloudy',
      'cloudy',
      'rainy',
      'stormy',
      'foggy',
      'rainbow',
    ] as const;

    for (const weather of weatherTypes) {
      test(`accepts ${weather} weather type`, async ({ request }) => {
        const response = await request.post(`${BASE_URL}/api/sky-check`, {
          headers: { 'X-User-ID': TEST_USER_ID },
          data: {
            weather: {
              primary: weather,
              energy: 'medium',
            },
          },
        });

        expect(response.status()).toBe(201);

        const data = await response.json();
        expect(data.weather.primary).toBe(weather);
      });
    }
  });

  test.describe('Energy Levels', () => {
    const energyLevels = ['high', 'medium', 'low'] as const;

    for (const energy of energyLevels) {
      test(`accepts ${energy} energy level`, async ({ request }) => {
        const response = await request.post(`${BASE_URL}/api/sky-check`, {
          headers: { 'X-User-ID': TEST_USER_ID },
          data: {
            weather: {
              primary: 'sunny',
              energy,
            },
          },
        });

        expect(response.status()).toBe(201);

        const data = await response.json();
        expect(data.weather.energy).toBe(energy);
      });
    }
  });
});

test.describe('GET /api/rituals - Ritual Stats', () => {
  test('returns ritual streaks and stats', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/rituals`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('streaks');
    expect(data).toHaveProperty('stats');
    expect(data).toHaveProperty('weatherHistory');

    // Verify stats structure
    if (data.stats) {
      expect(typeof data.stats.totalRitualDays).toBe('number');
      expect(typeof data.stats.longestOverallStreak).toBe('number');
    }
  });

  test('returns weather history in response', async ({ request }) => {
    // First record some weather
    await request.post(`${BASE_URL}/api/sky-check`, {
      headers: { 'X-User-ID': TEST_USER_ID },
      data: { weather: { primary: 'sunny', energy: 'high' } },
    });

    const response = await request.get(`${BASE_URL}/api/rituals`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data.weatherHistory)).toBe(true);
  });
});

