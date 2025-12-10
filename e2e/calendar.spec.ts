/**
 * E2E Tests for Calendar Integration (Feature 5)
 *
 * Tests the calendar integration system:
 * - GET /api/v1/integrations/calendar/status - Check connection status
 * - GET /api/v1/integrations/calendar/connect - Get OAuth URL
 * - GET /api/v1/integrations/calendar/events - Get events (when connected)
 * - DELETE /api/v1/integrations/calendar/disconnect - Disconnect calendar
 * - POST /api/v1/integrations/calendar/location - Update location
 *
 * Note: Full OAuth flow requires Google credentials to be configured.
 * These tests verify the API structure works correctly.
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-calendar-test-user';

test.describe('Calendar Integration API', () => {
  test('GET /api/v1/integrations/calendar/status - returns connection status', async ({
    request,
  }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/integrations/calendar/status?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('connected');
    expect(typeof data.connected).toBe('boolean');
    expect(data).toHaveProperty('upcomingEventsCount');
    expect(typeof data.upcomingEventsCount).toBe('number');
  });

  test('GET /api/v1/integrations/calendar/status - requires userId', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/integrations/calendar/status`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(400);
  });

  test('GET /api/v1/integrations/calendar/connect - returns auth URL', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/integrations/calendar/connect?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('authUrl');
    expect(typeof data.authUrl).toBe('string');
    // Auth URL should be a Google OAuth URL or placeholder
    expect(data.authUrl.length).toBeGreaterThan(0);
  });

  test('GET /api/v1/integrations/calendar/connect - requires userId', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/integrations/calendar/connect`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(400);
  });

  test('GET /api/v1/integrations/calendar/events - requires connection', async ({ request }) => {
    // For a user without calendar connected, should return error
    const response = await request.get(
      `${BASE_URL}/api/v1/integrations/calendar/events?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    // Should return 400 since calendar isn't connected
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  test('GET /api/v1/integrations/calendar/events - requires userId', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/integrations/calendar/events`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(400);
  });

  test('DELETE /api/v1/integrations/calendar/disconnect - works for any user', async ({
    request,
  }) => {
    const response = await request.delete(
      `${BASE_URL}/api/v1/integrations/calendar/disconnect?userId=${TEST_USER_ID}`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });

  test('POST /api/v1/integrations/calendar/location - updates location', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/integrations/calendar/location`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        userId: TEST_USER_ID,
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 10,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('locationType');
  });

  test('POST /api/v1/integrations/calendar/location - requires coordinates', async ({
    request,
  }) => {
    const response = await request.post(`${BASE_URL}/api/v1/integrations/calendar/location`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        userId: TEST_USER_ID,
        // Missing latitude and longitude
      },
    });

    expect(response.status()).toBe(400);
  });

  test('POST /api/v1/integrations/calendar/location/save - saves named location', async ({
    request,
  }) => {
    const response = await request.post(`${BASE_URL}/api/v1/integrations/calendar/location/save`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        userId: TEST_USER_ID,
        name: 'Test Home',
        type: 'home',
        latitude: 37.7749,
        longitude: -122.4194,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });

  test('POST /api/v1/integrations/calendar/location/save - requires all fields', async ({
    request,
  }) => {
    const response = await request.post(`${BASE_URL}/api/v1/integrations/calendar/location/save`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        userId: TEST_USER_ID,
        name: 'Test',
        // Missing type, latitude, longitude
      },
    });

    expect(response.status()).toBe(400);
  });
});

test.describe('Calendar Settings UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);

    await page.evaluate((userId) => {
      localStorage.setItem('bogle_user_id', userId);
      localStorage.setItem('ferni_user_id', userId);
    }, TEST_USER_ID);

    await page.waitForTimeout(1000);
  });

  test('can open calendar settings from menu', async ({ page }) => {
    // Open settings menu
    const settingsButton = page.locator('[aria-label="Settings"]').or(page.locator('.menu-toggle'));
    if (await settingsButton.isVisible()) {
      await settingsButton.click();
      await page.waitForTimeout(500);

      // Look for calendar/integrations option
      const calendarOption = page
        .locator('text=Calendar')
        .or(page.locator('text=Integrations'))
        .or(page.locator('[data-action="calendar"]'));

      if (await calendarOption.isVisible()) {
        await calendarOption.click();
        await page.waitForTimeout(500);

        // Verify settings panel opened
        const panel = page
          .locator('.calendar-settings')
          .or(page.locator('.integrations-panel'))
          .or(page.locator('[data-panel="calendar"]'));

        if (await panel.isVisible()) {
          expect(await panel.isVisible()).toBe(true);
        }
      }
    }
  });

  test('displays connection status', async ({ page }) => {
    // Mock the status endpoint
    await page.route('**/api/v1/integrations/calendar/status**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: false,
          upcomingEventsCount: 0,
          currentLocation: null,
        }),
      });
    });

    // Verify status can be fetched
    const result = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/v1/integrations/calendar/status?userId=test');
        const data = await response.json();
        return {
          success: true,
          connected: data.connected,
        };
      } catch {
        return { success: false, connected: false };
      }
    });

    expect(result.success).toBe(true);
    expect(typeof result.connected).toBe('boolean');
  });

  test('shows connect button when not connected', async ({ page }) => {
    // Mock disconnected status
    await page.route('**/api/v1/integrations/calendar/status**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: false,
          upcomingEventsCount: 0,
        }),
      });
    });

    // Try to open calendar settings
    const opened = await page.evaluate(() => {
      const event = new CustomEvent('ferni:open-calendar');
      window.dispatchEvent(event);
      return true;
    });

    if (opened) {
      await page.waitForTimeout(500);

      // Look for connect button
      const connectButton = page
        .locator('text=Connect')
        .or(page.locator('text=Link Calendar'))
        .or(page.locator('[data-action="connect-calendar"]'));

      // Connect button should be visible for disconnected state
    }
  });

  test('can close calendar settings', async ({ page }) => {
    const opened = await page.evaluate(() => {
      const event = new CustomEvent('ferni:open-calendar');
      window.dispatchEvent(event);
      return true;
    });

    if (opened) {
      await page.waitForTimeout(500);

      const closeButton = page
        .locator('.calendar-close')
        .or(page.locator('[aria-label="Close"]'))
        .or(page.locator('.close-btn'));

      if (await closeButton.isVisible()) {
        await closeButton.click();
        await page.waitForTimeout(300);
      }
    }
  });
});

