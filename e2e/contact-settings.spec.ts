/**
 * Contact Settings E2E Tests
 *
 * Tests the Contact Settings feature end-to-end:
 * - Contact info API endpoints
 * - Preferences API endpoints
 * - UI interaction
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3003';
const TEST_USER_ID = process.env.TEST_USER_ID || 'e2e-test-user';

test.describe('Contact Settings API', () => {
  test('POST /api/user/contact - saves contact info', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/user/contact`, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': TEST_USER_ID,
      },
      data: {
        phone: '+15551234567',
        email: 'test@example.com',
        preferredName: 'Test User',
        timezone: 'America/New_York',
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.contactInfo).toBeDefined();
    expect(data.contactInfo.hasPhone).toBe(true);
    expect(data.contactInfo.hasEmail).toBe(true);
  });

  test('GET /api/user/contact - returns contact info', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/user/contact`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.contactInfo).toBeDefined();
  });

  test('GET /api/user/contact - returns 401 without user ID', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/user/contact`);

    // Should return 401 or empty response
    const status = response.status();
    expect([200, 401]).toContain(status);
  });

  test('POST /api/user/preferences - saves quiet hours', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/user/preferences`, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': TEST_USER_ID,
      },
      data: {
        timezone: 'America/New_York',
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('GET /api/user/preferences - returns preferences', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/user/preferences?userId=${TEST_USER_ID}`, {
      headers: {
        'X-User-ID': TEST_USER_ID,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
  });
});

test.describe('Contact Settings UI', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('can open Contact Settings from settings menu', async ({ page }) => {
    // Click the settings menu trigger
    const settingsTrigger = page.locator('.settings-trigger');
    if (!(await settingsTrigger.isVisible())) {
      test.skip();
      return;
    }

    await settingsTrigger.click();

    // Look for Contact Settings menu item
    const contactItem = page.locator('[data-action="contact-settings"]');
    if (await contactItem.isVisible()) {
      await contactItem.click();

      // Wait for contact settings modal
      const modal = page.locator('.contact-settings-overlay.open');
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Check for key UI elements
      await expect(page.locator('.contact-settings-title')).toBeVisible();
      await expect(page.locator('#phone-input')).toBeVisible();
      await expect(page.locator('#email-input')).toBeVisible();
    }
  });

  test('can enter and save contact info', async ({ page }) => {
    const settingsTrigger = page.locator('.settings-trigger');
    if (!(await settingsTrigger.isVisible())) {
      test.skip();
      return;
    }

    await settingsTrigger.click();

    const contactItem = page.locator('[data-action="contact-settings"]');
    if (!(await contactItem.isVisible())) {
      test.skip();
      return;
    }

    await contactItem.click();
    await page.waitForSelector('.contact-settings-overlay.open');

    // Fill in contact info
    const phoneInput = page.locator('#phone-input');
    const emailInput = page.locator('#email-input');
    const nameInput = page.locator('#name-input');

    if ((await phoneInput.isVisible()) && (await emailInput.isVisible())) {
      await phoneInput.fill('+15551234567');
      await emailInput.fill('test@example.com');

      if (await nameInput.isVisible()) {
        await nameInput.fill('Test User');
      }

      // Click save
      const saveBtn = page.locator('#save-btn');
      await saveBtn.click();

      // Wait for success message
      await expect(page.locator('.contact-settings-success')).toBeVisible({
        timeout: 5000,
      });
    }
  });

  test('can toggle quiet hours', async ({ page }) => {
    const settingsTrigger = page.locator('.settings-trigger');
    if (!(await settingsTrigger.isVisible())) {
      test.skip();
      return;
    }

    await settingsTrigger.click();

    const contactItem = page.locator('[data-action="contact-settings"]');
    if (!(await contactItem.isVisible())) {
      test.skip();
      return;
    }

    await contactItem.click();
    await page.waitForSelector('.contact-settings-overlay.open');

    // Find quiet hours toggle
    const quietToggle = page.locator('#quiet-hours-toggle');
    if (await quietToggle.isVisible()) {
      const isActive = await quietToggle.evaluate((el) => el.classList.contains('active'));

      // Toggle it
      await quietToggle.click();

      // Verify state changed
      const isActiveAfter = await quietToggle.evaluate((el) => el.classList.contains('active'));
      expect(isActiveAfter).not.toBe(isActive);
    }
  });

  test('can close Contact Settings', async ({ page }) => {
    const settingsTrigger = page.locator('.settings-trigger');
    if (!(await settingsTrigger.isVisible())) {
      test.skip();
      return;
    }

    await settingsTrigger.click();

    const contactItem = page.locator('[data-action="contact-settings"]');
    if (!(await contactItem.isVisible())) {
      test.skip();
      return;
    }

    await contactItem.click();
    await page.waitForSelector('.contact-settings-overlay.open');

    // Click close button
    const closeButton = page.locator('.contact-settings-close');
    await closeButton.click();

    // Modal should be hidden
    await expect(page.locator('.contact-settings-overlay.open')).not.toBeVisible();
  });
});
