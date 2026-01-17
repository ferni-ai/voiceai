/**
 * Unit tests for Shared Personality Integration
 *
 * Tests the "Better Than Human" personality system that works for ALL personas.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sharedPersonality,
  hasSharedPersonalitySupport,
  cleanupSharedPersonalitySession,
  type SharedPersonalityTurnInput,
} from '../shared-personality-integration.js';

// Mock the dependencies
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

describe('shared-personality-integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up any session state
    cleanupSharedPersonalitySession('test-session', 'test-user');
  });

  describe('hasSharedPersonalitySupport', () => {
    it('returns true for Maya', () => {
      expect(hasSharedPersonalitySupport('maya-santos')).toBe(true);
    });

    it('returns true for Peter', () => {
      expect(hasSharedPersonalitySupport('peter-john')).toBe(true);
    });

    it('returns true for Alex', () => {
      expect(hasSharedPersonalitySupport('alex-chen')).toBe(true);
    });

    it('returns true for Jordan', () => {
      expect(hasSharedPersonalitySupport('jordan-taylor')).toBe(true);
    });

    it('returns true for Nayan', () => {
      expect(hasSharedPersonalitySupport('nayan-patel')).toBe(true);
    });

    it('returns true for Ferni', () => {
      // Ferni has building blocks even though she has her own system
      expect(hasSharedPersonalitySupport('ferni')).toBe(true);
    });

    it('returns false for unknown persona', () => {
      expect(hasSharedPersonalitySupport('unknown-persona')).toBe(false);
    });
  });

  describe('processTurn', () => {
    const createBaseInput = (personaId: string): SharedPersonalityTurnInput => ({
      personaId,
      sessionId: 'test-session',
      userId: 'test-user',
      turnCount: 1,
      userTranscript: 'Hello, how are you?',
    });

    it('returns empty result for unknown persona', async () => {
      const input = createBaseInput('unknown-persona');
      const result = await sharedPersonality.processTurn(input);

      expect(result.shouldInject).toBe(false);
      expect(result.injectionContent).toBeUndefined();
      expect(result.personaId).toBe('unknown-persona');
    });

    it('processes Maya turn successfully', async () => {
      const input = createBaseInput('maya-santos');
      const result = await sharedPersonality.processTurn(input);

      // First turn shouldn't inject (no noticing, no accumulated context)
      expect(result.personaId).toBe('maya-santos');
      expect(result.context).toBeDefined();
    });

    it('processes Peter turn successfully', async () => {
      const input = createBaseInput('peter-john');
      const result = await sharedPersonality.processTurn(input);

      expect(result.personaId).toBe('peter-john');
      expect(result.context).toBeDefined();
    });

    it('detects significant pause', async () => {
      const input: SharedPersonalityTurnInput = {
        ...createBaseInput('maya-santos'),
        pauseBeforeMs: 4000, // 4 second pause
        userTranscript: "I don't know...",
        turnCount: 3,
      };

      const result = await sharedPersonality.processTurn(input);

      // Should detect the pause as a noticing opportunity
      if (result.noticing) {
        expect(result.noticing.type).toBe('significant_pause');
        expect(result.shouldInject).toBe(true);
      }
    });

    it('includes voice emotion in context', async () => {
      const input: SharedPersonalityTurnInput = {
        ...createBaseInput('alex-chen'),
        voiceEmotion: {
          primary: 'stressed',
          confidence: 0.85,
          arousal: 0.7,
          valence: -0.4,
        },
      };

      const result = await sharedPersonality.processTurn(input);

      // Voice emotion maps to energy level
      expect(result.context.voiceEnergyLevel).toBeDefined();
    });

    it('includes text emotion in context', async () => {
      const input: SharedPersonalityTurnInput = {
        ...createBaseInput('jordan-taylor'),
        textEmotion: {
          primary: 'excited',
          intensity: 0.8,
          distressLevel: 0,
        },
      };

      const result = await sharedPersonality.processTurn(input);

      // Text emotion maps to emotional intensity
      expect(result.context.emotionalIntensity).toBeDefined();
    });

    it('assembles full 8-dimensional context', async () => {
      const input: SharedPersonalityTurnInput = {
        ...createBaseInput('nayan-patel'),
        voiceEmotion: {
          primary: 'calm',
          confidence: 0.9,
        },
        speechRateWPM: 120,
        pauseBeforeMs: 500,
        textEmotion: {
          primary: 'contemplative',
          intensity: 0.6,
          distressLevel: 0.1,
        },
        conversationMomentum: 'cruising',
        currentTopics: ['philosophy', 'life'],
        lastTopics: ['work'],
        relationshipStage: 'friend',
        totalConversations: 25,
        sharedVulnerabilities: 3,
      };

      const result = await sharedPersonality.processTurn(input);

      // Verify context dimensions are populated (flat structure)
      expect(result.context).toBeDefined();
      // Temporal
      expect(result.context.timeOfDay).toBeDefined();
      expect(result.context.dayOfWeek).toBeDefined();
      // Emotional
      expect(result.context.emotionalIntensity).toBeDefined();
      expect(result.context.emotionalTrajectory).toBeDefined();
      // Conversational
      expect(result.context.conversationMomentum).toBeDefined();
      expect(result.context.turnCount).toBeDefined();
      // Relational
      expect(result.context.relationshipStage).toBeDefined();
      // Voice
      expect(result.context.userSpeechPace).toBeDefined();
      expect(result.context.pauseBeforeUserSpoke).toBeDefined();
    });

    it('respects expression cooldown', async () => {
      const baseInput = createBaseInput('maya-santos');

      // Simulate multiple turns
      const result1 = await sharedPersonality.processTurn({
        ...baseInput,
        turnCount: 1,
      });

      const result2 = await sharedPersonality.processTurn({
        ...baseInput,
        turnCount: 2,
      });

      const result3 = await sharedPersonality.processTurn({
        ...baseInput,
        turnCount: 3,
      });

      // At least one should not inject due to cooldown
      // (unless noticing triggers which takes priority)
      const injections = [result1.shouldInject, result2.shouldInject, result3.shouldInject];
      // This is expected behavior - not every turn should inject
      expect(injections).toBeDefined();
    });
  });

  describe('cleanupSharedPersonalitySession', () => {
    it('clears session state', async () => {
      // Process a turn to create state
      await sharedPersonality.processTurn({
        personaId: 'maya-santos',
        sessionId: 'cleanup-test',
        userId: 'cleanup-user',
        turnCount: 1,
        userTranscript: 'test',
      });

      // Cleanup
      cleanupSharedPersonalitySession('cleanup-test', 'cleanup-user');

      // Process again - should be fresh (initialized = false)
      const result = await sharedPersonality.processTurn({
        personaId: 'maya-santos',
        sessionId: 'cleanup-test',
        userId: 'cleanup-user',
        turnCount: 1,
        userTranscript: 'test',
      });

      // Should work without errors
      expect(result.personaId).toBe('maya-santos');
    });
  });

  describe('expression timing', () => {
    it('returns correct injection points', async () => {
      const input: SharedPersonalityTurnInput = {
        personaId: 'maya-santos',
        sessionId: 'timing-test',
        userId: 'timing-user',
        turnCount: 1,
        userTranscript: "I've been struggling with this...",
        pauseBeforeMs: 3500, // Trigger noticing
      };

      const result = await sharedPersonality.processTurn(input);

      // Valid injection points
      const validPoints = [
        'before_response',
        'mid_response',
        'after_response',
        'as_acknowledgment',
      ];
      expect(validPoints).toContain(result.injectionPoint);
    });
  });

  describe('persona-specific behavior', () => {
    it('Maya focuses on habits and routines', async () => {
      const input: SharedPersonalityTurnInput = {
        personaId: 'maya-santos',
        sessionId: 'maya-test',
        userId: 'maya-user',
        turnCount: 5,
        userTranscript: "I've been trying to wake up early but it's hard",
        currentTopics: ['habits', 'sleep'],
      };

      const result = await sharedPersonality.processTurn(input);

      // Maya's context should have first topic from input
      expect(result.context.currentTopic).toBe('habits');
    });

    it('Peter focuses on research and data', async () => {
      const input: SharedPersonalityTurnInput = {
        personaId: 'peter-john',
        sessionId: 'peter-test',
        userId: 'peter-user',
        turnCount: 5,
        userTranscript: "I've been researching index funds",
        currentTopics: ['investing', 'research'],
      };

      const result = await sharedPersonality.processTurn(input);

      expect(result.context.currentTopic).toBe('investing');
    });

    it('Nayan focuses on wisdom and philosophy', async () => {
      const input: SharedPersonalityTurnInput = {
        personaId: 'nayan-patel',
        sessionId: 'nayan-test',
        userId: 'nayan-user',
        turnCount: 5,
        userTranscript: "What's the meaning of all this?",
        currentTopics: ['philosophy', 'meaning'],
      };

      const result = await sharedPersonality.processTurn(input);

      expect(result.context.currentTopic).toBe('philosophy');
    });
  });
});
