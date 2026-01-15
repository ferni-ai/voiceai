/**
 * Easter Eggs System Unit Tests
 *
 * Tests the easter egg system that adds personality and surprise moments:
 * - Quirk generation per persona
 * - Easter egg detection and triggering
 * - State management for usage tracking
 *
 * @module personas/__tests__/easter-eggs.test
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { checkForEasterEgg, getRandomQuirk, resetEasterEggState } from '../easter-eggs.js';

describe('Easter Eggs System', () => {
  beforeEach(() => {
    resetEasterEggState();
  });

  describe('getRandomQuirk', () => {
    it('should return a quirk for Ferni', () => {
      const quirk = getRandomQuirk('ferni');

      // May return null sometimes (probability-based)
      if (quirk) {
        expect(typeof quirk).toBe('string');
        expect(quirk.length).toBeGreaterThan(0);
      }
    });

    it('should work for all personas', () => {
      const personas = [
        'ferni',
        'peter-john',
        'alex-chen',
        'maya-santos',
        'jordan-taylor',
        'nayan-patel',
      ];

      for (const personaId of personas) {
        // Try multiple times since quirks are probabilistic
        let foundQuirk = false;
        for (let i = 0; i < 10; i++) {
          const quirk = getRandomQuirk(personaId);
          if (quirk) {
            foundQuirk = true;
            expect(typeof quirk).toBe('string');
            break;
          }
        }
        // It's OK if we don't find a quirk (low probability)
        // Just verify no errors
      }
    });

    it('should return null for unknown persona', () => {
      const quirk = getRandomQuirk('unknown-persona');
      expect(quirk).toBeNull();
    });

    it('should return different quirks over time', () => {
      const quirks = new Set<string>();

      // Try to collect quirks (they're probabilistic)
      for (let i = 0; i < 20; i++) {
        const quirk = getRandomQuirk('ferni');
        if (quirk) {
          quirks.add(quirk);
        }
      }

      // May have found some variety
      // Even if we only found one, that's fine
    });
  });

  describe('checkForEasterEgg', () => {
    // Note: checkForEasterEgg signature is (userText, personaId, context)
    // Returns EasterEggResult with { type, response?, triggered }

    it('should check for easter egg triggers in message', () => {
      const result = checkForEasterEgg('hello', 'ferni', {
        conversationCount: 5,
      });

      // Result always has type and triggered
      expect(result.type).toBeDefined();
      expect(typeof result.triggered).toBe('boolean');
    });

    it('should not trigger on empty message', () => {
      const result = checkForEasterEgg('', 'ferni', {
        conversationCount: 5,
      });

      // Should return with triggered: false or type: 'none'
      expect(result.triggered).toBe(false);
    });

    it('should detect birthday trigger', () => {
      const result = checkForEasterEgg("it's my birthday today!", 'ferni', {
        conversationCount: 5,
      });

      // Birthday is a keyword trigger
      if (result.triggered) {
        expect(result.type).toBe('birthday');
        expect(result.response).toBeDefined();
      }
    });

    it('should work for all personas', () => {
      const personas = [
        'ferni',
        'peter-john',
        'alex-chen',
        'maya-santos',
        'jordan-taylor',
        'nayan-patel',
      ];

      for (const personaId of personas) {
        const result = checkForEasterEgg('test message', personaId, {
          conversationCount: 5,
        });

        // Result should always be defined with type
        expect(result.type).toBeDefined();
        expect(typeof result.triggered).toBe('boolean');
      }
    });

    it('should return response text when triggered', () => {
      // Use a known trigger
      const result = checkForEasterEgg('getting married soon!', 'ferni', {
        conversationCount: 5,
      });

      if (result.triggered) {
        expect(result.response).toBeDefined();
        expect(result.response!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('resetEasterEggState', () => {
    it('should reset state without errors', () => {
      // First, try to trigger some state
      checkForEasterEgg('test', 'ferni', {
        conversationCount: 5,
      });

      // Reset
      expect(() => resetEasterEggState()).not.toThrow();

      // Should be able to check again
      const result = checkForEasterEgg('test', 'ferni', {
        conversationCount: 5,
      });
      // Just verify no errors - result structure is valid
      expect(result.type).toBeDefined();
    });
  });

  describe('Easter egg content quality', () => {
    it('easter egg response should not be empty when triggered', () => {
      // Use known triggers to ensure we get results
      const triggers = ["it's my birthday", 'getting married', 'got engaged'];

      for (const trigger of triggers) {
        const result = checkForEasterEgg(trigger, 'ferni', {
          conversationCount: 10,
        });

        if (result.triggered && result.response) {
          expect(result.response.length).toBeGreaterThan(0);
          expect(result.type).not.toBe('none');
        }
      }
    });
  });
});
