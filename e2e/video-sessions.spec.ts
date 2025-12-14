/**
 * E2E Tests for Video Sessions API
 *
 * Tests the video session functionality:
 * - GET /api/video/capabilities
 * - GET /api/video/state
 * - POST /api/video/enable
 * - POST /api/video/disable
 * - POST /api/video/screen-share/start
 * - POST /api/video/screen-share/stop
 * - POST /api/video/mode
 * - POST /api/video/config
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-video-test-user';

test.describe('Video Sessions API', () => {
  test('GET /api/video/capabilities - returns video capabilities', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/video/capabilities`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('capabilities');
    expect(data.capabilities).toHaveProperty('supportsVideo', true);
    expect(data.capabilities).toHaveProperty('supportsScreenShare', true);
    expect(data.capabilities).toHaveProperty('maxParticipants');
    expect(data.capabilities).toHaveProperty('supportedQualities');
    expect(data.capabilities).toHaveProperty('supportedModes');
  });

  test('GET /api/video/state - returns session state', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/video/state`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('state');
    expect(data).toHaveProperty('config');

    expect(data.state).toHaveProperty('isVideoEnabled');
    expect(data.state).toHaveProperty('isScreenSharing');
    expect(data.state).toHaveProperty('isRecording');
    expect(data.state).toHaveProperty('mode');
  });

  test('POST /api/video/enable - enables video', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/video/enable`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('trackId');
  });

  test('POST /api/video/disable - disables video', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/video/disable`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });

  test('POST /api/video/screen-share/start - starts screen sharing', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/video/screen-share/start`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('trackId');
  });

  test('POST /api/video/screen-share/stop - stops screen sharing', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/video/screen-share/stop`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });

  test('POST /api/video/mode - sets display mode', async ({ request }) => {
    const validModes = ['avatar', 'video', 'hybrid'];

    for (const mode of validModes) {
      const response = await request.post(`${BASE_URL}/api/video/mode`, {
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: { mode },
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
    }
  });

  test('POST /api/video/mode - rejects invalid mode', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/video/mode`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { mode: 'invalid' },
    });

    expect(response.status()).toBe(400);
  });

  test('POST /api/video/config - updates configuration', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/video/config`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { videoQuality: 'high', preferAvatarMode: false },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('config');
  });

  test('requires authentication', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/video/state`, {
      headers: {
        // Missing X-User-ID
      },
    });

    expect(response.status()).toBe(401);
  });
});

test.describe('Video Sessions Workflow', () => {
  test('complete video session workflow', async ({ request }) => {
    const headers = {
      'X-User-ID': TEST_USER_ID,
      'Content-Type': 'application/json',
    };

    // 1. Get initial state
    const stateRes = await request.get(`${BASE_URL}/api/video/state`, { headers });
    expect(stateRes.status()).toBe(200);

    // 2. Enable video
    const enableRes = await request.post(`${BASE_URL}/api/video/enable`, {
      headers,
      data: {},
    });
    expect(enableRes.status()).toBe(200);

    // 3. Change mode to hybrid
    const modeRes = await request.post(`${BASE_URL}/api/video/mode`, {
      headers,
      data: { mode: 'hybrid' },
    });
    expect(modeRes.status()).toBe(200);

    // 4. Verify state reflects changes
    const verifyRes = await request.get(`${BASE_URL}/api/video/state`, { headers });
    const verifyData = await verifyRes.json();
    expect(verifyData.state.isVideoEnabled).toBe(true);

    // 5. Disable video
    const disableRes = await request.post(`${BASE_URL}/api/video/disable`, {
      headers,
      data: {},
    });
    expect(disableRes.status()).toBe(200);
  });
});
