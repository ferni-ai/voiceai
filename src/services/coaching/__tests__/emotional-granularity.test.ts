/**
 * Emotional Granularity Training Tests
 *
 * Tests for emotional vocabulary analysis and coaching.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectVagueExpression,
  buildGranularityContext,
  type EmotionCategory,
} from '../emotional-granularity.js';

describe('EmotionalGranularity', () => {
  // Use unique user IDs for each test
  let testCounter = 0;
  const getUniqueUserId = () => `test-user-${Date.now()}-${testCounter++}`;

  // ===========================================================================
  // detectVagueExpression
  // ===========================================================================
  describe('detectVagueExpression', () => {
    it('should detect "I feel bad" as vague', () => {
      const userId = getUniqueUserId();
      const result = detectVagueExpression(userId, 'I feel bad about what happened');

      expect(result.isVague).toBe(true);
      expect(result.category).toBe('sadness');
      expect(result.alternatives).toBeDefined();
      expect(result.alternatives!.length).toBeGreaterThan(0);
    });

    it('should detect "I feel terrible" as vague', () => {
      const userId = getUniqueUserId();
      const result = detectVagueExpression(userId, 'I feel terrible');

      expect(result.isVague).toBe(true);
      expect(result.category).toBe('sadness');
    });

    it('should detect "I feel good" as vague', () => {
      const userId = getUniqueUserId();
      const result = detectVagueExpression(userId, 'I feel good about this');

      expect(result.isVague).toBe(true);
      expect(result.category).toBe('joy');
      expect(result.alternatives).toContain('content');
    });

    it('should detect "I am stressed" as vague', () => {
      const userId = getUniqueUserId();
      const result = detectVagueExpression(userId, "I'm stressed out");

      expect(result.isVague).toBe(true);
      expect(result.category).toBe('fear');
      expect(result.alternatives).toContain('overwhelmed');
    });

    it('should detect "I am mad" as vague', () => {
      const userId = getUniqueUserId();
      const result = detectVagueExpression(userId, "I'm mad at him");

      expect(result.isVague).toBe(true);
      expect(result.category).toBe('anger');
    });

    it('should detect "I am scared" as vague', () => {
      const userId = getUniqueUserId();
      const result = detectVagueExpression(userId, "I'm scared about tomorrow");

      expect(result.isVague).toBe(true);
      expect(result.category).toBe('fear');
      expect(result.alternatives).toContain('anxious');
    });

    it('should detect "I am sad" as vague', () => {
      const userId = getUniqueUserId();
      const result = detectVagueExpression(userId, "I'm sad today");

      expect(result.isVague).toBe(true);
      expect(result.category).toBe('sadness');
    });

    it('should detect "I feel weird" as vague', () => {
      const userId = getUniqueUserId();
      const result = detectVagueExpression(userId, 'I feel weird about this situation');

      expect(result.isVague).toBe(true);
      expect(result.category).toBe('mixed');
    });

    it('should not detect specific emotions as vague', () => {
      const userId = getUniqueUserId();
      const result = detectVagueExpression(userId, 'I feel disappointed and a little anxious');

      expect(result.isVague).toBe(false);
    });

    it('should generate expansion prompt', () => {
      const userId = getUniqueUserId();
      const result = detectVagueExpression(userId, 'I feel bad');

      expect(result.expansionPrompt).toBeDefined();
      expect(result.expansionPrompt).toContain('?');
    });
  });

  // ===========================================================================
  // buildGranularityContext
  // ===========================================================================
  describe('buildGranularityContext', () => {
    it('should return null for new user with no history', () => {
      const userId = getUniqueUserId();
      const context = buildGranularityContext(userId);
      expect(context).toBeNull();
    });

    it('should return coaching context for low granularity user', () => {
      const userId = getUniqueUserId();

      // Use lots of vague expressions to lower score
      for (let i = 0; i < 10; i++) {
        detectVagueExpression(userId, 'I feel bad');
      }

      const context = buildGranularityContext(userId);

      if (context) {
        expect(context).toContain('EMOTIONAL VOCABULARY');
      }
    });
  });
});
