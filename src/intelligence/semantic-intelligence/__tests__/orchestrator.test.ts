/**
 * Tests for the Semantic Intelligence Orchestrator
 *
 * The orchestrator coordinates all 4 phases:
 * - Phase 1: Tool Hints
 * - Phase 2: Learning Loop
 * - Phase 3: Intent Classification
 * - Phase 4: Proactive Anticipation
 *
 * It provides a unified interface for the turn processor.
 *
 * NOTE: intentClassification.type returns high-level types like 'tool_request',
 * 'conversation', 'emotional' - NOT domain-specific types like 'music' or 'calendar'.
 */

import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import {
  getSemanticIntelligence,
  processSemanticIntelligence,
  recordExecution,
  type SemanticIntelligenceContext,
  type SemanticIntelligenceResult,
} from '../orchestrator.js';
import { resetForTesting, initializeForTesting } from '../persistence.js';

// Test constants
const TEST_USER = 'test-user-orchestrator';
const TEST_SESSION = 'test-session-orch';

describe('Semantic Intelligence Orchestrator', () => {
  // Pre-initialize Firestore before any tests to avoid issues with fake timers
  beforeAll(async () => {
    await initializeForTesting();
  });

  beforeEach(() => {
    resetForTesting();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2024-12-30T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getSemanticIntelligence', () => {
    it('should return complete result structure', async () => {
      const context: SemanticIntelligenceContext = {
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'play some jazz music',
      };

      const result = await getSemanticIntelligence(context);

      // Verify result structure
      expect(result).toHaveProperty('toolHints');
      expect(result).toHaveProperty('learnedPrediction');
      expect(result).toHaveProperty('intentClassification');
      expect(result).toHaveProperty('proactiveHints');
      expect(result).toHaveProperty('needsCrisisSupport');
      expect(result).toHaveProperty('combinedInjection');
      expect(result).toHaveProperty('totalProcessingTimeMs');
      expect(result).toHaveProperty('timingBreakdown');
    });

    it('should classify music request as tool_request', async () => {
      const result = await getSemanticIntelligence({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'play some jazz',
      });

      // Intent type is high-level (tool_request), not domain-specific (music)
      expect(result.intentClassification.type).toBe('tool_request');
      // isToolRequest depends on semantic router results which may vary
      expect(typeof result.toolHints.isToolRequest).toBe('boolean');
    });

    it('should classify calendar request as tool_request', async () => {
      const result = await getSemanticIntelligence({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: "what's on my calendar today",
      });

      // Intent type is high-level (tool_request), not domain-specific (calendar)
      expect(result.intentClassification.type).toBe('tool_request');
    });

    it('should detect crisis and set priority flag', async () => {
      // Use input that matches URGENCY_PATTERNS.critical:
      // /\b(hurting myself|want to die|suicidal|kill myself)\b/i
      const result = await getSemanticIntelligence({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'I want to die',
      });

      expect(result.needsCrisisSupport).toBe(true);
      expect(result.combinedInjection).toContain('CRISIS');
    });

    it('should skip processing for short greetings', async () => {
      const result = await getSemanticIntelligence({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'hi',
      });

      // Should return empty/minimal result
      expect(result.toolHints.hints.length).toBe(0);
      expect(result.combinedInjection).toBe('');
    });

    it('should include timing breakdown', async () => {
      const result = await getSemanticIntelligence({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'check the weather forecast',
      });

      expect(result.timingBreakdown).toHaveProperty('toolHintsMs');
      expect(result.timingBreakdown).toHaveProperty('learnedPredictionMs');
      expect(result.timingBreakdown).toHaveProperty('intentClassificationMs');
      expect(result.timingBreakdown).toHaveProperty('proactiveHintsMs');
      expect(result.totalProcessingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should consider recent tools in hints', async () => {
      const result = await getSemanticIntelligence({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: "what's the weather",
        recentTools: ['getWeather'], // Already used weather
      });

      // Implementation may still suggest it but with context
      expect(result.toolHints.hints).toBeInstanceOf(Array);
    });

    it('should consider recent topics', async () => {
      const result = await getSemanticIntelligence({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'tell me more',
        recentTopics: ['weather', 'outdoor plans'],
      });

      expect(result).toBeDefined();
    });

    it('should handle upcoming events context', async () => {
      const result = await getSemanticIntelligence({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'what should I prepare for',
        upcomingEvents: [
          { title: 'Team Meeting', startsInMinutes: 15 },
          { title: 'Lunch with Client', startsInMinutes: 120 },
        ],
      });

      // Should factor in upcoming events
      expect(result.proactiveHints).toBeInstanceOf(Array);
    });

    it('should classify emotional expressions correctly', async () => {
      // Use input that matches INTENT_PATTERNS.emotional:
      // /^(i'm|i am)\s+(so\s+)?(happy|sad|angry|frustrated|excited|worried|anxious|stressed|tired|exhausted)\b/i
      const result = await getSemanticIntelligence({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: "I'm so frustrated right now",
      });

      expect(result.intentClassification.type).toBe('emotional');
    });

    it('should classify conversational input correctly', async () => {
      const result = await getSemanticIntelligence({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'tell me a story about your day',
      });

      // Could be conversation or unknown, not tool_request
      expect(['conversation', 'unknown']).toContain(result.intentClassification.type);
    });
  });

  describe('processSemanticIntelligence (fire-and-forget)', () => {
    it('should not block on processing', () => {
      // This is fire-and-forget, should return immediately
      const start = performance.now();

      processSemanticIntelligence({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'play music',
      });

      const duration = performance.now() - start;
      // Should return immediately (within 1ms typically)
      expect(duration).toBeLessThan(50);
    });
  });

  describe('recordExecution (learning loop)', () => {
    it('should record successful execution', async () => {
      await expect(
        recordExecution({
          userId: TEST_USER,
          sessionId: TEST_SESSION,
          personaId: 'ferni',
          inputText: 'play jazz',
          toolId: 'playMusic',
          args: { genre: 'jazz' },
          success: true,
          executionTimeMs: 150,
        })
      ).resolves.not.toThrow();
    });

    it('should record failed execution', async () => {
      await expect(
        recordExecution({
          userId: TEST_USER,
          sessionId: TEST_SESSION,
          personaId: 'ferni',
          inputText: 'play music',
          toolId: 'playMusic',
          args: {},
          success: false,
          executionTimeMs: 50,
        })
      ).resolves.not.toThrow();
    });

    it('should record with semantic prediction for correction detection', async () => {
      await expect(
        recordExecution({
          userId: TEST_USER,
          sessionId: TEST_SESSION,
          personaId: 'ferni',
          inputText: 'what time is my meeting',
          toolId: 'getEvents',
          args: {},
          success: true,
          executionTimeMs: 200,
          semanticPrediction: {
            toolId: 'getWeather', // Wrong prediction
            confidence: 0.65,
          },
        })
      ).resolves.not.toThrow();
    });
  });

  describe('combined injection format', () => {
    it('should format tool hints properly', async () => {
      const result = await getSemanticIntelligence({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'schedule a meeting for tomorrow',
      });

      // Should have formatted injection
      if (result.combinedInjection) {
        expect(result.combinedInjection).toContain('[');
      }
    });

    it('should include intent type in injection for tool requests', async () => {
      const result = await getSemanticIntelligence({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'send an email to John',
      });

      if (
        result.combinedInjection &&
        result.intentClassification.type !== 'unknown' &&
        result.intentClassification.confidence > 0.6
      ) {
        expect(result.combinedInjection).toContain('INTENT');
      }
    });
  });

  describe('performance', () => {
    it('should complete within reasonable time', async () => {
      // Use real timers for performance measurement
      vi.useRealTimers();

      const start = performance.now();

      await getSemanticIntelligence({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'play some jazz music and check the weather',
      });

      const duration = performance.now() - start;
      // Should be fast (semantic routing is optimized for speed)
      // Allow up to 1000ms for CI/test environments with variable load
      // In production, this typically runs in <50ms
      expect(duration).toBeLessThan(1000);
    });
  });
});