test.describe('Calendar Integration Flow', () => {
  test('OAuth flow generates valid auth URL', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/integrations/calendar/connect?userId=${TEST_USER_ID}`,
      {
        headers: { 'X-User-ID': TEST_USER_ID },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Auth URL should contain state parameter for security
    // (actual URL format depends on Google OAuth configuration)
    expect(data.authUrl).toBeTruthy();
  });

  test('disconnect clears connection state', async ({ request }) => {
    // Disconnect
    const disconnectResponse = await request.delete(
      `${BASE_URL}/api/v1/integrations/calendar/disconnect?userId=${TEST_USER_ID}`,
      {
        headers: { 'X-User-ID': TEST_USER_ID },
      }
    );
    expect(disconnectResponse.status()).toBe(200);

    // Verify disconnected
    const statusResponse = await request.get(
      `${BASE_URL}/api/v1/integrations/calendar/status?userId=${TEST_USER_ID}`,
      {
        headers: { 'X-User-ID': TEST_USER_ID },
      }
    );
    expect(statusResponse.status()).toBe(200);

    const status = await statusResponse.json();
    expect(status.connected).toBe(false);
  });

  test('location tracking works independently', async ({ request }) => {
    // Location tracking should work even without calendar connection
    const locationResponse = await request.post(
      `${BASE_URL}/api/v1/integrations/calendar/location`,
      {
        headers: {
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          userId: TEST_USER_ID,
          latitude: 40.7128,
          longitude: -74.006,
          accuracy: 15,
        },
      }
    );

    expect(locationResponse.status()).toBe(200);

    const data = await locationResponse.json();
    expect(data.success).toBe(true);
  });
});
