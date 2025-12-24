/**
 * E2E Tests for Group Conversation API
 *
 * Tests the group conversation functionality:
 * - POST /api/group-conversation/roundtable/start - Start Team Roundtable
 * - POST /api/group-conversation/roundtable/end - End Team Roundtable
 * - POST /api/group-conversation/participant/add - Add external participant via SIP
 * - POST /api/group-conversation/participant/remove - Remove participant
 * - GET /api/group-conversation/sessions - List user's group sessions
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-group-conversation-test-user';

test.describe('Group Conversation API', () => {
  let roundtableSessionId: string;

  test.describe('Team Roundtable', () => {
    test('POST /api/group-conversation/roundtable/start - starts a roundtable session', async ({
      request,
    }) => {
      const response = await request.post(`${BASE_URL}/api/group-conversation/roundtable/start`, {
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          personas: ['ferni', 'peter-john'],
          topic: 'Career planning discussion',
          collaborationMode: 'discussion',
        },
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('sessionId');
      expect(data).toHaveProperty('participants');

      // Verify participants include user and agents
      expect(data.participants.length).toBeGreaterThanOrEqual(2);

      roundtableSessionId = data.sessionId;
    });

    test('POST /api/group-conversation/roundtable/start - requires personas array', async ({
      request,
    }) => {
      const response = await request.post(`${BASE_URL}/api/group-conversation/roundtable/start`, {
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          topic: 'Missing personas',
        },
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('success', false);
      expect(data.error).toContain('personas');
    });

    test('POST /api/group-conversation/roundtable/start - validates persona IDs', async ({
      request,
    }) => {
      const response = await request.post(`${BASE_URL}/api/group-conversation/roundtable/start`, {
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          personas: ['ferni', 'invalid-persona-id'],
          topic: 'Test',
        },
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('success', false);
      expect(data.error).toContain('invalid-persona-id');
    });

    test('POST /api/group-conversation/roundtable/start - supports all collaboration modes', async ({
      request,
    }) => {
      const modes = ['discussion', 'debate', 'brainstorm', 'interview'];

      for (const mode of modes) {
        const response = await request.post(`${BASE_URL}/api/group-conversation/roundtable/start`, {
          headers: {
            'X-User-ID': TEST_USER_ID,
            'Content-Type': 'application/json',
          },
          data: {
            personas: ['ferni'],
            topic: `Test ${mode}`,
            collaborationMode: mode,
          },
        });

        expect(response.status()).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
      }
    });

    test('POST /api/group-conversation/roundtable/end - ends a roundtable session', async ({
      request,
    }) => {
      // First create a session
      const createResponse = await request.post(
        `${BASE_URL}/api/group-conversation/roundtable/start`,
        {
          headers: {
            'X-User-ID': TEST_USER_ID,
            'Content-Type': 'application/json',
          },
          data: {
            personas: ['ferni'],
            topic: 'Session to end',
          },
        }
      );

      const createData = await createResponse.json();
      const sessionToEnd = createData.sessionId;

      // Now end it
      const response = await request.post(`${BASE_URL}/api/group-conversation/roundtable/end`, {
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          sessionId: sessionToEnd,
        },
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
    });
  });

  test.describe('External Participants (SIP)', () => {
    test('POST /api/group-conversation/participant/add - validates phone number', async ({
      request,
    }) => {
      const response = await request.post(`${BASE_URL}/api/group-conversation/participant/add`, {
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          phoneNumber: 'not-a-phone',
          name: 'Test Person',
        },
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('success', false);
    });

    test('POST /api/group-conversation/participant/add - requires name', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/group-conversation/participant/add`, {
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          phoneNumber: '+15551234567',
        },
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('success', false);
    });

    test('POST /api/group-conversation/participant/add - accepts valid request (mock mode)', async ({
      request,
    }) => {
      const response = await request.post(`${BASE_URL}/api/group-conversation/participant/add`, {
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          phoneNumber: '+15551234567',
          name: 'Test Friend',
          relationship: 'friend',
          introduction: 'Joining for a chat',
        },
      });

      // In test mode without SIP configured, should still return success (mock)
      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('participantId');
    });

    test('POST /api/group-conversation/participant/remove - requires participant ID', async ({
      request,
    }) => {
      const response = await request.post(`${BASE_URL}/api/group-conversation/participant/remove`, {
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          sessionId: 'test-session',
        },
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('success', false);
    });
  });

  test.describe('Session History', () => {
    test('GET /api/group-conversation/sessions - returns user sessions', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/group-conversation/sessions`, {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('sessions');
      expect(Array.isArray(data.sessions)).toBe(true);
    });

    test('GET /api/group-conversation/sessions - requires authentication', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/group-conversation/sessions`);

      expect(response.status()).toBe(401);
    });
  });
});

test.describe('Group Conversation Integration', () => {
  test('Full roundtable flow: start -> discuss -> end', async ({ request }) => {
    // 1. Start roundtable with multiple personas
    const startResponse = await request.post(
      `${BASE_URL}/api/group-conversation/roundtable/start`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          personas: ['ferni', 'maya-habits', 'peter-john'],
          topic: 'Building better habits for productivity',
          collaborationMode: 'discussion',
        },
      }
    );

    expect(startResponse.status()).toBe(200);
    const startData = await startResponse.json();
    expect(startData.success).toBe(true);

    const sessionId = startData.sessionId;

    // 2. Verify session appears in history
    const historyResponse = await request.get(`${BASE_URL}/api/group-conversation/sessions`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(historyResponse.status()).toBe(200);
    const historyData = await historyResponse.json();
    expect(historyData.sessions.some((s: { sessionId: string }) => s.sessionId === sessionId)).toBe(
      true
    );

    // 3. End the roundtable
    const endResponse = await request.post(`${BASE_URL}/api/group-conversation/roundtable/end`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        sessionId,
      },
    });

    expect(endResponse.status()).toBe(200);
    expect((await endResponse.json()).success).toBe(true);
  });
});

