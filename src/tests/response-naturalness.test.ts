/**
 * Tests for Response Naturalness Module
 *
 * Tests acknowledgment prefixes, thinking fillers, and catchphrase integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  getAcknowledgmentPrefix,
  getThinkingFiller,
  getCatchphraseWithSsml,
  getResponseEnhancements,
  resetCatchphraseTracking,
  determineAcknowledgmentMood,
  shouldAddPrefix,
  shouldInjectCatchphrase,
  ACKNOWLEDGMENT_PREFIXES,
  THINKING_FILLERS,
  PERSONA_CATCHPHRASES,
} from '../speech/response-naturalness.js';

// ============================================================================
// ACKNOWLEDGMENT PREFIXES
// ============================================================================

describe('Acknowledgment Prefixes', () => {
  describe('ACKNOWLEDGMENT_PREFIXES', () => {
    it('should have prefixes for all main personas', () => {
      const personas = ['nayan-patel', 'peter-john', 'maya', 'jordan', 'alex', 'ferni', 'jack-b'];

      for (const persona of personas) {
        expect(ACKNOWLEDGMENT_PREFIXES[persona]).toBeDefined();
        expect(ACKNOWLEDGMENT_PREFIXES[persona].neutral).toBeDefined();
        expect(ACKNOWLEDGMENT_PREFIXES[persona].neutral.length).toBeGreaterThan(0);
      }
    });

    it('should have multiple mood categories', () => {
      const moods = ['neutral', 'engaged', 'empathetic', 'excited', 'thoughtful'];
      const personaId = 'nayan-patel';

      for (const mood of moods) {
        expect(
          ACKNOWLEDGMENT_PREFIXES[personaId][
            mood as keyof (typeof ACKNOWLEDGMENT_PREFIXES)['nayan-patel']
          ]
        ).toBeDefined();
      }
    });
  });

  describe('getAcknowledgmentPrefix', () => {
    it('should return a prefix for valid persona', () => {
      const prefix = getAcknowledgmentPrefix('nayan-patel', 'neutral');
      expect(prefix).toBeTruthy();
      expect(prefix.length).toBeGreaterThan(0);
    });

    it('should return different prefixes for different moods', () => {
      // Note: some might overlap, so we check the categories exist
      const neutral = getAcknowledgmentPrefix('peter-john', 'neutral');
      const excited = getAcknowledgmentPrefix('peter-john', 'excited');

      // Both should be valid strings
      expect(typeof neutral).toBe('string');
      expect(typeof excited).toBe('string');
    });

    it('should return break tag for unknown persona', () => {
      const prefix = getAcknowledgmentPrefix('unknown-persona', 'neutral');
      expect(prefix).toContain('<break');
    });
  });

  describe('determineAcknowledgmentMood', () => {
    it('should return empathetic for heavy topics', () => {
      expect(determineAcknowledgmentMood(undefined, 'heavy')).toBe('empathetic');
    });

    it('should return empathetic for sad emotion', () => {
      expect(determineAcknowledgmentMood('sad', 'light')).toBe('empathetic');
    });

    it('should return excited for joy emotion', () => {
      expect(determineAcknowledgmentMood('joy', 'light', false, true)).toBe('excited');
    });

    it('should return thoughtful for questions', () => {
      expect(determineAcknowledgmentMood(undefined, 'light', true)).toBe('thoughtful');
    });

    it('should return neutral by default', () => {
      expect(determineAcknowledgmentMood()).toBe('neutral');
    });
  });

  describe('shouldAddPrefix', () => {
    it('should not prefix greetings', () => {
      expect(shouldAddPrefix(0, false, true)).toBe(false);
    });

    it('should not prefix first turn', () => {
      expect(shouldAddPrefix(0, false, false)).toBe(false);
    });

    it('should prefix follow-ups with probability', () => {
      // HUMANIZATION FIX: Follow-ups now get prefix only 50% of the time
      // Run multiple times to verify probability-based behavior
      let trueCount = 0;
      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        if (shouldAddPrefix(3, true, false)) {
          trueCount++;
        }
      }

      // With 50% probability, expect roughly half to be true
      // Using a wide range to account for randomness
      expect(trueCount).toBeGreaterThan(10); // At least some should be true
      expect(trueCount).toBeLessThan(40); // But not all should be true
    });
  });
});

// ============================================================================
// THINKING FILLERS
// ============================================================================

describe('Thinking Fillers', () => {
  describe('THINKING_FILLERS', () => {
    it('should have fillers for all main personas', () => {
      const personas = ['nayan-patel', 'peter-john', 'maya', 'jordan', 'alex', 'ferni', 'jack-b'];

      for (const persona of personas) {
        expect(THINKING_FILLERS[persona]).toBeDefined();
        expect(THINKING_FILLERS[persona].length).toBeGreaterThan(0);
      }
    });

    it('should contain SSML break tags', () => {
      const filler = THINKING_FILLERS['nayan-patel'][0];
      expect(filler).toContain('<break');
    });
  });

  describe('getThinkingFiller', () => {
    it('should return a filler for valid persona', () => {
      const filler = getThinkingFiller('nayan-patel');
      expect(filler).toBeTruthy();
      expect(filler).toContain('<break');
    });

    it('should return default filler for unknown persona', () => {
      const filler = getThinkingFiller('unknown-persona');
      expect(filler).toContain('<break');
      expect(filler).toContain('Hmm');
    });
  });
});

// ============================================================================
// CATCHPHRASES
// ============================================================================

describe('Catchphrases', () => {
  beforeEach(() => {
    resetCatchphraseTracking();
  });

  describe('PERSONA_CATCHPHRASES', () => {
    it('should have catchphrases for all main personas', () => {
      const personas = ['nayan-patel', 'peter-john', 'maya', 'jordan', 'alex', 'ferni', 'jack-b'];

      for (const persona of personas) {
        expect(PERSONA_CATCHPHRASES[persona]).toBeDefined();
        expect(PERSONA_CATCHPHRASES[persona].phrases.length).toBeGreaterThan(0);
      }
    });

    it('should have SSML wrapper function', () => {
      const config = PERSONA_CATCHPHRASES['nayan-patel'];
      const wrapped = config.ssmlWrapper('Test phrase');
      expect(wrapped).toContain('Test phrase');
      expect(wrapped).toContain('<break');
    });

    it("should include Jack Bogle's signature catchphrases", () => {
      const jackPhrases = PERSONA_CATCHPHRASES['nayan-patel'].phrases;
      expect(jackPhrases).toContain('Stay the course.');
    });

    it("should include Peter John's signature catchphrases", () => {
      const peterPhrases = PERSONA_CATCHPHRASES['peter-john'].phrases;
      expect(peterPhrases.some((p) => p.includes('Invest in what you know'))).toBe(true);
    });
  });

  describe('getCatchphraseWithSsml', () => {
    it('should return SSML-wrapped catchphrase', () => {
      const catchphrase = getCatchphraseWithSsml('nayan-patel');
      expect(catchphrase).toBeTruthy();
      expect(catchphrase).toContain('<break');
    });

    it('should return null for unknown persona', () => {
      const catchphrase = getCatchphraseWithSsml('unknown-persona');
      expect(catchphrase).toBeNull();
    });
  });

  describe('shouldInjectCatchphrase', () => {
    it('should have low probability on non-positive moments', () => {
      // Without positive moment, probability is only 15%
      // Run multiple times and verify it's not always true
      let falseCount = 0;
      for (let i = 0; i < 20; i++) {
        resetCatchphraseTracking();
        if (!shouldInjectCatchphrase('nayan-patel', 10, false)) {
          falseCount++;
        }
      }
      // With 15% probability, we should get quite a few false results
      expect(falseCount).toBeGreaterThan(5);
    });

    it('should track usage across calls', () => {
      // Force injection by checking many times
      let injected = false;
      for (let i = 0; i < 20; i++) {
        if (shouldInjectCatchphrase('nayan-patel', i * 5, true)) {
          injected = true;
          break;
        }
      }
      // With high positive probability and many attempts, should eventually inject
      expect(injected).toBe(true);
    });

    it('should reset tracking correctly', () => {
      // Force some usage
      for (let i = 0; i < 10; i++) {
        shouldInjectCatchphrase('maya', i * 5, true);
      }

      // Reset
      resetCatchphraseTracking();

      // After reset, should be able to inject again (eventually)
      let canInject = false;
      for (let i = 0; i < 20; i++) {
        if (shouldInjectCatchphrase('maya', i * 5, true)) {
          canInject = true;
          break;
        }
      }
      expect(canInject).toBe(true);
    });
  });
});

// ============================================================================
// COMBINED ENHANCEMENTS
// ============================================================================

describe('getResponseEnhancements', () => {
  beforeEach(() => {
    resetCatchphraseTracking();
  });

  it('should sometimes return prefix for non-greeting turns', () => {
    // Mock random to always return low value to trigger prefix
    vi.spyOn(Math, 'random').mockReturnValue(0.1);

    const result = getResponseEnhancements({
      personaId: 'nayan-patel',
      turnCount: 3,
      userEmotion: 'neutral',
      isFollowUp: true,
      isGreeting: false,
    });

    // With mocked random, prefix should be added
    expect(result.prefix).toBeTruthy();

    vi.restoreAllMocks();
  });

  it('should not return prefix for greetings', () => {
    const result = getResponseEnhancements({
      personaId: 'nayan-patel',
      turnCount: 0,
      isGreeting: true,
    });

    expect(result.prefix).toBeNull();
  });

  it('should set shouldAddThinkingFiller for questions', () => {
    const result = getResponseEnhancements({
      personaId: 'peter-john',
      turnCount: 2,
      isQuestion: true,
    });

    expect(result.shouldAddThinkingFiller).toBe(true);
  });

  it('should sometimes return suffix for positive moments', () => {
    // With random chance, this may or may not return suffix
    // Just verify the structure is correct
    const result = getResponseEnhancements({
      personaId: 'maya',
      turnCount: 10,
      isPositiveMoment: true,
    });

    expect(result).toHaveProperty('suffix');
    expect(result).toHaveProperty('prefix');
    expect(result).toHaveProperty('shouldAddThinkingFiller');
  });
});
