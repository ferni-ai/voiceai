/**
 * Story Routes API Tests
 *
 * Tests for the Your Story actions API that powers the
 * "What I've Done for You" section in the dashboard.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

// Mock action tracker
const mockActionTracker = {
  getUserActions: vi.fn(),
  getStats: vi.fn(),
  onEvent: vi.fn(() => () => {}), // Returns unsubscribe function
};

vi.mock('../../services/action-tracker/tracker.js', () => ({
  getActionTracker: vi.fn(() => mockActionTracker),
}));

// Mock commitment keeper
const mockCommitments = [
  { id: 'c1', status: 'completed' },
  { id: 'c2', status: 'completed' },
  { id: 'c3', status: 'active' },
];

vi.mock('../../services/superhuman/commitment-keeper.js', () => ({
  loadUserCommitments: vi.fn(() => Promise.resolve(mockCommitments)),
}));

// Mock auth middleware
vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return { userId: 'test-user-123', isAdmin: false };
  }),
  rateLimit: vi.fn(() => false), // Not rate limited
}));

// Mock helpers
vi.mock('../helpers.js', async () => {
  const actual = await vi.importActual('../helpers.js');
  return {
    ...actual,
    handleCorsPreflightIfNeeded: vi.fn(() => false),
    sendJSON: vi.fn((res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }),
    sendError: vi.fn((res, message, status = 500) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }),
    getUserId: vi.fn(() => 'test-user-123'),
  };
});

// Create mock request
function createMockRequest(options: {
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
  method?: string;
}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.headers = {
    host: 'localhost:3002',
    authorization: 'Bearer test-token',
    ...options.headers,
  };
  req.url = options.url || '/api/story/actions';
  req.method = options.method || 'GET';
  return req;
}

// Create mock response
interface MockResponse extends ServerResponse {
  _data: string;
  _statusCode: number;
  _headers: Record<string, string>;
}

function createMockResponse(): MockResponse {
  const res = {
    _data: '',
    _statusCode: 200,
    _headers: {} as Record<string, string>,
    writeHead: vi.fn(function (this: any, status: number, headers?: Record<string, string>) {
      this._statusCode = status;
      if (headers) {
        this._headers = { ...this._headers, ...headers };
      }
    }),
    end: vi.fn(function (this: any, data?: string) {
      this._data = data || '';
    }),
    write: vi.fn(),
    setHeader: vi.fn(),
  };
  return res as unknown as MockResponse;
}

// Sample action data for tests
const mockActions = [
  {
    id: 'act_1',
    userId: 'test-user-123',
    type: 'call' as const,
    status: 'completed' as const,
    request: {
      description: 'Call Mom',
      target: 'Mom',
      requestedAt: new Date('2026-01-20T10:00:00Z'),
    },
    execution: {
      resultSummary: 'She sounds happy!',
    },
    createdAt: new Date('2026-01-20T10:00:00Z'),
    updatedAt: new Date('2026-01-20T10:05:00Z'),
  },
  {
    id: 'act_2',
    userId: 'test-user-123',
    type: 'text' as const,
    status: 'completed' as const,
    request: {
      description: 'Text John',
      target: 'John',
      requestedAt: new Date('2026-01-19T14:00:00Z'),
    },
    createdAt: new Date('2026-01-19T14:00:00Z'),
    updatedAt: new Date('2026-01-19T14:01:00Z'),
  },
];

const mockStats = {
  total: 10,
  byType: { call: 5, text: 3, email: 1, calendar: 1, reminder: 0 },
  byStatus: { completed: 8, failed: 1, in_progress: 1, requested: 0, cancelled: 0 },
  completedToday: 2,
  inProgress: 1,
  failedLast24h: 0,
};

describe('Story Routes API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActionTracker.getUserActions.mockResolvedValue(mockActions);
    mockActionTracker.getStats.mockResolvedValue(mockStats);
  });

  describe('GET /api/story/actions', () => {
    it('should return care moments for authenticated user', async () => {
      const { handleStoryRoutes } = await import('../story-routes.js');
      const { sendJSON } = await import('../helpers.js');

      const req = createMockRequest({
        url: '/api/story/actions',
        method: 'GET',
      });
      const res = createMockResponse();

      const handled = await handleStoryRoutes(req, res, '/api/story/actions');

      expect(handled).toBe(true);
      expect(sendJSON).toHaveBeenCalled();

      // Verify response shape
      const sendJSONCall = vi.mocked(sendJSON).mock.calls[0];
      const responseData = sendJSONCall[1] as any;

      expect(responseData.recentCare).toHaveLength(2);
      expect(responseData.recentCare[0].narrative).toContain('Mom');
      expect(responseData.commitmentProgress.kept).toBe(2);
      expect(responseData.commitmentProgress.pending).toBe(1);
      expect(responseData.totalActions).toBe(2);
      expect(responseData.summary).toBeDefined();
      expect(responseData.summary.callsMade).toBe(5);
    });

    it('should return 401 for unauthenticated request', async () => {
      const { handleStoryRoutes } = await import('../story-routes.js');

      const req = createMockRequest({
        url: '/api/story/actions',
        headers: { authorization: undefined }, // No auth header
      });
      const res = createMockResponse();

      const handled = await handleStoryRoutes(req, res, '/api/story/actions');

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(401);
    });

    it('should respect limit query parameter', async () => {
      const { handleStoryRoutes } = await import('../story-routes.js');

      const req = createMockRequest({
        url: '/api/story/actions?limit=1',
        method: 'GET',
      });
      const res = createMockResponse();

      await handleStoryRoutes(req, res, '/api/story/actions');

      expect(mockActionTracker.getUserActions).toHaveBeenCalledWith(
        'test-user-123',
        expect.objectContaining({ limit: 1 })
      );
    });

    it('should include summary stats in response', async () => {
      const { handleStoryRoutes } = await import('../story-routes.js');
      const { sendJSON } = await import('../helpers.js');

      const req = createMockRequest({
        url: '/api/story/actions',
        method: 'GET',
      });
      const res = createMockResponse();

      await handleStoryRoutes(req, res, '/api/story/actions');

      const sendJSONCall = vi.mocked(sendJSON).mock.calls[0];
      const responseData = sendJSONCall[1] as any;

      expect(responseData.summary).toEqual({
        callsMade: 5,
        messagesSent: 4, // text + email
        remindersKept: 0,
        commitmentsFulfilled: 2,
      });
    });

    it('should handle users with no actions gracefully', async () => {
      mockActionTracker.getUserActions.mockResolvedValue([]);
      mockActionTracker.getStats.mockResolvedValue({
        total: 0,
        byType: { call: 0, text: 0, email: 0, calendar: 0, reminder: 0 },
        byStatus: { completed: 0, failed: 0, in_progress: 0, requested: 0, cancelled: 0 },
        completedToday: 0,
        inProgress: 0,
        failedLast24h: 0,
      });

      const { handleStoryRoutes } = await import('../story-routes.js');
      const { sendJSON } = await import('../helpers.js');

      const req = createMockRequest({
        url: '/api/story/actions',
        method: 'GET',
      });
      const res = createMockResponse();

      await handleStoryRoutes(req, res, '/api/story/actions');

      const sendJSONCall = vi.mocked(sendJSON).mock.calls[0];
      const responseData = sendJSONCall[1] as any;

      expect(responseData.recentCare).toHaveLength(0);
      expect(responseData.totalActions).toBe(0);
    });
  });

  describe('GET /api/story/summary', () => {
    it('should return aggregated stats', async () => {
      const { handleStoryRoutes } = await import('../story-routes.js');
      const { sendJSON } = await import('../helpers.js');

      const req = createMockRequest({
        url: '/api/story/summary',
        method: 'GET',
      });
      const res = createMockResponse();

      const handled = await handleStoryRoutes(req, res, '/api/story/summary');

      expect(handled).toBe(true);
      expect(sendJSON).toHaveBeenCalled();

      const sendJSONCall = vi.mocked(sendJSON).mock.calls[0];
      const responseData = sendJSONCall[1] as any;

      expect(responseData.callsMade).toBe(5);
      expect(responseData.messagesSent).toBe(4);
      expect(responseData.commitmentsFulfilled).toBe(2);
      expect(responseData.commitmentsTracking).toBe(1);
      expect(responseData.since).toBeDefined();
    });
  });

  describe('GET /api/story/stream', () => {
    it('should establish SSE connection', async () => {
      const { handleStoryRoutes } = await import('../story-routes.js');

      const req = createMockRequest({
        url: '/api/story/stream',
        method: 'GET',
      });
      const res = createMockResponse();

      const handled = await handleStoryRoutes(req, res, '/api/story/stream');

      expect(handled).toBe(true);
      expect(res._headers['Content-Type']).toBe('text/event-stream');
      expect(mockActionTracker.onEvent).toHaveBeenCalled();
    });

    it('should require authentication for SSE', async () => {
      const { handleStoryRoutes } = await import('../story-routes.js');

      const req = createMockRequest({
        url: '/api/story/stream',
        headers: { authorization: undefined },
      });
      const res = createMockResponse();

      const handled = await handleStoryRoutes(req, res, '/api/story/stream');

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(401);
    });
  });

  describe('Care Moment Narrative Generation', () => {
    it('should generate warm narratives for calls', async () => {
      const { handleStoryRoutes } = await import('../story-routes.js');
      const { sendJSON } = await import('../helpers.js');

      const req = createMockRequest({
        url: '/api/story/actions',
        method: 'GET',
      });
      const res = createMockResponse();

      await handleStoryRoutes(req, res, '/api/story/actions');

      const sendJSONCall = vi.mocked(sendJSON).mock.calls[0];
      const responseData = sendJSONCall[1] as any;

      // First action is a call
      const callMoment = responseData.recentCare[0];
      expect(callMoment.type).toBe('called_for_you');
      expect(callMoment.narrative).toContain('Called Mom');
      expect(callMoment.narrative).toContain('She sounds happy');
    });

    it('should generate warm narratives for texts', async () => {
      const { handleStoryRoutes } = await import('../story-routes.js');
      const { sendJSON } = await import('../helpers.js');

      const req = createMockRequest({
        url: '/api/story/actions',
        method: 'GET',
      });
      const res = createMockResponse();

      await handleStoryRoutes(req, res, '/api/story/actions');

      const sendJSONCall = vi.mocked(sendJSON).mock.calls[0];
      const responseData = sendJSONCall[1] as any;

      // Second action is a text
      const textMoment = responseData.recentCare[1];
      expect(textMoment.type).toBe('messaged_for_you');
      expect(textMoment.narrative).toContain('John');
    });
  });

  describe('Route Matching', () => {
    it('should not handle non-story routes', async () => {
      const { handleStoryRoutes, isStoryRoute } = await import('../story-routes.js');

      expect(isStoryRoute('/api/other/route')).toBe(false);

      const req = createMockRequest({
        url: '/api/other/route',
        method: 'GET',
      });
      const res = createMockResponse();

      const handled = await handleStoryRoutes(req, res, '/api/other/route');
      expect(handled).toBe(false);
    });

    it('should return 404 for unknown story routes', async () => {
      const { handleStoryRoutes } = await import('../story-routes.js');
      const { sendError } = await import('../helpers.js');

      const req = createMockRequest({
        url: '/api/story/unknown',
        method: 'GET',
      });
      const res = createMockResponse();

      const handled = await handleStoryRoutes(req, res, '/api/story/unknown');

      expect(handled).toBe(true);
      expect(sendError).toHaveBeenCalledWith(res, 'Story route not found', 404);
    });
  });
});
