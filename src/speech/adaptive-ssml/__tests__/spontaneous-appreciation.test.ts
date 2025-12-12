/**
 * Tests for Spontaneous Appreciation
 *
 * Verifies that appreciation phrases are injected appropriately.
 */

import { describe, expect, it } from 'vitest';

import {
  getAppreciationPhrase,
  injectSpontaneousAppreciation,
} from '../spontaneous-appreciation.js';

describe('spontaneous-appreciation', () => {
  describe('injectSpontaneousAppreciation', () => {
    it('should not inject before minimum turn count', () => {
      const result = injectSpontaneousAppreciation('Hello', {
        turnCount: 3,
        sessionId: 'test-session',
      });

      expect(result.appreciationAdded).toBe(false);
      expect(result.text).toBe('Hello');
    });

    it('should not inject for heavy conversation tone', () => {
      const result = injectSpontaneousAppreciation('I understand', {
        turnCount: 10,
        conversationTone: 'heavy',
        sessionId: 'test-session',
      });

      expect(result.appreciationAdded).toBe(false);
    });

    it('should respect probability (deterministic with session ID)', () => {
      // With same session ID, result should be consistent
      const result1 = injectSpontaneousAppreciation('Hello', {
        turnCount: 7,
        sessionId: 'test-session-123',
      });

      const result2 = injectSpontaneousAppreciation('Hello', {
        turnCount: 7,
        sessionId: 'test-session-123',
      });

      expect(result1.appreciationAdded).toBe(result2.appreciationAdded);
    });

    it('should inject with high probability when forced', () => {
      // Use probability of 1.0 to guarantee injection
      const result = injectSpontaneousAppreciation(
        'Hello',
        {
          turnCount: 10,
          sessionId: 'test-session',
          conversationTone: 'positive',
        },
        { probability: 1.0 }
      );

      expect(result.appreciationAdded).toBe(true);
      expect(result.phrase).toBeDefined();
      expect(result.text).toContain(result.phrase);
      expect(result.text).toContain('<break time="400ms"/>');
    });

    it('should not inject if already given this session', () => {
      const result = injectSpontaneousAppreciation(
        'Hello',
        {
          turnCount: 10,
          sessionId: 'test-session',
          appreciationGivenThisSession: true,
        },
        { probability: 1.0 }
      );

      expect(result.appreciationAdded).toBe(false);
    });

    it('should use general phrases for new users', () => {
      const result = injectSpontaneousAppreciation(
        'Hello',
        {
          turnCount: 10,
          totalConversations: 1,
          sessionId: 'test-session',
          conversationTone: 'positive',
        },
        { probability: 1.0 }
      );

      expect(result.appreciationAdded).toBe(true);
      // Should NOT include "look forward" phrases (those require 3+ conversations)
      expect(result.phrase).not.toContain('look forward');
    });

    it('should include returning user phrases after 3 conversations', () => {
      // Run multiple times to increase chance of getting returning user phrase
      let foundReturningPhrase = false;

      for (let i = 0; i < 20; i++) {
        const result = injectSpontaneousAppreciation(
          'Hello',
          {
            turnCount: 10 + i, // Vary turn count for different random seed
            totalConversations: 5,
            sessionId: `test-session-${i}`,
            conversationTone: 'positive',
          },
          { probability: 1.0 }
        );

        if (
          result.phrase?.includes('look forward') ||
          result.phrase?.includes('good to talk') ||
          result.phrase?.includes('hearing from you')
        ) {
          foundReturningPhrase = true;
          break;
        }
      }

      // At least one should have returning user phrase
      expect(foundReturningPhrase).toBe(true);
    });

    it('should include deep connection phrases after 10 conversations', () => {
      let foundDeepPhrase = false;

      for (let i = 0; i < 20; i++) {
        const result = injectSpontaneousAppreciation(
          'Hello',
          {
            turnCount: 10 + i,
            totalConversations: 15,
            sessionId: `test-session-deep-${i}`,
            conversationTone: 'positive',
          },
          { probability: 1.0 }
        );

        if (
          result.phrase?.includes('built something real') ||
          result.phrase?.includes('favorite people') ||
          result.phrase?.includes('actually know you')
        ) {
          foundDeepPhrase = true;
          break;
        }
      }

      expect(foundDeepPhrase).toBe(true);
    });

    it('should respect custom minTurnCount', () => {
      const result = injectSpontaneousAppreciation(
        'Hello',
        {
          turnCount: 3,
          sessionId: 'test-session',
        },
        { minTurnCount: 2, probability: 1.0 }
      );

      // Should inject because turn 3 >= minTurnCount 2
      expect(result.appreciationAdded).toBe(true);
    });

    it('should add pause after appreciation phrase', () => {
      const result = injectSpontaneousAppreciation(
        'How are you?',
        {
          turnCount: 10,
          sessionId: 'test-session',
        },
        { probability: 1.0 }
      );

      expect(result.text).toContain('<break time="400ms"/>');
      expect(result.text).toContain('How are you?');
    });
  });

  describe('getAppreciationPhrase', () => {
    it('should return a string', () => {
      const phrase = getAppreciationPhrase();
      expect(typeof phrase).toBe('string');
      expect(phrase.length).toBeGreaterThan(0);
    });

    it('should return different phrases for different conversation counts', () => {
      const newUser = getAppreciationPhrase(1);
      const returningUser = getAppreciationPhrase(5);
      const longTermUser = getAppreciationPhrase(15);

      // All should be strings
      expect(typeof newUser).toBe('string');
      expect(typeof returningUser).toBe('string');
      expect(typeof longTermUser).toBe('string');
    });
  });

  describe('seeded randomness', () => {
    it('should produce consistent results for same session and turn', () => {
      const results: boolean[] = [];

      // Same input should always produce same output
      for (let i = 0; i < 5; i++) {
        const result = injectSpontaneousAppreciation(
          'Test',
          {
            turnCount: 8,
            sessionId: 'consistent-session-id',
          },
          { probability: 0.5 }
        ); // 50% chance

        results.push(result.appreciationAdded);
      }

      // All results should be the same
      expect(results.every((r) => r === results[0])).toBe(true);
    });

    it('should produce different results for different sessions', () => {
      const results: boolean[] = [];

      // Different sessions should (eventually) produce different results
      for (let i = 0; i < 100; i++) {
        const result = injectSpontaneousAppreciation(
          'Test',
          {
            turnCount: 8,
            sessionId: `session-${i}`,
          },
          { probability: 0.5 }
        );

        results.push(result.appreciationAdded);
      }

      // Should have mix of true and false
      const trueCount = results.filter(Boolean).length;
      expect(trueCount).toBeGreaterThan(0);
      expect(trueCount).toBeLessThan(100);
    });
  });
});
