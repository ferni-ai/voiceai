/**
 * E2E Tests for Group Coaching API
 *
 * Tests the group coaching session functionality:
 * - POST /api/group/sessions - Create session
 * - GET /api/group/sessions - List sessions
 * - GET /api/group/sessions/:id - Get session
 * - POST /api/group/sessions/:id/start - Start session
 * - POST /api/group/sessions/:id/end - End session
 * - POST /api/group/sessions/:id/join - Join session
 * - POST /api/group/sessions/:id/topics - Add topic
 * - POST /api/group/sessions/:id/goals - Add goal
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-group-coaching-test-user';
const TEST_USER_2 = 'e2e-group-coaching-test-user-2';

test.describe('Group Coaching API', () => {
  let createdSessionId: string;

  test('POST /api/group/sessions - creates a new session', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/group/sessions`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { type: 'family' },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('session');
    expect(data).toHaveProperty('joinLink');

    expect(data.session).toHaveProperty('id');
    expect(data.session).toHaveProperty('type', 'family');
    expect(data.session).toHaveProperty('hostUserId', TEST_USER_ID);
    expect(data.session).toHaveProperty('status', 'waiting');
    expect(data.session).toHaveProperty('participants');

    createdSessionId = data.session.id;
  });

  test('POST /api/group/sessions - validates session type', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/group/sessions`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { type: 'invalid_type' },
    });

    expect(response.status()).toBe(400);
  });

  test('POST /api/group/sessions - supports all session types', async ({ request }) => {
    const types = ['family', 'couple', 'team', 'peer_support'];

    for (const type of types) {
      const response = await request.post(`${BASE_URL}/api/group/sessions`, {
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: { type },
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.session.type).toBe(type);
    }
  });

  test('GET /api/group/sessions - lists user sessions', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/group/sessions`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('sessions');
    expect(data).toHaveProperty('total');
    expect(Array.isArray(data.sessions)).toBe(true);
  });

  test('GET /api/group/sessions/:id - gets session details', async ({ request }) => {
    // First create a session
    const createRes = await request.post(`${BASE_URL}/api/group/sessions`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { type: 'team' },
    });
    const { session } = await createRes.json();

    const response = await request.get(`${BASE_URL}/api/group/sessions/${session.id}`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('session');
    expect(data.session.id).toBe(session.id);
  });

  test('POST /api/group/sessions/:id/start - starts a session', async ({ request }) => {
    // Create session first
    const createRes = await request.post(`${BASE_URL}/api/group/sessions`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { type: 'couple' },
    });
    const { session } = await createRes.json();

    const response = await request.post(`${BASE_URL}/api/group/sessions/${session.id}/start`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('session');
    expect(data.session.status).toBe('active');
  });

  test('POST /api/group/sessions/:id/end - ends a session', async ({ request }) => {
    // Create and start session first
    const createRes = await request.post(`${BASE_URL}/api/group/sessions`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { type: 'peer_support' },
    });
    const { session } = await createRes.json();

    await request.post(`${BASE_URL}/api/group/sessions/${session.id}/start`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    const response = await request.post(`${BASE_URL}/api/group/sessions/${session.id}/end`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('summary');
  });

  test('POST /api/group/sessions/:id/topics - adds a topic', async ({ request }) => {
    // Create session first
    const createRes = await request.post(`${BASE_URL}/api/group/sessions`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { type: 'family' },
    });
    const { session } = await createRes.json();

    const response = await request.post(`${BASE_URL}/api/group/sessions/${session.id}/topics`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { topic: 'Communication' },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('session');
  });

  test('POST /api/group/sessions/:id/goals - adds a shared goal', async ({ request }) => {
    // Create session first
    const createRes = await request.post(`${BASE_URL}/api/group/sessions`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { type: 'couple' },
    });
    const { session } = await createRes.json();

    const response = await request.post(`${BASE_URL}/api/group/sessions/${session.id}/goals`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { goal: 'Better communication by end of month' },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('session');
  });

  test('requires authentication', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/group/sessions`, {
      headers: {
        // Missing X-User-ID
      },
    });

    expect(response.status()).toBe(401);
  });
});

test.describe('Group Coaching Workflow', () => {
  test('complete group session lifecycle', async ({ request }) => {
    const headers = {
      'X-User-ID': TEST_USER_ID,
      'Content-Type': 'application/json',
    };

    // 1. Create a family session
    const createRes = await request.post(`${BASE_URL}/api/group/sessions`, {
      headers,
      data: { type: 'family' },
    });
    expect(createRes.status()).toBe(200);
    const { session, joinLink } = await createRes.json();
    expect(joinLink).toBeTruthy();

    // 2. Add topics
    const topicRes = await request.post(`${BASE_URL}/api/group/sessions/${session.id}/topics`, {
      headers,
      data: { topic: 'Weekly family time' },
    });
    expect(topicRes.status()).toBe(200);

    // 3. Add goals
    const goalRes = await request.post(`${BASE_URL}/api/group/sessions/${session.id}/goals`, {
      headers,
      data: { goal: 'Have dinner together 3x per week' },
    });
    expect(goalRes.status()).toBe(200);

    // 4. Start the session
    const startRes = await request.post(`${BASE_URL}/api/group/sessions/${session.id}/start`, {
      headers,
      data: {},
    });
    expect(startRes.status()).toBe(200);

    // 5. Verify session is active
    const verifyRes = await request.get(`${BASE_URL}/api/group/sessions/${session.id}`, {
      headers,
    });
    const verifyData = await verifyRes.json();
    expect(verifyData.session.status).toBe('active');

    // 6. End the session
    const endRes = await request.post(`${BASE_URL}/api/group/sessions/${session.id}/end`, {
      headers,
      data: {},
    });
    expect(endRes.status()).toBe(200);
    const endData = await endRes.json();
    expect(endData.summary).toBeTruthy();
  });
});
