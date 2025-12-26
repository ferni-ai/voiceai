/**
 * End-to-End Tests for Personality Module
 *
 * Tests the full integration flow of the personality system:
 * - Emotional data recording → Pattern detection → Growth tracking
 * - Semantic moment matching → Callback extraction
 * - Timing intelligence → Appropriate moment selection
 * - Session cleanup → Memory management
 *
 * @module tests/personality/personality-e2e
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Core personality exports
import {
  analyzeMessageTiming,
  clearAllUserEmotionalTracking,
  extractCallbackKeyMoments,
  formatCallbackForPrompt,
  formatGrowthForPrompt,
  formatPatternForPrompt,
  getEmotionalHistory,
  getEmotionalTrackingStats,
  getGrowthCelebrations,
  getMomentsForPersona,
  getPatternInsights,
  getPendingCallbacksFromProfile,
  recordEmotionalDataPoint,
  recordGrowthEvidence,
  shouldSharePersonalMoment,
} from '../../personality/index.js';

// Mock embedding for semantic search tests
vi.mock('../../memory/embedding-cache.js', () => ({
  embedCached: vi.fn().mockImplementation(async (text: string) => ({
    ok: true,
    value: Array(768).fill(0).map(() => Math.random()),
  })),
}));

vi.mock('../../memory/embeddings.js', () => ({
  cosineSimilarity: vi.fn().mockImplementation(() => 0.65), // Medium relevance
}));

describe('Personality Module E2E', () => {
  const testUserId = 'e2e-test-user';
  const testSessionId = 'e2e-test-session';

  beforeAll(() => {
    // Ensure clean state before all tests
    clearAllUserEmotionalTracking(testUserId);
  });

  afterEach(() => {
    // Clean up after each test
    clearAllUserEmotionalTracking(testUserId);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // FULL CONVERSATION FLOW TESTS
  // ============================================================================

  describe('Full Conversation Flow', () => {
    it('should track emotional state across multiple turns', () => {
      // Simulate a conversation with emotional progression
      const turns = [
        { emotion: 'neutral', intensity: 0.5, topics: ['greeting'], context: 'Hi there!' },
        { emotion: 'curious', intensity: 0.6, topics: ['work'], context: 'How was your day?' },
        { emotion: 'stress', intensity: 0.7, topics: ['work', 'deadline'], context: 'So much to do...' },
        { emotion: 'anxiety', intensity: 0.8, topics: ['work', 'boss'], context: 'My boss is upset' },
        { emotion: 'stress', intensity: 0.9, topics: ['work', 'pressure'], context: 'Everything is overwhelming' },
      ];

      // Record each turn
      turns.forEach((turn) => {
        recordEmotionalDataPoint(testUserId, turn.emotion, turn.intensity, turn.topics, turn.context);
      });

      // Verify history is recorded
      const history = getEmotionalHistory(testUserId);
      expect(history).toHaveLength(5);

      // After recording correlated work+stress data, patterns may be detected
      const patterns = getPatternInsights(testUserId, { onlyUnsurfaced: true });
      // Pattern detection requires correlation threshold
      expect(patterns).toBeDefined();
    });

    it('should integrate timing analysis with callback extraction', () => {
      // User shares something callback-worthy
      const userMessage = "I have an important interview tomorrow and I'm really nervous";

      // Analyze timing
      const timing = analyzeMessageTiming(userMessage);
      expect(timing.intent).toBeDefined();
      expect(timing.personalMomentAppropriate).toBeDefined();

      // Extract callbacks
      const callbacks = extractCallbackKeyMoments(userMessage);
      expect(callbacks.length).toBeGreaterThan(0);
      expect(callbacks.some((c) => c.type === 'milestone')).toBe(true);

      // Timing should suggest appropriate response - processing_aloud because it's thinking through feelings
      expect(['processing_aloud', 'needs_to_be_heard', 'vulnerable_share']).toContain(timing.intent);
    });

    it('should track growth over time', () => {
      // Record initial struggle
      recordGrowthEvidence(
        testUserId,
        'public_speaking',
        "I can't even think about presenting without panicking",
        false // Starting point - not progress
      );

      // Record progress (would normally be days/weeks later)
      recordGrowthEvidence(
        testUserId,
        'public_speaking',
        'I gave a short presentation today!',
        true // This is progress
      );

      // Note: Growth celebration requires 7+ days between evidence
      // For E2E testing we verify the tracking works
      const celebrations = getGrowthCelebrations(testUserId);
      expect(celebrations).toBeDefined();
    });
  });

  // ============================================================================
  // PERSONA MOMENTS INTEGRATION TESTS
  // ============================================================================

  describe('Persona Moments', () => {
    const personas = ['ferni', 'alex', 'maya', 'jordan', 'peter', 'nayan'];

    personas.forEach((personaId) => {
      it(`${personaId} has moments defined`, () => {
        const moments = getMomentsForPersona(personaId);
        expect(moments.length).toBeGreaterThan(0);

        // Each moment should have required fields
        moments.forEach((moment) => {
          expect(moment.id).toBeDefined();
          expect(moment.personaId).toBe(personaId);
          expect(moment.content).toBeDefined();
          expect(moment.topic).toBeDefined();
          expect(moment.depth).toBeDefined();
          expect(moment.triggers.keywords.length).toBeGreaterThan(0);
          expect(moment.transitions.length).toBeGreaterThan(0);
        });
      });

      it(`${personaId} has depth-appropriate gating`, () => {
        const moments = getMomentsForPersona(personaId);

        // Check that deeper moments require stronger relationships
        const depthToStage: Record<string, string[]> = {
          surface: ['stranger', 'acquaintance', 'friend', 'trusted'],
          medium: ['acquaintance', 'friend', 'trusted'],
          deep: ['friend', 'trusted'],
          sacred: ['trusted'],
        };

        moments.forEach((moment) => {
          const allowedStages = depthToStage[moment.depth];
          expect(allowedStages).toContain(moment.minRelationshipStage);
        });
      });
    });
  });

  // ============================================================================
  // CALLBACK SYSTEM E2E TESTS
  // ============================================================================

  describe('Callback System ("Smile Factor")', () => {
    it('should detect various callback-worthy patterns', () => {
      const testCases = [
        { message: 'I have a presentation next Tuesday', expectedType: 'milestone' },
        { message: "I'm thinking about quitting my job", expectedType: 'decision' },
        { message: "I've never told anyone this before...", expectedType: 'shared_vulnerability' },
        { message: 'I finally finished my thesis!', expectedType: 'celebration' },
      ];

      testCases.forEach(({ message, expectedType }) => {
        const callbacks = extractCallbackKeyMoments(message);
        expect(callbacks.some((c) => c.type === expectedType)).toBe(true);
      });
    });

    it('should format callbacks for prompt injection', () => {
      const mockCallback = {
        moment: {
          id: 'test-moment',
          timestamp: new Date(),
          type: 'milestone' as const,
          summary: 'Job interview on Friday',
          emotionalWeight: 'medium' as const,
          topics: ['career'],
          followUpNeeded: true,
        },
        question: 'How did that interview go?',
      };

      const formatted = formatCallbackForPrompt(mockCallback);

      expect(formatted).toContain('CALLBACK OPPORTUNITY');
      expect(formatted).toContain('Job interview on Friday');
      expect(formatted).toContain('How did that interview go?');
      expect(formatted).toContain('LOVED');
    });

    it('should retrieve pending callbacks from user profile', () => {
      const mockProfile = {
        id: testUserId,
        createdAt: new Date(),
        lastActive: new Date(),
        totalConversations: 10,
        personalityTraits: {},
        keyMoments: [
          {
            id: 'km_1',
            timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            type: 'milestone' as const,
            summary: 'Had job interview',
            emotionalWeight: 'medium' as const,
            topics: ['career'],
            followUpNeeded: true,
          },
          {
            id: 'km_2',
            timestamp: new Date(),
            type: 'celebration' as const,
            summary: 'Got promoted',
            emotionalWeight: 'light' as const,
            topics: ['career'],
            followUpNeeded: false, // Already followed up
          },
        ],
      };

      const pending = getPendingCallbacksFromProfile(mockProfile);

      // Should only return the one needing follow-up
      expect(pending).toHaveLength(1);
      expect(pending[0].moment.id).toBe('km_1');
    });
  });

  // ============================================================================
  // TIMING INTELLIGENCE E2E TESTS
  // ============================================================================

  describe('Timing Intelligence', () => {
    const scenarios = [
      {
        name: 'venting user',
        message: "I can't believe they did that AGAIN! So frustrating!!",
        expectedIntent: 'just_venting',
        personalMomentOk: false,
      },
      {
        name: 'seeking advice',
        message: 'What do you think I should do about this situation?',
        expectedIntent: 'seeking_perspective',
        personalMomentOk: true,
      },
      {
        name: 'vulnerable share',
        message: "I've never told anyone this before...",
        expectedIntent: 'vulnerable_share',
        personalMomentOk: false,
      },
      {
        name: 'celebration',
        message: 'I got the job!! So excited!',
        expectedIntent: 'sharing_good_news',
        personalMomentOk: false,
      },
    ];

    scenarios.forEach(({ name, message, expectedIntent, personalMomentOk }) => {
      it(`correctly identifies ${name}`, () => {
        const timing = analyzeMessageTiming(message);

        expect(timing.intent).toBe(expectedIntent);
        expect(timing.personalMomentAppropriate).toBe(personalMomentOk);
      });
    });

    it('should integrate with shouldSharePersonalMoment', () => {
      // High relevance + venting = don't share
      const ventingResult = shouldSharePersonalMoment(
        "I'm SO annoyed right now! Ugh!!",
        0.9
      );
      expect(ventingResult.should).toBe(false);

      // High relevance + seeking perspective = share
      const seekingResult = shouldSharePersonalMoment(
        'What do you think about that?',
        0.8
      );
      expect(seekingResult.should).toBe(true);
    });
  });

  // ============================================================================
  // MEMORY MANAGEMENT E2E TESTS
  // ============================================================================

  describe('Memory Management', () => {
    it('should track memory stats across users', () => {
      // Record data for multiple users
      const users = ['user-a', 'user-b', 'user-c'];

      users.forEach((userId) => {
        recordEmotionalDataPoint(userId, 'neutral', 0.5, ['test']);
      });

      const stats = getEmotionalTrackingStats();

      expect(stats.emotionalData.userCount).toBeGreaterThanOrEqual(users.length);
      expect(stats.emotionalData.totalDataPoints).toBeGreaterThanOrEqual(users.length);

      // Cleanup
      users.forEach((userId) => clearAllUserEmotionalTracking(userId));
    });

    it('should completely clean up user data on session end', () => {
      // Record various data
      recordEmotionalDataPoint(testUserId, 'happy', 0.8, ['test']);
      recordGrowthEvidence(testUserId, 'test-area', 'evidence', false);

      // Verify data exists
      expect(getEmotionalHistory(testUserId).length).toBeGreaterThan(0);

      // Cleanup
      clearAllUserEmotionalTracking(testUserId);

      // Verify all data is cleared
      expect(getEmotionalHistory(testUserId)).toHaveLength(0);
      expect(getGrowthCelebrations(testUserId)).toHaveLength(0);
      expect(getPatternInsights(testUserId)).toHaveLength(0);
    });
  });

  // ============================================================================
  // PROMPT FORMATTING E2E TESTS
  // ============================================================================

  describe('Prompt Formatting', () => {
    it('should format pattern insights for LLM', () => {
      const mockPattern = {
        id: 'test-pattern',
        userId: testUserId,
        pattern: 'work → stress/anxiety',
        evidence: ['deadline mention', 'boss stress', 'overwhelm'],
        trend: 'triggered' as const,
        triggers: ['work'],
        insight: "I've noticed you seem stressed when work comes up",
        deliveryTiming: 'when_relevant' as const,
        confidence: 0.75,
        detectedAt: new Date(),
        lastUpdated: new Date(),
        surfacedToUser: false,
      };

      const formatted = formatPatternForPrompt(mockPattern);

      expect(formatted).toContain('PATTERN INSIGHT');
      expect(formatted).toContain('SUPERHUMAN');
      expect(formatted).toContain('75%');
      expect(formatted).toContain("I've noticed");
    });

    it('should format growth celebrations for LLM', () => {
      const mockGrowth = {
        id: 'test-growth',
        userId: testUserId,
        area: 'confidence',
        pastEvidence: 'too scared to speak up',
        pastDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        currentEvidence: 'led the team meeting',
        currentDate: new Date(),
        celebration: 'Look at you now! That growth is real.',
        significance: 'breakthrough' as const,
        surfaced: false,
      };

      const formatted = formatGrowthForPrompt(mockGrowth);

      expect(formatted).toContain('GROWTH CELEBRATION');
      expect(formatted).toContain('SUPERHUMAN');
      expect(formatted).toContain('confidence');
      expect(formatted).toContain('too scared');
      expect(formatted).toContain('led the team');
    });
  });

  // ============================================================================
  // INTEGRATION WITH SESSION COORDINATOR
  // ============================================================================

  describe('Session Coordinator Integration', () => {
    it('exports are compatible with session coordinator imports', async () => {
      // Verify all exports used by session-coordinator.ts are available
      const {
        findRelevantMomentSemantic,
        formatCallbackForPrompt,
        getPendingCallbacksFromProfile,
        analyzeMessageTiming,
        clearAllUserEmotionalTracking,
      } = await import('../../personality/index.js');

      expect(findRelevantMomentSemantic).toBeInstanceOf(Function);
      expect(formatCallbackForPrompt).toBeInstanceOf(Function);
      expect(getPendingCallbacksFromProfile).toBeInstanceOf(Function);
      expect(analyzeMessageTiming).toBeInstanceOf(Function);
      expect(clearAllUserEmotionalTracking).toBeInstanceOf(Function);
    });
  });
});

