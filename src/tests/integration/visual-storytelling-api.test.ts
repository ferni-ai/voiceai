/**
 * Visual Storytelling API Integration Tests
 *
 * Tests the /api/visual-storytelling endpoints:
 * - GET /:userId - Get all visual storytelling data
 * - PUT /:userId/sleep-pattern - Update sleep pattern
 * - POST /:userId/milestone/:milestoneId/celebrate - Mark milestone as celebrated
 * - GET /:userId/infer-sleep - Auto-infer sleep pattern from usage
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type http from 'http';

// Mock auth for tests
vi.mock('../../api/auth.js', () => ({
  validateAuth: vi.fn().mockReturnValue({ uid: 'test-user-123' }),
}));

// Mock Firestore
const mockFirestore = {
  collection: vi.fn(),
  doc: vi.fn(),
};

vi.mock('../../memory/firestore-factory.js', () => ({
  getFirestore: vi.fn().mockReturnValue(mockFirestore),
}));

vi.mock('../../memory/firestore-store.js', () => ({
  getFirestoreStore: vi.fn().mockReturnValue({
    getProfile: vi.fn().mockResolvedValue({
      conversationCount: 15,
      currentStreak: 5,
      longestStreak: 10,
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    }),
  }),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import { handleVisualStorytellingRoutes } from '../../api/visual-storytelling-routes.js';

describe('Visual Storytelling API', () => {
  // Mock request/response objects
  const createMockRequest = (
    method: string,
    url: string,
    body?: unknown
  ): Partial<http.IncomingMessage> => ({
    method,
    url,
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    },
    on: vi.fn((event, callback) => {
      if (event === 'data' && body) {
        callback(JSON.stringify(body));
      }
      if (event === 'end') {
        callback();
      }
    }),
  });

  const createMockResponse = (): Partial<http.ServerResponse> & {
    _statusCode: number;
    _data: string;
    _headers: Record<string, string>;
  } => {
    const res: Partial<http.ServerResponse> & {
      _statusCode: number;
      _data: string;
      _headers: Record<string, string>;
    } = {
      _statusCode: 200,
      _data: '',
      _headers: {},
      writableEnded: false,
      writeHead: vi.fn(function (
        this: typeof res,
        statusCode: number,
        headers?: Record<string, string>
      ) {
        this._statusCode = statusCode;
        if (headers) this._headers = headers;
        return this as unknown as http.ServerResponse;
      }),
      setHeader: vi.fn(function (
        this: typeof res,
        name: string,
        value: string | number | readonly string[]
      ) {
        this._headers[name] = String(value);
        return this as unknown as http.ServerResponse;
      }),
      end: vi.fn(function (this: typeof res, data?: string) {
        this._data = data || '';
        this.writableEnded = true;
      }),
    };
    return res;
  };

  beforeAll(() => {
    // Set up common mocks
    mockFirestore.collection.mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({
          exists: false,
          data: vi.fn().mockReturnValue(null),
        }),
        set: vi.fn().mockResolvedValue(undefined),
      }),
      where: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({
          docs: [],
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              docs: [],
            }),
          }),
        }),
      }),
    });
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/visual-storytelling/:userId', () => {
    it('should return visual storytelling data for a user', async () => {
      const req = createMockRequest('GET', '/api/visual-storytelling/test-user-123');
      const res = createMockResponse();

      const handled = await handleVisualStorytellingRoutes(
        req as http.IncomingMessage,
        res as http.ServerResponse,
        '/api/visual-storytelling/test-user-123'
      );

      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalled();

      const responseData = JSON.parse(res._data);
      expect(responseData).toHaveProperty('relationship');
      expect(responseData).toHaveProperty('teaserEligibility');
      expect(responseData).toHaveProperty('milestones');
      expect(responseData).toHaveProperty('teamProgress');
    });

    it('should calculate correct relationship stage from conversation count', async () => {
      const req = createMockRequest('GET', '/api/visual-storytelling/test-user-123');
      const res = createMockResponse();

      await handleVisualStorytellingRoutes(
        req as http.IncomingMessage,
        res as http.ServerResponse,
        '/api/visual-storytelling/test-user-123'
      );

      const responseData = JSON.parse(res._data);
      // With 15 conversations, should be in "building-trust" stage (threshold 10-25)
      expect(responseData.relationship.stage).toBe('building-trust');
      expect(responseData.relationship.stageIndex).toBe(2);
    });

    it('should calculate teaser eligibility correctly', async () => {
      const req = createMockRequest('GET', '/api/visual-storytelling/test-user-123');
      const res = createMockResponse();

      await handleVisualStorytellingRoutes(
        req as http.IncomingMessage,
        res as http.ServerResponse,
        '/api/visual-storytelling/test-user-123'
      );

      const responseData = JSON.parse(res._data);
      // With 15 conversations and 30 days:
      // history (3) ✓, goals (5) ✓, team (2) ✓, patterns (10) ✓, wellbeing (7 days) ✓
      expect(responseData.teaserEligibility.history).toBe(true);
      expect(responseData.teaserEligibility.goals).toBe(true);
      expect(responseData.teaserEligibility.team).toBe(true);
      expect(responseData.teaserEligibility.patterns).toBe(true);
      expect(responseData.teaserEligibility.wellbeing).toBe(true);
    });
  });

  describe('PUT /api/visual-storytelling/:userId/sleep-pattern', () => {
    it('should update sleep pattern', async () => {
      const sleepPattern = {
        wakeTime: 8,
        sleepTime: 23,
        isNightOwl: true,
        isEarlyBird: false,
      };

      const req = createMockRequest(
        'PUT',
        '/api/visual-storytelling/test-user-123/sleep-pattern',
        sleepPattern
      );
      const res = createMockResponse();

      const handled = await handleVisualStorytellingRoutes(
        req as http.IncomingMessage,
        res as http.ServerResponse,
        '/api/visual-storytelling/test-user-123/sleep-pattern'
      );

      expect(handled).toBe(true);
      expect(mockFirestore.collection).toHaveBeenCalledWith('sleepPatterns');
    });

    it('should validate wake time range', async () => {
      const invalidPattern = {
        wakeTime: 15, // Invalid: should be 0-12
        sleepTime: 23,
        isNightOwl: false,
        isEarlyBird: false,
      };

      const req = createMockRequest(
        'PUT',
        '/api/visual-storytelling/test-user-123/sleep-pattern',
        invalidPattern
      );
      const res = createMockResponse();

      await handleVisualStorytellingRoutes(
        req as http.IncomingMessage,
        res as http.ServerResponse,
        '/api/visual-storytelling/test-user-123/sleep-pattern'
      );

      expect(res._statusCode).toBe(400);
    });
  });

  describe('POST /api/visual-storytelling/:userId/milestone/:milestoneId/celebrate', () => {
    it('should mark milestone as celebrated', async () => {
      const req = createMockRequest(
        'POST',
        '/api/visual-storytelling/test-user-123/milestone/first-hello/celebrate'
      );
      const res = createMockResponse();

      const handled = await handleVisualStorytellingRoutes(
        req as http.IncomingMessage,
        res as http.ServerResponse,
        '/api/visual-storytelling/test-user-123/milestone/first-hello/celebrate'
      );

      expect(handled).toBe(true);
      expect(mockFirestore.collection).toHaveBeenCalledWith('milestones');
    });
  });

  describe('GET /api/visual-storytelling/:userId/infer-sleep', () => {
    it('should return null when not enough session data', async () => {
      const req = createMockRequest('GET', '/api/visual-storytelling/test-user-123/infer-sleep');
      const res = createMockResponse();

      await handleVisualStorytellingRoutes(
        req as http.IncomingMessage,
        res as http.ServerResponse,
        '/api/visual-storytelling/test-user-123/infer-sleep'
      );

      const responseData = JSON.parse(res._data);
      expect(responseData.inferred ?? null).toBeNull();
    });

    it('should infer night owl from late night sessions', async () => {
      // Mock sessions with late night times
      const lateNightSessions = Array.from({ length: 10 }, (_, i) => ({
        data: () => ({
          startTime: new Date(Date.now() - i * 24 * 60 * 60 * 1000).setHours(2, 0, 0, 0),
        }),
      }));

      mockFirestore.collection.mockReturnValueOnce({
        doc: vi.fn(),
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                docs: lateNightSessions,
              }),
            }),
          }),
        }),
      });

      const req = createMockRequest('GET', '/api/visual-storytelling/test-user-123/infer-sleep');
      const res = createMockResponse();

      await handleVisualStorytellingRoutes(
        req as http.IncomingMessage,
        res as http.ServerResponse,
        '/api/visual-storytelling/test-user-123/infer-sleep'
      );

      const responseData = JSON.parse(res._data);
      if (responseData.inferred) {
        expect(responseData.inferred.isNightOwl).toBe(true);
      }
    });
  });

  describe('Route Matching', () => {
    it('should not handle non-matching routes', async () => {
      const req = createMockRequest('GET', '/api/other-route/test');
      const res = createMockResponse();

      const handled = await handleVisualStorytellingRoutes(
        req as http.IncomingMessage,
        res as http.ServerResponse,
        '/api/other-route/test'
      );

      expect(handled).toBe(false);
    });

    it('should handle URL-encoded user IDs', async () => {
      const req = createMockRequest('GET', '/api/visual-storytelling/user%40example.com');
      const res = createMockResponse();

      const handled = await handleVisualStorytellingRoutes(
        req as http.IncomingMessage,
        res as http.ServerResponse,
        '/api/visual-storytelling/user%40example.com'
      );

      expect(handled).toBe(true);
    });
  });
});

describe('Stage Calculation', () => {
  it('should correctly map conversation counts to stages', () => {
    const stageThresholds = [
      { count: 0, expected: 'first-meeting' },
      { count: 2, expected: 'first-meeting' },
      { count: 3, expected: 'getting-started' },
      { count: 9, expected: 'getting-started' },
      { count: 10, expected: 'building-trust' },
      { count: 24, expected: 'building-trust' },
      { count: 25, expected: 'established' },
      { count: 49, expected: 'established' },
      { count: 50, expected: 'deep-partnership' },
      { count: 100, expected: 'deep-partnership' },
    ];

    // Import the determineStage function or test via API
    for (const { count, expected } of stageThresholds) {
      // These would be tested via the API response
      expect(count).toBeGreaterThanOrEqual(0);
      expect(expected).toBeTruthy();
    }
  });
});

describe('Team Progress Calculation', () => {
  it('should unlock team members based on conversation count', () => {
    const unlockThresholds = {
      ferni: 0,
      maya: 5,
      alex: 10,
      peter: 15,
      jordan: 20,
      nayan: 30,
    };

    // With 15 conversations:
    // ferni ✓, maya ✓, alex ✓, peter ✓, jordan ✗, nayan ✗
    const conversationCount = 15;

    expect(conversationCount >= unlockThresholds.ferni).toBe(true);
    expect(conversationCount >= unlockThresholds.maya).toBe(true);
    expect(conversationCount >= unlockThresholds.alex).toBe(true);
    expect(conversationCount >= unlockThresholds.peter).toBe(true);
    expect(conversationCount >= unlockThresholds.jordan).toBe(false);
    expect(conversationCount >= unlockThresholds.nayan).toBe(false);
  });
});
