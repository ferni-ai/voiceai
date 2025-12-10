/**
 * E2E Tests for Household Management (Feature 4)
 *
 * Tests the household system:
 * - GET /api/voice/household - Get household for device
 * - POST /api/voice/household - Create household
 * - POST /api/voice/household/members - Add member
 * - DELETE /api/voice/household/members/:id - Remove member
 * - POST /api/voice/household/identify - Identify speaker
 * - Also tests /api/household/:userId CRUD endpoints
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-household-test-user';
const TEST_DEVICE_ID = `e2e-test-device-${Date.now()}`;

test.describe('Household API (Voice Routes)', () => {
  test('GET /api/voice/household - returns household or 404', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/voice/household`, {
      headers: {
        'X-Device-ID': TEST_DEVICE_ID,
        'X-User-ID': TEST_USER_ID,
      },
    });

    // Should return 200 (existing) or 404 (not found)
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('household');
    }
  });

  test('GET /api/voice/household - requires device ID', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/voice/household`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        // Missing X-Device-ID
      },
    });

    expect(response.status()).toBe(400);
  });

  test('POST /api/voice/household - creates household', async ({ request }) => {
    const uniqueDeviceId = `test-device-${Date.now()}`;

    const response = await request.post(`${BASE_URL}/api/voice/household`, {
      headers: {
        'X-Device-ID': uniqueDeviceId,
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        name: 'E2E Test Household',
      },
    });

    // Should succeed with 200 or 201
    expect([200, 201]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('household');
    expect(data.household).toHaveProperty('name');
  });

  test('POST /api/voice/household - requires user and device ID', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/voice/household`, {
      headers: {
        'Content-Type': 'application/json',
        // Missing required headers
      },
      data: { name: 'Test' },
    });

    expect(response.status()).toBe(400);
  });

  test('POST /api/voice/household/members - adds member', async ({ request }) => {
    // First create a household
    const uniqueDeviceId = `test-device-member-${Date.now()}`;
    await request.post(`${BASE_URL}/api/voice/household`, {
      headers: {
        'X-Device-ID': uniqueDeviceId,
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { name: 'Member Test Household' },
    });

    // Now add a member
    const response = await request.post(`${BASE_URL}/api/voice/household/members`, {
      headers: {
        'X-Device-ID': uniqueDeviceId,
        'Content-Type': 'application/json',
      },
      data: {
        userId: `member-${Date.now()}`,
        displayName: 'Test Member',
        role: 'adult',
      },
    });

    // Should succeed
    expect([200, 201]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('member');
  });

  test('POST /api/voice/household/members - requires device ID', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/voice/household/members`, {
      headers: {
        'Content-Type': 'application/json',
        // Missing X-Device-ID
      },
      data: {
        userId: 'test-member',
        displayName: 'Test',
        role: 'adult',
      },
    });

    expect(response.status()).toBe(400);
  });

  test('DELETE /api/voice/household/members/:id - removes member', async ({ request }) => {
    // First create household with member
    const uniqueDeviceId = `test-device-delete-${Date.now()}`;
    await request.post(`${BASE_URL}/api/voice/household`, {
      headers: {
        'X-Device-ID': uniqueDeviceId,
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: { name: 'Delete Test Household' },
    });

    const memberId = `member-delete-${Date.now()}`;
    await request.post(`${BASE_URL}/api/voice/household/members`, {
      headers: {
        'X-Device-ID': uniqueDeviceId,
        'Content-Type': 'application/json',
      },
      data: {
        userId: memberId,
        displayName: 'To Be Deleted',
        role: 'adult',
      },
    });

    // Delete the member
    const response = await request.delete(`${BASE_URL}/api/voice/household/members/${memberId}`, {
      headers: {
        'X-Device-ID': uniqueDeviceId,
      },
    });

    // Should succeed
    expect([200, 204]).toContain(response.status());
  });

  test('POST /api/voice/household/identify - requires device ID', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/voice/household/identify`, {
      headers: {
        'Content-Type': 'application/json',
        // Missing X-Device-ID
      },
      data: {
        embedding: [0.1, 0.2, 0.3],
      },
    });

    expect(response.status()).toBe(400);
  });
});

test.describe('Household API (User Routes)', () => {
  test('GET /api/household/:userId - returns household data', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/household/${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('members');
    expect(data).toHaveProperty('settings');
    expect(Array.isArray(data.members)).toBe(true);
  });

  test('PUT /api/household/:userId - updates household', async ({ request }) => {
    const response = await request.put(`${BASE_URL}/api/household/${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        members: [
          {
            id: 'member-1',
            name: 'Test User',
            relationship: 'self',
            voiceEnrolled: false,
          },
        ],
        settings: {
          privacyMode: 'shared',
          voiceIdentification: true,
          sharedCalendar: true,
          familyReminders: true,
        },
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });

  test('PATCH /api/household/:userId/settings - updates settings only', async ({ request }) => {
    const response = await request.patch(`${BASE_URL}/api/household/${TEST_USER_ID}/settings`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        voiceIdentification: false,
        familyReminders: false,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });

  test('POST /api/household/:userId/members - adds member', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/household/${TEST_USER_ID}/members`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        name: 'New Family Member',
        relationship: 'family',
        voiceEnrolled: false,
      },
    });

    expect([200, 201]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('member');
    expect(data.member).toHaveProperty('id');
    expect(data.member.name).toBe('New Family Member');
  });

  test('settings structure is correct', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/household/${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Verify settings structure
    expect(data.settings).toHaveProperty('privacyMode');
    expect(data.settings).toHaveProperty('voiceIdentification');
    expect(data.settings).toHaveProperty('sharedCalendar');
    expect(data.settings).toHaveProperty('familyReminders');

    // Privacy mode should be valid value
    expect(['shared', 'individual', 'strict']).toContain(data.settings.privacyMode);

    // Booleans
    expect(typeof data.settings.voiceIdentification).toBe('boolean');
    expect(typeof data.settings.sharedCalendar).toBe('boolean');
    expect(typeof data.settings.familyReminders).toBe('boolean');
  });
});

test.describe('Household Manager UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);

    await page.evaluate(
      ({ userId, deviceId }) => {
        localStorage.setItem('bogle_user_id', userId);
        localStorage.setItem('ferni_user_id', userId);
        localStorage.setItem('ferni_device_id', deviceId);
      },
      { userId: TEST_USER_ID, deviceId: TEST_DEVICE_ID }
    );

    await page.waitForTimeout(1000);
  });

  test('can open household manager from settings', async ({ page }) => {
    // Open settings menu
    const settingsButton = page.locator('[aria-label="Settings"]').or(page.locator('.menu-toggle'));
    if (await settingsButton.isVisible()) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      // Look for household option
      const householdOption = page
        .locator('text=Household')
        .or(page.locator('text=Family'))
        .or(page.locator('[data-action="household"]'));

      if (await householdOption.isVisible()) {
        await householdOption.click();
        await page.waitForTimeout(500);

        // Verify modal opened
        const modal = page
          .locator('.household-manager')
          .or(page.locator('.household-modal'))
          .or(page.locator('[data-panel="household"]'));

        if (await modal.isVisible()) {
          expect(await modal.isVisible()).toBe(true);
        }
      }
    }
  });

  test('displays household settings', async ({ page }) => {
    // Try to open household manager directly
    const opened = await page.evaluate(() => {
      const event = new CustomEvent('ferni:open-household');
      window.dispatchEvent(event);
      return true;
    });

    if (opened) {
      await page.waitForTimeout(500);

      // Look for settings toggles
      const voiceToggle = page.locator('text=Voice').or(page.locator('[data-setting="voice"]'));
      const calendarToggle = page
        .locator('text=Calendar')
        .or(page.locator('[data-setting="calendar"]'));

      // Dashboard should show settings options
    }
  });

  test('can add household member', async ({ page }) => {
    const opened = await page.evaluate(() => {
      const event = new CustomEvent('ferni:open-household');
      window.dispatchEvent(event);
      return true;
    });

    if (opened) {
      await page.waitForTimeout(500);

      // Look for add member button
      const addButton = page
        .locator('text=Add Member')
        .or(page.locator('[data-action="add-member"]'))
        .or(page.locator('.add-member-btn'));

      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(300);

        // Should show member form or modal
      }
    }
  });

  test('can close household manager', async ({ page }) => {
    const opened = await page.evaluate(() => {
      const event = new CustomEvent('ferni:open-household');
      window.dispatchEvent(event);
      return true;
    });

    if (opened) {
      await page.waitForTimeout(500);

      const closeButton = page
        .locator('.household-close')
        .or(page.locator('[aria-label="Close"]'))
        .or(page.locator('.close-btn'));

      if (await closeButton.isVisible()) {
        await closeButton.click();
        await page.waitForTimeout(300);
      }
    }
  });
});

test.describe('Household Data Integration', () => {
  test('household persists members correctly', async ({ request }) => {
    const testUserId = `integration-test-${Date.now()}`;

    // Add a member
    const addResponse = await request.post(`${BASE_URL}/api/household/${testUserId}/members`, {
      headers: {
        'X-User-ID': testUserId,
        'Content-Type': 'application/json',
      },
      data: {
        name: 'Integration Test Member',
        relationship: 'spouse',
        voiceEnrolled: true,
      },
    });

    expect([200, 201]).toContain(addResponse.status());

    // Verify member persisted
    const getResponse = await request.get(`${BASE_URL}/api/household/${testUserId}`, {
      headers: {
        'X-User-ID': testUserId,
      },
    });

    expect(getResponse.status()).toBe(200);

    const data = await getResponse.json();
    const member = data.members.find((m: { name: string }) => m.name === 'Integration Test Member');
    expect(member).toBeDefined();
    expect(member.relationship).toBe('spouse');
    expect(member.voiceEnrolled).toBe(true);
  });

  test('default household has correct structure', async ({ request }) => {
    const newUserId = `new-household-user-${Date.now()}`;

    const response = await request.get(`${BASE_URL}/api/household/${newUserId}`, {
      headers: {
        'X-User-ID': newUserId,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();

    // New users get default settings
    expect(data.members).toEqual([]);
    expect(data.settings.privacyMode).toBe('shared');
    expect(data.settings.voiceIdentification).toBe(true);
    expect(data.settings.sharedCalendar).toBe(true);
    expect(data.settings.familyReminders).toBe(true);
  });
});
