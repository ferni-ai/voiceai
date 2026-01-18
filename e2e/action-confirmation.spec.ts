/**
 * Action Confirmation UI E2E Tests
 * Playwright tests for the action confirmation component.
 * Run: pnpm playwright test e2e/action-confirmation.spec.ts
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3004';
const TEST_USER_ID = process.env.TEST_USER_ID || 'test_user_e2e';
const TEST_HEADERS = { 'X-Test-User-Id': TEST_USER_ID, 'Content-Type': 'application/json' };

test.describe('Action Confirmation UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}?userId=${TEST_USER_ID}`);
    await page.waitForLoadState('networkidle');
  });

  test.describe('API Endpoints', () => {
    test('GET /api/actions/pending should return pending actions', async ({ page }) => {
      const response = await page.request.get(`${BASE_URL}/api/actions/pending?userId=${TEST_USER_ID}`, { headers: TEST_HEADERS });
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.actions)).toBe(true);
    });

    test('GET /api/actions/trust-profiles should return trust profiles', async ({ page }) => {
      const response = await page.request.get(`${BASE_URL}/api/actions/trust-profiles?userId=${TEST_USER_ID}`, { headers: TEST_HEADERS });
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.profiles)).toBe(true);
    });

    test('GET /api/actions/types should return action types', async ({ page }) => {
      const response = await page.request.get(`${BASE_URL}/api/actions/types`, { headers: TEST_HEADERS });
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.types).toBeDefined();
      expect(body.types.send_sms).toBeDefined();
      expect(body.types.send_email).toBeDefined();
    });

    test('POST /api/actions/check should validate action request', async ({ page }) => {
      const response = await page.request.post(`${BASE_URL}/api/actions/check`, {
        headers: TEST_HEADERS,
        data: {
          userId: TEST_USER_ID,
          actionType: 'send_sms',
          preview: { title: 'Test SMS', summary: 'Testing', details: [], canUndo: false },
        },
      });
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('requiresApproval');
    });

    test('POST /api/actions/check should reject unknown action type', async ({ page }) => {
      const response = await page.request.post(`${BASE_URL}/api/actions/check`, {
        headers: TEST_HEADERS,
        data: {
          userId: TEST_USER_ID,
          actionType: 'unknown_action_type',
          preview: { title: 'Unknown', summary: 'Should fail', details: [], canUndo: false },
        },
      });
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Unknown action type');
    });
  });

  test.describe('Action Types', () => {
    test('should have messaging actions', async ({ page }) => {
      const response = await page.request.get(`${BASE_URL}/api/actions/types`, { headers: TEST_HEADERS });
      const body = await response.json();
      expect(body.types.send_sms.category).toBe('messaging');
      expect(body.types.send_email.category).toBe('messaging');
    });

    test('should have payment actions with NEW max trust', async ({ page }) => {
      const response = await page.request.get(`${BASE_URL}/api/actions/types`, { headers: TEST_HEADERS });
      const body = await response.json();
      expect(body.types.send_payment.maxTrustLevel).toBe('NEW');
      expect(body.types.send_payment.requiresConfirmation).toBe(true);
    });
  });

  test.describe('Action Approval Flow', () => {
    test('should require approval for new user', async ({ page }) => {
      const uniqueUserId = `${TEST_USER_ID}_${Date.now()}`;
      const response = await page.request.post(`${BASE_URL}/api/actions/check`, {
        headers: TEST_HEADERS,
        data: {
          userId: uniqueUserId,
          actionType: 'send_sms',
          preview: { title: 'Test', summary: 'Approval check', details: [], canUndo: false },
        },
      });
      const body = await response.json();
      expect(body.requiresApproval).toBe(true);
    });
  });
});
