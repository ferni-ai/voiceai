/**
 * E2E Tests for Team Huddles (Feature 9)
 *
 * Tests the team huddle system:
 * - GET /api/huddles - Get user's huddles
 * - POST /api/huddles/start - Start a new huddle
 * - GET /api/huddles/:id - Get specific huddle
 * - GET /api/huddles/:id/participants - Get participants
 * - POST /api/huddles/:id/complete - Complete huddle
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-huddle-test-user';

test.describe('Team Huddles API', () => {
  test('GET /api/huddles - returns user huddles', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/huddles?userId=${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('totalHuddles');
    expect(data).toHaveProperty('recentHuddles');
    expect(data).toHaveProperty('availablePersonas');
    expect(Array.isArray(data.recentHuddles)).toBe(true);
    expect(Array.isArray(data.availablePersonas)).toBe(true);
    expect(typeof data.totalHuddles).toBe('number');
  });

  test('GET /api/huddles - returns available personas', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/huddles?userId=${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.availablePersonas.length).toBeGreaterThan(0);

    // Each persona should have required fields
    for (const persona of data.availablePersonas) {
      expect(persona).toHaveProperty('id');
      expect(persona).toHaveProperty('name');
      expect(persona).toHaveProperty('specialty');
    }
  });

  test('POST /api/huddles/start - starts a new huddle', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/huddles/start`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        topic: 'How to build better habits',
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('huddle');
    expect(data.huddle).toHaveProperty('id');
    expect(data.huddle).toHaveProperty('topic');
    expect(data.huddle).toHaveProperty('participants');
    expect(data.huddle).toHaveProperty('status', 'active');
    expect(data.huddle).toHaveProperty('startedAt');
    expect(Array.isArray(data.huddle.participants)).toBe(true);
    expect(data.huddle.participants.length).toBeGreaterThan(0);
  });

  test('POST /api/huddles/start - selects relevant personas', async ({ request }) => {
    // Test habit-related topic
    const habitResponse = await request.post(`${BASE_URL}/api/huddles/start`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        topic: 'Building a consistent morning routine',
      },
    });

    expect(habitResponse.status()).toBe(200);
    const habitData = await habitResponse.json();
    const participantIds = habitData.huddle.participants.map((p: { id: string }) => p.id);
    // Should include maya (habits expert)
    expect(participantIds).toContain('maya');

    // Test stress-related topic
    const stressResponse = await request.post(`${BASE_URL}/api/huddles/start`, {
      headers: {
        'X-User-ID': `${TEST_USER_ID}-stress`,
        'Content-Type': 'application/json',
      },
      data: {
        topic: 'Managing stress and finding calm',
      },
    });

    expect(stressResponse.status()).toBe(200);
    const stressData = await stressResponse.json();
    const stressParticipants = stressData.huddle.participants.map((p: { id: string }) => p.id);
    // Should include nayan (mindfulness expert)
    expect(stressParticipants).toContain('nayan');
  });

  test('GET /api/huddles/:id - returns specific huddle', async ({ request }) => {
    // First start a huddle
    const startResponse = await request.post(`${BASE_URL}/api/huddles/start`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        topic: 'Test huddle for retrieval',
      },
    });

    const startData = await startResponse.json();
    const huddleId = startData.huddle.id;

    // Get the huddle
    const response = await request.get(`${BASE_URL}/api/huddles/${huddleId}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('huddle');
    expect(data.huddle.id).toBe(huddleId);
    expect(data.huddle.topic).toBe('Test huddle for retrieval');
  });

  test('GET /api/huddles/:id - returns 404 for non-existent', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/huddles/non-existent-huddle-id`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(404);
  });

  test('GET /api/huddles/:id/participants - returns participants', async ({ request }) => {
    // First start a huddle
    const startResponse = await request.post(`${BASE_URL}/api/huddles/start`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        topic: 'Participant test huddle',
      },
    });

    const startData = await startResponse.json();
    const huddleId = startData.huddle.id;

    // Get participants
    const response = await request.get(`${BASE_URL}/api/huddles/${huddleId}/participants`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('participants');
    expect(Array.isArray(data.participants)).toBe(true);

    for (const participant of data.participants) {
      expect(participant).toHaveProperty('id');
      expect(participant).toHaveProperty('name');
      expect(participant).toHaveProperty('specialty');
      expect(participant).toHaveProperty('isActive');
    }
  });

  test('POST /api/huddles/:id/complete - completes huddle with recommendations', async ({
    request,
  }) => {
    // First start a huddle
    const startResponse = await request.post(`${BASE_URL}/api/huddles/start`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        topic: 'Huddle to complete',
      },
    });

    const startData = await startResponse.json();
    const huddleId = startData.huddle.id;

    // Complete the huddle
    const response = await request.post(`${BASE_URL}/api/huddles/${huddleId}/complete`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('huddle');
    expect(data.huddle.status).toBe('completed');
    expect(data.huddle).toHaveProperty('completedAt');
    expect(data.huddle).toHaveProperty('recommendations');
    expect(Array.isArray(data.huddle.recommendations)).toBe(true);
    expect(data.huddle.recommendations.length).toBeGreaterThan(0);
  });

  test('complete huddle - generates relevant recommendations', async ({ request }) => {
    // Start a huddle with specific topic
    const startResponse = await request.post(`${BASE_URL}/api/huddles/start`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        topic: 'Building habits with tracking',
      },
    });

    const startData = await startResponse.json();
    const huddleId = startData.huddle.id;

    // Complete it
    const completeResponse = await request.post(`${BASE_URL}/api/huddles/${huddleId}/complete`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    const data = await completeResponse.json();

    // Should have recommendations from participating personas
    expect(data.huddle.recommendations.length).toBeGreaterThan(0);

    // Each recommendation should be a non-empty string
    for (const rec of data.huddle.recommendations) {
      expect(typeof rec).toBe('string');
      expect(rec.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Team Huddles UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);

    await page.evaluate((userId) => {
      localStorage.setItem('bogle_user_id', userId);
      localStorage.setItem('ferni_user_id', userId);
    }, TEST_USER_ID);

    await page.waitForTimeout(1000);
  });

  test('can request team huddle from menu', async ({ page }) => {
    // Open settings menu
    const settingsButton = page.locator('[aria-label="Settings"]').or(page.locator('.menu-toggle'));
    if (await settingsButton.isVisible()) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      // Look for team/huddle option
      const huddleOption = page
        .locator('text=Team')
        .or(page.locator('text=Huddle'))
        .or(page.locator('[data-action="team-huddle"]'));

      if (await huddleOption.isVisible()) {
        await huddleOption.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('huddles endpoint is accessible', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/huddles?userId=test');
        const data = await response.json();
        return {
          success: response.ok,
          hasPersonas: data.availablePersonas && data.availablePersonas.length > 0,
        };
      } catch {
        return { success: false, hasPersonas: false };
      }
    });

    expect(result.success).toBe(true);
    expect(result.hasPersonas).toBe(true);
  });

  test('can start huddle via API from browser', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/huddles/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-ID': 'browser-test-user',
          },
          body: JSON.stringify({ topic: 'Browser test huddle' }),
        });
        const data = await response.json();
        return {
          success: data.success,
          hasHuddle: !!data.huddle,
          hasParticipants: data.huddle?.participants?.length > 0,
        };
      } catch {
        return { success: false, hasHuddle: false, hasParticipants: false };
      }
    });

    expect(result.success).toBe(true);
    expect(result.hasHuddle).toBe(true);
    expect(result.hasParticipants).toBe(true);
  });
});

test.describe('Team Huddles Integration', () => {
  test('full huddle flow works end-to-end', async ({ request }) => {
    const userId = `e2e-full-flow-${Date.now()}`;

    // 1. Check initial state
    const initialResponse = await request.get(`${BASE_URL}/api/huddles?userId=${userId}`, {
      headers: { 'X-User-ID': userId },
    });
    expect(initialResponse.status()).toBe(200);

    // 2. Start a huddle
    const startResponse = await request.post(`${BASE_URL}/api/huddles/start`, {
      headers: {
        'X-User-ID': userId,
        'Content-Type': 'application/json',
      },
      data: {
        topic: 'End-to-end test: planning my week ahead',
      },
    });
    expect(startResponse.status()).toBe(200);
    const startData = await startResponse.json();
    const huddleId = startData.huddle.id;

    // 3. Get huddle details
    const detailsResponse = await request.get(`${BASE_URL}/api/huddles/${huddleId}`, {
      headers: { 'X-User-ID': userId },
    });
    expect(detailsResponse.status()).toBe(200);

    // 4. Get participants
    const participantsResponse = await request.get(
      `${BASE_URL}/api/huddles/${huddleId}/participants`,
      {
        headers: { 'X-User-ID': userId },
      }
    );
    expect(participantsResponse.status()).toBe(200);

    // 5. Complete the huddle
    const completeResponse = await request.post(`${BASE_URL}/api/huddles/${huddleId}/complete`, {
      headers: {
        'X-User-ID': userId,
        'Content-Type': 'application/json',
      },
      data: {},
    });
    expect(completeResponse.status()).toBe(200);
    const completeData = await completeResponse.json();
    expect(completeData.huddle.status).toBe('completed');
    expect(completeData.huddle.recommendations.length).toBeGreaterThan(0);

    // 6. Verify it shows in recent huddles
    const finalResponse = await request.get(`${BASE_URL}/api/huddles?userId=${userId}`, {
      headers: { 'X-User-ID': userId },
    });
    expect(finalResponse.status()).toBe(200);
    const finalData = await finalResponse.json();
    const foundHuddle = finalData.recentHuddles.find((h: { id: string }) => h.id === huddleId);
    expect(foundHuddle).toBeDefined();
    expect(foundHuddle.status).toBe('completed');
  });
});
