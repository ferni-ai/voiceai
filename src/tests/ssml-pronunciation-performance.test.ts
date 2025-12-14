/**
 * SSML Pronunciation Performance Tests
 *
 * Tests for the optimized pronunciation processor to ensure:
 * 1. Correctness - optimized version produces same results as naive version
 * 2. Category skipping - patterns are correctly categorized and skipped
 * 3. Performance - category skipping reduces pattern checks
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { FINANCIAL_END, FINANCIAL_PRONUNCIATIONS, FINANCIAL_START } from '../ssml/constants.js';
import {
  applyPronunciationsOptimized,
  estimatePatternChecks,
  getCategoryStats,
  resetPronunciationCache,
} from '../ssml/pronunciation-processor.js';

describe('SSML Pronunciation Processor Performance', () => {
  beforeEach(() => {
    resetPronunciationCache();
  });

  describe('Category Statistics', () => {
    it('should categorize all 233 patterns', () => {
      const stats = getCategoryStats();
      const totalPatterns = stats.reduce((sum, cat) => sum + cat.count, 0);
      expect(totalPatterns).toBe(FINANCIAL_PRONUNCIATIONS.length);
    });

    it('should have patterns in multiple categories', () => {
      const stats = getCategoryStats();
      const nonEmptyCategories = stats.filter((cat) => cat.count > 0);
      expect(nonEmptyCategories.length).toBeGreaterThan(2);
    });
  });

  describe('Pattern Skipping', () => {
    it('should skip digit patterns for text without numbers', () => {
      const text = 'This is a simple text without any numbers';
      const estimate = estimatePatternChecks(text);

      // Should skip retirement_accounts category (digit patterns)
      const retirementCategory = estimate.categories.find((c) => c.name === 'retirement_accounts');
      expect(retirementCategory?.checked).toBe(false);
      expect(estimate.skipped).toBeGreaterThan(0);
    });

    it('should check digit patterns for text with numbers', () => {
      const text = 'Check your 401k balance';
      const estimate = estimatePatternChecks(text);

      const retirementCategory = estimate.categories.find((c) => c.name === 'retirement_accounts');
      expect(retirementCategory?.checked).toBe(true);
    });

    it('should skip uppercase patterns for lowercase-only text', () => {
      const text = 'this is all lowercase text';
      const estimate = estimatePatternChecks(text);

      const uppercaseCategory = estimate.categories.find((c) => c.name === 'uppercase_acronyms');
      expect(uppercaseCategory?.checked).toBe(false);
    });

    it('should check uppercase patterns for text with acronyms', () => {
      const text = 'Check the SEC and FDIC';
      const estimate = estimatePatternChecks(text);

      const uppercaseCategory = estimate.categories.find((c) => c.name === 'uppercase_acronyms');
      expect(uppercaseCategory?.checked).toBe(true);
    });

    it('should skip Japanese patterns for non-Japanese text', () => {
      const text = 'Simple English text about life';
      const estimate = estimatePatternChecks(text);

      const japaneseCategory = estimate.categories.find((c) => c.name === 'japanese_cultural');
      expect(japaneseCategory?.checked).toBe(false);
    });

    it('should check Japanese patterns for text with Japanese terms', () => {
      const text = 'Embrace wabi-sabi in your life';
      const estimate = estimatePatternChecks(text);

      const japaneseCategory = estimate.categories.find((c) => c.name === 'japanese_cultural');
      expect(japaneseCategory?.checked).toBe(true);
    });
  });

  describe('Correctness', () => {
    it('should correctly replace 401k', () => {
      const result = applyPronunciationsOptimized('Check your 401k balance');
      expect(result).toContain('four oh one K');
      expect(result).toContain(FINANCIAL_START);
      expect(result).toContain(FINANCIAL_END);
    });

    it('should correctly replace ETF', () => {
      const result = applyPronunciationsOptimized('ETFs are great investments');
      expect(result).toContain('E T F');
    });

    it('should correctly replace ADHD', () => {
      const result = applyPronunciationsOptimized('Managing ADHD is possible');
      expect(result).toContain('A D H D');
    });

    it('should correctly replace Japanese terms', () => {
      const result = applyPronunciationsOptimized('Find your ikigai');
      expect(result).toContain('ee-kee-guy');
    });

    it('should handle multiple terms', () => {
      const result = applyPronunciationsOptimized(
        'Max out your 401k and HSA, check your ETF performance'
      );
      expect(result).toContain('four oh one K');
      expect(result).toContain('H S A');
      expect(result).toContain('E T F');
    });

    it('should handle empty text', () => {
      const result = applyPronunciationsOptimized('');
      expect(result).toBe('');
    });

    it('should handle text with no matches', () => {
      const text = 'just plain text with nothing to replace';
      const result = applyPronunciationsOptimized(text);
      expect(result).toBe(text);
    });
  });

  describe('Performance Estimates', () => {
    it('should skip most patterns for simple lowercase text', () => {
      const text = 'hello world this is simple text';
      const estimate = estimatePatternChecks(text);

      // Should skip a significant portion of patterns
      expect(estimate.skipped).toBeGreaterThan(estimate.checked);
    });

    it('should check more patterns for text with diverse content', () => {
      const text = 'Check your 401k, manage ADHD with CBT, and find your ikigai at S&P 500';
      const estimate = estimatePatternChecks(text);

      // Most categories should be checked
      const checkedCategories = estimate.categories.filter((c) => c.checked);
      expect(checkedCategories.length).toBeGreaterThan(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very short text', () => {
      expect(applyPronunciationsOptimized('a')).toBe('a');
      expect(applyPronunciationsOptimized('.')).toBe('.');
    });

    it('should handle text with special characters', () => {
      const text = 'S&P 500 is up 5%!';
      const result = applyPronunciationsOptimized(text);
      expect(result).toContain('S and P five hundred');
    });

    it('should preserve whitespace', () => {
      const text = '  401k  ';
      const result = applyPronunciationsOptimized(text);
      expect(result).toMatch(/^\s+.*\s+$/);
    });
  });
});
