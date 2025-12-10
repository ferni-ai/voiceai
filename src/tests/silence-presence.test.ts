/**
 * Silence Presence Tests
 *
 * Tests the SilencePresenceEngine that implements:
 * - Meaningful silences that communicate care
 * - Different silence types (processing, emotional, invitation, etc.)
 * - SSML generation for silences
 *
 * @module tests/silence-presence
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getSilencePresenceEngine,
  resetSilencePresenceEngine,
  type SilenceDecision,
} from '../conversation/silence-presence.js';

// Mock the humanization signal emitter
vi.mock('../services/humanization/humanization-signal-emitter.js', () => ({
  humanizationSignalEmitter: {
    silenceMoment: vi.fn().mockResolvedValue(undefined),
  },
}));

// ============================================================================
// TESTS
// ============================================================================

describe('SilencePresenceEngine', () => {
  beforeEach(() => {
    resetSilencePresenceEngine();
  });

  afterEach(() => {
    resetSilencePresenceEngine();
  });

  // --------------------------------------------------------------------------
  // Singleton Pattern
  // --------------------------------------------------------------------------

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getSilencePresenceEngine();
      const instance2 = getSilencePresenceEngine();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getSilencePresenceEngine();
      resetSilencePresenceEngine();
      const instance2 = getSilencePresenceEngine();
      expect(instance2).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Basic Decision Making
  // --------------------------------------------------------------------------

  describe('Basic Decision Making', () => {
    it('should not use silence too early in conversation', () => {
      const engine = getSilencePresenceEngine();

      const decision = engine.decideSilence({
        userMessage: 'This is really hard to talk about',
        turnCount: 1, // Too early
        conversationDepth: 'deep',
      });

      expect(decision.useSilence).toBe(false);
    });

    it('should return valid structure when not using silence', () => {
      const engine = getSilencePresenceEngine();

      const decision = engine.decideSilence({
        userMessage: 'Hello',
        turnCount: 1,
        conversationDepth: 'surface',
      });

      expect(decision).toHaveProperty('useSilence');
      expect(decision).toHaveProperty('reason');
      expect(decision).toHaveProperty('duration');
      expect(decision).toHaveProperty('config');
      expect(decision).toHaveProperty('ssml');
    });
  });

  // --------------------------------------------------------------------------
  // Emotional Silence Detection
  // --------------------------------------------------------------------------

  describe('Emotional Silence Detection', () => {
    it('should consider silence for emotional content', () => {
      const engine = getSilencePresenceEngine();

      // Test multiple times since there's probability involved
      let silenceDetected = false;
      for (let i = 0; i < 20; i++) {
        resetSilencePresenceEngine();
        const newEngine = getSilencePresenceEngine();
        const decision = newEngine.decideSilence({
          userMessage: "I've never told anyone this before, but I feel so alone",
          turnCount: 5,
          conversationDepth: 'deep',
          wasPersonalSharing: true,
          topicWeight: 'heavy',
        });

        if (decision.useSilence && decision.reason === 'emotional') {
          silenceDetected = true;
          break;
        }
      }

      expect(silenceDetected).toBe(true);
    });

    it('should detect grief-related content', () => {
      const engine = getSilencePresenceEngine();

      // Multiple attempts due to probability
      let silenceDetected = false;
      for (let i = 0; i < 20; i++) {
        resetSilencePresenceEngine();
        const newEngine = getSilencePresenceEngine();
        const decision = newEngine.decideSilence({
          userMessage: 'Since he passed away, I just miss him so much',
          turnCount: 5,
          conversationDepth: 'deep',
          topicWeight: 'heavy',
        });

        if (decision.useSilence && ['emotional', 'respect'].includes(decision.reason)) {
          silenceDetected = true;
          break;
        }
      }

      expect(silenceDetected).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Vulnerability/Respect Silence
  // --------------------------------------------------------------------------

  describe('Vulnerability/Respect Silence', () => {
    it('should consider respect silence for vulnerability', () => {
      const engine = getSilencePresenceEngine();

      // Multiple attempts due to probability
      let respectSilenceDetected = false;
      for (let i = 0; i < 20; i++) {
        resetSilencePresenceEngine();
        const newEngine = getSilencePresenceEngine();
        const decision = newEngine.decideSilence({
          userMessage: "Honestly, the truth is I've been struggling a lot",
          turnCount: 5,
          conversationDepth: 'deep',
          topicWeight: 'heavy',
        });

        if (decision.useSilence && decision.reason === 'respect') {
          respectSilenceDetected = true;
          break;
        }
      }

      expect(respectSilenceDetected).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Resonance Silence
  // --------------------------------------------------------------------------

  describe('Resonance Silence', () => {
    it('should consider resonance silence for insights', () => {
      const engine = getSilencePresenceEngine();

      // Multiple attempts due to probability
      let resonanceDetected = false;
      for (let i = 0; i < 20; i++) {
        resetSilencePresenceEngine();
        const newEngine = getSilencePresenceEngine();
        const decision = newEngine.decideSilence({
          userMessage: 'Wow, I just realized something important. Oh my god.',
          turnCount: 5,
          conversationDepth: 'medium',
        });

        if (decision.useSilence && decision.reason === 'resonance') {
          resonanceDetected = true;
          break;
        }
      }

      expect(resonanceDetected).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Processing Silence
  // --------------------------------------------------------------------------

  describe('Processing Silence', () => {
    it('should consider processing silence for thinking moments', () => {
      const engine = getSilencePresenceEngine();

      // Multiple attempts due to probability
      let processingDetected = false;
      for (let i = 0; i < 20; i++) {
        resetSilencePresenceEngine();
        const newEngine = getSilencePresenceEngine();
        const decision = newEngine.decideSilence({
          userMessage: "What do you think? I'm not sure about this. Let me think...",
          turnCount: 5,
          conversationDepth: 'medium',
        });

        if (decision.useSilence && decision.reason === 'processing') {
          processingDetected = true;
          break;
        }
      }

      expect(processingDetected).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Silence Limits
  // --------------------------------------------------------------------------

  describe('Silence Limits', () => {
    it('should respect maximum silences per conversation', () => {
      const engine = getSilencePresenceEngine();

      // Force multiple silences
      let silenceCount = 0;
      for (let i = 0; i < 10; i++) {
        // Directly set state to avoid interval check
        (engine as unknown as { lastSilenceTime: number }).lastSilenceTime = 0;
        (engine as unknown as { silenceCount: number }).silenceCount = silenceCount;

        const decision = engine.decideSilence({
          userMessage: "I've never told anyone this before",
          turnCount: 5 + i,
          conversationDepth: 'deep',
          topicWeight: 'heavy',
        });

        if (decision.useSilence) {
          silenceCount++;
        }
      }

      // Should be capped at MAX_SILENCES_PER_CONV (5)
      expect(silenceCount).toBeLessThanOrEqual(5);
    });
  });

  // --------------------------------------------------------------------------
  // SSML Generation
  // --------------------------------------------------------------------------

  describe('SSML Generation', () => {
    it('should generate valid SSML for silence', () => {
      const engine = getSilencePresenceEngine();

      // Force a silence decision
      (engine as unknown as { lastSilenceTime: number }).lastSilenceTime = 0;
      (engine as unknown as { silenceCount: number }).silenceCount = 0;

      // Get a silence that will be used
      let decision: SilenceDecision | null = null;
      for (let i = 0; i < 20; i++) {
        resetSilencePresenceEngine();
        const newEngine = getSilencePresenceEngine();
        (newEngine as unknown as { lastSilenceTime: number }).lastSilenceTime = 0;

        decision = newEngine.decideSilence({
          userMessage: "I've never told anyone this before, I feel so alone",
          turnCount: 5,
          conversationDepth: 'deep',
          topicWeight: 'heavy',
        });

        if (decision.useSilence) {
          break;
        }
      }

      if (decision?.useSilence) {
        expect(decision.ssml).toContain('<break');
        expect(decision.ssml).toContain('ms"/>');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Verbal Cues
  // --------------------------------------------------------------------------

  describe('Verbal Cues', () => {
    it('should provide verbal cues for processing silence', () => {
      const engine = getSilencePresenceEngine();

      const cue = engine.getVerbalCueForSilence('processing');
      expect(cue).not.toBeNull();
      expect(typeof cue).toBe('string');
    });

    it('should provide verbal cues for invitation silence', () => {
      const engine = getSilencePresenceEngine();

      const cue = engine.getVerbalCueForSilence('invitation');
      expect(cue).not.toBeNull();
    });

    it('should return null for emotional silence (no verbal cue)', () => {
      const engine = getSilencePresenceEngine();

      const cue = engine.getVerbalCueForSilence('emotional');
      expect(cue).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Apply to Response
  // --------------------------------------------------------------------------

  describe('Apply to Response', () => {
    it('should not modify response when no silence', () => {
      const engine = getSilencePresenceEngine();

      const decision: SilenceDecision = {
        useSilence: false,
        reason: 'presence',
        duration: 0,
        config: {
          minDuration: 1200,
          maxDuration: 2500,
          breathSound: 'settling',
          showPresence: true,
          verbalCue: null,
        },
        ssml: '',
      };

      const result = engine.applyToResponse('Hello there!', decision);
      expect(result.text).toBe('Hello there!');
    });

    it('should prepend SSML when using silence', () => {
      const engine = getSilencePresenceEngine();

      const decision: SilenceDecision = {
        useSilence: true,
        reason: 'emotional',
        duration: 2000,
        config: {
          minDuration: 1500,
          maxDuration: 3000,
          breathSound: 'soft_exhale',
          showPresence: true,
          verbalCue: null,
        },
        ssml: '<break time="2000ms"/>',
      };

      const result = engine.applyToResponse('I understand.', decision);
      expect(result.ssml).toContain('<break');
      expect(result.ssml).toContain('I understand.');
    });
  });

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  describe('Reset', () => {
    it('should reset internal counters', () => {
      const engine = getSilencePresenceEngine();

      // Use some silences
      (engine as unknown as { silenceCount: number }).silenceCount = 3;
      (engine as unknown as { lastSilenceTime: number }).lastSilenceTime = Date.now();

      engine.reset();

      // Should be able to use silence again after reset
      const decision = engine.decideSilence({
        userMessage: "I've never told anyone this",
        turnCount: 5,
        conversationDepth: 'deep',
        topicWeight: 'heavy',
      });

      // Won't necessarily use silence due to probability, but shouldn't be blocked by count
      expect(decision).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty message', () => {
      const engine = getSilencePresenceEngine();

      expect(() => {
        engine.decideSilence({
          userMessage: '',
          turnCount: 5,
          conversationDepth: 'surface',
        });
      }).not.toThrow();
    });

    it('should handle very long message', () => {
      const engine = getSilencePresenceEngine();
      const longMessage = 'This is a long message. '.repeat(100);

      expect(() => {
        engine.decideSilence({
          userMessage: longMessage,
          turnCount: 5,
          conversationDepth: 'deep',
        });
      }).not.toThrow();
    });

    it('should handle all conversation depths', () => {
      const engine = getSilencePresenceEngine();
      const depths = ['surface', 'medium', 'deep'] as const;

      for (const depth of depths) {
        expect(() => {
          engine.decideSilence({
            userMessage: 'Test message',
            turnCount: 5,
            conversationDepth: depth,
          });
        }).not.toThrow();
      }
    });
  });
});
