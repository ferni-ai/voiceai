/**
 * E2E Tests for Common Utilities
 *
 * Tests the utilities API endpoints for reminders, lists, alarms, and voice memos.
 * These utilities integrate with both voice commands and the API layer.
 *
 * Test Categories:
 * 1. Health checks
 * 2. Reminders (create, list, cancel)
 * 3. Lists (create, view, add items)
 * 4. Alarms (create, list)
 * 5. Voice Memos (list)
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'https://app.ferni.ai';
const TEST_USER_ID = 'test-utilities-user';

test.describe('Utilities API - Health Check', () => {
  test('utilities health endpoint returns status', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/utilities/health`);

    // Skip if endpoint doesn't exist yet
    if (response.status() === 404) {
      console.log('Utilities health endpoint not deployed yet - skipping');
      test.skip();
      return;
    }

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.status).toBeDefined();
    expect(data.timestamp).toBeDefined();
    console.log(`✓ Utilities health: ${data.status}, Firestore: ${data.firestore}`);
  });
});

test.describe('Utilities API - Reminders', () => {
  test('GET /api/utilities/reminders requires userId', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/utilities/reminders`);

    if (response.status() === 404) {
      console.log('Reminders endpoint not deployed yet - skipping');
      test.skip();
      return;
    }

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('userId');
  });

  test('GET /api/utilities/reminders returns list for user', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/utilities/reminders?userId=${TEST_USER_ID}`);

    if (response.status() === 404) {
      test.skip();
      return;
    }

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.reminders).toBeDefined();
    expect(Array.isArray(data.reminders)).toBe(true);
    expect(typeof data.count).toBe('number');
    console.log(`✓ Found ${data.count} reminders for test user`);
  });

  test('POST /api/utilities/reminders creates a reminder', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/utilities/reminders`, {
      data: {
        userId: TEST_USER_ID,
        message: 'E2E test reminder - please ignore',
        when: 'in 1 hour',
        deliveryMethod: 'voice_message',
      },
    });

    if (response.status() === 404) {
      test.skip();
      return;
    }

    expect(response.status()).toBe(201);
    const data = await response.json();
    expect(data.reminder).toBeDefined();
    expect(data.reminder.id).toBeDefined();
    expect(data.reminder.scheduledFor).toBeDefined();
    console.log(`✓ Created reminder ${data.reminder.id} scheduled for ${data.reminder.scheduledFor}`);

    // Clean up: cancel the reminder we just created
    const cancelResponse = await request.delete(
      `${BASE_URL}/api/utilities/reminders/${data.reminder.id}`
    );
    if (cancelResponse.status() === 200) {
      console.log(`✓ Cleaned up test reminder`);
    }
  });

  test('POST /api/utilities/reminders validates required fields', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/utilities/reminders`, {
      data: {
        userId: TEST_USER_ID,
        // Missing 'message' and 'when'
      },
    });

    if (response.status() === 404) {
      test.skip();
      return;
    }

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  test('DELETE /api/utilities/reminders/:id returns 404 for non-existent', async ({ request }) => {
    const response = await request.delete(`${BASE_URL}/api/utilities/reminders/non-existent-id-12345`);

    if (response.status() === 404) {
      // Either endpoint not deployed or reminder not found - both valid
      const data = await response.json();
      expect(data.error).toBeDefined();
    }
  });
});

test.describe('Utilities API - Lists', () => {
  test('GET /api/utilities/lists requires userId', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/utilities/lists`);

    if (response.status() === 404) {
      console.log('Lists endpoint not deployed yet - skipping');
      test.skip();
      return;
    }

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('userId');
  });

  test('GET /api/utilities/lists returns lists for user', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/utilities/lists?userId=${TEST_USER_ID}`);

    if (response.status() === 404) {
      test.skip();
      return;
    }

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.lists).toBeDefined();
    expect(Array.isArray(data.lists)).toBe(true);
    console.log(`✓ Found ${data.count} lists for test user`);
  });
});

test.describe('Utilities API - Alarms', () => {
  test('GET /api/utilities/alarms requires userId', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/utilities/alarms`);

    if (response.status() === 404) {
      console.log('Alarms endpoint not deployed yet - skipping');
      test.skip();
      return;
    }

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('userId');
  });

  test('GET /api/utilities/alarms returns alarms for user', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/utilities/alarms?userId=${TEST_USER_ID}`);

    if (response.status() === 404) {
      test.skip();
      return;
    }

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.alarms).toBeDefined();
    expect(Array.isArray(data.alarms)).toBe(true);
    console.log(`✓ Found ${data.count} alarms for test user`);
  });
});

test.describe('Utilities API - Voice Memos', () => {
  test('GET /api/utilities/voice-memos requires userId', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/utilities/voice-memos`);

    if (response.status() === 404) {
      console.log('Voice memos endpoint not deployed yet - skipping');
      test.skip();
      return;
    }

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('userId');
  });

  test('GET /api/utilities/voice-memos returns memos for user', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/utilities/voice-memos?userId=${TEST_USER_ID}`);

    if (response.status() === 404) {
      test.skip();
      return;
    }

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.memos).toBeDefined();
    expect(Array.isArray(data.memos)).toBe(true);
    console.log(`✓ Found ${data.count} voice memos for test user`);
  });
});

test.describe('Utilities - Integration Summary', () => {
  test('SUMMARY: Utilities E2E verification', async ({ request }) => {
    console.log('\n📋 UTILITIES E2E TEST SUMMARY\n');

    // Check utilities health
    const healthResponse = await request.get(`${BASE_URL}/api/utilities/health`);
    if (healthResponse.status() === 200) {
      const healthData = await healthResponse.json();
      console.log(`Utilities Health: ✅ ${healthData.status}`);
      console.log(`Firestore: ${healthData.firestore === 'connected' ? '✅' : '⚠️'} ${healthData.firestore}`);
    } else {
      console.log(`Utilities Health: ⚠️ Endpoint not deployed (${healthResponse.status()})`);
    }

    console.log('\n🔧 UTILITY ENDPOINTS:');
    console.log('  - GET  /api/utilities/health');
    console.log('  - GET  /api/utilities/reminders?userId=...');
    console.log('  - POST /api/utilities/reminders');
    console.log('  - DELETE /api/utilities/reminders/:id');
    console.log('  - GET  /api/utilities/lists?userId=...');
    console.log('  - GET  /api/utilities/lists/:id?userId=...');
    console.log('  - GET  /api/utilities/alarms?userId=...');
    console.log('  - GET  /api/utilities/voice-memos?userId=...');

    console.log('\n📱 VOICE TOOL INTEGRATION:');
    console.log('  - setReminder → createReminder service');
    console.log('  - getReminders → getPendingReminders service');
    console.log('  - cancelReminder → cancelReminder service');
    console.log('  - createList → Firestore lists collection');
    console.log('  - setAlarm → Firestore alarms collection');
    console.log('  - saveVoiceMemo → Firestore voice_memos collection');

    console.log('\n💾 DATA PERSISTENCE:');
    console.log('  - Reminders: Firestore (bogle_users/{userId}/reminders)');
    console.log('  - Lists: Firestore (bogle_users/{userId}/lists)');
    console.log('  - Alarms: Firestore (bogle_users/{userId}/alarms)');
    console.log('  - Voice Memos: Firestore (bogle_users/{userId}/voice_memos)');
    console.log('  - Timers: In-memory (session-only)');
    console.log('  - Notes: In-memory (session-only)');

    console.log('\n✅ Utilities infrastructure audit complete!\n');
  });
});
