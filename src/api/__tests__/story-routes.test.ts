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

// The user's own commitments as the store returns them: active only (13, like the
// 2026-11-16 audit's "13 active commitments"). They are not Ferni's promises.
const activeCommitments = Array.from({ length: 13 }, (_, i) => ({ id: `c${i}`, status: 'active' }));
vi.mock('../../services/superhuman/commitment-keeper.js', () => ({
  loadUserCommitments: vi.fn(() => Promise.resolve(activeCommitments)),
}));
vi.mock('../../services/superhuman/commitment-store.js', () => ({
  loadActiveCommitmentsOrThrow: vi.fn(() => Promise.resolve(activeCommitments)),
}));

// Ferni's promises (ferni_commitments): 4 kept, 1 still open. Trust & Growth says "Kept 4 of 4".
const promise = (id: string, fulfilled: boolean) => ({
  id,
  text: id,
  madeAt: new Date('2026-11-01T12:00:00Z'),
  fulfilled,
  violated: false,
});
const loadFerniPromises = vi.hoisted(() => vi.fn());
vi.mock('../../services/trust-systems/together-store.js', () => ({ loadFerniPromises }));

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
    loadFerniPromises.mockResolvedValue([
      promise('p1', true),
      promise('p2', true),
      promise('p3', true),
      promise('p4', true),
      promise('p5', false),
    ]);
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
      expect(responseData.commitmentProgress).toEqual({ kept: 4, pending: 1, total: 4 });
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
        commitmentsFulfilled: 4,
      });
    });

    it('counts "kept" as Trust & Growth does: Ferni\'s promises, not the user\'s open commitments', async () => {
      const { handleStoryRoutes } = await import('../story-routes.js');
      const { sendJSON } = await import('../helpers.js');
      const { tallyPromises } = await import('../../services/trust-systems/together-signals.js');

      await handleStoryRoutes(createMockRequest({}), createMockResponse(), '/api/story/actions');
      const body = vi.mocked(sendJSON).mock.calls[0][1] as any;

      // Before: "0/13 kept", the user's 13 active commitments with none ever "completed"
      expect(body.commitmentProgress).not.toEqual({ kept: 0, pending: 13, total: 13 });
      const trust = tallyPromises(await loadFerniPromises());
      expect(body.commitmentProgress).toEqual({
        kept: trust.kept,
        pending: trust.open,
        total: trust.resolved,
      });
    });

    it('says the same "kept" and total as Trust & Growth for one list of promises', async () => {
      // A promise marked both fulfilled and broken counts as broken on every screen.
      const both = { ...promise('p-both', true), violated: true };
      const broken = { ...promise('p-broken', false), violated: true };
      const promises = [
        promise('p1', true),
        promise('p2', true),
        both,
        broken,
        promise('p-open-1', false),
        promise('p-open-2', false),
      ];
      loadFerniPromises.mockResolvedValue(promises);
      const { handleStoryRoutes } = await import('../story-routes.js');
      const { sendJSON } = await import('../helpers.js');
      const { computeTogetherHealth } =
        await import('../../services/trust-systems/together-health.js');
      const { localClock } = await import('../../services/trust-systems/together-signals.js');

      await handleStoryRoutes(createMockRequest({}), createMockResponse(), '/api/story/actions');
      const story = (vi.mocked(sendJSON).mock.calls[0][1] as any).commitmentProgress;

      // Three evenings together, so Trust & Growth gives a read with its promises factor.
      const snapshots = ['2026-11-01', '2026-11-02', '2026-11-03'].map((d, i) => ({
        id: `s${i}`,
        timestamp: new Date(`${d}T20:00:00Z`),
        primaryEmotion: 'joy' as const,
        secondaryEmotions: [],
        intensity: 0.3,
        valence: 0.3,
        arousal: 0.5,
        source: 'detected' as const,
      }));
      const health = computeTogetherHealth(
        { snapshots, promises, lifeEvents: [] },
        new Date('2026-11-04T12:00:00Z'),
        localClock('UTC')
      );
      const trust = health.factors.find((f) => f.id === 'promises');

      expect(trust?.detail).toEqual({ kept: 2, total: 4 });
      expect(story).toEqual({ kept: trust?.detail.kept, pending: 2, total: trust?.detail.total });
    });

    it('says it could not read the promises instead of showing 0', async () => {
      loadFerniPromises.mockRejectedValue(new Error('Firestore unavailable'));
      const { handleStoryRoutes } = await import('../story-routes.js');
      const { sendJSON } = await import('../helpers.js');

      await handleStoryRoutes(createMockRequest({}), createMockResponse(), '/api/story/actions');
      const body = vi.mocked(sendJSON).mock.calls[0][1] as any;

      expect(body.commitmentProgress).toBeNull();
      expect(body.summary.commitmentsFulfilled).toBeNull();
      expect(body.summary.callsMade).toBe(5); // the rest of the read still stands
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
      expect(responseData.commitmentsFulfilled).toBe(4);
      expect(responseData.commitmentsTracking).toBe(13);
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
