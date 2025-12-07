/**
 * Observability Routes Tests
 *
 * Tests for observability API endpoints:
 * - Full observability snapshot
 * - LLM health metrics
 * - Connection health metrics
 * - UX quality metrics
 * - Memory/RAG metrics
 * - Cost tracking
 * - Error & recovery metrics
 * - Persona health metrics
 * - Alerts
 * - Clear metrics
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

// Mock auth middleware
vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(() => ({ userId: 'test-user', tier: 'friend' })),
  requireAdmin: vi.fn(() => ({ userId: 'admin-user', tier: 'admin' })),
  rateLimit: vi.fn(() => false),
}));

// Mock observability services - all mocks defined inside factory
vi.mock('../services/observability/index.js', () => ({
  observabilityHub: {
    getSnapshot: vi.fn(),
    getRecentAlerts: vi.fn(),
    clearAlerts: vi.fn(),
  },
  llmHealthMetrics: {
    getSnapshot: vi.fn(),
  },
  connectionHealthMetrics: {
    getSnapshot: vi.fn(),
  },
  uxQualityMetrics: {
    getSnapshot: vi.fn(),
  },
  memoryMetrics: {
    getSnapshot: vi.fn(),
  },
  costMetrics: {
    getSnapshot: vi.fn(),
  },
  errorMetrics: {
    getSnapshot: vi.fn(),
  },
  personaMetrics: {
    getSnapshot: vi.fn(),
  },
}));

import { handleObservabilityRoutes } from '../api/observability-routes.js';
import { requireAuth, requireAdmin } from '../api/auth-middleware.js';
import {
  observabilityHub,
  llmHealthMetrics,
  connectionHealthMetrics,
  uxQualityMetrics,
  memoryMetrics,
  costMetrics,
  errorMetrics,
  personaMetrics,
} from '../services/observability/index.js';

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
    headers: { 'x-user-id': 'test-user', host: 'localhost:3002', ...headers },
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

describe('Observability Routes', () => {
  const sampleSnapshot = {
    timestamp: '2024-03-15T10:00:00Z',
    llm: { avgLatency: 150, errorRate: 0.01 },
    connection: { activeConnections: 10, reconnections: 2 },
    ux: { avgResponseTime: 200, satisfactionScore: 0.85 },
    memory: { hitRate: 0.75, avgQueryTime: 50 },
    cost: { totalCost: 15.5, costPerRequest: 0.001 },
    errors: { totalErrors: 5, recoveryRate: 0.8 },
    personas: { activePersonas: 3, avgSwitchTime: 100 },
  };

  const sampleAlerts = [
    {
      id: 'alert-1',
      type: 'warning',
      message: 'High latency detected',
      timestamp: '2024-03-15T10:00:00Z',
    },
    {
      id: 'alert-2',
      type: 'error',
      message: 'LLM provider error',
      timestamp: '2024-03-15T09:55:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(observabilityHub.getSnapshot).mockReturnValue(sampleSnapshot);
    vi.mocked(observabilityHub.getRecentAlerts).mockReturnValue(sampleAlerts);
    vi.mocked(llmHealthMetrics.getSnapshot).mockReturnValue({ avgLatency: 150, errorRate: 0.01 });
    vi.mocked(connectionHealthMetrics.getSnapshot).mockReturnValue({
      activeConnections: 10,
      reconnections: 2,
    });
    vi.mocked(uxQualityMetrics.getSnapshot).mockReturnValue({
      avgResponseTime: 200,
      satisfactionScore: 0.85,
    });
    vi.mocked(memoryMetrics.getSnapshot).mockReturnValue({ hitRate: 0.75, avgQueryTime: 50 });
    vi.mocked(costMetrics.getSnapshot).mockReturnValue({ totalCost: 15.5, costPerRequest: 0.001 });
    vi.mocked(errorMetrics.getSnapshot).mockReturnValue({ totalErrors: 5, recoveryRate: 0.8 });
    vi.mocked(personaMetrics.getSnapshot).mockReturnValue({
      activePersonas: 3,
      avgSwitchTime: 100,
    });
  });

  describe('Route Matching', () => {
    it('should not handle non-observability routes', async () => {
      const req = createMockRequest({ url: '/api/other' });
      const { res } = createMockResponse();

      const handled = await handleObservabilityRoutes(req, res, '/api/other');

      expect(handled).toBe(false);
    });

    it('should handle CORS preflight', async () => {
      const req = createMockRequest({ method: 'OPTIONS', url: '/api/observability' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleObservabilityRoutes(req, res, '/api/observability');

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(204);
    });

    it('should require auth for read operations', async () => {
      const req = createMockRequest({ url: '/api/observability' });
      const { res } = createMockResponse();

      await handleObservabilityRoutes(req, res, '/api/observability');

      expect(requireAuth).toHaveBeenCalled();
    });
  });

  describe('GET /api/observability', () => {
    it('should return full observability snapshot', async () => {
      const req = createMockRequest({ url: '/api/observability' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleObservabilityRoutes(req, res, '/api/observability');

      expect(handled).toBe(true);
      expect(observabilityHub.getSnapshot).toHaveBeenCalledWith(60); // default window
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.llm).toBeDefined();
      expect(data.connection).toBeDefined();
    });

    it('should accept custom window parameter', async () => {
      const req = createMockRequest({ url: '/api/observability?window=120' });
      const { res } = createMockResponse();

      await handleObservabilityRoutes(req, res, '/api/observability');

      expect(observabilityHub.getSnapshot).toHaveBeenCalledWith(120);
    });
  });

  describe('GET /api/observability/llm', () => {
    it('should return LLM health metrics', async () => {
      const req = createMockRequest({ url: '/api/observability/llm' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleObservabilityRoutes(req, res, '/api/observability/llm');

      expect(handled).toBe(true);
      expect(llmHealthMetrics.getSnapshot).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.avgLatency).toBe(150);
    });
  });

  describe('GET /api/observability/connection', () => {
    it('should return connection health metrics', async () => {
      const req = createMockRequest({ url: '/api/observability/connection' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleObservabilityRoutes(req, res, '/api/observability/connection');

      expect(handled).toBe(true);
      expect(connectionHealthMetrics.getSnapshot).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.activeConnections).toBe(10);
    });
  });

  describe('GET /api/observability/ux', () => {
    it('should return UX quality metrics', async () => {
      const req = createMockRequest({ url: '/api/observability/ux' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleObservabilityRoutes(req, res, '/api/observability/ux');

      expect(handled).toBe(true);
      expect(uxQualityMetrics.getSnapshot).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.satisfactionScore).toBe(0.85);
    });
  });

  describe('GET /api/observability/memory', () => {
    it('should return memory/RAG metrics', async () => {
      const req = createMockRequest({ url: '/api/observability/memory' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleObservabilityRoutes(req, res, '/api/observability/memory');

      expect(handled).toBe(true);
      expect(memoryMetrics.getSnapshot).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.hitRate).toBe(0.75);
    });
  });

  describe('GET /api/observability/cost', () => {
    it('should return cost tracking metrics', async () => {
      const req = createMockRequest({ url: '/api/observability/cost' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleObservabilityRoutes(req, res, '/api/observability/cost');

      expect(handled).toBe(true);
      expect(costMetrics.getSnapshot).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.totalCost).toBe(15.5);
    });
  });

  describe('GET /api/observability/errors', () => {
    it('should return error & recovery metrics', async () => {
      const req = createMockRequest({ url: '/api/observability/errors' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleObservabilityRoutes(req, res, '/api/observability/errors');

      expect(handled).toBe(true);
      expect(errorMetrics.getSnapshot).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.recoveryRate).toBe(0.8);
    });
  });

  describe('GET /api/observability/personas', () => {
    it('should return persona health metrics', async () => {
      const req = createMockRequest({ url: '/api/observability/personas' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleObservabilityRoutes(req, res, '/api/observability/personas');

      expect(handled).toBe(true);
      expect(personaMetrics.getSnapshot).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.activePersonas).toBe(3);
    });
  });

  describe('GET /api/observability/alerts', () => {
    it('should return recent alerts', async () => {
      const req = createMockRequest({ url: '/api/observability/alerts' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleObservabilityRoutes(req, res, '/api/observability/alerts');

      expect(handled).toBe(true);
      expect(observabilityHub.getRecentAlerts).toHaveBeenCalledWith(50); // default limit
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.alerts).toHaveLength(2);
      expect(data.count).toBe(2);
    });

    it('should accept custom limit parameter', async () => {
      const req = createMockRequest({ url: '/api/observability/alerts?limit=10' });
      const { res } = createMockResponse();

      await handleObservabilityRoutes(req, res, '/api/observability/alerts');

      expect(observabilityHub.getRecentAlerts).toHaveBeenCalledWith(10);
    });
  });

  describe('POST /api/observability/clear', () => {
    it('should clear all metrics', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/observability/clear',
      });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleObservabilityRoutes(req, res, '/api/observability/clear');

      expect(handled).toBe(true);
      expect(requireAdmin).toHaveBeenCalled();
      expect(observabilityHub.clearAlerts).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.message).toContain('cleared');
    });
  });

  describe('Unknown Endpoints', () => {
    it('should return 404 for unknown observability endpoints', async () => {
      const req = createMockRequest({ url: '/api/observability/unknown' });
      const { res, getWrittenData } = createMockResponse();

      await handleObservabilityRoutes(req, res, '/api/observability/unknown');

      expect(getWrittenData().status).toBe(404);
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      vi.mocked(observabilityHub.getSnapshot).mockImplementation(() => {
        throw new Error('Service unavailable');
      });

      const req = createMockRequest({ url: '/api/observability' });
      const { res, getWrittenData } = createMockResponse();

      await handleObservabilityRoutes(req, res, '/api/observability');

      expect(getWrittenData().status).toBe(500);
    });
  });
});
