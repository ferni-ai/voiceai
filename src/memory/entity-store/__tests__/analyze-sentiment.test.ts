/**
 * Sentiment Analysis Tests
 *
 * Tests for the rule-based sentiment analyzer used in entity mention capture.
 */

import { describe, it, expect } from 'vitest';
import { analyzeSentiment } from '../integration.js';

describe('analyzeSentiment', () => {
  describe('positive sentiment', () => {
    it('should detect strong positive words', () => {
      expect(analyzeSentiment('I love this!')).toBeGreaterThan(0.4);
      expect(analyzeSentiment("That's amazing")).toBeGreaterThan(0.4);
      expect(analyzeSentiment('This is wonderful')).toBeGreaterThan(0.4);
    });

    it('should detect medium positive words', () => {
      expect(analyzeSentiment("I'm happy")).toBeGreaterThan(0.2);
      expect(analyzeSentiment("That's great")).toBeGreaterThan(0.2);
      expect(analyzeSentiment("I'm excited")).toBeGreaterThan(0.2);
    });

    it('should detect light positive words', () => {
      expect(analyzeSentiment('That was nice')).toBeGreaterThan(0);
      expect(analyzeSentiment("It's fine")).toBeGreaterThan(0);
      expect(analyzeSentiment('I like it')).toBeGreaterThan(0);
    });

    it('should amplify with intensifiers', () => {
      const base = analyzeSentiment("I'm happy");
      const intensified = analyzeSentiment("I'm very happy");
      expect(intensified).toBeGreaterThan(base);
    });
  });

  describe('negative sentiment', () => {
    it('should detect strong negative words', () => {
      expect(analyzeSentiment('I hate this')).toBeLessThan(-0.4);
      expect(analyzeSentiment("That's terrible")).toBeLessThan(-0.4);
      expect(analyzeSentiment("I'm devastated")).toBeLessThan(-0.4);
    });

    it('should detect medium negative words', () => {
      expect(analyzeSentiment("I'm sad")).toBeLessThan(-0.2);
      expect(analyzeSentiment("I'm frustrated")).toBeLessThan(-0.2);
      expect(analyzeSentiment("I'm worried")).toBeLessThan(-0.2);
    });

    it('should detect light negative words', () => {
      expect(analyzeSentiment("I'm concerned")).toBeLessThan(0);
      expect(analyzeSentiment("I'm tired")).toBeLessThan(0);
      expect(analyzeSentiment("It's bad")).toBeLessThan(0);
    });

    it('should amplify with intensifiers', () => {
      const base = analyzeSentiment("I'm sad");
      const intensified = analyzeSentiment("I'm really sad");
      expect(intensified).toBeLessThan(base);
    });
  });

  describe('neutral sentiment', () => {
    it('should return 0 for empty text', () => {
      expect(analyzeSentiment('')).toBe(0);
      expect(analyzeSentiment('   ')).toBe(0);
    });

    it('should return 0 for text with no sentiment words', () => {
      expect(analyzeSentiment('Just met Mike')).toBe(0);
      expect(analyzeSentiment('The meeting is tomorrow')).toBe(0);
      expect(analyzeSentiment('She went to the store')).toBe(0);
    });
  });

  describe('negation handling', () => {
    it('should flip positive sentiment with negation', () => {
      const positive = analyzeSentiment("I'm happy");
      const negated = analyzeSentiment("I'm not happy");
      expect(negated).toBeLessThan(0);
      expect(negated).toBeLessThan(positive);
    });

    it('should flip negative sentiment with negation', () => {
      const negative = analyzeSentiment("I'm sad");
      const negated = analyzeSentiment("I'm not sad");
      expect(negated).toBeGreaterThan(0);
      expect(negated).toBeGreaterThan(negative);
    });

    it("should handle contractions like don't", () => {
      expect(analyzeSentiment("I don't like it")).toBeLessThan(0);
      expect(analyzeSentiment("I don't hate it")).toBeGreaterThan(0);
    });

    it('should handle never negation', () => {
      expect(analyzeSentiment('I never feel good')).toBeLessThan(0);
    });
  });

  describe('mixed sentiment', () => {
    it('should calculate net sentiment for mixed text', () => {
      // Both positive and negative - should be close to neutral
      const mixed = analyzeSentiment("I'm happy but also a bit worried");
      expect(mixed).toBeGreaterThan(-0.3);
      expect(mixed).toBeLessThan(0.3);
    });

    it('should lean positive when positive words dominate', () => {
      const result = analyzeSentiment("I'm happy, excited, and grateful today");
      expect(result).toBeGreaterThan(0.3);
    });

    it('should lean negative when negative words dominate', () => {
      const result = analyzeSentiment("I'm sad, frustrated, and worried");
      expect(result).toBeLessThan(-0.3);
    });
  });

  describe('real conversation examples', () => {
    it('should analyze typical entity mentions', () => {
      // Positive about a person
      expect(analyzeSentiment('Mom is doing amazing!')).toBeGreaterThan(0.3);

      // Worried about a person
      expect(analyzeSentiment("I'm worried about my brother")).toBeLessThan(0);

      // Neutral reference
      expect(analyzeSentiment('My boss called today')).toBe(0);

      // Excited about someone
      expect(analyzeSentiment("Sarah got promoted, I'm so happy for her!")).toBeGreaterThan(0.3);

      // Sad about loss
      expect(analyzeSentiment('I miss my grandfather, still sad about it')).toBeLessThan(-0.2);
    });
  });

  describe('bounds', () => {
    it('should always return values between -1 and 1', () => {
      const extremePositive = analyzeSentiment('love amazing wonderful fantastic excellent');
      expect(extremePositive).toBeLessThanOrEqual(1);
      expect(extremePositive).toBeGreaterThan(0.5);

      const extremeNegative = analyzeSentiment('hate terrible awful horrible devastated');
      expect(extremeNegative).toBeGreaterThanOrEqual(-1);
      expect(extremeNegative).toBeLessThan(-0.5);
    });
  });
});
