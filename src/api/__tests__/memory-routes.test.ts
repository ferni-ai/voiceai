/**
 * Memory Routes API Tests
 *
 * Tests for the memory system API routes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

// Mock unified memory service
const mockUnifiedMemoryService = {
  recordFeedback: vi.fn(),
  reinforceMemory: vi.fn(),
  getHealth: vi.fn().mockResolvedValue({
    totalMemories: 100,
    recentMemories: 10,
    strongMemories: 50,
    emotionalMemories: 25,
    commitments: 5,
  }),
  runMaintenance: vi.fn().mockResolvedValue({ cleaned: 5 }),
  getLearningMetrics: vi.fn().mockResolvedValue({
    totalFeedback: 100,
    helpfulCount: 75,
    notHelpfulCount: 25,
  }),
  getSurfacingMetrics: vi.fn().mockResolvedValue({
    totalSurfaced: 200,
    avgConfidence: 0.85,
    timingBreakdown: { immediate: 100, nextPause: 50, sessionEnd: 50 },
  }),
  getGraphMetrics: vi.fn().mockResolvedValue({
    totalLinks: 500,
    linksByType: { topic: 200, entity: 150, emotion: 150 },
    avgLinksPerMemory: 5,
  }),
};

vi.mock('../../services/unified-memory-service.js', () => ({
  getUnifiedMemoryService: vi.fn(() => mockUnifiedMemoryService),
}));

// Mock auth middleware
vi.mock('../auth-middleware.js', () => ({
  optionalAuth: vi.fn((req) => {
    const userId = req.headers['x-user-id'];
    return userId ? { userId } : null;
  }),
  requireAuth: vi.fn(async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return { userId, isAdmin: req.headers['x-admin'] === 'true' };
  }),
}));

// Mock helpers
vi.mock('../helpers.js', async () => {
  const actual = await vi.importActual('../helpers.js');
  return {
    ...actual,
    handleCorsPreflightIfNeeded: vi.fn(() => false),
    parseBody: vi.fn().mockResolvedValue({}),
    sendJSON: vi.fn((res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }),
    sendJSONCached: vi.fn((res, data, maxAge = 300) => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': `max-age=${maxAge}`,
      });
      res.end(JSON.stringify(data));
    }),
    sendError: vi.fn((res, message, status = 500) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }),
  };
});

// Create mock request
function createMockRequest(options: {
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
  method?: string;
}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.headers = options.headers || {};
  req.url = options.url || '/';
  req.method = options.method || 'GET';
  return req;
}

// Create mock response
function createMockResponse(): ServerResponse & { _data: string; _statusCode: number } {
  const res = {
    _data: '',
    _statusCode: 200,
    writeHead: vi.fn(function (this: any, status: number) {
      this._statusCode = status;
    }),
    end: vi.fn(function (this: any, data?: string) {
      this._data = data || '';
    }),
    setHeader: vi.fn(),
  };
  return res as unknown as ServerResponse & { _data: string; _statusCode: number };
}

describe('Memory Routes API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/memory/feedback', () => {
    it('should record memory feedback', async () => {
      const { handleMemoryRoutes } = await import('../memory-routes.js');
      const { parseBody } = await import('../helpers.js');

      vi.mocked(parseBody).mockResolvedValue({
        memoryId: 'mem-123',
        userId: 'user-456',
        action: 'helpful',
      });

      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-user-id': 'user-456' },
      });
      const res = createMockResponse();

      const handled = await handleMemoryRoutes(req, res, '/api/memory/feedback');

      expect(handled).toBe(true);
      expect(mockUnifiedMemoryService.recordFeedback).toHaveBeenCalled();
    });

    it('should require memoryId and action', async () => {
      const { handleMemoryRoutes } = await import('../memory-routes.js');
      const { parseBody, sendError } = await import('../helpers.js');

      vi.mocked(parseBody).mockResolvedValue({});

      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-user-id': 'user-456' },
      });
      const res = createMockResponse();

      const handled = await handleMemoryRoutes(req, res, '/api/memory/feedback');

      expect(handled).toBe(true);
      expect(sendError).toHaveBeenCalledWith(res, expect.any(String), 400);
    });
  });

  describe('GET /api/memory/metrics', () => {
    it('should return memory metrics for authenticated users', async () => {
      const { handleMemoryRoutes } = await import('../memory-routes.js');
      const { sendJSONCached } = await import('../helpers.js');

      const req = createMockRequest({
        method: 'GET',
        headers: { 'x-user-id': 'user-456' },
      });
      const res = createMockResponse();

      const handled = await handleMemoryRoutes(req, res, '/api/memory/metrics');

      expect(handled).toBe(true);
      expect(sendJSONCached).toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const { handleMemoryRoutes } = await import('../memory-routes.js');

      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      const handled = await handleMemoryRoutes(req, res, '/api/memory/metrics');

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(401);
    });
  });

  describe('GET /api/memory/metrics/:userId', () => {
    it('should return user-specific metrics', async () => {
      const { handleMemoryRoutes } = await import('../memory-routes.js');
      const { sendJSON } = await import('../helpers.js');

      const req = createMockRequest({
        method: 'GET',
        headers: { 'x-user-id': 'user-456' },
      });
      const res = createMockResponse();

      const handled = await handleMemoryRoutes(req, res, '/api/memory/metrics/user-456');

      expect(handled).toBe(true);
      expect(mockUnifiedMemoryService.getHealth).toHaveBeenCalledWith('user-456');
    });

    it('should prevent access to other users metrics (non-admin)', async () => {
      const { handleMemoryRoutes } = await import('../memory-routes.js');
      const { sendError } = await import('../helpers.js');

      const req = createMockRequest({
        method: 'GET',
        headers: { 'x-user-id': 'user-456' },
      });
      const res = createMockResponse();

      const handled = await handleMemoryRoutes(req, res, '/api/memory/metrics/other-user');

      expect(handled).toBe(true);
      expect(sendError).toHaveBeenCalledWith(res, 'Forbidden', 403);
    });
  });

  describe('GET /api/memory/health', () => {
    it('should return health status', async () => {
      const { handleMemoryRoutes } = await import('../memory-routes.js');
      const { sendJSON } = await import('../helpers.js');

      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      const handled = await handleMemoryRoutes(req, res, '/api/memory/health');

      expect(handled).toBe(true);
      expect(sendJSON).toHaveBeenCalledWith(res, expect.objectContaining({
        status: expect.any(String),
        components: expect.any(Object),
      }));
    });
  });

  describe('POST /api/memory/maintenance', () => {
    it('should require admin access', async () => {
      const { handleMemoryRoutes } = await import('../memory-routes.js');
      const { sendError } = await import('../helpers.js');

      const req = createMockRequest({
        method: 'POST',
        headers: { 'x-user-id': 'user-456' },
      });
      const res = createMockResponse();

      const handled = await handleMemoryRoutes(req, res, '/api/memory/maintenance');

      expect(handled).toBe(true);
      expect(sendError).toHaveBeenCalledWith(res, 'Admin access required', 403);
    });
  });

  describe('Route matching', () => {
    it('should not handle unrelated routes', async () => {
      const { handleMemoryRoutes } = await import('../memory-routes.js');

      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      const handled = await handleMemoryRoutes(req, res, '/api/unrelated');

      expect(handled).toBe(false);
    });
  });
});
