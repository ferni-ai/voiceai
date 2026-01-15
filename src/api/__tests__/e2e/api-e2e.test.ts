/**
 * API End-to-End Tests
 *
 * Integration tests that validate complete user flows through the API.
 * These tests are designed to run against a staging environment with real
 * (or emulated) external services.
 *
 * Run with: pnpm vitest run --testPathPattern=e2e
 *
 * Prerequisites:
 * - FIRESTORE_EMULATOR_HOST=localhost:8080 (optional, uses emulator)
 * - Test user credentials
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Base URL for API requests - defaults to local dev server
const API_BASE_URL = process.env.E2E_API_URL || 'http://localhost:3002';
const TEST_USER_ID = process.env.E2E_TEST_USER_ID || 'e2e-test-user';
const ADMIN_KEY = process.env.E2E_ADMIN_KEY || 'dev-mode';

// Skip E2E tests unless explicitly enabled
const SKIP_E2E = !process.env.RUN_E2E_TESTS;

// Helper to make authenticated requests
async function apiRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_BASE_URL}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': TEST_USER_ID,
      ...options.headers,
    },
  });
}

// Helper to make admin requests
async function adminRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  return apiRequest(path, {
    ...options,
    headers: {
      'x-admin-key': ADMIN_KEY,
      ...options.headers,
    },
  });
}

describe.skipIf(SKIP_E2E)('API E2E Tests', () => {
  describe('Health Checks', () => {
    it('GET /health returns healthy status', async () => {
      const res = await fetch(`${API_BASE_URL}/health`);
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data.status).toBe('ok');
    });

    it('GET /api/memory/health returns memory system status', async () => {
      const res = await apiRequest('/api/memory/health');
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data.status).toMatch(/healthy|degraded|unhealthy/);
    });
  });

  describe('Custom Agent Flow', () => {
    let testAgentId: string;

    it('POST /api/custom-agents creates a new agent', async () => {
      const res = await apiRequest('/api/custom-agents', {
        method: 'POST',
        body: JSON.stringify({
          name: 'e2e-test-agent',
          description: 'E2E test agent for validation',
          type: 'fictional',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBeDefined();
      testAgentId = data.id;
    });

    it('GET /api/custom-agents lists agents', async () => {
      const res = await apiRequest('/api/custom-agents');
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/custom-agents/:id returns agent details', async () => {
      if (!testAgentId) {
        console.log('Skipping - no test agent created');
        return;
      }

      const res = await apiRequest(`/api/custom-agents/${testAgentId}`);
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data.id).toBe(testAgentId);
    });

    it('DELETE /api/custom-agents/:id removes agent', async () => {
      if (!testAgentId) {
        console.log('Skipping - no test agent created');
        return;
      }

      const res = await apiRequest(`/api/custom-agents/${testAgentId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(204);
    });
  });

  describe('Conversation Threads Flow', () => {
    let testThreadId: string;

    it('POST /api/conversations/threads creates a thread', async () => {
      const res = await apiRequest(`/api/conversations/threads?userId=${TEST_USER_ID}`, {
        method: 'POST',
        body: JSON.stringify({
          topic: 'E2E Test Topic',
          lastMessage: 'Testing thread creation',
          personaId: 'ferni',
        }),
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.thread.id).toBeDefined();
      testThreadId = data.thread.id;
    });

    it('GET /api/conversations/threads returns threads', async () => {
      const res = await apiRequest(`/api/conversations/threads?userId=${TEST_USER_ID}`);
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.threads)).toBe(true);
    });

    it('PATCH /api/conversations/threads/:id updates thread', async () => {
      if (!testThreadId) {
        console.log('Skipping - no test thread created');
        return;
      }

      const res = await apiRequest(
        `/api/conversations/threads/${testThreadId}?userId=${TEST_USER_ID}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'resolved' }),
        }
      );

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.thread.status).toBe('resolved');
    });
  });

  describe('Share Invite Flow', () => {
    it('POST /api/custom-agent-features/share/invite creates invite', async () => {
      const res = await apiRequest('/api/custom-agent-features/share/invite', {
        method: 'POST',
        body: JSON.stringify({
          agentId: 'e2e-test-agent',
          email: 'test@example.com',
          role: 'viewer',
          agentName: 'Test Agent',
          ownerName: 'E2E Tester',
        }),
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.invite.id).toBeDefined();
    });

    it('POST /api/custom-agent-features/share/link creates shareable link', async () => {
      const res = await apiRequest('/api/custom-agent-features/share/link', {
        method: 'POST',
        body: JSON.stringify({
          agentId: 'e2e-test-agent',
          role: 'viewer',
        }),
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.link.url).toContain('shared/');
    });
  });

  describe('Memory Metrics Flow', () => {
    it('POST /api/memory/feedback records feedback', async () => {
      const res = await apiRequest('/api/memory/feedback', {
        method: 'POST',
        body: JSON.stringify({
          memoryId: 'e2e-test-memory',
          userId: TEST_USER_ID,
          action: 'helpful',
        }),
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('GET /api/memory/metrics returns metrics', async () => {
      const res = await apiRequest('/api/memory/metrics');
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data.learningMetrics).toBeDefined();
      expect(data.surfacingMetrics).toBeDefined();
      expect(data.healthStatus).toBeDefined();
    });
  });

  describe('Garden/Founders Flow', () => {
    it('GET /api/garden/status returns garden status', async () => {
      const res = await fetch(`${API_BASE_URL}/api/garden/status`);
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data.monthlyGoal).toBeDefined();
      expect(data.health).toBeDefined();
    });

    it('GET /api/garden/founder-stats returns stats', async () => {
      const res = await apiRequest('/api/garden/founder-stats');
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data.totalFounders).toBeDefined();
    });

    it('GET /api/garden/founders-wall returns founders list', async () => {
      const res = await apiRequest('/api/garden/founders-wall');
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('Admin Operations', () => {
    it('POST /api/garden/admin/seed seeds data (admin only)', async () => {
      const res = await adminRequest('/api/garden/admin/seed', {
        method: 'POST',
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.success).toBeDefined();
    });

    it('GET /api/admin/marketplace/queue returns review queue', async () => {
      const res = await adminRequest('/api/admin/marketplace/queue', {
        headers: {
          'x-admin-id': 'e2e-admin',
          'x-admin-name': 'E2E Admin',
        },
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.queue).toBeDefined();
    });
  });
});

describe.skipIf(SKIP_E2E)('API Error Handling', () => {
  it('returns 401 for unauthenticated requests to protected routes', async () => {
    const res = await fetch(`${API_BASE_URL}/api/memory/metrics`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent resources', async () => {
    const res = await apiRequest('/api/custom-agents/non-existent-id');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid request bodies', async () => {
    const res = await apiRequest('/api/conversations/threads?userId=test', {
      method: 'POST',
      body: JSON.stringify({}), // Missing required fields
    });
    expect(res.status).toBe(400);
  });
});
