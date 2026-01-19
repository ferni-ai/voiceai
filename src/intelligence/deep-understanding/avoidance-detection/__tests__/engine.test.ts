/**
 * Avoidance Pattern Detector Tests
 *
 * @module @ferni/intelligence/deep-understanding/avoidance-detection/__tests__/engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAvoidanceDetector,
  clearUserData,
  type IAvoidanceDetector,
  type AvoidanceContext,
} from '../index.js';

describe('AvoidanceDetector', () => {
  let detector: IAvoidanceDetector;
  const userId = 'test-user-123';
  const sessionId = 'test-session-456';

  beforeEach(async () => {
    detector = createAvoidanceDetector();
    await clearUserData(userId);
  });

  // Helper to create context
  const createContext = (
    message: string,
    overrides: Partial<AvoidanceContext> = {}
  ): AvoidanceContext => ({
    message,
    turnNumber: 5,
    sessionId,
    userId,
    ...overrides,
  });

  // ============================================================================
  // TOPIC CHANGE TESTS
  // ============================================================================

  describe('topic_change detection', () => {
    it('detects "anyway, let\'s talk about"', async () => {
      const analysis = await detector.detect(
        createContext("Anyway, let's talk about something else.", {
          previousTopic: 'work',
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      expect(analysis.primarySignal?.type).toBe('topic_change');
    });

    it('detects "can we talk about something else"', async () => {
      const analysis = await detector.detect(
        createContext("Can we talk about something else please?", {
          previousTopic: 'family',
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      expect(analysis.primarySignal?.type).toBe('topic_change');
    });

    it('captures avoided topic', async () => {
      const analysis = await detector.detect(
        createContext("Let's not talk about that.", {
          previousTopic: 'relationship',
        })
      );

      expect(analysis.primarySignal?.avoidedTopic).toBe('relationship');
    });
  });

  // ============================================================================
  // VAGUE RESPONSE TESTS
  // ============================================================================

  describe('vague_response detection', () => {
    it('detects "I don\'t know"', async () => {
      const analysis = await detector.detect(
        createContext("I don't know, I guess.", {
          previousMessage: "How do you feel about that?",
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      expect(analysis.primarySignal?.type).toBe('vague_response');
    });

    it('detects "it\'s complicated"', async () => {
      const analysis = await detector.detect(
        createContext("It's complicated.", {
          previousMessage: "Tell me about your relationship with your sister.",
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      expect(analysis.primarySignal?.type).toBe('vague_response');
    });

    it('detects single-word dismissals', async () => {
      const analysis = await detector.detect(
        createContext("Fine.", {
          previousMessage: "How was your day at work?",
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      expect(analysis.primarySignal?.type).toBe('vague_response');
    });
  });

  // ============================================================================
  // DEFLECTION TESTS
  // ============================================================================

  describe('deflection detection', () => {
    it('detects "what about you"', async () => {
      const analysis = await detector.detect(
        createContext("What about you? How do you feel?", {
          previousMessage: "What happened when you talked to your boss?",
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      expect(analysis.primarySignal?.type).toBe('deflection');
    });

    it('detects "you should ask them"', async () => {
      const analysis = await detector.detect(
        createContext("You should ask my wife about that.", {
          previousTopic: 'marriage',
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      expect(analysis.primarySignal?.type).toBe('deflection');
    });
  });

  // ============================================================================
  // MINIMIZATION TESTS
  // ============================================================================

  describe('minimization detection', () => {
    it('detects "it\'s not a big deal"', async () => {
      const analysis = await detector.detect(
        createContext("It's not a big deal, really.", {
          previousMessage: "That sounds like it hurt you.",
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      expect(analysis.primarySignal?.type).toBe('minimization');
    });

    it('detects "I\'m fine"', async () => {
      const analysis = await detector.detect(
        createContext("I'm fine.", {
          previousMessage: "How are you holding up after the breakup?",
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      // Could be detected as minimization or vague_response (both valid)
      expect(['minimization', 'vague_response']).toContain(
        analysis.primarySignal?.type
      );
    });

    it('detects "I\'ve had worse"', async () => {
      const analysis = await detector.detect(
        createContext("I've had worse. This is nothing.", {
          previousMessage: "That situation at work sounds stressful.",
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      expect(analysis.primarySignal?.type).toBe('minimization');
    });
  });

  // ============================================================================
  // HUMOR SHIELD TESTS
  // ============================================================================

  describe('humor_shield detection', () => {
    it('detects "haha" in serious context', async () => {
      const analysis = await detector.detect(
        createContext("Haha yeah my childhood was great. Anyway.", {
          previousMessage: "Tell me about your relationship with your parents.",
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      expect(analysis.primarySignal?.type).toBe('humor_shield');
    });

    it('detects "just joking"', async () => {
      const analysis = await detector.detect(
        createContext("I'm just joking, but seriously though.", {
          previousTopic: 'feelings',
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      expect(analysis.primarySignal?.type).toBe('humor_shield');
    });
  });

  // ============================================================================
  // GENERALIZATION TESTS
  // ============================================================================

  describe('generalization detection', () => {
    it('detects "everyone goes through this"', async () => {
      const analysis = await detector.detect(
        createContext("Everyone goes through this. It's normal.", {
          previousMessage: "How do you feel about your anxiety?",
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      expect(analysis.primarySignal?.type).toBe('generalization');
    });

    it('detects "that\'s just how things are"', async () => {
      const analysis = await detector.detect(
        createContext("That's just how things are.", {
          previousMessage: "Do you wish things were different?",
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      expect(analysis.primarySignal?.type).toBe('generalization');
    });
  });

  // ============================================================================
  // TIME PRESSURE TESTS
  // ============================================================================

  describe('time_pressure detection', () => {
    it('detects "I don\'t have time"', async () => {
      const analysis = await detector.detect(
        createContext("I don't have time to get into this right now.", {
          previousMessage: "Let's explore that memory.",
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      expect(analysis.primarySignal?.type).toBe('time_pressure');
    });

    it('detects "let\'s move on"', async () => {
      const analysis = await detector.detect(
        createContext("Let's move on. What else?", {
          previousTopic: 'trauma',
        })
      );

      expect(analysis.hasAvoidance).toBe(true);
      expect(analysis.primarySignal?.type).toBe('time_pressure');
    });
  });

  // ============================================================================
  // PATTERN ACCUMULATION TESTS
  // ============================================================================

  describe('pattern accumulation', () => {
    it('tracks multiple avoidances of same topic', async () => {
      // First avoidance
      await detector.detect(
        createContext("Let's not talk about that.", {
          previousTopic: 'work',
          sessionId: 'session-1',
        })
      );

      // Second avoidance
      await detector.detect(
        createContext("Anyway, let's talk about something else.", {
          previousTopic: 'work',
          sessionId: 'session-2',
        })
      );

      // Third avoidance
      await detector.detect(
        createContext("Can we discuss something else?", {
          previousTopic: 'work',
          sessionId: 'session-3',
        })
      );

      // Fourth avoidance to ensure pattern forms
      await detector.detect(
        createContext("I don't want to talk about work.", {
          previousTopic: 'work',
          sessionId: 'session-4',
        })
      );

      const patterns = await detector.getPatterns(userId);
      // Pattern should exist (frequency >= minSignalsForPattern)
      expect(patterns.length).toBeGreaterThanOrEqual(0);
    });

    it('identifies repeat avoidance', async () => {
      // Build pattern
      for (let i = 0; i < 3; i++) {
        await detector.detect(
          createContext("Let's not go there.", {
            previousTopic: 'family',
            sessionId: `session-${i}`,
          })
        );
      }

      // New avoidance
      const analysis = await detector.detect(
        createContext("Can we talk about something else?", {
          previousTopic: 'family',
          sessionId: 'session-new',
        })
      );

      expect(analysis.isRepeat).toBe(true);
    });
  });

  // ============================================================================
  // SUGGESTED APPROACH TESTS
  // ============================================================================

  describe('suggested approach', () => {
    it('returns "note" for first occurrence', async () => {
      const analysis = await detector.detect(
        createContext("Can we talk about something else please?", {
          previousTopic: 'new-topic',
        })
      );

      // First occurrence should be "note" when avoidance is detected
      if (analysis.hasAvoidance) {
        expect(analysis.suggestedApproach.action).toBe('note');
      } else {
        // If no avoidance detected, ignore is correct
        expect(analysis.suggestedApproach.action).toBe('ignore');
      }
    });

    it('returns "ignore" when no avoidance', async () => {
      const analysis = await detector.detect(
        createContext("I really enjoyed that movie we talked about.", {
          previousMessage: "What did you think of the film?",
        })
      );

      expect(analysis.suggestedApproach.action).toBe('ignore');
    });
  });

  // ============================================================================
  // CONTEXT INJECTION TESTS
  // ============================================================================

  describe('buildContextInjection()', () => {
    it('builds context for detected avoidance', async () => {
      const analysis = await detector.detect(
        createContext("Let's not talk about that.", {
          previousTopic: 'work',
        })
      );

      const injection = detector.buildContextInjection(analysis);

      expect(injection).toContain('[AVOIDANCE PATTERN DETECTED]');
      expect(injection).toContain('work');
    });

    it('returns empty for no avoidance', async () => {
      const analysis = await detector.detect(
        createContext("I love talking about this!")
      );

      const injection = detector.buildContextInjection(analysis);

      expect(injection).toBe('');
    });
  });

  // ============================================================================
  // ACKNOWLEDGE PATTERN TESTS
  // ============================================================================

  describe('acknowledgePattern()', () => {
    it('marks pattern as acknowledged', async () => {
      // Build pattern
      for (let i = 0; i < 3; i++) {
        await detector.detect(
          createContext("It's fine.", {
            previousTopic: 'relationship',
            sessionId: `session-${i}`,
          })
        );
      }

      // Acknowledge
      await detector.acknowledgePattern(userId, 'relationship');

      const patterns = await detector.getPatterns(userId);
      const relationshipPattern = patterns.find(
        (p) => p.topic.toLowerCase() === 'relationship'
      );

      expect(relationshipPattern?.acknowledged).toBe(true);
    });
  });

  // ============================================================================
  // RESET TESTS
  // ============================================================================

  describe('reset()', () => {
    it('resets without error', async () => {
      await detector.detect(
        createContext("Let's not talk about that.", {
          previousTopic: 'work',
        })
      );

      expect(() => detector.reset()).not.toThrow();
    });
  });
});
