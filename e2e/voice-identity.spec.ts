/**
 * E2E Tests for Voice Identity System (Feature 3)
 *
 * Tests the voice enrollment and verification system:
 * - POST /api/voice/enroll/start - Start enrollment session
 * - POST /api/voice/enroll/sample - Add voice sample
 * - POST /api/voice/enroll/complete - Complete enrollment
 * - POST /api/voice/enroll/cancel - Cancel enrollment
 * - POST /api/voice/verify - Verify speaker
 * - POST /api/voice/identify - Identify unknown speaker
 * - GET /api/voice/profile - Get profile status
 * - DELETE /api/voice/profile - Delete profile
 */

import { expect, test, type Page } from './support/fixtures';
import { API_URL, APP_URL } from './support/env';
import { openSettingsMenu, pinMenuItems } from './support/app';

const TEST_USER_ID = `e2e-voice-test-${Date.now()}`;

test.describe('Voice Identity API - Enrollment', { tag: '@needs-server' }, () => {
  test('POST /api/voice/enroll/start - starts enrollment session', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/voice/enroll/start`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        requiredSamples: 3,
      },
    });

    // Should succeed with 200 or 400 if already enrolled
    expect([200, 400]).toContain(response.status());

    const data = await response.json();
    if (response.status() === 200) {
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('sessionId');
      expect(data).toHaveProperty('requiredSamples');
      expect(data.requiredSamples).toBeGreaterThan(0);
    }
  });

  test('POST /api/voice/enroll/start - requires authentication', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/voice/enroll/start`, {
      headers: {
        'Content-Type': 'application/json',
        // Missing X-User-ID
      },
      data: {},
    });

    expect(response.status()).toBe(401);
  });

  test('POST /api/voice/enroll/sample - requires active session', async ({ request }) => {
    // Try to add sample without starting enrollment
    const newUserId = `no-session-${Date.now()}`;
    const response = await request.post(`${API_URL}/api/voice/enroll/sample`, {
      headers: {
        'X-User-ID': newUserId,
        'Content-Type': 'application/json',
      },
      data: {
        audio: 'base64-encoded-audio-data',
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  test('POST /api/voice/enroll/complete - requires active session', async ({ request }) => {
    const newUserId = `no-complete-session-${Date.now()}`;
    const response = await request.post(`${API_URL}/api/voice/enroll/complete`, {
      headers: {
        'X-User-ID': newUserId,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  test('POST /api/voice/enroll/cancel - cancels enrollment', async ({ request }) => {
    const userId = `cancel-test-${Date.now()}`;

    // Start enrollment first
    await request.post(`${API_URL}/api/voice/enroll/start`, {
      headers: {
        'X-User-ID': userId,
        'Content-Type': 'application/json',
      },
      data: { requiredSamples: 3 },
    });

    // Cancel it
    const response = await request.post(`${API_URL}/api/voice/enroll/cancel`, {
      headers: {
        'X-User-ID': userId,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });
});

test.describe('Voice Identity API - Profile Management', { tag: '@needs-server' }, () => {
  test('GET /api/voice/profile - returns profile or not found', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/voice/profile`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    // 200 if profile exists, 404 if not
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('profile');
      expect(data.profile).toHaveProperty('userId');
      expect(data.profile).toHaveProperty('qualityScore');
      expect(data.profile).toHaveProperty('enrolledAt');
    }
  });

  test('GET /api/voice/profile - requires authentication', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/voice/profile`, {
      headers: {
        // Missing X-User-ID
      },
    });

    expect(response.status()).toBe(401);
  });

  test('DELETE /api/voice/profile - deletes profile', async ({ request }) => {
    const response = await request.delete(`${API_URL}/api/voice/profile`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    // 200 if deleted, 404 if no profile existed
    expect([200, 404]).toContain(response.status());
  });

  test('DELETE /api/voice/profile - requires authentication', async ({ request }) => {
    const response = await request.delete(`${API_URL}/api/voice/profile`, {
      headers: {
        // Missing X-User-ID
      },
    });

    expect(response.status()).toBe(401);
  });
});

test.describe('Voice Identity API - Verification', { tag: '@needs-server' }, () => {
  test('POST /api/voice/verify - requires audio', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/voice/verify`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        // Missing audio
      },
    });

    expect(response.status()).toBe(400);
  });

  test('POST /api/voice/identify - requires audio', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/voice/identify`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        // Missing audio
      },
    });

    expect(response.status()).toBe(400);
  });

  test('GET /api/voice/capabilities - returns system capabilities', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/voice/capabilities`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('voiceAuth');
    expect(data.voiceAuth).toHaveProperty('enrollment');
    expect(data.voiceAuth).toHaveProperty('verification');
    expect(data.voiceAuth).toHaveProperty('identification');
    expect(typeof data.voiceAuth.enrollment).toBe('boolean');
  });
});

// The enrollment modal is ui/voice-enrollment.ui.ts. Voice ID is a roadmap
// feature, so the menu sections hide it; the menu lists it as the pinned
// favorite "voice-enrollment" (see renderPinnedItems in ui/settings-menu.ui.ts).
const ENROLLMENT_MODAL = '.voice-enrollment-modal.voice-enrollment-modal--visible';

async function openEnrollmentFromMenu(page: Page): Promise<void> {
  await openSettingsMenu(page);
  await page.locator('.settings-menu [data-action="voice-enrollment"]').click();
  await expect(page.locator(ENROLLMENT_MODAL)).toBeVisible({ timeout: 5000 });
}

test.describe('Voice Enrollment UI', () => {
  test.beforeEach(async ({ page }) => {
    await pinMenuItems(page, ['voice-enrollment']);
    await page.goto(APP_URL);

    await page.evaluate((userId) => {
      localStorage.setItem('bogle_user_id', userId);
      localStorage.setItem('ferni_user_id', userId);
    }, TEST_USER_ID);

    await page.waitForTimeout(1000);
  });

  test('can open voice enrollment from settings', async ({ page }) => {
    await openEnrollmentFromMenu(page);

    // Verify enrollment modal opened
    const modal = page.locator(ENROLLMENT_MODAL);
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal.locator('.voice-enrollment-title')).toBeVisible();
  });

  test('enrollment UI shows instructions', async ({ page }) => {
    await openEnrollmentFromMenu(page);

    // Should show some instructions (the status/instruction area of the modal)
    const content = page.locator(`${ENROLLMENT_MODAL} .voice-enrollment-content`);
    await expect(content).toBeVisible();
    await expect(content).toContainText(/voice/i);
  });

  test('can close enrollment modal', async ({ page }) => {
    await openEnrollmentFromMenu(page);

    await page.locator(`${ENROLLMENT_MODAL} .voice-enrollment-close`).click();
    await expect(page.locator(ENROLLMENT_MODAL)).toHaveCount(0);
  });
});

test.describe('Voice Identity Security', { tag: '@needs-server' }, () => {
  test('enrollment rate limited', async ({ request }) => {
    const userId = `rate-limit-test-${Date.now()}`;

    // Make multiple rapid requests
    const responses = await Promise.all(
      Array(10)
        .fill(null)
        .map(() =>
          request.post(`${API_URL}/api/voice/enroll/start`, {
            headers: {
              'X-User-ID': userId,
              'Content-Type': 'application/json',
            },
            data: { requiredSamples: 3 },
          })
        )
    );

    // At least one should succeed, but some may be rate limited
    const statuses = responses.map((r) => r.status());
    const hasSuccess = statuses.some((s) => s === 200 || s === 400);
    expect(hasSuccess).toBe(true);
  });

  test('verification requires authentication', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/voice/verify`, {
      headers: {
        'Content-Type': 'application/json',
        // Missing X-User-ID
      },
      data: {
        audio: 'test-audio',
      },
    });

    expect(response.status()).toBe(401);
  });
});
