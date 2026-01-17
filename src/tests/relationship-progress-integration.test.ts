/**
 * Relationship Progress Integration Tests
 *
 * Tests the relationship stage calculation based on the UNIFIED STAGE SYSTEM:
 * - Stage names: first-meeting, getting-started, building-trust, established, deep-partnership
 * - Based on: totalConversations, daysSinceFirstMeeting, currentStreak, longestStreak
 * - NOT based on engagement scores or ritual days
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

// Mock the correct paths as used in the actual handler
vi.mock('../services/engagement/engagement-store.js', () => ({
  getEngagementStore: vi.fn(() => Promise.resolve(mockEngagementStore)),
}));

vi.mock('../services/stores/conversation-history.js', () => ({
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
    it('should calculate first-meeting stage for new user (< 10 conversations)', async () => {
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 2 });
      mockEngagementStore.getProfile.mockResolvedValue({
        currentStreak: 0,
        longestStreak: 0,
        firstMeetingDate: new Date().toISOString(),
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stage: 'first-meeting',
        stageNumber: 1,
        metrics: expect.objectContaining({
          totalConversations: 2,
        }),
      });
    });

    it('should calculate getting-started stage (10+ conversations)', async () => {
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 10 });
      mockEngagementStore.getProfile.mockResolvedValue({
        currentStreak: 0,
        longestStreak: 0,
        firstMeetingDate: new Date().toISOString(),
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stage: 'getting-started',
        stageNumber: 2,
        nextStage: 'building-trust',
      });
    });

    it('should calculate building-trust stage (15+ conversations, 5+ days, 3+ streak)', async () => {
      const firstMeetingDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 15 });
      mockEngagementStore.getProfile.mockResolvedValue({
        currentStreak: 3,
        longestStreak: 3,
        firstMeetingDate,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stage: 'building-trust',
        stageNumber: 3,
        nextStage: 'established',
      });
    });

    it('should calculate established stage (30+ conversations, 21+ days, 7+ streak)', async () => {
      const firstMeetingDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 30 });
      mockEngagementStore.getProfile.mockResolvedValue({
        currentStreak: 7,
        longestStreak: 7,
        firstMeetingDate,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stage: 'established',
        stageNumber: 4,
        nextStage: 'deep-partnership',
      });
    });

    it('should calculate deep-partnership stage (60+ conversations, 45+ days, 14+ streak)', async () => {
      const firstMeetingDate = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString(); // 50 days ago
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 60 });
      mockEngagementStore.getProfile.mockResolvedValue({
        currentStreak: 14,
        longestStreak: 14,
        firstMeetingDate,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stage: 'deep-partnership',
        stageNumber: 5,
        nextStage: null,
      });
    });
  });

  describe('Progress Percentage Calculation', () => {
    it('should calculate progress towards next stage', async () => {
      // 5 conversations (50% of 10 needed for getting-started)
      // Days requirement: 0 (meets requirement, 100%)
      // Streak requirement: 0 (meets requirement, 100%)
      // Progress = average of (50%, 100%, 100%) = 83.33% ≈ 83%
      const firstMeetingDate = new Date().toISOString();
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 5 });
      mockEngagementStore.getProfile.mockResolvedValue({
        currentStreak: 0,
        longestStreak: 0,
        firstMeetingDate,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      // Progress is calculated as average of all requirements (conversations, days, streak)
      expect(res._data).toMatchObject({
        stage: 'first-meeting',
        nextStage: 'getting-started',
      });
      expect(res._data.progress).toBeGreaterThan(0);
      expect(res._data.progress).toBeLessThanOrEqual(100);
    });

    it('should cap progress at 100% for max stage', async () => {
      // deep-partnership stage has no next stage
      const firstMeetingDate = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString();
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 100 });
      mockEngagementStore.getProfile.mockResolvedValue({
        currentStreak: 20,
        longestStreak: 20,
        firstMeetingDate,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        progress: 100,
        stage: 'deep-partnership',
        nextStage: null,
      });
    });
  });

  describe('Metrics Aggregation', () => {
    it('should include metrics from both stores', async () => {
      const lastEngagement = new Date().toISOString();
      const firstMeetingDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 20 });
      mockEngagementStore.getProfile.mockResolvedValue({
        currentStreak: 5,
        longestStreak: 7,
        lastEngagementAt: lastEngagement,
        firstMeetingDate,
        milestonesReached: 3,
        insightsShared: 12,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        metrics: {
          totalConversations: 20,
          currentStreak: 5,
          longestStreak: 7,
          milestonesReached: 3,
          insightsShared: 12,
          lastConversation: lastEngagement,
        },
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing streak data gracefully', async () => {
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 5 });
      mockEngagementStore.getProfile.mockResolvedValue({}); // No streak data

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        metrics: {
          totalConversations: 5,
          currentStreak: 0,
          longestStreak: 0,
        },
      });
    });

    it('should handle zero data gracefully', async () => {
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 0 });
      mockEngagementStore.getProfile.mockResolvedValue({
        currentStreak: 0,
        longestStreak: 0,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stage: 'first-meeting',
        stageNumber: 1,
        nextStage: 'getting-started',
        metrics: {
          totalConversations: 0,
        },
      });
    });
  });

  describe('Error Handling', () => {
    it('should return error response when conversation history fails', async () => {
      mockConversationHistory.getHistory.mockRejectedValue(new Error('DB error'));
      mockEngagementStore.getProfile.mockResolvedValue({
        currentStreak: 5,
        longestStreak: 5,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._status).toBe(500);
      expect(res._data).toMatchObject({
        error: 'Failed to get progress',
        stage: 'first-meeting',
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
    // first-meeting: 0-9 conversations
    { conversations: 0, days: 0, streak: 0, expectedStage: 'first-meeting', stageNumber: 1 },
    { conversations: 5, days: 0, streak: 0, expectedStage: 'first-meeting', stageNumber: 1 },
    { conversations: 9, days: 0, streak: 0, expectedStage: 'first-meeting', stageNumber: 1 },

    // getting-started: 10+ conversations, 0+ days, 0+ streak
    { conversations: 10, days: 0, streak: 0, expectedStage: 'getting-started', stageNumber: 2 },
    { conversations: 14, days: 4, streak: 2, expectedStage: 'getting-started', stageNumber: 2 },

    // building-trust: 15+ conversations, 5+ days, 3+ streak
    { conversations: 15, days: 5, streak: 3, expectedStage: 'building-trust', stageNumber: 3 },
    { conversations: 20, days: 10, streak: 5, expectedStage: 'building-trust', stageNumber: 3 },

    // established: 30+ conversations, 21+ days, 7+ streak
    { conversations: 30, days: 21, streak: 7, expectedStage: 'established', stageNumber: 4 },
    { conversations: 50, days: 30, streak: 10, expectedStage: 'established', stageNumber: 4 },

    // deep-partnership: 60+ conversations, 45+ days, 14+ streak
    { conversations: 60, days: 45, streak: 14, expectedStage: 'deep-partnership', stageNumber: 5 },
    {
      conversations: 100,
      days: 100,
      streak: 20,
      expectedStage: 'deep-partnership',
      stageNumber: 5,
    },
  ])(
    'should map $conversations conversations, $days days, $streak streak to $expectedStage',
    async ({ conversations, days, streak, expectedStage, stageNumber }) => {
      const firstMeetingDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: conversations });
      mockEngagementStore.getProfile.mockResolvedValue({
        currentStreak: streak,
        longestStreak: streak,
        firstMeetingDate,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/relationship/progress?userId=test-user');

      await handleGetRelationshipProgress(req, res, parsedUrl);

      expect(res._data).toMatchObject({
        stage: expectedStage,
        stageNumber: stageNumber,
        metrics: {
          totalConversations: conversations,
        },
      });
    }
  );
});
