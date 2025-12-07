/**
 * Handoff Diagnostics Routes Tests
 *
 * Tests for handoff diagnostics API endpoints:
 * - Get handoff metrics summary
 * - Get recent handoff traces
 * - Get handoff failures
 * - Get in-progress handoffs
 * - Get specific trace by ID
 * - Dashboard HTML endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

// Mock auth middleware
vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(() => ({ userId: 'admin-user', tier: 'admin' })),
  requireAdmin: vi.fn(() => ({ userId: 'admin-user', tier: 'admin' })),
  rateLimit: vi.fn(() => false),
}));

// Mock handoff metrics service - defined inside factory
vi.mock('../services/handoff-metrics.js', () => ({
  handoffMetrics: {
    getSummary: vi.fn(),
    getInProgressHandoffs: vi.fn(),
    getTrace: vi.fn(),
  },
}));

// Mock fs for dashboard
vi.mock('fs', () => ({
  readFileSync: vi.fn(
    () => '<html><head><title>Dashboard</title></head><body>Dashboard</body></html>'
  ),
}));

import {
  handleDiagnosticsRoutes,
  getDashboardHtml,
  clearDashboardCache,
} from '../api/handoff-diagnostics.js';
import { requireAuth } from '../api/auth-middleware.js';
import { handoffMetrics } from '../services/handoff-metrics.js';

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
    headers: { 'x-user-id': 'admin-user', host: 'localhost:3002', ...headers },
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

describe('Handoff Diagnostics Routes', () => {
  const sampleSummary = {
    totalAttempts: 100,
    totalSuccesses: 95,
    totalFailures: 5,
    successRate: 0.95,
    avgDuration: 250,
    recentFailures: [
      {
        traceId: 'trace-1',
        startTime: Date.now() - 60000,
        endTime: Date.now() - 59000,
        status: 'failed',
        error: 'Connection timeout',
      },
      {
        traceId: 'trace-2',
        startTime: Date.now() - 120000,
        endTime: Date.now() - 119000,
        status: 'failed',
        error: 'Authentication failed',
      },
    ],
    byFailureReason: {
      'Connection timeout': 3,
      'Authentication failed': 2,
    },
  };

  const sampleInProgress = [
    {
      traceId: 'in-progress-1',
      startTime: Date.now() - 5000,
      status: 'in_progress',
      fromPersona: 'ferni',
      toPersona: 'maya',
    },
  ];

  const sampleTrace = {
    traceId: 'trace-123',
    startTime: Date.now() - 60000,
    endTime: Date.now() - 59000,
    status: 'success',
    fromPersona: 'ferni',
    toPersona: 'maya',
    steps: [
      { name: 'validate', duration: 50 },
      { name: 'transfer', duration: 200 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(handoffMetrics.getSummary).mockReturnValue(sampleSummary);
    vi.mocked(handoffMetrics.getInProgressHandoffs).mockReturnValue(sampleInProgress);
    vi.mocked(handoffMetrics.getTrace).mockImplementation((id) =>
      id === 'trace-123' ? sampleTrace : null
    );
    clearDashboardCache();
  });

  describe('Route Matching', () => {
    it('should not handle non-diagnostics routes', async () => {
      const req = createMockRequest({ url: '/api/other' });
      const { res } = createMockResponse();
      const parsedUrl = new URL('/api/other', 'http://localhost:3002');

      const handled = await handleDiagnosticsRoutes(req, res, '/api/other', parsedUrl);

      expect(handled).toBe(false);
    });

    it('should require admin auth for all operations', async () => {
      const req = createMockRequest({ url: '/api/diagnostics/handoffs' });
      const { res } = createMockResponse();
      const parsedUrl = new URL('/api/diagnostics/handoffs', 'http://localhost:3002');

      await handleDiagnosticsRoutes(req, res, '/api/diagnostics/handoffs', parsedUrl);

      expect(requireAuth).toHaveBeenCalledWith(req, res, { requireAdmin: true });
    });
  });

  describe('GET /api/diagnostics/handoffs', () => {
    it('should return handoff metrics summary', async () => {
      const req = createMockRequest({ url: '/api/diagnostics/handoffs' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/diagnostics/handoffs', 'http://localhost:3002');

      const handled = await handleDiagnosticsRoutes(
        req,
        res,
        '/api/diagnostics/handoffs',
        parsedUrl
      );

      expect(handled).toBe(true);
      expect(handoffMetrics.getSummary).toHaveBeenCalledWith(60); // default window
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
      expect(data.data.totalAttempts).toBe(100);
      expect(data.data.successRate).toBe(0.95);
    });

    it('should accept custom window parameter', async () => {
      const req = createMockRequest({ url: '/api/diagnostics/handoffs?window=120' });
      const { res } = createMockResponse();
      const parsedUrl = new URL('/api/diagnostics/handoffs?window=120', 'http://localhost:3002');

      await handleDiagnosticsRoutes(req, res, '/api/diagnostics/handoffs', parsedUrl);

      expect(handoffMetrics.getSummary).toHaveBeenCalledWith(120);
    });

    it('should include meta information', async () => {
      const req = createMockRequest({ url: '/api/diagnostics/handoffs' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/diagnostics/handoffs', 'http://localhost:3002');

      await handleDiagnosticsRoutes(req, res, '/api/diagnostics/handoffs', parsedUrl);

      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.meta).toBeDefined();
      expect(data.meta.windowMinutes).toBe(60);
      expect(data.meta.generatedAt).toBeDefined();
    });
  });

  describe('GET /api/diagnostics/handoffs/recent', () => {
    it('should return recent handoff traces', async () => {
      const req = createMockRequest({ url: '/api/diagnostics/handoffs/recent' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/diagnostics/handoffs/recent', 'http://localhost:3002');

      const handled = await handleDiagnosticsRoutes(
        req,
        res,
        '/api/diagnostics/handoffs/recent',
        parsedUrl
      );

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
      expect(data.data.traces).toBeDefined();
      expect(data.data.total).toBe(100);
      expect(data.data.successRate).toBe(0.95);
    });

    it('should accept custom limit parameter', async () => {
      const req = createMockRequest({ url: '/api/diagnostics/handoffs/recent?limit=10' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL(
        '/api/diagnostics/handoffs/recent?limit=10',
        'http://localhost:3002'
      );

      await handleDiagnosticsRoutes(req, res, '/api/diagnostics/handoffs/recent', parsedUrl);

      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.meta.limit).toBe(10);
    });
  });

  describe('GET /api/diagnostics/handoffs/failures', () => {
    it('should return handoff failures', async () => {
      const req = createMockRequest({ url: '/api/diagnostics/handoffs/failures' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/diagnostics/handoffs/failures', 'http://localhost:3002');

      const handled = await handleDiagnosticsRoutes(
        req,
        res,
        '/api/diagnostics/handoffs/failures',
        parsedUrl
      );

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
      expect(data.data.failures).toBeDefined();
      expect(data.data.totalFailures).toBe(5);
      expect(data.data.failureRate).toBeCloseTo(0.05, 2); // 1 - 0.95
      expect(data.data.byReason).toBeDefined();
    });
  });

  describe('GET /api/diagnostics/handoffs/in-progress', () => {
    it('should return in-progress handoffs', async () => {
      const req = createMockRequest({ url: '/api/diagnostics/handoffs/in-progress' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/diagnostics/handoffs/in-progress', 'http://localhost:3002');

      const handled = await handleDiagnosticsRoutes(
        req,
        res,
        '/api/diagnostics/handoffs/in-progress',
        parsedUrl
      );

      expect(handled).toBe(true);
      expect(handoffMetrics.getInProgressHandoffs).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
      expect(data.data.inProgress).toHaveLength(1);
      expect(data.data.count).toBe(1);
    });
  });

  describe('GET /api/diagnostics/handoffs/:traceId', () => {
    it('should return specific handoff trace', async () => {
      const req = createMockRequest({ url: '/api/diagnostics/handoffs/trace-123' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/diagnostics/handoffs/trace-123', 'http://localhost:3002');

      const handled = await handleDiagnosticsRoutes(
        req,
        res,
        '/api/diagnostics/handoffs/trace-123',
        parsedUrl
      );

      expect(handled).toBe(true);
      expect(handoffMetrics.getTrace).toHaveBeenCalledWith('trace-123');
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
      expect(data.data.traceId).toBe('trace-123');
      expect(data.data.steps).toHaveLength(2);
    });

    it('should return 404 for non-existent trace', async () => {
      const req = createMockRequest({ url: '/api/diagnostics/handoffs/nonexistent' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/diagnostics/handoffs/nonexistent', 'http://localhost:3002');

      await handleDiagnosticsRoutes(req, res, '/api/diagnostics/handoffs/nonexistent', parsedUrl);

      expect(getWrittenData().status).toBe(404);
    });
  });

  describe('Dashboard HTML', () => {
    it('should return dashboard HTML', () => {
      const html = getDashboardHtml();
      expect(html).toContain('<html>');
      expect(html).toContain('Dashboard');
    });

    it('should cache dashboard HTML', () => {
      const html1 = getDashboardHtml();
      const html2 = getDashboardHtml();
      expect(html1).toBe(html2);
    });

    it('should clear dashboard cache', () => {
      getDashboardHtml(); // populate cache
      clearDashboardCache();
      // After clearing, next call should read from fs again
      const html = getDashboardHtml();
      expect(html).toContain('<html>');
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      vi.mocked(handoffMetrics.getSummary).mockImplementation(() => {
        throw new Error('Service unavailable');
      });

      const req = createMockRequest({ url: '/api/diagnostics/handoffs' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/diagnostics/handoffs', 'http://localhost:3002');

      await handleDiagnosticsRoutes(req, res, '/api/diagnostics/handoffs', parsedUrl);

      expect(getWrittenData().status).toBe(500);
    });
  });

  describe('Parameter Validation', () => {
    it('should enforce max limit of 200', async () => {
      const req = createMockRequest({ url: '/api/diagnostics/handoffs/recent?limit=500' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL(
        '/api/diagnostics/handoffs/recent?limit=500',
        'http://localhost:3002'
      );

      await handleDiagnosticsRoutes(req, res, '/api/diagnostics/handoffs/recent', parsedUrl);

      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.meta.limit).toBe(200); // capped at max
    });

    it('should enforce max window of 1440 minutes', async () => {
      const req = createMockRequest({ url: '/api/diagnostics/handoffs?window=5000' });
      const { res } = createMockResponse();
      const parsedUrl = new URL('/api/diagnostics/handoffs?window=5000', 'http://localhost:3002');

      await handleDiagnosticsRoutes(req, res, '/api/diagnostics/handoffs', parsedUrl);

      expect(handoffMetrics.getSummary).toHaveBeenCalledWith(1440); // capped at max
    });
  });
});
