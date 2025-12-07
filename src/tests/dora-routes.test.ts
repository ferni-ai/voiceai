/**
 * DORA Metrics Routes Tests
 *
 * Tests for DORA metrics API endpoints:
 * - Metrics retrieval
 * - Deployment tracking
 * - Incident management
 * - Webhook integrations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

// Mock auth middleware
vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(() => ({ userId: 'test-user', tier: 'friend' })),
  requireAdmin: vi.fn(() => ({ userId: 'admin-user', tier: 'admin' })),
  rateLimit: vi.fn(() => false),
}));

// Mock DORA metrics service
const mockDORAService = {
  getMetrics: vi.fn(),
  getDeployments: vi.fn(),
  recordDeployment: vi.fn(),
  markDeploymentFailed: vi.fn(),
  getIncidents: vi.fn(),
  getActiveIncidents: vi.fn(),
  recordIncident: vi.fn(),
  resolveIncident: vi.fn(),
  seedSampleData: vi.fn(),
  reset: vi.fn(),
};

vi.mock('../services/dora-metrics.js', () => ({
  getDORAMetricsService: vi.fn(() => mockDORAService),
}));

import { handleDORARoutes } from '../api/dora-routes.js';
import { requireAdmin } from '../api/auth-middleware.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
}): IncomingMessage {
  const { method = 'GET', url = '/', headers = {}, body = '' } = options;

  const req = {
    method,
    url,
    headers: { 'x-user-id': 'test-user', ...headers },
    on: vi.fn((event: string, callback: (chunk?: unknown) => void) => {
      if (event === 'data' && body) {
        setTimeout(() => callback(Buffer.from(body)), 0);
      }
      if (event === 'end') {
        setTimeout(() => callback(), 1);
      }
      return req;
    }),
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;

  return req;
}

function createMockResponse(): {
  res: ServerResponse;
  getWrittenData: () => { status?: number; headers?: Record<string, string>; body?: string };
} {
  let status: number | undefined;
  let headers: Record<string, string> = {};
  let body = '';

  const res = {
    writeHead: vi.fn((s: number, h?: Record<string, string>) => {
      status = s;
      if (h) headers = { ...headers, ...h };
      return res;
    }),
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    end: vi.fn((data?: string) => {
      if (data) body = data;
    }),
  } as unknown as ServerResponse;

  return {
    res,
    getWrittenData: () => ({ status, headers, body }),
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('DORA Metrics Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDORAService.getMetrics.mockReturnValue({
      deploymentFrequency: { value: 2.5, trend: 'up', unit: 'per day' },
      leadTime: { value: 45, trend: 'down', unit: 'minutes' },
      changeFailureRate: { value: 5, trend: 'stable', unit: 'percent' },
      mttr: { value: 30, trend: 'down', unit: 'minutes' },
    });
    mockDORAService.getDeployments.mockReturnValue([
      { id: 'dep-1', timestamp: '2024-03-15T10:00:00Z', success: true },
      { id: 'dep-2', timestamp: '2024-03-14T15:00:00Z', success: true },
    ]);
    mockDORAService.getIncidents.mockReturnValue([
      { id: 'inc-1', title: 'API Error', severity: 'major', resolvedAt: null },
    ]);
  });

  describe('Route Matching', () => {
    it('should not handle non-DORA routes', async () => {
      const req = createMockRequest({ url: '/api/other' });
      const { res } = createMockResponse();

      const handled = await handleDORARoutes(req, res);

      expect(handled).toBe(false);
    });

    it('should handle CORS preflight', async () => {
      const req = createMockRequest({ method: 'OPTIONS', url: '/api/dora/metrics' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleDORARoutes(req, res);

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(204);
    });
  });

  describe('GET /api/dora/metrics', () => {
    it('should return DORA metrics', async () => {
      const req = createMockRequest({ url: '/api/dora/metrics' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleDORARoutes(req, res);

      expect(handled).toBe(true);
      expect(mockDORAService.getMetrics).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.deploymentFrequency).toBeDefined();
      expect(data.leadTime).toBeDefined();
      expect(data.changeFailureRate).toBeDefined();
      expect(data.mttr).toBeDefined();
    });
  });

  describe('GET /api/dora/deployments', () => {
    it('should return deployments list', async () => {
      const req = createMockRequest({ url: '/api/dora/deployments' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleDORARoutes(req, res);

      expect(handled).toBe(true);
      expect(mockDORAService.getDeployments).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.deployments).toHaveLength(2);
    });

    it('should handle query parameters', async () => {
      const req = createMockRequest({ url: '/api/dora/deployments?limit=10' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleDORARoutes(req, res);

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(200);
    });
  });

  describe('POST /api/dora/deployments', () => {
    it('should record a deployment', async () => {
      mockDORAService.recordDeployment.mockReturnValue({
        id: 'dep-new',
        timestamp: '2024-03-15T12:00:00Z',
        commitSha: 'abc123',
        branch: 'main',
        environment: 'production',
        success: true,
      });

      const req = createMockRequest({
        method: 'POST',
        url: '/api/dora/deployments',
        body: JSON.stringify({
          timestamp: '2024-03-15T12:00:00Z',
          commitSha: 'abc123',
          branch: 'main',
          environment: 'production',
          success: true,
        }),
      });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleDORARoutes(req, res);

      expect(handled).toBe(true);
      expect(mockDORAService.recordDeployment).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(201);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
      expect(data.deployment.id).toBe('dep-new');
    });

    it('should require admin auth for POST', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/dora/deployments',
        body: JSON.stringify({
          timestamp: '2024-03-15T12:00:00Z',
          commitSha: 'abc123',
          branch: 'main',
          environment: 'production',
        }),
      });
      const { res } = createMockResponse();

      await handleDORARoutes(req, res);

      expect(requireAdmin).toHaveBeenCalled();
    });
  });

  describe('POST /api/dora/deployments/:id/fail', () => {
    it('should mark deployment as failed', async () => {
      mockDORAService.markDeploymentFailed.mockReturnValue({
        id: 'dep-1',
        success: false,
        failedAt: '2024-03-15T13:00:00Z',
      });

      const req = createMockRequest({
        method: 'POST',
        url: '/api/dora/deployments/dep-1/fail',
        body: JSON.stringify({ rollback: true }),
      });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleDORARoutes(req, res);

      expect(handled).toBe(true);
      expect(mockDORAService.markDeploymentFailed).toHaveBeenCalledWith('dep-1', true);
      expect(getWrittenData().status).toBe(200);
    });

    it('should return 404 for non-existent deployment', async () => {
      mockDORAService.markDeploymentFailed.mockReturnValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/dora/deployments/nonexistent/fail',
        body: '{}',
      });
      const { res, getWrittenData } = createMockResponse();

      await handleDORARoutes(req, res);

      expect(getWrittenData().status).toBe(404);
    });
  });

  describe('GET /api/dora/incidents', () => {
    it('should return all incidents', async () => {
      const req = createMockRequest({ url: '/api/dora/incidents' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleDORARoutes(req, res);

      expect(handled).toBe(true);
      expect(mockDORAService.getIncidents).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
    });

    it('should filter active incidents when requested', async () => {
      mockDORAService.getActiveIncidents.mockReturnValue([
        { id: 'inc-1', title: 'Active Issue', resolvedAt: null },
      ]);

      const req = createMockRequest({ url: '/api/dora/incidents?active=true' });
      const { res, getWrittenData } = createMockResponse();

      await handleDORARoutes(req, res);

      expect(mockDORAService.getActiveIncidents).toHaveBeenCalled();
      expect(mockDORAService.getIncidents).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/dora/incidents', () => {
    it('should record an incident', async () => {
      mockDORAService.recordIncident.mockReturnValue({
        id: 'inc-new',
        title: 'Database Connection Issue',
        severity: 'critical',
        startedAt: '2024-03-15T14:00:00Z',
      });

      const req = createMockRequest({
        method: 'POST',
        url: '/api/dora/incidents',
        body: JSON.stringify({
          title: 'Database Connection Issue',
          severity: 'critical',
          startedAt: '2024-03-15T14:00:00Z',
        }),
      });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleDORARoutes(req, res);

      expect(handled).toBe(true);
      expect(mockDORAService.recordIncident).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(201);
    });
  });

  describe('POST /api/dora/incidents/:id/resolve', () => {
    it('should resolve an incident', async () => {
      mockDORAService.resolveIncident.mockReturnValue({
        id: 'inc-1',
        resolvedAt: '2024-03-15T15:00:00Z',
        resolution: 'Restarted service',
      });

      const req = createMockRequest({
        method: 'POST',
        url: '/api/dora/incidents/inc-1/resolve',
        body: JSON.stringify({
          resolution: 'Restarted service',
          rootCause: 'Memory leak',
        }),
      });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleDORARoutes(req, res);

      expect(handled).toBe(true);
      expect(mockDORAService.resolveIncident).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
    });

    it('should return 404 for non-existent incident', async () => {
      mockDORAService.resolveIncident.mockReturnValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/dora/incidents/nonexistent/resolve',
        body: '{}',
      });
      const { res, getWrittenData } = createMockResponse();

      await handleDORARoutes(req, res);

      expect(getWrittenData().status).toBe(404);
    });
  });

  describe('Dev-only Endpoints', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    describe('POST /api/dora/seed', () => {
      it('should seed sample data in non-production', async () => {
        process.env.NODE_ENV = 'development';

        const req = createMockRequest({
          method: 'POST',
          url: '/api/dora/seed',
          body: '{}',
        });
        const { res, getWrittenData } = createMockResponse();

        await handleDORARoutes(req, res);

        expect(mockDORAService.seedSampleData).toHaveBeenCalled();
        expect(getWrittenData().status).toBe(200);
      });

      it('should reject in production', async () => {
        process.env.NODE_ENV = 'production';

        const req = createMockRequest({
          method: 'POST',
          url: '/api/dora/seed',
          body: '{}',
        });
        const { res, getWrittenData } = createMockResponse();

        await handleDORARoutes(req, res);

        expect(mockDORAService.seedSampleData).not.toHaveBeenCalled();
        expect(getWrittenData().status).toBe(403);
      });
    });

    describe('POST /api/dora/reset', () => {
      it('should reset data in non-production', async () => {
        process.env.NODE_ENV = 'development';

        const req = createMockRequest({
          method: 'POST',
          url: '/api/dora/reset',
          body: '{}',
        });
        const { res, getWrittenData } = createMockResponse();

        await handleDORARoutes(req, res);

        expect(mockDORAService.reset).toHaveBeenCalled();
        expect(getWrittenData().status).toBe(200);
      });

      it('should reject in production', async () => {
        process.env.NODE_ENV = 'production';

        const req = createMockRequest({
          method: 'POST',
          url: '/api/dora/reset',
          body: '{}',
        });
        const { res, getWrittenData } = createMockResponse();

        await handleDORARoutes(req, res);

        expect(mockDORAService.reset).not.toHaveBeenCalled();
        expect(getWrittenData().status).toBe(403);
      });
    });
  });

  describe('Webhook Endpoints', () => {
    describe('POST /api/dora/webhook/github', () => {
      it('should process deployment workflow completion', async () => {
        mockDORAService.recordDeployment.mockReturnValue({
          id: 'dep-gh',
          triggeredBy: 'github',
        });

        const req = createMockRequest({
          method: 'POST',
          url: '/api/dora/webhook/github',
          headers: { 'x-github-event': 'workflow_run' },
          body: JSON.stringify({
            action: 'completed',
            workflow_run: {
              id: 12345,
              name: 'Deploy to Production',
              head_sha: 'abc123',
              head_branch: 'main',
              conclusion: 'success',
              actor: { login: 'developer' },
              created_at: '2024-03-15T10:00:00Z',
              updated_at: '2024-03-15T10:05:00Z',
            },
          }),
        });
        const { res, getWrittenData } = createMockResponse();

        await handleDORARoutes(req, res);

        expect(mockDORAService.recordDeployment).toHaveBeenCalled();
        const data = JSON.parse(getWrittenData().body || '{}');
        expect(data.success).toBe(true);
      });

      it('should ignore non-deploy workflows', async () => {
        const req = createMockRequest({
          method: 'POST',
          url: '/api/dora/webhook/github',
          headers: { 'x-github-event': 'workflow_run' },
          body: JSON.stringify({
            action: 'completed',
            workflow_run: {
              id: 12345,
              name: 'Run Tests',
              conclusion: 'success',
            },
          }),
        });
        const { res, getWrittenData } = createMockResponse();

        await handleDORARoutes(req, res);

        expect(mockDORAService.recordDeployment).not.toHaveBeenCalled();
        const data = JSON.parse(getWrittenData().body || '{}');
        expect(data.message).toBe('Event ignored');
      });
    });

    describe('POST /api/dora/webhook/cloudbuild', () => {
      it('should process successful Cloud Build', async () => {
        mockDORAService.recordDeployment.mockReturnValue({
          id: 'dep-cb',
          triggeredBy: 'cloudbuild',
        });

        const req = createMockRequest({
          method: 'POST',
          url: '/api/dora/webhook/cloudbuild',
          body: JSON.stringify({
            id: 'build-123',
            status: 'SUCCESS',
            projectId: 'my-project',
            startTime: '2024-03-15T10:00:00Z',
            finishTime: '2024-03-15T10:10:00Z',
            substitutions: {
              COMMIT_SHA: 'def456',
              BRANCH_NAME: 'main',
              _ENVIRONMENT: 'production',
            },
          }),
        });
        const { res, getWrittenData } = createMockResponse();

        await handleDORARoutes(req, res);

        expect(mockDORAService.recordDeployment).toHaveBeenCalled();
        const data = JSON.parse(getWrittenData().body || '{}');
        expect(data.success).toBe(true);
      });

      it('should ignore in-progress builds', async () => {
        const req = createMockRequest({
          method: 'POST',
          url: '/api/dora/webhook/cloudbuild',
          body: JSON.stringify({
            id: 'build-123',
            status: 'WORKING',
          }),
        });
        const { res, getWrittenData } = createMockResponse();

        await handleDORARoutes(req, res);

        expect(mockDORAService.recordDeployment).not.toHaveBeenCalled();
        const data = JSON.parse(getWrittenData().body || '{}');
        expect(data.message).toBe('Build status ignored');
      });
    });
  });

  describe('Unknown Endpoints', () => {
    it('should return 404 for unknown DORA endpoints', async () => {
      const req = createMockRequest({ url: '/api/dora/unknown' });
      const { res, getWrittenData } = createMockResponse();

      await handleDORARoutes(req, res);

      expect(getWrittenData().status).toBe(404);
    });
  });
});
