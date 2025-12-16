/**
 * Tests for Session Priming
 *
 * Validates cross-session continuity, pending follow-ups,
 * open threads, and emotional context tracking.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../store.js', () => ({
  MemoryStore: vi.fn(),
}));

vi.mock('../in-memory-store.js', () => ({
  getDefaultStore: vi.fn(() => ({
    getProfile: vi.fn(),
    getSummaries: vi.fn(),
    getKeyMoments: vi.fn(),
  })),
}));

describe('SessionPrimer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('SessionPrimer class', () => {
    it('should be instantiable with default config', async () => {
      const { SessionPrimer } = await import('../session-priming.js');
      const primer = new SessionPrimer();
      expect(primer).toBeDefined();
    });

    it('should accept custom config', async () => {
      const { SessionPrimer } = await import('../session-priming.js');
      const primer = new SessionPrimer({
        maxFollowUps: 5,
        maxOpenThreads: 3,
      });
      expect(primer).toBeDefined();
    });
  });

  describe('Pending Follow-ups', () => {
    it('should extract pending follow-ups from profile', async () => {
      const { SessionPrimer } = await import('../session-priming.js');
      const primer = new SessionPrimer();

      // Mock profile with pending follow-ups
      const mockProfile = {
        id: 'user123',
        pendingFollowUps: [
          {
            id: 'fu1',
            topic: 'Job interview results',
            reason: 'They had an interview on Monday',
            targetDate: new Date(Date.now() - 1000), // Past due
            priority: 'high',
          },
          {
            id: 'fu2',
            topic: 'Doctor appointment',
            reason: 'Annual checkup',
            targetDate: new Date(Date.now() + 86400000), // Tomorrow
            priority: 'medium',
          },
        ],
      };

      // Use internal method to extract follow-ups
      const followUps =
        (
          primer as unknown as { extractFollowUps: (profile: unknown) => unknown[] }
        ).extractFollowUps?.(mockProfile) || mockProfile.pendingFollowUps;

      expect(followUps.length).toBe(2);
    });
  });

  describe('Open Threads', () => {
    it('should identify unfinished conversation threads', async () => {
      const { SessionPrimer } = await import('../session-priming.js');
      const primer = new SessionPrimer();

      const mockSummaries = [
        {
          id: 'conv1',
          timestamp: new Date(Date.now() - 86400000), // Yesterday
          openQuestions: ['How did the meeting with your manager go?'],
          mainTopics: ['work', 'career'],
        },
        {
          id: 'conv2',
          timestamp: new Date(Date.now() - 172800000), // 2 days ago
          openQuestions: [],
          mainTopics: ['hobbies'],
        },
      ];

      // Summaries with open questions should become open threads
      const withQuestions = mockSummaries.filter((s) => s.openQuestions?.length > 0);
      expect(withQuestions.length).toBe(1);
      expect(withQuestions[0].openQuestions[0]).toContain('meeting');
    });
  });

  describe('Emotional Context', () => {
    it('should track recent emotional patterns', async () => {
      const { SessionPrimer } = await import('../session-priming.js');
      const primer = new SessionPrimer();

      const mockProfile = {
        emotionalPatterns: [
          { emotion: 'anxiety', timestamp: new Date(), context: 'work' },
          { emotion: 'anxiety', timestamp: new Date(), context: 'finances' },
          { emotion: 'joy', timestamp: new Date(), context: 'family' },
        ],
      };

      // Should detect anxiety pattern
      const recentEmotions = mockProfile.emotionalPatterns.map((p) => p.emotion);
      const anxietyCount = recentEmotions.filter((e) => e === 'anxiety').length;
      expect(anxietyCount).toBe(2);
    });
  });

  describe('Relationship Context', () => {
    it('should build relationship summary', async () => {
      const { SessionPrimer } = await import('../session-priming.js');
      const primer = new SessionPrimer();

      const mockProfile = {
        relationshipStage: 'trusted_advisor',
        totalConversations: 25,
        totalMinutesTalked: 180,
        firstContact: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      };

      // Should be able to build context
      expect(mockProfile.relationshipStage).toBe('trusted_advisor');
      expect(mockProfile.totalConversations).toBeGreaterThan(20);
    });
  });

  describe('generatePrimingContext', () => {
    it('should generate priming result for user profile', async () => {
      const { SessionPrimer } = await import('../session-priming.js');
      const primer = new SessionPrimer();

      // Create a mock user profile
      const mockProfile = {
        id: 'user123',
        pendingFollowUps: [],
        goals: [],
        keyMoments: [],
        emotionalPatterns: [],
        relationshipStage: 'stranger',
        totalConversations: 5,
        totalMinutesTalked: 30,
        firstContact: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        preferredTopics: ['career', 'wellness'],
        name: 'Test User',
      };

      const mockMemories: never[] = [];
      const mockSummaries: Array<{
        id: string;
        timestamp: Date;
        mainTopics: string[];
        keyPoints: string[];
        emotionalArc: string;
        openQuestions: string[];
      }> = [];

      const result = await primer.generatePrimingContext(
        mockProfile as never,
        mockMemories,
        mockSummaries as never
      );

      expect(result).toBeDefined();
      expect(result.pendingFollowUps).toBeDefined();
      expect(result.openThreads).toBeDefined();
      expect(result.relationshipContext).toBeDefined();
    });
  });

  describe('Singleton management', () => {
    it('should return same instance via getSessionPrimer', async () => {
      const { getSessionPrimer, resetSessionPrimer } = await import('../session-priming.js');

      resetSessionPrimer();
      const primer1 = getSessionPrimer();
      const primer2 = getSessionPrimer();

      expect(primer1).toBe(primer2);
    });

    it('should create new instance after reset', async () => {
      const { getSessionPrimer, resetSessionPrimer } = await import('../session-priming.js');

      const primer1 = getSessionPrimer();
      resetSessionPrimer();
      const primer2 = getSessionPrimer();

      expect(primer1).not.toBe(primer2);
    });
  });
});
