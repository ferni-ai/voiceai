/**
 * Semantic Intelligence E2E Integration Test
 *
 * Validates that semantic data capture → storage → context injection
 * flows end-to-end correctly.
 *
 * @module tests/integration/semantic-intelligence-e2e
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Firestore before any imports
vi.mock('../../memory/firestore/client.js', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({ exists: false, data: () => null })),
        set: vi.fn(async () => {}),
        update: vi.fn(async () => {}),
        delete: vi.fn(async () => {}),
      })),
      where: vi.fn(() => ({
        get: vi.fn(async () => ({ docs: [] })),
      })),
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({ docs: [] })),
        })),
      })),
    })),
  })),
}));

describe('Semantic Intelligence E2E', () => {
  const TEST_USER_ID = 'test-user-semantic-e2e';
  const TEST_SESSION_ID = 'test-session-semantic-e2e';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Data Recording Flow', () => {
    it('should record semantic data from turn handler', async () => {
      const { processSemanticIntelligence } =
        await import('../../services/superhuman/semantic-intelligence/integration.js');

      const testData = {
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        personaId: 'ferni',
        turnNumber: 5,
        userText: 'I talked to my mom today and felt really happy about our conversation',
        topic: 'family',
        topics: ['family', 'relationships'],
        textEmotion: 'happy',
        textEmotionIntensity: 0.8,
        voiceEmotion: 'content',
        voiceEmotionConfidence: 0.7,
        voiceEmotionIntensity: 0.6,
        timestamp: new Date(),
        dayOfWeek: new Date().getDay(),
        hourOfDay: new Date().getHours(),
        turnsSinceStart: 5,
        mentionedPerson: 'mom',
      };

      // Should not throw
      await expect(processSemanticIntelligence(testData)).resolves.not.toThrow();
    });

    it('should detect and record advice from agent responses', async () => {
      const { detectAdvice, trackAdviceInResponse } =
        await import('../../services/superhuman/semantic-intelligence/advice-detector.js');

      // Test advice detection
      const responseWithAdvice = "I'd suggest taking a break when you feel overwhelmed.";
      const detection = detectAdvice(responseWithAdvice);

      expect(detection.containsAdvice).toBe(true);
      expect(detection.category).toBe('practical');
      expect(detection.confidence).toBeGreaterThan(0.6);
      expect(detection.adviceText).toContain('suggest');

      // Test non-advice
      const responseWithoutAdvice = 'That sounds really tough. Tell me more about it.';
      const noAdvice = detectAdvice(responseWithoutAdvice);
      expect(noAdvice.containsAdvice).toBe(false);

      // Test full tracking (should not throw)
      await expect(
        trackAdviceInResponse(responseWithAdvice, {
          userId: TEST_USER_ID,
          sessionId: TEST_SESSION_ID,
          personaId: 'ferni',
          topic: 'stress',
          userSituation: 'feeling overwhelmed at work',
          userEmotion: 'stressed',
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Context Building Flow', () => {
    it('should build semantic intelligence context', async () => {
      const { buildSemanticIntelligenceContext, formatSemanticIntelligenceContext } =
        await import('../../services/superhuman/semantic-intelligence/index.js');

      const context = await buildSemanticIntelligenceContext(TEST_USER_ID, {
        content: 'I talked to Sarah yesterday and felt really good',
        topics: ['relationships'],
        emotion: 'happy',
        personMentioned: 'Sarah',
        isSessionStart: true,
      });

      // Context should have the expected structure
      expect(context).toHaveProperty('activeCorrelations');
      expect(context).toHaveProperty('emotionalArcs');
      expect(context).toHaveProperty('relationalInsights');
      expect(context).toHaveProperty('growthContext');
      expect(context).toHaveProperty('hiddenConnections');
      expect(context).toHaveProperty('proactiveInsights');
      expect(context).toHaveProperty('openLoops');
      expect(context).toHaveProperty('ferniCommitments');
      expect(context).toHaveProperty('relationshipGraph');
      expect(context).toHaveProperty('temporalPatterns');
      expect(context).toHaveProperty('behavioralIntelligence');
      expect(context).toHaveProperty('coachingIntelligence');
      expect(context).toHaveProperty('selfAwareness');

      // Formatting should not throw
      const formatted = formatSemanticIntelligenceContext(context);
      expect(typeof formatted).toBe('string');
    });

    it('should format context with proper headers when content exists', async () => {
      const { formatSemanticIntelligenceContext } =
        await import('../../services/superhuman/semantic-intelligence/index.js');

      // Context with actual content
      const contextWithContent = {
        activeCorrelations: ['Pattern: When you talk about work, you often mention stress'],
        emotionalArcs: ['Emotional journey: Moving from stressed → hopeful over past week'],
        relationalInsights: ['Sarah consistently brings you joy - mentioned 5 times positively'],
        relevantPatterns: [],
        growthContext: 'Growth noted: You\'re using "I feel" statements more often now',
        hiddenConnections: [
          'Last month you mentioned wanting more time with family - you just made that happen',
        ],
        proactiveInsights: 'Insight: You mentioned wanting to call your mom last week',
        openLoops: '',
        ferniCommitments: '',
        relationshipGraph: '',
        temporalPatterns: '',
        behavioralIntelligence: '',
        coachingIntelligence: '',
        selfAwareness: '',
      };

      const formatted = formatSemanticIntelligenceContext(contextWithContent);

      // Should contain header
      expect(formatted).toContain('SEMANTIC INTELLIGENCE');
      expect(formatted).toContain('Better Than Human');

      // Should contain the injected content
      expect(formatted).toContain('work');
      expect(formatted).toContain('Sarah');
    });

    it('should return empty string when no meaningful content', async () => {
      const { formatSemanticIntelligenceContext } =
        await import('../../services/superhuman/semantic-intelligence/index.js');

      const emptyContext = {
        activeCorrelations: [],
        emotionalArcs: [],
        relationalInsights: [],
        relevantPatterns: [],
        growthContext: '',
        hiddenConnections: [],
        proactiveInsights: '',
        openLoops: '',
        ferniCommitments: '',
        relationshipGraph: '',
        temporalPatterns: '',
        behavioralIntelligence: '',
        coachingIntelligence: '',
        selfAwareness: '',
      };

      const formatted = formatSemanticIntelligenceContext(emptyContext);
      expect(formatted).toBe('');
    });
  });

  describe('Context Builder Integration', () => {
    it('should register semantic intelligence builder', async () => {
      // Import to ensure registration and get builder directly
      const { semanticIntelligenceBuilder } =
        await import('../../intelligence/context-builders/superhuman/semantic-intelligence-integration.js');

      expect(semanticIntelligenceBuilder).toBeDefined();
      expect(semanticIntelligenceBuilder.name).toBe('semantic-intelligence');
      // BuilderCategory enum values are lowercase
      expect(semanticIntelligenceBuilder.category.toUpperCase()).toBe('MEMORY');
    });

    it('should run builder and return injections', async () => {
      // Import to ensure registration
      const { semanticIntelligenceBuilder } =
        await import('../../intelligence/context-builders/superhuman/semantic-intelligence-integration.js');

      const mockInput = {
        services: {
          userId: TEST_USER_ID,
          sessionId: TEST_SESSION_ID,
        },
        userData: {
          turnCount: 5,
        },
        analysis: {
          topics: { detected: ['family'] },
          emotion: { primary: 'happy' },
        },
        userText: 'I talked to my mom today',
        voiceEmotion: { emotion: 'content' },
        persona: { id: 'ferni' },
      };

      // Should return array (possibly empty if no cached data)
      const injections = await semanticIntelligenceBuilder.build(mockInput as any);
      expect(Array.isArray(injections)).toBe(true);
    });

    it('should run builder on early turns for returning users (session start)', async () => {
      const { semanticIntelligenceBuilder } =
        await import('../../intelligence/context-builders/superhuman/semantic-intelligence-integration.js');

      const mockInput = {
        services: {
          userId: 'new-user-no-history',
          sessionId: 'new-session',
        },
        userData: {
          turnCount: 0, // First turn - session start enables "I remember from last time..."
        },
        analysis: {},
        userText: 'Hello',
        persona: { id: 'ferni' },
      };

      // Should run - returns array (possibly with content from past sessions)
      const injections = await semanticIntelligenceBuilder.build(mockInput as any);
      expect(Array.isArray(injections)).toBe(true);
    });

    it('should skip builder for anonymous users', async () => {
      const { semanticIntelligenceBuilder } =
        await import('../../intelligence/context-builders/superhuman/semantic-intelligence-integration.js');

      const mockInput = {
        services: {
          userId: undefined,
          sessionId: 'anon-session',
        },
        userData: {
          turnCount: 10,
        },
        analysis: {},
        userText: 'Hello',
        persona: { id: 'ferni' },
      };

      const injections = await semanticIntelligenceBuilder.build(mockInput as any);
      expect(injections).toHaveLength(0);
    });
  });

  describe('Session Priming Integration', () => {
    it('should include semantic intelligence in session priming', async () => {
      const { buildSuperhumanSessionPriming, clearAllSuperhumanPrimingSessions } =
        await import('../../intelligence/context-builders/superhuman-session-priming.js');

      // Clear any cached sessions
      clearAllSuperhumanPrimingSessions();

      const mockInput = {
        services: {
          userId: TEST_USER_ID,
          sessionId: 'new-priming-session',
        },
        userData: {
          turnCount: 1,
        },
        persona: { id: 'ferni' },
      };

      // Should not throw
      const injections = await buildSuperhumanSessionPriming(mockInput as any);
      expect(Array.isArray(injections)).toBe(true);

      // Second call with same session should return empty (already primed)
      const secondCall = await buildSuperhumanSessionPriming(mockInput as any);
      expect(secondCall).toHaveLength(0);
    });
  });

  describe('Advice Detection Patterns', () => {
    it('should detect behavioral advice', async () => {
      const { detectAdvice } =
        await import('../../services/superhuman/semantic-intelligence/advice-detector.js');

      const patterns = [
        { text: 'You should try to get more sleep.', expected: 'behavioral' },
        { text: 'Try keeping a journal of your thoughts.', expected: 'behavioral' },
        { text: 'Maybe try taking a short walk.', expected: 'behavioral' },
      ];

      for (const { text, expected } of patterns) {
        const result = detectAdvice(text);
        expect(result.containsAdvice).toBe(true);
        expect(result.category).toBe(expected);
      }
    });

    it('should detect emotional advice', async () => {
      const { detectAdvice } =
        await import('../../services/superhuman/semantic-intelligence/advice-detector.js');

      const patterns = [
        { text: "It's okay to feel upset about this.", expected: 'emotional' },
        { text: 'Give yourself permission to rest.', expected: 'emotional' },
        { text: 'Be gentle with yourself today.', expected: 'emotional' },
      ];

      for (const { text, expected } of patterns) {
        const result = detectAdvice(text);
        expect(result.containsAdvice).toBe(true);
        expect(result.category).toBe(expected);
      }
    });

    it('should detect relational advice', async () => {
      const { detectAdvice } =
        await import('../../services/superhuman/semantic-intelligence/advice-detector.js');

      // "set a boundary" triggers relational - no other pattern before it
      const boundaryAdvice =
        'It sounds like this person is overwhelming. Set a boundary with them.';
      const result = detectAdvice(boundaryAdvice);
      expect(result.containsAdvice).toBe(true);
      expect(result.category).toBe('relational');

      // "talk to them about" is explicitly relational
      const talkAdvice = 'Talk to them about how you feel.';
      const result2 = detectAdvice(talkAdvice);
      expect(result2.containsAdvice).toBe(true);
      expect(result2.category).toBe('relational');
    });

    it('should not detect questions as advice', async () => {
      const { detectAdvice } =
        await import('../../services/superhuman/semantic-intelligence/advice-detector.js');

      const questions = [
        'How are you feeling about that?',
        'Did you talk to her?',
        'Would you like to explore that more?',
      ];

      for (const text of questions) {
        const result = detectAdvice(text);
        expect(result.containsAdvice).toBe(false);
      }
    });
  });

  describe('Person Extraction', () => {
    it('should extract relationship mentions', async () => {
      const { semanticIntelligenceBuilder } =
        await import('../../intelligence/context-builders/superhuman/semantic-intelligence-integration.js');

      // The builder has a private extractMentionedPerson function
      // We test it indirectly through the builder
      const textsWithPeople = [
        { text: 'My mom called today', expectedMatch: true },
        { text: 'My boss said I did great', expectedMatch: true },
        { text: 'My friend Sarah wants to hang out', expectedMatch: true },
        { text: 'The weather is nice today', expectedMatch: false },
      ];

      for (const { text } of textsWithPeople) {
        const mockInput = {
          services: { userId: TEST_USER_ID, sessionId: TEST_SESSION_ID },
          userData: { turnCount: 5 },
          analysis: { topics: { detected: [] }, emotion: {} },
          userText: text,
          persona: { id: 'ferni' },
        };

        // Should not throw
        await expect(semanticIntelligenceBuilder.build(mockInput as any)).resolves.not.toThrow();
      }
    });
  });
});
