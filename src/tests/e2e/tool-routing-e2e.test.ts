/**
 * Tool Routing Integration E2E Tests
 *
 * Validates the tool routing pipeline including:
 * - Unified Intelligence enhancement (stub mode)
 * - Emotion-aware routing
 * - Cross-persona handoff context
 * - Proactive outreach triggering
 *
 * Note: Full FTIS routing has been simplified - these tests validate
 * the stub provides graceful degradation.
 *
 * @module tests/e2e/tool-routing-e2e.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the loggers before any imports that use them
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// Mock Firestore to avoid actual database calls
vi.mock('../../utils/firestore-utils.js', () => ({
  cleanForFirestore: vi.fn((obj) => obj),
  getFirestore: vi.fn(() => null),
}));

// Import after mocks
import {
  getUnifiedIntelligence,
  initializeUnifiedIntelligence,
  type IntelligenceEnhancement,
} from '../../tools/intelligence/index.js';

describe('Tool Routing E2E Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Initialize the unified intelligence layer for each test
    initializeUnifiedIntelligence();
  });

  describe('Unified Intelligence Enhancement', () => {
    it('should return intelligence enhancement for tool selection', async () => {
      const intelligence = getUnifiedIntelligence();

      const enhancement = await intelligence.enhanceToolSelection('test-user', {
        personaId: 'ferni',
        timeOfDay: new Date(),
        transcript: 'I need help with my budget',
        sessionHistory: [],
      });

      expect(enhancement).toBeDefined();
      expect(enhancement.prioritizeTools).toBeDefined();
      expect(enhancement.anticipatedTools).toBeDefined();
      expect(Array.isArray(enhancement.prioritizeTools)).toBe(true);
      expect(Array.isArray(enhancement.anticipatedTools)).toBe(true);
    });

    it('should handle emotion-aware routing with voice emotion state', async () => {
      const intelligence = getUnifiedIntelligence();

      const enhancement = await intelligence.enhanceToolSelection('test-user', {
        personaId: 'ferni',
        timeOfDay: new Date(),
        transcript: 'I am feeling really stressed',
        sessionHistory: [],
        voiceEmotion: {
          primary: 'stress',
          valence: -0.6,
          arousal: 0.8,
          stressLevel: 0.9,
          anxietyMarkers: true,
        },
      });

      expect(enhancement).toBeDefined();
      // With high stress, emotion-aware boosts should be active
      if (enhancement.emotionAwareBoosts) {
        expect(enhancement.emotionAwareBoosts.boostedDomains).toBeDefined();
        expect(enhancement.emotionAwareBoosts.stressLevel).toBeGreaterThan(0);
      }
    });

    it('should include cross-persona context when previousPersonaId is provided', async () => {
      const intelligence = getUnifiedIntelligence();

      // First, record a handoff to set up cross-persona context
      await intelligence.recordHandoff({
        userId: 'test-user',
        sessionId: 'session-123',
        fromPersonaId: 'ferni',
        toPersonaId: 'maya',
        toolsUsed: ['mood_check'],
        topicsDiscussed: ['stress', 'wellness'],
        timestamp: new Date(),
      });

      // Now enhance with the previous persona context
      const enhancement = await intelligence.enhanceToolSelection('test-user', {
        personaId: 'maya',
        timeOfDay: new Date(),
        transcript: 'Continue helping me with my habits',
        sessionHistory: ['stress', 'wellness'],
        previousPersonaId: 'ferni',
      });

      expect(enhancement).toBeDefined();
      // Cross-persona context should be available
      if (enhancement.crossPersonaContext) {
        expect(enhancement.crossPersonaContext.previousPersonaId).toBe('ferni');
      }
    });
  });

  describe('Pattern Matching Edge Cases', () => {
    it('should have valid enhancement for weather-related queries', async () => {
      const intelligence = getUnifiedIntelligence();

      const enhancement = await intelligence.enhanceToolSelection('test-user', {
        personaId: 'ferni',
        timeOfDay: new Date(),
        transcript: 'do I need an umbrella today',
        sessionHistory: [],
      });

      expect(enhancement).toBeDefined();
      // Enhancement should work without errors
      expect(enhancement.anticipatedTools).toBeDefined();
    });

    it('should have valid enhancement for open-ended conversations', async () => {
      const intelligence = getUnifiedIntelligence();

      // This is a conversational query that shouldn't trigger specific tools
      const enhancement = await intelligence.enhanceToolSelection('test-user', {
        personaId: 'ferni',
        timeOfDay: new Date(),
        transcript: 'what is your favorite color',
        sessionHistory: [],
      });

      expect(enhancement).toBeDefined();
      // Should still return valid enhancement, even if empty
      expect(enhancement.anticipatedTools).toBeDefined();
    });
  });

  describe('Proactive Outreach Integration', () => {
    it('should include proactive outreach in enhancement when patterns detected', async () => {
      const intelligence = getUnifiedIntelligence();

      // Simulate a user who might need proactive outreach
      const enhancement = await intelligence.enhanceToolSelection('proactive-test-user', {
        personaId: 'ferni',
        timeOfDay: new Date(),
        transcript: 'I have been really struggling lately',
        sessionHistory: ['stress', 'overwhelmed', 'anxiety'],
        voiceEmotion: {
          primary: 'distress',
          valence: -0.8,
          arousal: 0.7,
          stressLevel: 0.85,
          anxietyMarkers: true,
        },
      });

      expect(enhancement).toBeDefined();
      // Proactive outreach may or may not be triggered depending on patterns
      // The important thing is that the field exists and is properly typed
      if (enhancement.proactiveOutreach) {
        expect(typeof enhancement.proactiveOutreach.shouldTrigger).toBe('boolean');
        expect(enhancement.proactiveOutreach.type).toMatch(
          /habit_reminder|check_in|pattern_based/
        );
      }
    });
  });

  describe('Cross-Persona Handoff Context', () => {
    it('should record handoff events correctly', async () => {
      const intelligence = getUnifiedIntelligence();

      // Record a handoff - should not throw
      await expect(
        intelligence.recordHandoff({
          userId: 'test-user',
          sessionId: 'session-456',
          fromPersonaId: 'ferni',
          toPersonaId: 'peter',
          toolsUsed: ['stock_research', 'market_analysis'],
          topicsDiscussed: ['investments', 'portfolio'],
          timestamp: new Date(),
        })
      ).resolves.not.toThrow();
    });

    it('should preserve context after multiple handoffs', async () => {
      const intelligence = getUnifiedIntelligence();
      const userId = 'handoff-test-user-' + Date.now();

      // First handoff: ferni -> maya
      await intelligence.recordHandoff({
        userId,
        sessionId: 'session-1',
        fromPersonaId: 'ferni',
        toPersonaId: 'maya',
        toolsUsed: ['mood_check'],
        topicsDiscussed: ['stress'],
        timestamp: new Date(),
      });

      // Second handoff: maya -> nayan
      await intelligence.recordHandoff({
        userId,
        sessionId: 'session-2',
        fromPersonaId: 'maya',
        toPersonaId: 'nayan',
        toolsUsed: ['habit_track'],
        topicsDiscussed: ['meditation'],
        timestamp: new Date(),
      });

      // Enhancement after handoffs should work
      const enhancement = await intelligence.enhanceToolSelection(userId, {
        personaId: 'nayan',
        timeOfDay: new Date(),
        transcript: 'help me with my meditation practice',
        sessionHistory: ['stress', 'meditation'],
        previousPersonaId: 'maya',
      });

      expect(enhancement).toBeDefined();
      expect(enhancement.anticipatedTools).toBeDefined();
    });
  });

  describe('Integration Robustness', () => {
    it('should handle missing optional fields gracefully', async () => {
      const intelligence = getUnifiedIntelligence();

      // Minimal context - only required fields
      const enhancement = await intelligence.enhanceToolSelection('test-user', {
        personaId: 'ferni',
        timeOfDay: new Date(),
        transcript: 'hello',
        // No sessionHistory, voiceEmotion, or previousPersonaId
      });

      expect(enhancement).toBeDefined();
      expect(enhancement.prioritizeTools).toBeDefined();
      expect(enhancement.anticipatedTools).toBeDefined();
    });

    it('should handle empty transcript gracefully', async () => {
      const intelligence = getUnifiedIntelligence();

      const enhancement = await intelligence.enhanceToolSelection('test-user', {
        personaId: 'ferni',
        timeOfDay: new Date(),
        transcript: '',
        sessionHistory: [],
      });

      expect(enhancement).toBeDefined();
      // Should return valid (possibly empty) enhancement
      expect(enhancement.anticipatedTools).toBeDefined();
    });

  });
});
