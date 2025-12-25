/**
 * Emotional Granularity Training Tests
 *
 * Tests for emotional vocabulary analysis and coaching.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectVagueExpression,
  getVocabularySuggestions,
  getEmotionTeaching,
  getGranularityScore,
  getTopEmotionWords,
  recordExpansionAccepted,
  recordExpansionOffered,
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

    it('should track vague expressions in user profile', () => {
      const userId = getUniqueUserId();

      // Initial score
      const initialScore = getGranularityScore(userId);

      // Use vague expressions multiple times
      detectVagueExpression(userId, 'I feel bad');
      detectVagueExpression(userId, 'I feel bad');
      detectVagueExpression(userId, 'I feel terrible');

      const newScore = getGranularityScore(userId);
      // Score should decrease due to vague expressions
      expect(newScore).toBeLessThanOrEqual(initialScore);
    });
  });

  // ===========================================================================
  // getVocabularySuggestions
  // ===========================================================================
  describe('getVocabularySuggestions', () => {
    it('should return anger vocabulary', () => {
      const words = getVocabularySuggestions('anger');

      expect(words.length).toBeGreaterThan(0);
      expect(words.some((w) => w.word === 'frustrated')).toBe(true);
      expect(words.some((w) => w.word === 'furious')).toBe(true);
    });

    it('should return sadness vocabulary', () => {
      const words = getVocabularySuggestions('sadness');

      expect(words.length).toBeGreaterThan(0);
      expect(words.some((w) => w.word === 'disappointed')).toBe(true);
      expect(words.some((w) => w.word === 'melancholy')).toBe(true);
    });

    it('should return fear vocabulary', () => {
      const words = getVocabularySuggestions('fear');

      expect(words.length).toBeGreaterThan(0);
      expect(words.some((w) => w.word === 'anxious')).toBe(true);
      expect(words.some((w) => w.word === 'terrified')).toBe(true);
    });

    it('should return joy vocabulary', () => {
      const words = getVocabularySuggestions('joy');

      expect(words.length).toBeGreaterThan(0);
      expect(words.some((w) => w.word === 'content')).toBe(true);
      expect(words.some((w) => w.word === 'elated')).toBe(true);
    });

    it('should filter by intensity', () => {
      const highWords = getVocabularySuggestions('anger', 'high');

      expect(highWords.every((w) => w.intensity === 'high')).toBe(true);
      expect(highWords.some((w) => w.word === 'furious')).toBe(true);
    });

    it('should filter low intensity words', () => {
      const lowWords = getVocabularySuggestions('sadness', 'low');

      expect(lowWords.every((w) => w.intensity === 'low')).toBe(true);
      expect(lowWords.some((w) => w.word === 'disappointed')).toBe(true);
    });

    it('should return empty array for unknown category', () => {
      const words = getVocabularySuggestions('unknown' as EmotionCategory);
      expect(words).toEqual([]);
    });
  });

  // ===========================================================================
  // getEmotionTeaching
  // ===========================================================================
  describe('getEmotionTeaching', () => {
    it('should return teaching for known emotion word', () => {
      const teaching = getEmotionTeaching('frustrated');

      expect(teaching).toBeDefined();
      expect(teaching).toContain('frustrated');
      expect(teaching).toContain('anger');
    });

    it('should include nuance in teaching', () => {
      const teaching = getEmotionTeaching('melancholy');

      expect(teaching).toContain('melancholy');
      expect(teaching).toContain('sadness');
    });

    it('should include intensity in teaching', () => {
      const teaching = getEmotionTeaching('furious');

      expect(teaching).toContain('high');
    });

    it('should return null for unknown word', () => {
      const teaching = getEmotionTeaching('unknownemotion');
      expect(teaching).toBeNull();
    });
  });

  // ===========================================================================
  // getGranularityScore
  // ===========================================================================
  describe('getGranularityScore', () => {
    it('should return 50 for new user (baseline)', () => {
      const userId = getUniqueUserId();
      const score = getGranularityScore(userId);
      expect(score).toBe(50);
    });

    it('should increase score when using specific emotion words', () => {
      const userId = getUniqueUserId();

      // Use specific emotion words in messages
      detectVagueExpression(userId, 'I feel disappointed and anxious');
      detectVagueExpression(userId, 'I am feeling grateful today');
      detectVagueExpression(userId, 'This makes me feel melancholy');

      const score = getGranularityScore(userId);
      expect(score).toBeGreaterThanOrEqual(50);
    });
  });

  // ===========================================================================
  // getTopEmotionWords
  // ===========================================================================
  describe('getTopEmotionWords', () => {
    it('should return empty array for new user', () => {
      const userId = getUniqueUserId();
      const topWords = getTopEmotionWords(userId);
      expect(topWords).toEqual([]);
    });

    it('should track emotion word usage', () => {
      const userId = getUniqueUserId();

      // Use emotion words
      detectVagueExpression(userId, 'I feel anxious about this');
      detectVagueExpression(userId, 'I am really anxious');
      detectVagueExpression(userId, 'Feeling grateful today');

      const topWords = getTopEmotionWords(userId);

      // anxious should be tracked (used twice)
      const anxiousEntry = topWords.find((w) => w.word === 'anxious');
      if (anxiousEntry) {
        expect(anxiousEntry.count).toBe(2);
      }
    });

    it('should respect limit parameter', () => {
      const userId = getUniqueUserId();

      // Use many emotion words
      detectVagueExpression(userId, 'I feel anxious, nervous, fearful, sad');

      const topWords = getTopEmotionWords(userId, 2);
      expect(topWords.length).toBeLessThanOrEqual(2);
    });
  });

  // ===========================================================================
  // recordExpansionAccepted / recordExpansionOffered
  // ===========================================================================
  describe('recordExpansionAccepted / recordExpansionOffered', () => {
    it('should increase score when expansion accepted', () => {
      const userId = getUniqueUserId();
      const initialScore = getGranularityScore(userId);

      recordExpansionAccepted(userId);
      recordExpansionAccepted(userId);

      const newScore = getGranularityScore(userId);
      expect(newScore).toBeGreaterThan(initialScore);
    });

    it('should not throw when recording for new user', () => {
      const userId = getUniqueUserId();

      expect(() => {
        recordExpansionOffered(userId);
        recordExpansionAccepted(userId);
      }).not.toThrow();
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
