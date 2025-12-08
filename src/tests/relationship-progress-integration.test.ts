/**
 * Relationship Progress Integration Tests
 *
 * Tests the relationship stage calculation across multiple stores:
 * - Conversation history contribution
 * - Ritual engagement contribution
 * - Stage progression thresholds
 * - Progress percentage calculations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

// ============================================================================
// MOCK SETUP
// ============================================================================

const { mockEngagementStore, mockConversationHistory, mockLogger } = vi.hoisted(() => ({
  mockEngagementStore: {
    getProfile: vi.fn(),
    getRecentPredictions: vi.fn(),
  },
  mockConversationHistory: {
    getHistory: vi.fn(),
  },
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../services/engagement-store.js', () => ({
  getEngagementStore: vi.fn(() => Promise.resolve(mockEngagementStore)),
}));

vi.mock('../services/conversation-history.js', () => ({
  getConversationHistoryService: vi.fn(() => mockConversationHistory),
}));

vi.mock('../utils/safe-logger.js', () => ({
  createLogger: vi.fn(() => mockLogger),
}));

// Mock helpers
vi.mock('../api/helpers.js', () => ({
  requireUserId: vi.fn((_req: unknown, _res: ServerResponse, parsedUrl: URL) => {
    return parsedUrl.searchParams.get('userId');
  }),
  sendJSON: vi.fn((res: ServerResponse, data: unknown, status = 200) => {
    (res as unknown as { _data: unknown; _status: number })._data = data;
    (res as unknown as { _data: unknown; _status: number })._status = status;
  }),
  sendJSONCached: vi.fn((res: ServerResponse, data: unknown, _ttl: number) => {
    (res as unknown as { _data: unknown; _status: number })._data = data;
    (res as unknown as { _data: unknown; _status: number })._status = 200;
  }),
}));

import { handleGetRelationshipProgress } from '../api/routes/relationship.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockRequest(): IncomingMessage {
  return {
    method: 'GET',
    url: '/api/relationship/progress',
    headers: {},
  } as unknown as IncomingMessage;
}

function createMockResponse(): ServerResponse & { _data: unknown; _status: number } {
  return {
    _data: null,
    _status: 0,
    writeHead: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse & { _data: unknown; _status: number };
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Relationship Progress Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Stage Calculation from Multiple Stores', () => {
    it('should calculate stranger stage for new user (score < 5)', async () => {
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 2 });
      mockEngagementStore.getProfile.mockResolvedValue({ totalRitualDays: 0 });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stage: 'stranger',
        stageNumber: 1,
        engagementScore: 2, // 2 conversations + 0 ritual days * 2
      });
    });

    it('should calculate familiar stage (score 5-9)', async () => {
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 5 });
      mockEngagementStore.getProfile.mockResolvedValue({ totalRitualDays: 0 });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stage: 'familiar',
        stageNumber: 2,
        engagementScore: 5,
        nextStageAt: 10,
      });
    });

    it('should calculate acquaintance stage (score 10-24)', async () => {
      // 8 conversations + 3 ritual days * 2 = 8 + 6 = 14
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 8 });
      mockEngagementStore.getProfile.mockResolvedValue({ totalRitualDays: 3 });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stage: 'acquaintance',
        stageNumber: 3,
        engagementScore: 14,
        nextStageAt: 25,
      });
    });

    it('should calculate friend stage (score 25-49)', async () => {
      // 15 conversations + 7 ritual days * 2 = 15 + 14 = 29
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 15 });
      mockEngagementStore.getProfile.mockResolvedValue({ totalRitualDays: 7 });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stage: 'friend',
        stageNumber: 4,
        engagementScore: 29,
        nextStageAt: 50,
      });
    });

    it('should calculate confidant stage (score 50-99)', async () => {
      // 30 conversations + 15 ritual days * 2 = 30 + 30 = 60
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 30 });
      mockEngagementStore.getProfile.mockResolvedValue({ totalRitualDays: 15 });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stage: 'confidant',
        stageNumber: 5,
        engagementScore: 60,
        nextStageAt: 100,
      });
    });

    it('should calculate family stage (score >= 100)', async () => {
      // 50 conversations + 30 ritual days * 2 = 50 + 60 = 110
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 50 });
      mockEngagementStore.getProfile.mockResolvedValue({ totalRitualDays: 30 });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stage: 'family',
        stageNumber: 6,
        engagementScore: 110,
        nextStageAt: null,
      });
    });
  });

  describe('Engagement Score Calculation', () => {
    it('should weight ritual days 2x compared to conversations', async () => {
      // Ritual days should contribute 2 points each
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 0 });
      mockEngagementStore.getProfile.mockResolvedValue({ totalRitualDays: 5 });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        engagementScore: 10, // 0 conversations + 5 * 2 = 10
        stage: 'acquaintance',
      });
    });

    it('should combine both conversation and ritual contributions', async () => {
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 10 });
      mockEngagementStore.getProfile.mockResolvedValue({ totalRitualDays: 10 });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        engagementScore: 30, // 10 + 10*2
      });
    });
  });

  describe('Progress Percentage Calculation', () => {
    it('should calculate progress towards next stage', async () => {
      // Score 7, next stage at 10 = 70% progress
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 7 });
      mockEngagementStore.getProfile.mockResolvedValue({ totalRitualDays: 0 });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        progress: 70,
      });
    });

    it('should cap progress at 100%', async () => {
      // Family stage has no next stage
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 100 });
      mockEngagementStore.getProfile.mockResolvedValue({ totalRitualDays: 50 });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        progress: 100,
        stage: 'family',
      });
    });
  });

  describe('Stats Aggregation', () => {
    it('should include stats from both stores', async () => {
      const lastEngagement = new Date().toISOString();
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 20 });
      mockEngagementStore.getProfile.mockResolvedValue({
        totalRitualDays: 10,
        lastEngagementAt: lastEngagement,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stats: {
          totalConversations: 20,
          totalRitualDays: 10,
          lastEngagement: lastEngagement,
        },
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing totalRitualDays gracefully', async () => {
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 5 });
      mockEngagementStore.getProfile.mockResolvedValue({}); // No totalRitualDays

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        engagementScore: 5, // Only conversations counted
        stats: {
          totalRitualDays: 0,
        },
      });
    });

    it('should handle zero data gracefully', async () => {
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 0 });
      mockEngagementStore.getProfile.mockResolvedValue({ totalRitualDays: 0 });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stage: 'stranger',
        stageNumber: 1,
        engagementScore: 0,
        nextStageAt: 5,
      });
    });
  });

  describe('Error Handling', () => {
    it('should return error response when conversation history fails', async () => {
      mockConversationHistory.getHistory.mockRejectedValue(new Error('DB error'));
      mockEngagementStore.getProfile.mockResolvedValue({ totalRitualDays: 5 });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._status).toBe(500);
      expect(res._data).toMatchObject({
        error: 'Failed to get progress',
        stage: 'stranger',
      });
    });

    it('should return error response when engagement store fails', async () => {
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 10 });
      mockEngagementStore.getProfile.mockRejectedValue(new Error('Store error'));

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._status).toBe(500);
    });

    it('should log errors when fetching data fails', async () => {
      mockConversationHistory.getHistory.mockRejectedValue(new Error('Test error'));
      mockEngagementStore.getProfile.mockResolvedValue({ totalRitualDays: 0 });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});

describe('Relationship Stage Thresholds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { score: 0, expectedStage: 'stranger', stageNumber: 1 },
    { score: 4, expectedStage: 'stranger', stageNumber: 1 },
    { score: 5, expectedStage: 'familiar', stageNumber: 2 },
    { score: 9, expectedStage: 'familiar', stageNumber: 2 },
    { score: 10, expectedStage: 'acquaintance', stageNumber: 3 },
    { score: 24, expectedStage: 'acquaintance', stageNumber: 3 },
    { score: 25, expectedStage: 'friend', stageNumber: 4 },
    { score: 49, expectedStage: 'friend', stageNumber: 4 },
    { score: 50, expectedStage: 'confidant', stageNumber: 5 },
    { score: 99, expectedStage: 'confidant', stageNumber: 5 },
    { score: 100, expectedStage: 'family', stageNumber: 6 },
    { score: 200, expectedStage: 'family', stageNumber: 6 },
  ])(
    'should map score $score to stage $expectedStage',
    async ({ score, expectedStage, stageNumber }) => {
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: score });
      mockEngagementStore.getProfile.mockResolvedValue({ totalRitualDays: 0 });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stage: expectedStage,
        stageNumber: stageNumber,
        engagementScore: score,
      });
    }
  );
});
