/**
 * Engagement Routes Tests
 *
 * Tests for engagement API endpoints:
 * - Conversations
 * - Predictions
 * - Rituals
 * - Analytics
 * - Memories
 * - Team
 * - Data export/delete
 * - Relationship progress
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

// Mock the auth middleware
vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(() => ({ userId: 'test-user-123', tier: 'friend' })),
  rateLimit: vi.fn(() => false),
}));

// Mock helpers
vi.mock('../api/helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/helpers.js')>();
  return {
    ...actual,
    requireUserId: vi.fn((req, res, url) => {
      const userId = url.searchParams.get('userId') || 'test-user-123';
      return userId;
    }),
  };
});

// Mock engagement store
const mockStore = {
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  getRecentPredictions: vi.fn(),
  updatePredictionActuals: vi.fn(),
  getAllStreaks: vi.fn(),
  getRitualStreak: vi.fn(),
  saveRitualStreak: vi.fn(),
  getWeatherHistory: vi.fn(),
  recordWeather: vi.fn(),
};

vi.mock('../services/engagement-store.js', () => ({
  getEngagementStore: vi.fn(() => Promise.resolve(mockStore)),
}));

// Mock conversation history service
const mockHistoryService = {
  getHistory: vi.fn(),
};

vi.mock('../services/conversation-history.js', () => ({
  getConversationHistoryService: vi.fn(() => mockHistoryService),
}));

import { handleConversationsRoutes } from '../api/routes/conversations.js';
import { handlePredictionsRoutes } from '../api/routes/predictions.js';
import { handleRitualsRoutes } from '../api/routes/rituals.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockRequest(options: {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
  url?: string;
}): IncomingMessage {
  const { method = 'GET', headers = {}, body = '', url = '/' } = options;

  const req = {
    method,
    headers: { 'x-user-id': 'test-user-123', ...headers },
    url,
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
// CONVERSATIONS ROUTES
// ============================================================================

describe('Conversations Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHistoryService.getHistory.mockResolvedValue({
      conversations: [
        { id: 'conv-1', timestamp: '2024-03-15T10:00:00Z', summary: 'Morning check-in' },
        { id: 'conv-2', timestamp: '2024-03-14T15:00:00Z', summary: 'Evening reflection' },
      ],
      total: 2,
    });
  });

  describe('GET /api/conversations', () => {
    it('should return conversation history', async () => {
      const req = createMockRequest({ method: 'GET' });
      const { res, getWrittenData } = createMockResponse();
      const url = new URL('http://localhost/api/conversations?userId=test-user');

      const handled = await handleConversationsRoutes(req, res, '/api/conversations', url);

      expect(handled).toBe(true);
      expect(mockHistoryService.getHistory).toHaveBeenCalledWith('test-user', 50);
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.conversations).toHaveLength(2);
    });

    it('should respect limit parameter', async () => {
      const req = createMockRequest({ method: 'GET' });
      const { res } = createMockResponse();
      const url = new URL('http://localhost/api/conversations?userId=test-user&limit=10');

      await handleConversationsRoutes(req, res, '/api/conversations', url);

      expect(mockHistoryService.getHistory).toHaveBeenCalledWith('test-user', 10);
    });

    it('should cap limit at 500', async () => {
      const req = createMockRequest({ method: 'GET' });
      const { res } = createMockResponse();
      const url = new URL('http://localhost/api/conversations?userId=test-user&limit=1000');

      await handleConversationsRoutes(req, res, '/api/conversations', url);

      expect(mockHistoryService.getHistory).toHaveBeenCalledWith('test-user', 500);
    });

    it('should return false for non-matching routes', async () => {
      const req = createMockRequest({ method: 'GET' });
      const { res } = createMockResponse();
      const url = new URL('http://localhost/api/other');

      const handled = await handleConversationsRoutes(req, res, '/api/other', url);

      expect(handled).toBe(false);
    });

    it('should return false for wrong HTTP method', async () => {
      const req = createMockRequest({ method: 'POST' });
      const { res } = createMockResponse();
      const url = new URL('http://localhost/api/conversations');

      const handled = await handleConversationsRoutes(req, res, '/api/conversations', url);

      expect(handled).toBe(false);
    });
  });
});

// ============================================================================
// PREDICTIONS ROUTES
// ============================================================================

describe('Predictions Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.getProfile.mockResolvedValue({
      userId: 'test-user',
      stats: { totalPredictions: 10, predictionAccuracy: 75 },
    });
    mockStore.getRecentPredictions.mockResolvedValue([
      { id: 'pred-1', createdAt: new Date().toISOString(), accuracy: 80 },
      { id: 'pred-2', createdAt: new Date().toISOString(), accuracy: 70 },
    ]);
  });

  describe('GET /api/predictions', () => {
    it('should return predictions with stats', async () => {
      const req = createMockRequest({ method: 'GET' });
      const { res, getWrittenData } = createMockResponse();
      const url = new URL('http://localhost/api/predictions?userId=test-user');

      const handled = await handlePredictionsRoutes(req, res, '/api/predictions', url);

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.predictions).toBeDefined();
      expect(data.stats).toBeDefined();
      expect(data.stats.averageAccuracy).toBe(75);
    });

    it('should respect limit parameter', async () => {
      const req = createMockRequest({ method: 'GET' });
      const { res } = createMockResponse();
      const url = new URL('http://localhost/api/predictions?userId=test-user&limit=5');

      await handlePredictionsRoutes(req, res, '/api/predictions', url);

      expect(mockStore.getRecentPredictions).toHaveBeenCalledWith('test-user', 5);
    });

    it('should cap limit at 100', async () => {
      const req = createMockRequest({ method: 'GET' });
      const { res } = createMockResponse();
      const url = new URL('http://localhost/api/predictions?userId=test-user&limit=500');

      await handlePredictionsRoutes(req, res, '/api/predictions', url);

      expect(mockStore.getRecentPredictions).toHaveBeenCalledWith('test-user', 100);
    });

    it('should mark old predictions as expired', async () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      mockStore.getRecentPredictions.mockResolvedValue([
        { id: 'pred-old', createdAt: oldDate, completedAt: null },
      ]);

      const req = createMockRequest({ method: 'GET' });
      const { res, getWrittenData } = createMockResponse();
      const url = new URL('http://localhost/api/predictions?userId=test-user');

      await handlePredictionsRoutes(req, res, '/api/predictions', url);

      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.predictions[0].status).toBe('expired');
      expect(data.stats.expiredCount).toBe(1);
    });
  });

  describe('POST /api/predictions/:id/actuals', () => {
    it('should update prediction actuals', async () => {
      mockStore.updatePredictionActuals.mockResolvedValue({
        id: 'pred-123',
        accuracy: 85,
        actuals: { sleep: 7.5 },
      });

      const req = createMockRequest({
        method: 'POST',
        body: JSON.stringify({ userId: 'test-user', actuals: { sleep: 7.5 } }),
      });
      const { res, getWrittenData } = createMockResponse();
      const url = new URL('http://localhost/api/predictions/pred-123/actuals');

      const handled = await handlePredictionsRoutes(req, res, '/api/predictions/pred-123/actuals', url);

      expect(handled).toBe(true);
      expect(mockStore.updatePredictionActuals).toHaveBeenCalledWith('test-user', 'pred-123', { sleep: 7.5 });
      expect(getWrittenData().status).toBe(200);
    });

    it('should return 404 for non-existent prediction', async () => {
      mockStore.updatePredictionActuals.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        body: JSON.stringify({ userId: 'test-user', actuals: { sleep: 7 } }),
      });
      const { res, getWrittenData } = createMockResponse();
      const url = new URL('http://localhost/api/predictions/nonexistent/actuals');

      await handlePredictionsRoutes(req, res, '/api/predictions/nonexistent/actuals', url);

      expect(getWrittenData().status).toBe(404);
    });
  });
});

// ============================================================================
// RITUALS ROUTES
// ============================================================================

describe('Rituals Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.getProfile.mockResolvedValue({
      userId: 'test-user',
      activeRituals: ['ritual-1'],
      totalRitualDays: 30,
      longestOverallStreak: 15,
      stats: { totalSkyChecks: 25 },
    });
    mockStore.getAllStreaks.mockResolvedValue([
      { ritualId: 'ritual-1', currentStreak: 5, longestStreak: 10 },
    ]);
    mockStore.getWeatherHistory.mockResolvedValue([
      { date: '2024-03-15', weather: { primary: 'sunny' } },
    ]);
  });

  describe('GET /api/rituals', () => {
    it('should return rituals with streaks and weather', async () => {
      const req = createMockRequest({ method: 'GET' });
      const { res, getWrittenData } = createMockResponse();
      const url = new URL('http://localhost/api/rituals?userId=test-user');

      const handled = await handleRitualsRoutes(req, res, '/api/rituals', url);

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.activeRituals).toHaveLength(1);
      expect(data.streaks).toHaveLength(1);
      expect(data.stats.totalRitualDays).toBe(30);
    });
  });

  describe('POST /api/rituals', () => {
    it('should create a new ritual', async () => {
      mockStore.saveProfile.mockResolvedValue(undefined);
      mockStore.saveRitualStreak.mockResolvedValue(undefined);

      const req = createMockRequest({
        method: 'POST',
        body: JSON.stringify({ userId: 'test-user', ritual: { personaId: 'ferni', name: 'Morning' } }),
      });
      const { res, getWrittenData } = createMockResponse();
      const url = new URL('http://localhost/api/rituals');

      const handled = await handleRitualsRoutes(req, res, '/api/rituals', url);

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(201);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
      expect(data.ritualId).toMatch(/^ritual-/);
    });
  });

  describe('DELETE /api/rituals/:id', () => {
    it('should delete a ritual', async () => {
      mockStore.saveProfile.mockResolvedValue(undefined);

      const req = createMockRequest({ method: 'DELETE' });
      const { res, getWrittenData } = createMockResponse();
      const url = new URL('http://localhost/api/rituals/ritual-1?userId=test-user');

      const handled = await handleRitualsRoutes(req, res, '/api/rituals/ritual-1', url);

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
    });
  });

  describe('POST /api/rituals/:id/complete', () => {
    beforeEach(() => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      mockStore.getRitualStreak.mockResolvedValue({
        ritualId: 'ritual-1',
        currentStreak: 5,
        longestStreak: 10,
        lastCompletedAt: yesterday,
        totalCompletions: 30,
        streakHistory: [],
      });
      mockStore.saveRitualStreak.mockResolvedValue(undefined);
      mockStore.recordWeather.mockResolvedValue(undefined);
      mockStore.saveProfile.mockResolvedValue(undefined);
    });

    it('should complete a ritual and increment streak', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: JSON.stringify({ userId: 'test-user' }),
      });
      const { res, getWrittenData } = createMockResponse();
      const url = new URL('http://localhost/api/rituals/ritual-1/complete');

      const handled = await handleRitualsRoutes(req, res, '/api/rituals/ritual-1/complete', url);

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
      expect(data.streak).toBe(6);
    });

    it('should return already completed if done today', async () => {
      mockStore.getRitualStreak.mockResolvedValue({
        ritualId: 'ritual-1',
        currentStreak: 5,
        lastCompletedAt: new Date().toISOString(),
        totalCompletions: 30,
      });

      const req = createMockRequest({
        method: 'POST',
        body: JSON.stringify({ userId: 'test-user' }),
      });
      const { res, getWrittenData } = createMockResponse();
      const url = new URL('http://localhost/api/rituals/ritual-1/complete');

      await handleRitualsRoutes(req, res, '/api/rituals/ritual-1/complete', url);

      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.message).toContain('Already completed');
    });

    it('should reset streak if day was missed', async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
      mockStore.getRitualStreak.mockResolvedValue({
        ritualId: 'ritual-1',
        currentStreak: 5,
        longestStreak: 10,
        lastCompletedAt: twoDaysAgo,
        totalCompletions: 30,
        streakHistory: [],
      });

      const req = createMockRequest({
        method: 'POST',
        body: JSON.stringify({ userId: 'test-user' }),
      });
      const { res, getWrittenData } = createMockResponse();
      const url = new URL('http://localhost/api/rituals/ritual-1/complete');

      await handleRitualsRoutes(req, res, '/api/rituals/ritual-1/complete', url);

      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.streak).toBe(1);
    });

    it('should return 404 for non-existent ritual', async () => {
      mockStore.getRitualStreak.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        body: JSON.stringify({ userId: 'test-user' }),
      });
      const { res, getWrittenData } = createMockResponse();
      const url = new URL('http://localhost/api/rituals/nonexistent/complete');

      await handleRitualsRoutes(req, res, '/api/rituals/nonexistent/complete', url);

      expect(getWrittenData().status).toBe(404);
    });

    it('should record weather if provided', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: JSON.stringify({
          userId: 'test-user',
          weather: { primary: 'sunny', energy: 'high' },
        }),
      });
      const { res } = createMockResponse();
      const url = new URL('http://localhost/api/rituals/ritual-1/complete');

      await handleRitualsRoutes(req, res, '/api/rituals/ritual-1/complete', url);

      expect(mockStore.recordWeather).toHaveBeenCalled();
    });

    it('should celebrate milestones', async () => {
      mockStore.getRitualStreak.mockResolvedValue({
        ritualId: 'ritual-1',
        currentStreak: 6,
        longestStreak: 10,
        lastCompletedAt: new Date(Date.now() - 86400000).toISOString(),
        totalCompletions: 30,
        streakHistory: [],
      });

      const req = createMockRequest({
        method: 'POST',
        body: JSON.stringify({ userId: 'test-user' }),
      });
      const { res, getWrittenData } = createMockResponse();
      const url = new URL('http://localhost/api/rituals/ritual-1/complete');

      await handleRitualsRoutes(req, res, '/api/rituals/ritual-1/complete', url);

      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.streak).toBe(7);
      expect(data.celebration).toBeDefined();
      expect(data.celebration.type).toBe('milestone');
    });
  });
});

// ============================================================================
// ROUTE MATCHING
// ============================================================================

describe('Route Matching', () => {
  it('should not match unrelated paths', async () => {
    const req = createMockRequest({ method: 'GET' });
    const { res } = createMockResponse();
    const url = new URL('http://localhost/api/unrelated');

    const conversationsHandled = await handleConversationsRoutes(req, res, '/api/unrelated', url);
    const predictionsHandled = await handlePredictionsRoutes(req, res, '/api/unrelated', url);
    const ritualsHandled = await handleRitualsRoutes(req, res, '/api/unrelated', url);

    expect(conversationsHandled).toBe(false);
    expect(predictionsHandled).toBe(false);
    expect(ritualsHandled).toBe(false);
  });
});
