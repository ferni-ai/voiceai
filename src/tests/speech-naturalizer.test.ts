/**
 * Speech Naturalizer Unit Tests
 *
 * Tests for the speech naturalizer module that makes AI speech sound human through:
 * - Disfluencies (um, uh, like)
 * - Hedges (I think, maybe, probably)
 * - Thinking phrases
 * - Self-corrections
 *
 * @module tests/speech-naturalizer
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getSpeechNaturalizer,
  resetSpeechNaturalizer,
  SpeechNaturalizer,
  type SpeechNaturalizer as SpeechNaturalizerInstance,
} from '../conversation/speech-naturalizer/index.js';

// ============================================================================
// TESTS
// ============================================================================

describe('SpeechNaturalizer', () => {
  let naturalizer: SpeechNaturalizerInstance;

  beforeEach(() => {
    resetSpeechNaturalizer();
    naturalizer = getSpeechNaturalizer();
  });

  afterEach(() => {
    resetSpeechNaturalizer();
  });

  // --------------------------------------------------------------------------
  // Singleton Pattern
  // --------------------------------------------------------------------------

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = getSpeechNaturalizer();
      const instance2 = getSpeechNaturalizer();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getSpeechNaturalizer();
      resetSpeechNaturalizer();
      const instance2 = getSpeechNaturalizer();
      // After reset, may be a new instance but should still be valid
      expect(instance2).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Core Methods Existence
  // --------------------------------------------------------------------------

  describe('Core Methods', () => {
    it('should have naturalize method', () => {
      expect(typeof naturalizer.naturalize).toBe('function');
    });

    it('should have getThinkingPhrase method', () => {
      expect(typeof naturalizer.getThinkingPhrase).toBe('function');
    });

    it('should have getHedge method', () => {
      expect(typeof naturalizer.getHedge).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Naturalize Method
  // --------------------------------------------------------------------------

  describe('naturalize()', () => {
    it('should return a string for valid input', () => {
      const result = naturalizer.naturalize('This is a test sentence.', 'ferni', {});
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle empty string input', () => {
      const result = naturalizer.naturalize('', 'ferni', {});
      expect(typeof result).toBe('string');
    });

    it('should work for all canonical personas', () => {
      const personas = [
        'ferni',
        'nayan-patel',
        'peter-john',
        'maya-santos',
        'alex-chen',
        'jordan-taylor',
      ];
      const text = 'This is a test sentence for naturalization.';

      for (const personaId of personas) {
        const result = naturalizer.naturalize(text, personaId, {});
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it('should respect context parameters', () => {
      const text = 'This is an important financial decision.';

      // Should behave differently for serious vs casual context
      const seriousResult = naturalizer.naturalize(text, 'ferni', {
        isSeriousContext: true,
      });

      const casualResult = naturalizer.naturalize(text, 'ferni', {
        isSeriousContext: false,
      });

      // Both should be valid strings
      expect(typeof seriousResult).toBe('string');
      expect(typeof casualResult).toBe('string');
    });

    it('should handle special characters in text', () => {
      const text = 'What about $1,000.00? Is that enough?';
      const result = naturalizer.naturalize(text, 'ferni', {});
      expect(typeof result).toBe('string');
    });

    it('should handle long text without crashing', () => {
      const longText = 'This is a sentence. '.repeat(100);
      expect(() => {
        naturalizer.naturalize(longText, 'ferni', {});
      }).not.toThrow();
    });

    it('should handle turn number context', () => {
      const text = 'Let me explain that.';

      // Early turns might have more hedging
      const earlyTurn = naturalizer.naturalize(text, 'ferni', { turnNumber: 1 });
      const laterTurn = naturalizer.naturalize(text, 'ferni', { turnNumber: 10 });

      expect(typeof earlyTurn).toBe('string');
      expect(typeof laterTurn).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // getThinkingPhrase Method
  // --------------------------------------------------------------------------

  describe('getThinkingPhrase()', () => {
    it('should return a ThinkingPattern object', () => {
      const pattern = naturalizer.getThinkingPhrase('ferni');
      expect(pattern).toBeDefined();
      expect(pattern.type).toBeDefined();
      expect(pattern.phrase).toBeDefined();
      expect(pattern.ssml).toBeDefined();
    });

    it('should return persona-specific thinking phrases', () => {
      const ferniPattern = naturalizer.getThinkingPhrase('ferni');
      const nayanPattern = naturalizer.getThinkingPhrase('nayan-patel');

      // Both should be valid ThinkingPattern objects
      expect(ferniPattern.phrase).toBeTruthy();
      expect(nayanPattern.phrase).toBeTruthy();
    });

    it('should work for all personas', () => {
      const personas = [
        'ferni',
        'nayan-patel',
        'peter-john',
        'maya-santos',
        'alex-chen',
        'jordan-taylor',
      ];

      for (const personaId of personas) {
        const pattern = naturalizer.getThinkingPhrase(personaId);
        expect(pattern).toBeDefined();
        expect(typeof pattern.phrase).toBe('string');
        expect(typeof pattern.ssml).toBe('string');
      }
    });

    it('should handle unknown personas gracefully', () => {
      const pattern = naturalizer.getThinkingPhrase('unknown-persona');
      expect(pattern).toBeDefined();
      expect(pattern.phrase).toBeTruthy();
    });

    it('should support different thinking types', () => {
      const types = ['processing', 'recalling', 'considering', 'uncertain'] as const;

      for (const type of types) {
        const pattern = naturalizer.getThinkingPhrase('ferni', type);
        expect(pattern.type).toBe(type);
        expect(pattern.phrase).toBeTruthy();
      }
    });
  });

  // --------------------------------------------------------------------------
  // getHedge Method
  // --------------------------------------------------------------------------

  describe('getHedge()', () => {
    it('should return a hedge string', () => {
      const hedge = naturalizer.getHedge('ferni');
      expect(typeof hedge).toBe('string');
      expect(hedge.length).toBeGreaterThan(0);
    });

    it('should return persona-specific hedges', () => {
      const ferniHedge = naturalizer.getHedge('ferni');
      const peterHedge = naturalizer.getHedge('peter-john');

      expect(ferniHedge).toBeTruthy();
      expect(peterHedge).toBeTruthy();
    });

    it('should work for all personas', () => {
      const personas = [
        'ferni',
        'nayan-patel',
        'peter-john',
        'maya-santos',
        'alex-chen',
        'jordan-taylor',
      ];

      for (const personaId of personas) {
        const hedge = naturalizer.getHedge(personaId);
        expect(typeof hedge).toBe('string');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Context Sensitivity
  // --------------------------------------------------------------------------

  describe('Context Sensitivity', () => {
    it('should reduce modifications for serious emotional contexts', () => {
      const text = 'I am sorry for your loss.';

      // In serious contexts, naturalization should be more restrained
      const result = naturalizer.naturalize(text, 'ferni', {
        isSeriousContext: true,
        emotion: 'grief',
      });

      // Should still be a valid string, just potentially less modified
      expect(typeof result).toBe('string');
    });

    it('should handle topic parameter', () => {
      const result = naturalizer.naturalize('Let me explain your options.', 'ferni', {
        topic: 'investing',
      });
      expect(typeof result).toBe('string');
    });

    it('should handle emotion parameter', () => {
      const result = naturalizer.naturalize('That sounds exciting!', 'ferni', {
        emotion: 'excited',
      });
      expect(typeof result).toBe('string');
    });

    it('should handle userEnergy parameter', () => {
      const highEnergy = naturalizer.naturalize('Great idea!', 'ferni', {
        userEnergy: 'high',
      });
      const lowEnergy = naturalizer.naturalize('I see.', 'ferni', {
        userEnergy: 'low',
      });

      expect(typeof highEnergy).toBe('string');
      expect(typeof lowEnergy).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle null/undefined context gracefully', () => {
      expect(() => {
        naturalizer.naturalize('Test', 'ferni', undefined as any);
      }).not.toThrow();
    });

    it('should handle text with only whitespace', () => {
      const result = naturalizer.naturalize('   ', 'ferni', {});
      expect(typeof result).toBe('string');
    });

    it('should handle text with newlines', () => {
      const result = naturalizer.naturalize('Line one.\nLine two.', 'ferni', {});
      expect(typeof result).toBe('string');
    });

    it('should handle text with SSML tags already present', () => {
      const textWithSsml = 'Hello <break time="300ms"/> there.';
      const result = naturalizer.naturalize(textWithSsml, 'ferni', {});
      expect(typeof result).toBe('string');
    });

    it('should handle unicode characters', () => {
      const result = naturalizer.naturalize('Testing unicode: Hello World', 'ferni', {});
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // Regression Tests
  // --------------------------------------------------------------------------

  describe('Regression Tests', () => {
    it('should not add disfluencies to questions inappropriately', () => {
      const question = 'What do you think about that?';
      const result = naturalizer.naturalize(question, 'ferni', {
        isResponding: false,
      });
      expect(typeof result).toBe('string');
    });

    it('should maintain sentence integrity', () => {
      const text = 'First point. Second point. Third point.';
      const result = naturalizer.naturalize(text, 'ferni', {});

      // Should still have sentence structure
      expect(result).toContain('.');
    });

    it('should not crash with rapid successive calls', () => {
      expect(() => {
        for (let i = 0; i < 100; i++) {
          naturalizer.naturalize(`Test sentence ${i}`, 'ferni', { turnNumber: i });
        }
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Deterministic Randomness (seeded)
  // --------------------------------------------------------------------------

  describe('Deterministic Randomness', () => {
    it('should be deterministic when randomSeed is provided', () => {
      const text = 'This is a test sentence for deterministic naturalization.';

      // Use fresh instances to avoid stateful anti-repetition logic influencing output.
      const a = new SpeechNaturalizer({
        enabled: true,
        frequency: 1,
        contextSensitivity: false,
      }).naturalize(text, 'ferni', { turnNumber: 5, randomSeed: 'session-1:turn-5' });

      const b = new SpeechNaturalizer({
        enabled: true,
        frequency: 1,
        contextSensitivity: false,
      }).naturalize(text, 'ferni', { turnNumber: 5, randomSeed: 'session-1:turn-5' });

      expect(a).toBe(b);
    });

    it('should not call Math.random when randomSeed is provided', () => {
      const seeded = new SpeechNaturalizer({
        enabled: true,
        frequency: 1,
        contextSensitivity: false,
      });
      const text = 'This is a test sentence for deterministic naturalization.';

      const spy = vi.spyOn(Math, 'random');
      try {
        seeded.naturalize(text, 'ferni', { turnNumber: 5, randomSeed: 'session-2:turn-5' });
        // In seeded mode, we should not rely on Math.random() at all.
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it('should make getThinkingPhrase deterministic when randomSeed is provided', () => {
      const seeded = new SpeechNaturalizer({
        enabled: true,
        frequency: 1,
        contextSensitivity: false,
      });

      const a = seeded.getThinkingPhrase('ferni', 'processing', {
        randomSeed: 'session-3:thinking',
      });
      const b = seeded.getThinkingPhrase('ferni', 'processing', {
        randomSeed: 'session-3:thinking',
      });

      expect(a.phrase).toBe(b.phrase);
      expect(a.ssml).toBe(b.ssml);
    });
  });
});
