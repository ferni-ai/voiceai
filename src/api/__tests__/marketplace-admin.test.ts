/**
 * Marketplace Admin API Tests
 *
 * Tests for admin API endpoints:
 * - Review queue management
 * - Item approval/rejection
 * - Review moderation
 * - Stats aggregation
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// Mock marketplace modules
vi.mock('../../marketplace/index.js', () => ({
  getTool: vi.fn(),
  getAgent: vi.fn(),
  listTools: vi.fn(() => []),
  listAgents: vi.fn(() => []),
}));

vi.mock('../../marketplace/reviews/index.js', () => ({
  getPendingReviews: vi.fn(() => []),
  moderateReview: vi.fn(),
  getReviewStats: vi.fn(() => ({
    totalReviews: 0,
    averageRating: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  })),
}));

import { getAgent, getTool, listAgents, listTools } from '../../marketplace/index.js';
import { moderateReview } from '../../marketplace/reviews/index.js';
import { handleMarketplaceAdminRoutes } from '../routes/marketplace-admin.js';

// Helper to create mock request
function createMockRequest(
  method: string,
  pathname: string,
  body?: unknown,
  headers: Record<string, string> = {}
): IncomingMessage {
  const req = {
    method,
    url: pathname,
    headers: {
      host: 'localhost',
      ...headers,
    },
    on: vi.fn((event, callback) => {
      if (event === 'data' && body) {
        callback(Buffer.from(JSON.stringify(body)));
      }
      if (event === 'end') {
        callback();
      }
      return req;
    }),
  } as unknown as IncomingMessage;
  return req;
}

// Helper to create mock response
function createMockResponse(): ServerResponse & { _data: string; _statusCode: number } {
  let data = '';
  let statusCode = 200;

  const res = {
    writeHead: vi.fn((code: number) => {
      statusCode = code;
    }),
    end: vi.fn((chunk?: string) => {
      if (chunk) data = chunk;
    }),
    get _data() {
      return data;
    },
    get _statusCode() {
      return statusCode;
    },
  } as unknown as ServerResponse & { _data: string; _statusCode: number };

  return res;
}

describe('Marketplace Admin API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should reject requests without admin headers', async () => {
      const req = createMockRequest('GET', '/api/admin/marketplace/queue');
      const res = createMockResponse();

      const handled = await handleMarketplaceAdminRoutes(req, res, '/api/admin/marketplace/queue');

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(401);
      expect(JSON.parse(res._data).error).toMatch(/admin.*required/i);
    });

    it('should accept requests with valid admin headers', async () => {
      vi.mocked(listTools).mockReturnValue([]);
      vi.mocked(listAgents).mockReturnValue([]);

      const req = createMockRequest('GET', '/api/admin/marketplace/queue', undefined, {
        'x-admin-id': 'admin-123',
        'x-admin-role': 'admin',
      });
      const res = createMockResponse();

      const handled = await handleMarketplaceAdminRoutes(req, res, '/api/admin/marketplace/queue');

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
    });
  });

  describe('GET /api/admin/marketplace/queue', () => {
    it('should return empty queue when no pending items', async () => {
      vi.mocked(listTools).mockReturnValue([]);
      vi.mocked(listAgents).mockReturnValue([]);

      const req = createMockRequest('GET', '/api/admin/marketplace/queue', undefined, {
        'x-admin-id': 'admin-123',
        'x-admin-role': 'admin',
      });
      const res = createMockResponse();

      await handleMarketplaceAdminRoutes(req, res, '/api/admin/marketplace/queue');

      const data = JSON.parse(res._data);
      expect(data.queue).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('should return pending tools and agents', async () => {
      const mockTool = {
        id: 'tool-1',
        name: 'Pending Tool',
        version: '1.0.0',
        publisher: { id: 'pub-1', name: 'Test Publisher', verified: false },
        description: { short: 'A test tool', long: 'A longer description' },
        metadata: { category: 'test', tags: ['test'] },
        verification: { verified: false, trustLevel: 'community' },
      };

      vi.mocked(listTools).mockReturnValue([mockTool as never]);
      vi.mocked(listAgents).mockReturnValue([]);

      const req = createMockRequest('GET', '/api/admin/marketplace/queue', undefined, {
        'x-admin-id': 'admin-123',
        'x-admin-role': 'admin',
      });
      const res = createMockResponse();

      await handleMarketplaceAdminRoutes(req, res, '/api/admin/marketplace/queue');

      const data = JSON.parse(res._data);
      expect(data.queue).toHaveLength(1);
      expect(data.queue[0].id).toBe('tool-1');
      expect(data.queue[0].type).toBe('tool');
    });
  });

  describe('POST /api/admin/marketplace/item/:id/approve', () => {
    it('should approve a pending tool', async () => {
      const mockTool = {
        id: 'tool-1',
        name: 'Test Tool',
        verification: { verified: false, trustLevel: 'community' },
      };

      vi.mocked(getTool).mockReturnValue(mockTool as never);
      vi.mocked(getAgent).mockReturnValue(null as never);

      const req = createMockRequest(
        'POST',
        '/api/admin/marketplace/item/tool-1/approve',
        { trustLevel: 'verified' },
        {
          'x-admin-id': 'admin-123',
          'x-admin-role': 'admin',
        }
      );
      const res = createMockResponse();

      await handleMarketplaceAdminRoutes(req, res, '/api/admin/marketplace/item/tool-1/approve');

      expect(res._statusCode).toBe(200);
      const data = JSON.parse(res._data);
      expect(data.success).toBe(true);
      expect(mockTool.verification.verified).toBe(true);
    });

    it('should return 404 for non-existent item', async () => {
      vi.mocked(getTool).mockReturnValue(null as never);
      vi.mocked(getAgent).mockReturnValue(null as never);

      const req = createMockRequest(
        'POST',
        '/api/admin/marketplace/item/non-existent/approve',
        {},
        {
          'x-admin-id': 'admin-123',
          'x-admin-role': 'admin',
        }
      );
      const res = createMockResponse();

      await handleMarketplaceAdminRoutes(
        req,
        res,
        '/api/admin/marketplace/item/non-existent/approve'
      );

      expect(res._statusCode).toBe(404);
    });
  });

  describe('POST /api/admin/marketplace/item/:id/reject', () => {
    it('should reject a pending tool with reason', async () => {
      const mockTool = {
        id: 'tool-1',
        name: 'Bad Tool',
        verification: { verified: false, trustLevel: 'community' },
      };

      vi.mocked(getTool).mockReturnValue(mockTool as never);
      vi.mocked(getAgent).mockReturnValue(null as never);

      const req = createMockRequest(
        'POST',
        '/api/admin/marketplace/item/tool-1/reject',
        { reason: 'Does not meet quality standards' },
        {
          'x-admin-id': 'admin-123',
          'x-admin-role': 'admin',
        }
      );
      const res = createMockResponse();

      await handleMarketplaceAdminRoutes(req, res, '/api/admin/marketplace/item/tool-1/reject');

      expect(res._statusCode).toBe(200);
      const data = JSON.parse(res._data);
      expect(data.success).toBe(true);
    });
  });

  describe('POST /api/admin/marketplace/reviews/:id/moderate', () => {
    it('should moderate a review', async () => {
      vi.mocked(moderateReview).mockReturnValue({
        id: 'review-1',
        status: 'approved',
        moderatedAt: new Date().toISOString(),
        moderatedBy: 'admin-123',
      } as never);

      const req = createMockRequest(
        'POST',
        '/api/admin/marketplace/reviews/review-1/moderate',
        { decision: 'approved', note: 'Legitimate review' },
        {
          'x-admin-id': 'admin-123',
          'x-admin-role': 'admin',
        }
      );
      const res = createMockResponse();

      await handleMarketplaceAdminRoutes(
        req,
        res,
        '/api/admin/marketplace/reviews/review-1/moderate'
      );

      expect(res._statusCode).toBe(200);
      expect(moderateReview).toHaveBeenCalledWith(
        'review-1',
        'admin-123',
        'approved',
        'Legitimate review'
      );
    });

    it('should require decision in request body', async () => {
      const req = createMockRequest(
        'POST',
        '/api/admin/marketplace/reviews/review-1/moderate',
        {}, // Missing decision
        {
          'x-admin-id': 'admin-123',
          'x-admin-role': 'admin',
        }
      );
      const res = createMockResponse();

      await handleMarketplaceAdminRoutes(
        req,
        res,
        '/api/admin/marketplace/reviews/review-1/moderate'
      );

      expect(res._statusCode).toBe(400);
      expect(JSON.parse(res._data).error).toMatch(/decision.*required/i);
    });
  });

  describe('GET /api/admin/marketplace/stats', () => {
    it('should return marketplace statistics', async () => {
      vi.mocked(listTools).mockReturnValue([
        { verification: { verified: true, trustLevel: 'verified' } },
        { verification: { verified: false, trustLevel: 'community' } },
      ] as never);
      vi.mocked(listAgents).mockReturnValue([
        { verification: { verified: true, trustLevel: 'platform' } },
      ] as never);

      const req = createMockRequest('GET', '/api/admin/marketplace/stats', undefined, {
        'x-admin-id': 'admin-123',
        'x-admin-role': 'admin',
      });
      const res = createMockResponse();

      await handleMarketplaceAdminRoutes(req, res, '/api/admin/marketplace/stats');

      expect(res._statusCode).toBe(200);
      const data = JSON.parse(res._data);
      expect(data.items.tools).toBe(2);
      expect(data.items.agents).toBe(1);
      expect(data.items.verified).toBe(2);
      expect(data.items.pending).toBe(1);
    });
  });

  describe('Route matching', () => {
    it('should not handle non-admin routes', async () => {
      const req = createMockRequest('GET', '/api/marketplace/browse');
      const res = createMockResponse();

      const handled = await handleMarketplaceAdminRoutes(req, res, '/api/marketplace/browse');

      expect(handled).toBe(false);
    });
  });
});
