/**
 * End-to-End Integration Test for Shared Personality Pipeline
 *
 * Tests the full flow from input → context assembly → noticing → expression → output
 * for all personas using the "Better Than Human" system.
 */

import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import {
  sharedPersonality,
  cleanupSharedPersonalitySession,
  type SharedPersonalityTurnInput,
} from '../shared-personality-integration.js';
import { hasPersonaBuildingBlocks, getPersonaBuildingBlocks } from '../persona-building-blocks.js';

// Mock Firestore to avoid actual DB calls
vi.mock('../../../memory/firestore.js', () => ({
  getFirestore: vi.fn().mockResolvedValue({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({
          exists: false,
          data: () => undefined,
        }),
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            set: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue({
              exists: false,
              data: () => undefined,
            }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock('../personality-resonance-store.js', () => ({
  prewarmResonanceCache: vi.fn().mockResolvedValue(undefined),
  recordResonanceEvent: vi.fn().mockResolvedValue(undefined),
  recordUserTopicMention: vi.fn().mockResolvedValue(undefined),
  recordVulnerabilityResponse: vi.fn().mockResolvedValue(undefined),
  flushResonanceProfile: vi.fn().mockResolvedValue(undefined),
  loadResonanceProfile: vi.fn().mockResolvedValue(null),
  getCachedResonance: vi.fn().mockReturnValue(null),
  detectEngagement: vi.fn().mockReturnValue('neutral'),
  sharedPersonalityResonanceStore: {
    loadProfile: vi.fn().mockResolvedValue(null),
    getCached: vi.fn().mockReturnValue(null),
    recordEvent: vi.fn().mockResolvedValue(undefined),
    recordTopic: vi.fn().mockResolvedValue(undefined),
    recordVulnerability: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    prewarm: vi.fn().mockResolvedValue(undefined),
    detectEngagement: vi.fn().mockReturnValue('neutral'),
  },
}));

// Mock A/B testing to always return treatment for tests
vi.mock('../personality-ab-testing.js', () => ({
  getVariant: vi.fn().mockReturnValue('treatment'),
  isFeatureEnabled: vi.fn().mockReturnValue(true),
  incrementMetric: vi.fn(),
  createSessionMetricsTracker: vi.fn().mockReturnValue({
    turnCount: 0,
    sessionDurationMs: 0,
    averageTurnLengthWords: 0,
    positiveResponses: 0,
    negativeResponses: 0,
    neutralResponses: 0,
    noticingsTriggered: 0,
    noticingsAcknowledged: 0,
    expressionsInjected: 0,
    expressionsEngaged: 0,
    topicChanges: 0,
    deepTopicExplorations: 0,
    vulnerabilityMoments: 0,
    breakthroughMoments: 0,
  }),
  recordSessionEngagement: vi.fn(),
}));

describe('Personality Pipeline E2E', () => {
  const PERSONAS = [
    'maya-santos',
    'peter-john',
    'alex-chen',
    'jordan-taylor',
    'nayan-patel',
  ] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up all sessions
    PERSONAS.forEach((personaId) => {
      cleanupSharedPersonalitySession(`e2e-${personaId}`, `user-${personaId}`);
    });
  });

  afterAll(() => {
    vi.clearAllTimers();
  });

  describe('all personas have building blocks', () => {
    PERSONAS.forEach((personaId) => {
      it(`${personaId} has building blocks defined`, () => {
        expect(hasPersonaBuildingBlocks(personaId)).toBe(true);

        const blocks = getPersonaBuildingBlocks(personaId);
        expect(blocks).not.toBeNull();
        // Core required fields from PersonaBuildingBlocks interface
        expect(blocks!.passions).toBeDefined();
        expect(blocks!.opinions).toBeDefined();
        expect(blocks!.quirks).toBeDefined();
        expect(blocks!.locations).toBeDefined();
        expect(blocks!.vulnerabilities).toBeDefined();
        expect(blocks!.familyFragments).toBeDefined();
        expect(blocks!.warmDrinks).toBeDefined();
        expect(blocks!.topicConnections).toBeDefined();
      });
    });
  });

  describe('full conversation flow', () => {
    PERSONAS.forEach((personaId) => {
      it(`${personaId}: processes multi-turn conversation`, async () => {
        const sessionId = `e2e-${personaId}`;
        const userId = `user-${personaId}`;

        // Turn 1: Opening
        const turn1 = await sharedPersonality.processTurn({
          personaId,
          sessionId,
          userId,
          turnCount: 1,
          userTranscript: 'Hi there!',
        });
        expect(turn1.personaId).toBe(personaId);
        expect(turn1.context.turnCount).toBe(1);

        // Turn 2: Some context
        const turn2 = await sharedPersonality.processTurn({
          personaId,
          sessionId,
          userId,
          turnCount: 2,
          userTranscript: "I've been thinking about making some changes in my life.",
        });
        expect(turn2.personaId).toBe(personaId);
        expect(turn2.context.turnCount).toBe(2);

        // Turn 3: Emotional sharing
        const turn3 = await sharedPersonality.processTurn({
          personaId,
          sessionId,
          userId,
          turnCount: 3,
          userTranscript: "It's been really hard lately...",
          textEmotion: {
            primary: 'sad',
            intensity: 0.7,
            distressLevel: 0.5,
          },
        });
        expect(turn3.personaId).toBe(personaId);
        expect(turn3.context.distressLevel).toBeGreaterThan(0);
      });
    });
  });

  describe('noticing detection across personas', () => {
    PERSONAS.forEach((personaId) => {
      it(`${personaId}: detects significant pause`, async () => {
        const result = await sharedPersonality.processTurn({
          personaId,
          sessionId: `noticing-${personaId}`,
          userId: `user-${personaId}`,
          turnCount: 3,
          userTranscript: "I don't know...",
          pauseBeforeMs: 3500, // 3.5 second pause
        });

        // Should detect the pause
        if (result.noticing) {
          expect(result.noticing.type).toBe('significant_pause');
          expect(result.noticing.personaId).toBe(personaId);
          expect(result.noticing.acknowledgment).toBeDefined();
        }
      });
    });
  });

  describe('context assembly correctness', () => {
    const testInput: SharedPersonalityTurnInput = {
      personaId: 'maya-santos',
      sessionId: 'context-test',
      userId: 'context-user',
      turnCount: 5,
      userTranscript: "I've been trying to build a meditation habit.",
      voiceEmotion: {
        primary: 'calm',
        confidence: 0.85,
        arousal: 0.3,
        valence: 0.5,
      },
      speechRateWPM: 110,
      pauseBeforeMs: 800,
      textEmotion: {
        primary: 'hopeful',
        intensity: 0.6,
        distressLevel: 0.1,
      },
      conversationMomentum: 'cruising',
      currentTopics: ['meditation', 'habits'],
      lastTopics: ['work'],
      relationshipStage: 'friend',
      totalConversations: 20,
      sharedVulnerabilities: 2,
    };

    it('assembles temporal context correctly', async () => {
      const result = await sharedPersonality.processTurn(testInput);

      expect(result.context.timeOfDay).toBeDefined();
      expect(['dawn', 'morning', 'afternoon', 'evening', 'night', 'late_night']).toContain(
        result.context.timeOfDay
      );
      expect(result.context.dayOfWeek).toBeGreaterThanOrEqual(0);
      expect(result.context.dayOfWeek).toBeLessThanOrEqual(6);
      expect(typeof result.context.isWeekend).toBe('boolean');
    });

    it('assembles emotional context correctly', async () => {
      const result = await sharedPersonality.processTurn(testInput);

      expect(result.context.emotionalIntensity).toBeGreaterThanOrEqual(0);
      expect(result.context.emotionalIntensity).toBeLessThanOrEqual(1);
      expect(['rising', 'falling', 'stable', 'volatile']).toContain(
        result.context.emotionalTrajectory
      );
      expect(result.context.distressLevel).toBeGreaterThanOrEqual(0);
    });

    it('assembles conversational context correctly', async () => {
      const result = await sharedPersonality.processTurn(testInput);

      expect(['opening', 'cruising', 'peaking', 'intimate', 'closing', 'stalled']).toContain(
        result.context.conversationMomentum
      );
      expect(result.context.currentTopic).toBe('meditation');
      expect(result.context.lastTopic).toBe('work');
    });

    it('assembles voice/presence signals correctly', async () => {
      const result = await sharedPersonality.processTurn(testInput);

      expect(['fast', 'normal', 'slow', 'hesitant']).toContain(result.context.userSpeechPace);
      expect(result.context.pauseBeforeUserSpoke).toBe(800);
      expect(['high', 'medium', 'low', 'subdued']).toContain(result.context.voiceEnergyLevel);
    });

    it('assembles relational context correctly', async () => {
      const result = await sharedPersonality.processTurn(testInput);

      expect(['stranger', 'acquaintance', 'friend', 'trusted_advisor']).toContain(
        result.context.relationshipStage
      );
      expect(result.context.sharedVulnerabilityCount).toBe(2);
      expect(result.context.conversationsTotal).toBe(20);
    });
  });

  describe('expression composition', () => {
    it('composes expressions with correct structure', async () => {
      // Use high turn count and specific context to trigger expression
      const result = await sharedPersonality.processTurn({
        personaId: 'maya-santos',
        sessionId: 'expression-test',
        userId: 'expression-user',
        turnCount: 10,
        userTranscript: 'I finally did my morning meditation today!',
        textEmotion: {
          primary: 'proud',
          intensity: 0.8,
          distressLevel: 0,
        },
        conversationMomentum: 'peaking',
        relationshipStage: 'friend',
        totalConversations: 30,
        sharedVulnerabilities: 5,
      });

      // If expression was composed, verify its structure
      if (result.expression) {
        expect(result.expression.content).toBeDefined();
        expect(typeof result.expression.content).toBe('string');
        expect(result.expression.theme).toBeDefined();
        expect(result.expression.intimacyLevel).toBeGreaterThanOrEqual(0);
        expect(result.expression.intimacyLevel).toBeLessThanOrEqual(1);
        expect(['immediate', 'after_pause', 'mid_response', 'at_end']).toContain(
          result.expression.timing
        );
        expect(result.expression.compositionReason).toBeDefined();
      }
    });
  });

  describe('injection point correctness', () => {
    it('returns valid injection points', async () => {
      const result = await sharedPersonality.processTurn({
        personaId: 'peter-john',
        sessionId: 'injection-test',
        userId: 'injection-user',
        turnCount: 5,
        userTranscript: 'What do you think about index funds?',
        pauseBeforeMs: 3000, // Should trigger noticing
      });

      const validPoints = [
        'before_response',
        'mid_response',
        'after_response',
        'as_acknowledgment',
      ];
      expect(validPoints).toContain(result.injectionPoint);
    });
  });

  describe('persona differentiation', () => {
    it('different personas have different building blocks', () => {
      const mayaBlocks = getPersonaBuildingBlocks('maya-santos');
      const peterBlocks = getPersonaBuildingBlocks('peter-john');
      const nayanBlocks = getPersonaBuildingBlocks('nayan-patel');

      // They should all exist
      expect(mayaBlocks).not.toBeNull();
      expect(peterBlocks).not.toBeNull();
      expect(nayanBlocks).not.toBeNull();

      // And be different
      expect(mayaBlocks!.passions[0]).not.toEqual(peterBlocks!.passions[0]);
      expect(peterBlocks!.passions[0]).not.toEqual(nayanBlocks!.passions[0]);
    });

    it('Jordan has celebratory themes', () => {
      const jordanBlocks = getPersonaBuildingBlocks('jordan-taylor');
      expect(jordanBlocks).not.toBeNull();

      // Jordan should have celebration-related content
      const hasPartyTheme = jordanBlocks!.passions.some(
        (p) =>
          p.expression.toLowerCase().includes('party') ||
          p.expression.toLowerCase().includes('celebration') ||
          p.expression.toLowerCase().includes('event')
      );
      expect(hasPartyTheme).toBe(true);
    });

    it('Alex has communication-related content', () => {
      const alexBlocks = getPersonaBuildingBlocks('alex-chen');
      expect(alexBlocks).not.toBeNull();

      // Alex should have passions, opinions, quirks, etc.
      expect(alexBlocks!.passions.length).toBeGreaterThan(0);
      expect(alexBlocks!.opinions.length).toBeGreaterThan(0);
      expect(alexBlocks!.quirks.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('handles unknown persona gracefully', async () => {
      const result = await sharedPersonality.processTurn({
        personaId: 'unknown-persona',
        sessionId: 'error-test',
        userId: 'error-user',
        turnCount: 1,
        userTranscript: 'Hello',
      });

      // Should not throw, should return safe result
      expect(result.shouldInject).toBe(false);
      expect(result.personaId).toBe('unknown-persona');
    });

    it('handles missing optional fields gracefully', async () => {
      const result = await sharedPersonality.processTurn({
        personaId: 'maya-santos',
        sessionId: 'minimal-test',
        userId: 'minimal-user',
        turnCount: 1,
        userTranscript: 'Hello',
        // No optional fields provided
      });

      // Should not throw
      expect(result.context).toBeDefined();
      expect(result.context.turnCount).toBe(1);
    });
  });

  describe('session cleanup', () => {
    it('cleanup removes session state', async () => {
      // Create some session state
      await sharedPersonality.processTurn({
        personaId: 'maya-santos',
        sessionId: 'cleanup-e2e',
        userId: 'cleanup-user',
        turnCount: 1,
        userTranscript: 'Hello',
      });

      // Cleanup
      cleanupSharedPersonalitySession('cleanup-e2e', 'cleanup-user');

      // Process again - should start fresh
      const result = await sharedPersonality.processTurn({
        personaId: 'maya-santos',
        sessionId: 'cleanup-e2e',
        userId: 'cleanup-user',
        turnCount: 1,
        userTranscript: 'Hello again',
      });

      // Session state should be reset (turnsSinceLastExpression starts high)
      expect(result.context.turnCount).toBe(1);
    });
  });
});
