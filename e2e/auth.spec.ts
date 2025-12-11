/**
 * E2E Tests for Firebase Authentication System
 *
 * Tests the authentication endpoints and flows:
 * - Account info and management
 * - Migration from device ID to Firebase UID
 * - Auth monitoring and health
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_DEVICE_ID = `e2e-auth-test-${Date.now()}`;
const TEST_USER_ID = `device:${TEST_DEVICE_ID}`;

// ============================================================================
// ACCOUNT ROUTES
// ============================================================================

test.describe('Account API', () => {
  test('GET /api/account - returns account info with valid auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/account`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('links');
    expect(data.links).toHaveProperty('export');
    expect(data.links).toHaveProperty('delete');
  });

  test('GET /api/account - returns 401 without auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/account`, {
      headers: {
        'Content-Type': 'application/json',
        // No X-User-ID header
      },
    });

    expect(response.status()).toBe(401);
  });

  test('PUT /api/account/profile - updates profile', async ({ request }) => {
    const response = await request.put(`${BASE_URL}/api/account/profile`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        name: 'E2E Test User',
        preferences: {
          testPreference: 'test-value',
        },
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('profile');
    expect(data.profile.name).toBe('E2E Test User');
  });

  test('DELETE /api/account - requires confirmation', async ({ request }) => {
    // Try without confirmation
    const response = await request.delete(`${BASE_URL}/api/account`, {
      headers: {
        'X-User-ID': `device:delete-test-${Date.now()}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('confirmation');
  });

  test('DELETE /api/account - deletes with confirmation', async ({ request }) => {
    const deleteUserId = `device:delete-confirm-${Date.now()}`;

    // First create the user
    await request.put(`${BASE_URL}/api/account/profile`, {
      headers: {
        'X-User-ID': deleteUserId,
        'Content-Type': 'application/json',
      },
      data: { name: 'To Be Deleted' },
    });

    // Now delete with confirmation
    const response = await request.delete(`${BASE_URL}/api/account`, {
      headers: {
        'X-User-ID': deleteUserId,
        'Content-Type': 'application/json',
      },
      data: {
        confirmation: 'DELETE_MY_ACCOUNT',
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('success');
  });
});

// ============================================================================
// MIGRATION ROUTES
// ============================================================================

test.describe('Migration API', () => {
  test('POST /api/auth/migrate - requires deviceId', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/auth/migrate`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        // Missing deviceId
        firebaseUid: 'test-firebase-uid-12345678901234567890',
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('deviceId');
  });

  test('POST /api/auth/migrate - requires valid firebaseUid', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/auth/migrate`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        deviceId: TEST_DEVICE_ID,
        firebaseUid: 'short', // Too short to be valid
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('firebaseUid');
  });

  test('POST /api/auth/migrate - succeeds with valid params', async ({ request }) => {
    const migrateDeviceId = `migrate-test-${Date.now()}`;
    const migrateFirebaseUid = `firebase-uid-test-${Date.now()}-12345678`;

    // First create some data under the device ID
    await request.put(`${BASE_URL}/api/account/profile`, {
      headers: {
        'X-User-ID': `device:${migrateDeviceId}`,
        'Content-Type': 'application/json',
      },
      data: { name: 'Migration Test User' },
    });

    // Now migrate
    const response = await request.post(`${BASE_URL}/api/auth/migrate`, {
      headers: {
        'X-User-ID': `device:${migrateDeviceId}`,
        'Content-Type': 'application/json',
      },
      data: {
        deviceId: migrateDeviceId,
        firebaseUid: migrateFirebaseUid,
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('profileAction');
  });

  test('GET /api/auth/migration-status - returns status for device', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/auth/migration-status?deviceId=${TEST_DEVICE_ID}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('deviceId');
    expect(data).toHaveProperty('isMigrated');
  });

  test('GET /api/auth/migration-status - requires deviceId', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/auth/migration-status`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(400);
  });
});

// ============================================================================
// AUTH MONITORING ROUTES
// ============================================================================

test.describe('Auth Monitoring API', () => {
  test('GET /api/auth/health - returns health status', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/auth/health`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('checks');
    expect(data).toHaveProperty('timestamp');
  });

  test('GET /api/auth/metrics - requires admin', async ({ request }) => {
    // Without admin auth
    const response = await request.get(`${BASE_URL}/api/auth/metrics`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
    });

    // Should be 403 (forbidden) or 401 if requireAdmin rejects
    expect([401, 403]).toContain(response.status());
  });

  test('GET /api/auth/events - requires admin', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/auth/events`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
    });

    expect([401, 403]).toContain(response.status());
  });
});

// ============================================================================
// GDPR ROUTES (auth-related)
// ============================================================================

test.describe('GDPR API (Auth Related)', () => {
  test('GET /api/gdpr/data-summary - returns data summary', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/gdpr/data-summary`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('dataTypes');
    expect(data).toHaveProperty('rights');
  });

  test('DELETE /api/gdpr/account - requires confirmation', async ({ request }) => {
    const response = await request.delete(`${BASE_URL}/api/gdpr/account`, {
      headers: {
        'X-User-ID': `device:gdpr-test-${Date.now()}`,
        'Content-Type': 'application/json',
      },
      data: {
        // Wrong confirmation
        confirmation: 'WRONG',
      },
    });

    expect(response.status()).toBe(400);
  });
});

// ============================================================================
// TOKEN ENDPOINT (auth context)
// ============================================================================

test.describe('Token API (Auth Context)', () => {
  test('GET /token - generates token with device ID', async ({ request }) => {
    const roomName = `test-room-${Date.now()}`;
    const username = 'E2E Test User';

    const response = await request.get(
      `${BASE_URL}/token?room=${roomName}&username=${username}&device_id=${TEST_DEVICE_ID}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('token');
    expect(data).toHaveProperty('room', roomName);
    expect(data).toHaveProperty('username', username);
    expect(data).toHaveProperty('device_id', TEST_DEVICE_ID);
  });

  test('GET /token - requires room and username', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/token?room=test`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('username');
  });
});
