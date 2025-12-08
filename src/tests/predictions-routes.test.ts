/**
 * Predictions Routes Tests
 *
 * Tests for predictions API endpoints:
 * - GET /api/predictions - Get user predictions
 * - POST /api/predictions/:id/actuals - Update prediction with actual values
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

// Mock engagement store
const mockStore = {
  getRecentPredictions: vi.fn(),
  getProfile: vi.fn(),
  updatePredictionActuals: vi.fn(),
};

vi.mock('../services/engagement-store.js', () => ({
  getEngagementStore: vi.fn(() => Promise.resolve(mockStore)),
}));

// Mock logger
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock validators
vi.mock('../api/validators.js', () => ({
  validateBody: vi.fn(),
  UpdatePredictionActualsSchema: {},
}));

import {
  handleGetPredictions,
  handleUpdatePredictionActuals,
  handlePredictionsRoutes,
} from '../api/routes/predictions.js';
import { validateBody } from '../api/validators.js';

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

describe('Predictions Routes', () => {
  const samplePredictions = [
    {
      id: 'pred-1',
      type: 'market_performance',
      predicted: 5,
      createdAt: new Date().toISOString(),
      status: 'pending',
    },
    {
      id: 'pred-2',
      type: 'savings_goal',
      predicted: 1000,
      actual: 950,
      accuracy: 95,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      completedAt: new Date().toISOString(),
      status: 'completed',
    },
  ];

  const sampleProfile = {
    userId: 'test-user',
    stats: {
      totalPredictions: 10,
      predictionAccuracy: 85,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.getRecentPredictions.mockResolvedValue(samplePredictions);
    mockStore.getProfile.mockResolvedValue(sampleProfile);
    mockStore.updatePredictionActuals.mockResolvedValue({ updated: true, accuracy: 90 });
  });

  describe('handleGetPredictions', () => {
    it('should return predictions with stats', async () => {
      const req = createMockRequest({ url: '/api/predictions' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/predictions?userId=test-user', 'http://localhost:3002');

      await handleGetPredictions(req, res, parsedUrl);

      expect(mockStore.getRecentPredictions).toHaveBeenCalledWith('test-user', 20);
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.predictions).toBeDefined();
      expect(data.stats).toBeDefined();
    });

    it('should accept custom limit parameter', async () => {
      const req = createMockRequest({ url: '/api/predictions?limit=50' });
      const { res } = createMockResponse();
      const parsedUrl = new URL(
        '/api/predictions?userId=test-user&limit=50',
        'http://localhost:3002'
      );

      await handleGetPredictions(req, res, parsedUrl);

      expect(mockStore.getRecentPredictions).toHaveBeenCalledWith('test-user', 50);
    });

    it('should cap limit at 100', async () => {
      const req = createMockRequest({ url: '/api/predictions?limit=200' });
      const { res } = createMockResponse();
      const parsedUrl = new URL(
        '/api/predictions?userId=test-user&limit=200',
        'http://localhost:3002'
      );

      await handleGetPredictions(req, res, parsedUrl);

      expect(mockStore.getRecentPredictions).toHaveBeenCalledWith('test-user', 100);
    });

    it('should auto-expire old predictions', async () => {
      const oldPrediction = {
        id: 'pred-old',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
        status: 'pending',
      };
      mockStore.getRecentPredictions.mockResolvedValue([oldPrediction]);

      const req = createMockRequest({ url: '/api/predictions' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/predictions?userId=test-user', 'http://localhost:3002');

      await handleGetPredictions(req, res, parsedUrl);

      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.predictions[0].status).toBe('expired');
      expect(data.stats.expiredCount).toBe(1);
    });

    it('should calculate average accuracy from completed predictions', async () => {
      const predictions = [
        { id: '1', accuracy: 80, createdAt: new Date().toISOString() },
        { id: '2', accuracy: 90, createdAt: new Date().toISOString() },
        { id: '3', createdAt: new Date().toISOString() }, // no accuracy
      ];
      mockStore.getRecentPredictions.mockResolvedValue(predictions);

      const req = createMockRequest({ url: '/api/predictions' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/predictions?userId=test-user', 'http://localhost:3002');

      await handleGetPredictions(req, res, parsedUrl);

      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.stats.averageAccuracy).toBe(85); // (80 + 90) / 2
    });

    it('should return 401 when userId missing', async () => {
      const req = createMockRequest({
        url: '/api/predictions',
        headers: { 'x-user-id': undefined }, // Explicitly remove x-user-id header
      });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/predictions', 'http://localhost:3002'); // No userId in query

      await handleGetPredictions(req, res, parsedUrl);

      expect(getWrittenData().status).toBe(401);
    });

    it('should handle store errors gracefully', async () => {
      mockStore.getRecentPredictions.mockRejectedValue(new Error('Database error'));

      const req = createMockRequest({ url: '/api/predictions' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/predictions?userId=test-user', 'http://localhost:3002');

      await handleGetPredictions(req, res, parsedUrl);

      expect(getWrittenData().status).toBe(500);
    });
  });

  describe('handleUpdatePredictionActuals', () => {
    it('should update prediction with actuals', async () => {
      vi.mocked(validateBody).mockResolvedValue({
        userId: 'test-user',
        actuals: { value: 100 },
      });

      const req = createMockRequest({
        method: 'POST',
        url: '/api/predictions/pred-1/actuals',
        body: JSON.stringify({ userId: 'test-user', actuals: { value: 100 } }),
      });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/predictions/pred-1/actuals', 'http://localhost:3002');

      await handleUpdatePredictionActuals(req, res, parsedUrl, 'pred-1');

      expect(mockStore.updatePredictionActuals).toHaveBeenCalledWith('test-user', 'pred-1', {
        value: 100,
      });
      expect(getWrittenData().status).toBe(200);
    });

    it('should return 404 when prediction not found', async () => {
      vi.mocked(validateBody).mockResolvedValue({
        userId: 'test-user',
        actuals: { value: 100 },
      });
      mockStore.updatePredictionActuals.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/predictions/nonexistent/actuals',
      });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/predictions/nonexistent/actuals', 'http://localhost:3002');

      await handleUpdatePredictionActuals(req, res, parsedUrl, 'nonexistent');

      expect(getWrittenData().status).toBe(404);
    });

    it('should handle validation failure', async () => {
      vi.mocked(validateBody).mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/predictions/pred-1/actuals',
      });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/predictions/pred-1/actuals', 'http://localhost:3002');

      await handleUpdatePredictionActuals(req, res, parsedUrl, 'pred-1');

      // Validation failure returns early (no status set by this function)
      expect(mockStore.updatePredictionActuals).not.toHaveBeenCalled();
    });

    it('should handle store errors gracefully', async () => {
      vi.mocked(validateBody).mockResolvedValue({
        userId: 'test-user',
        actuals: { value: 100 },
      });
      mockStore.updatePredictionActuals.mockRejectedValue(new Error('Update failed'));

      const req = createMockRequest({
        method: 'POST',
        url: '/api/predictions/pred-1/actuals',
      });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/predictions/pred-1/actuals', 'http://localhost:3002');

      await handleUpdatePredictionActuals(req, res, parsedUrl, 'pred-1');

      expect(getWrittenData().status).toBe(500);
    });
  });

  describe('handlePredictionsRoutes', () => {
    it('should route GET /api/predictions', async () => {
      const req = createMockRequest({ method: 'GET', url: '/api/predictions' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/predictions?userId=test-user', 'http://localhost:3002');

      const handled = await handlePredictionsRoutes(req, res, '/api/predictions', parsedUrl);

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(200);
    });

    it('should route POST /api/predictions/:id/actuals', async () => {
      vi.mocked(validateBody).mockResolvedValue({
        userId: 'test-user',
        actuals: { value: 100 },
      });

      const req = createMockRequest({ method: 'POST', url: '/api/predictions/pred-1/actuals' });
      const { res, getWrittenData } = createMockResponse();
      const parsedUrl = new URL('/api/predictions/pred-1/actuals', 'http://localhost:3002');

      const handled = await handlePredictionsRoutes(
        req,
        res,
        '/api/predictions/pred-1/actuals',
        parsedUrl
      );

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(200);
    });

    it('should return false for non-prediction routes', async () => {
      const req = createMockRequest({ method: 'GET', url: '/api/other' });
      const { res } = createMockResponse();
      const parsedUrl = new URL('/api/other', 'http://localhost:3002');

      const handled = await handlePredictionsRoutes(req, res, '/api/other', parsedUrl);

      expect(handled).toBe(false);
    });

    it('should return false for wrong method', async () => {
      const req = createMockRequest({ method: 'POST', url: '/api/predictions' });
      const { res } = createMockResponse();
      const parsedUrl = new URL('/api/predictions', 'http://localhost:3002');

      const handled = await handlePredictionsRoutes(req, res, '/api/predictions', parsedUrl);

      expect(handled).toBe(false);
    });
  });
});
