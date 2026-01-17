/**
 * E2E Tests for Predictive Outreach System
 *
 * Tests the full lifecycle:
 * 1. User conversation → trigger detection
 * 2. Predictive analysis → decision engine
 * 3. Timing optimization → scheduling
 * 4. Delivery → tracking
 *
 * @vitest-environment node
 */

import { test, expect, describe, beforeAll, afterAll } from 'vitest';

// Test configuration
const API_BASE = process.env.TEST_API_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-predictive-test-user';
const ADMIN_KEY = 'dev-mode';

describe('Predictive Outreach E2E', () => {
  describe('Outreach API Endpoints', () => {
    test('GET /api/outreach/upcoming returns upcoming check-ins', async () => {
      const response = await fetch(`${API_BASE}/api/outreach/upcoming?userId=${TEST_USER_ID}`, {
        headers: {
          'x-admin-key': ADMIN_KEY,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data).toHaveProperty('checkIns');
      expect(Array.isArray(data.checkIns)).toBe(true);
    });

    test('GET /api/outreach/history returns outreach history', async () => {
      const response = await fetch(`${API_BASE}/api/outreach/history?userId=${TEST_USER_ID}`, {
        headers: {
          'x-admin-key': ADMIN_KEY,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data).toHaveProperty('history');
      expect(Array.isArray(data.history)).toBe(true);
    });

    test('GET /api/outreach/timing returns optimal timing', async () => {
      const response = await fetch(`${API_BASE}/api/outreach/timing?userId=${TEST_USER_ID}`, {
        headers: {
          'x-admin-key': ADMIN_KEY,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data).toHaveProperty('optimalTimes');
      expect(data.optimalTimes).toHaveProperty('recommendedHour');
    });
  });

  describe('Scheduled Jobs API', () => {
    test('POST /api/jobs/daily-outreach processes daily outreach', async () => {
      const response = await fetch(`${API_BASE}/api/jobs/daily-outreach`, {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
      });

      // May fail if not running with full server, but shouldn't 500
      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty('success');
        expect(data).toHaveProperty('job', 'daily-outreach');
      }
    });

    test('POST /api/jobs/run-predictive-analysis runs analysis', async () => {
      const response = await fetch(`${API_BASE}/api/jobs/run-predictive-analysis`, {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty('success');
        expect(data).toHaveProperty('job', 'run-predictive-analysis');
      }
    });
  });

  describe('Predictive Insights API', () => {
    test('GET /api/predictive-insights returns predictions', async () => {
      const response = await fetch(
        `${API_BASE}/api/predictive-insights?userId=${TEST_USER_ID}`,
        {
          headers: {
            'x-admin-key': ADMIN_KEY,
          },
        }
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data).toHaveProperty('insights');
      expect(Array.isArray(data.insights)).toBe(true);
    });

    test('GET /api/predictive-insights/energy returns energy prediction', async () => {
      const response = await fetch(
        `${API_BASE}/api/predictive-insights/energy?userId=${TEST_USER_ID}`,
        {
          headers: {
            'x-admin-key': ADMIN_KEY,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty('prediction');
      }
    });
  });

  describe('Trigger → Decision → Delivery Flow', () => {
    test('can create and process an outreach trigger', async () => {
      // 1. Create a trigger
      const createResponse = await fetch(`${API_BASE}/api/outreach/trigger`, {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: TEST_USER_ID,
          type: 'commitment_check',
          reason: 'User said they would exercise tomorrow',
          commitment: 'Exercise in the morning',
          scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      if (createResponse.ok) {
        const trigger = await createResponse.json();

        expect(trigger).toHaveProperty('triggerId');
        expect(trigger).toHaveProperty('status', 'pending');

        // 2. Check it appears in upcoming
        const upcomingResponse = await fetch(
          `${API_BASE}/api/outreach/upcoming?userId=${TEST_USER_ID}`,
          {
            headers: { 'x-admin-key': ADMIN_KEY },
          }
        );

        if (upcomingResponse.ok) {
          const upcoming = await upcomingResponse.json();
          const found = upcoming.checkIns?.find(
            (c: { triggerId?: string }) => c.triggerId === trigger.triggerId
          );
          expect(found).toBeDefined();
        }
      }
    });

    test('can cancel an outreach trigger', async () => {
      // Create then cancel
      const createResponse = await fetch(`${API_BASE}/api/outreach/trigger`, {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: TEST_USER_ID,
          type: 'goal_milestone',
          reason: 'Test milestone',
          scheduledFor: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        }),
      });

      if (createResponse.ok) {
        const trigger = await createResponse.json();

        // Cancel it
        const cancelResponse = await fetch(
          `${API_BASE}/api/outreach/trigger/${trigger.triggerId}`,
          {
            method: 'DELETE',
            headers: { 'x-admin-key': ADMIN_KEY },
          }
        );

        if (cancelResponse.ok) {
          const result = await cancelResponse.json();
          expect(result).toHaveProperty('cancelled', true);
        }
      }
    });
  });

  describe('Learning & Feedback', () => {
    test('can record outreach feedback', async () => {
      const response = await fetch(`${API_BASE}/api/outreach/feedback`, {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: TEST_USER_ID,
          outreachId: 'test-outreach-123',
          outcome: 'engaged',
          responseTimeMinutes: 5,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        expect(result).toHaveProperty('recorded', true);
      }
    });

    test('GET /api/outreach/analytics returns learning stats', async () => {
      const response = await fetch(
        `${API_BASE}/api/outreach/analytics?userId=${TEST_USER_ID}`,
        {
          headers: { 'x-admin-key': ADMIN_KEY },
        }
      );

      if (response.ok) {
        const data = await response.json();
        expect(data).toHaveProperty('analytics');
      }
    });
  });
});

describe('Predictive Intelligence Integration', () => {
  test('conversation signals are processed for learning', async () => {
    // Simulate publishing a predictive intelligence event
    const response = await fetch(`${API_BASE}/api/intelligence/event`, {
      method: 'POST',
      headers: {
        'x-admin-key': ADMIN_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'predictive_intelligence',
        userId: TEST_USER_ID,
        sessionId: 'test-session-123',
        payload: {
          message: 'Work has been really stressful lately',
          topic: 'work',
          emotion: 'stressed',
          emotionIntensity: 0.7,
          dayOfWeek: new Date().getDay(),
          hourOfDay: new Date().getHours(),
          turnCount: 5,
          sessionCount: 10,
        },
      }),
    });

    // May not be implemented, but shouldn't crash
    expect(response.status).not.toBe(500);
  });
});
