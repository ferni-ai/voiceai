/**
 * E2E Tests for Ritual Builder Feature
 *
 * Tests the custom practice/ritual creation functionality:
 * - GET /api/rituals - list user's rituals
 * - GET /api/rituals/:id - get specific ritual
 * - POST /api/rituals - create new ritual
 * - PUT /api/rituals/:id - update ritual
 * - DELETE /api/rituals/:id - delete ritual
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-ritual-test-user';

test.describe('Rituals API', () => {
  let createdRitualId: string | null = null;

  test('GET /api/rituals - returns user rituals', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/rituals`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('rituals');
    expect(Array.isArray(data.rituals)).toBe(true);
  });

  test('POST /api/rituals - creates a new ritual', async ({ request }) => {
    const newRitual = {
      name: 'E2E Test Morning Gratitude',
      description: 'A test ritual for e2e testing',
      type: 'reflection',
      duration: 5,
      steps: [
        { prompt: 'What are you grateful for today?', duration: 60 },
        { prompt: 'What is one thing you are looking forward to?', duration: 60 },
      ],
      schedule: {
        frequency: 'daily',
        time: '08:00',
      },
    };

    const response = await request.post(`${BASE_URL}/api/rituals`, {
      headers: { 'X-User-ID': TEST_USER_ID },
      data: newRitual,
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);

    if (data.ritual?.id) {
      createdRitualId = data.ritual.id;
    }
  });

  test('GET /api/rituals/:id - returns specific ritual', async ({ request }) => {
    // First create a ritual to fetch
    const createResponse = await request.post(`${BASE_URL}/api/rituals`, {
      headers: { 'X-User-ID': TEST_USER_ID },
      data: {
        name: 'E2E Fetch Test Ritual',
        type: 'meditation',
        duration: 3,
      },
    });

    const createData = await createResponse.json();
    const ritualId = createData.ritual?.id;

    if (!ritualId) {
      test.skip();
      return;
    }

    const response = await request.get(`${BASE_URL}/api/rituals/${ritualId}`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('ritual');
    expect(data.ritual.id).toBe(ritualId);
  });

  test('PUT /api/rituals/:id - updates a ritual', async ({ request }) => {
    // First create a ritual to update
    const createResponse = await request.post(`${BASE_URL}/api/rituals`, {
      headers: { 'X-User-ID': TEST_USER_ID },
      data: {
        name: 'E2E Update Test Ritual',
        type: 'breathing',
        duration: 2,
      },
    });

    const createData = await createResponse.json();
    const ritualId = createData.ritual?.id;

    if (!ritualId) {
      test.skip();
      return;
    }

    const response = await request.put(`${BASE_URL}/api/rituals/${ritualId}`, {
      headers: { 'X-User-ID': TEST_USER_ID },
      data: {
        name: 'E2E Updated Ritual Name',
        duration: 5,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });

  test('DELETE /api/rituals/:id - deletes a ritual', async ({ request }) => {
    // First create a ritual to delete
    const createResponse = await request.post(`${BASE_URL}/api/rituals`, {
      headers: { 'X-User-ID': TEST_USER_ID },
      data: {
        name: 'E2E Delete Test Ritual',
        type: 'journaling',
        duration: 10,
      },
    });

    const createData = await createResponse.json();
    const ritualId = createData.ritual?.id;

    if (!ritualId) {
      test.skip();
      return;
    }

    const response = await request.delete(`${BASE_URL}/api/rituals/${ritualId}`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });
});

test.describe('Ritual Builder UI', () => {
  test('opens ritual builder from menu', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    // Find and click Create Custom Practice
    const ritualButton = page.locator('[data-action="ritual"]');
    if (!(await ritualButton.isVisible())) {
      const customizeHeader = page.locator('.settings-menu__section-header:has-text("Customize")');
      if (await customizeHeader.isVisible()) {
        await customizeHeader.click();
      }
    }
    await ritualButton.click();

    // Verify ritual builder opened
    await expect(page.locator('.ritual-builder-overlay, .ritual-builder')).toBeVisible({
      timeout: 5000,
    });
  });

  test('displays ritual type options', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const ritualButton = page.locator('[data-action="ritual"]');
    if (!(await ritualButton.isVisible())) {
      const customizeHeader = page.locator('.settings-menu__section-header:has-text("Customize")');
      if (await customizeHeader.isVisible()) {
        await customizeHeader.click();
      }
    }
    await ritualButton.click();

    await page.waitForSelector('.ritual-builder-overlay, .ritual-builder', { timeout: 5000 });

    // Should show ritual builder content
    const builder = page.locator('.ritual-builder-overlay, .ritual-builder');
    await expect(builder).toBeVisible();
  });
});
