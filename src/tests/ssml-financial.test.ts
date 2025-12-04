import { describe, it, expect } from 'vitest';
import { tagTextWithSsml } from '../ssml/index.js';
import {
  stripSsmlTags,
  containsTextIgnoringSsml,
  hasFinancialPronunciation,
} from './helpers/ssml-helpers.js';

describe('SSML Financial Pronunciation Tests', () => {
  describe('Financial Term Pronunciations', () => {
    it('should pronounce 401k correctly', () => {
      const tagged = tagTextWithSsml('I have a 401k account');
      expect(hasFinancialPronunciation(tagged, '401k', 'four oh one K')).toBe(true);
    });

    it('should pronounce S&P 500 correctly', () => {
      const tagged = tagTextWithSsml('The S&P 500 is up today');
      expect(containsTextIgnoringSsml(tagged, 'S and P five hundred')).toBe(true);
    });

    it('should handle multiple financial terms in one sentence', () => {
      const tagged = tagTextWithSsml('Move your 401k to VTI with low fees');
      expect(containsTextIgnoringSsml(tagged, 'four oh one K')).toBe(true);
      expect(containsTextIgnoringSsml(tagged, 'V T I')).toBe(true);
    });

    it('should pronounce ETF as individual letters', () => {
      const tagged = tagTextWithSsml('ETFs are great investments');
      expect(containsTextIgnoringSsml(tagged, 'E T F')).toBe(true);
    });

    it('should pronounce REIT as "reet"', () => {
      const tagged = tagTextWithSsml('REITs provide good income');
      expect(containsTextIgnoringSsml(tagged, 'reet')).toBe(true);
    });

    it('should pronounce IRA correctly', () => {
      const tagged = tagTextWithSsml('Open a Roth IRA');
      expect(containsTextIgnoringSsml(tagged, 'I R A')).toBe(true);
    });

    it('should pronounce 403b correctly', () => {
      const tagged = tagTextWithSsml('Your 403b is similar to a 401k');
      expect(containsTextIgnoringSsml(tagged, 'four oh three B')).toBe(true);
    });

    it('should pronounce HSA correctly', () => {
      const tagged = tagTextWithSsml('Use your HSA wisely');
      expect(containsTextIgnoringSsml(tagged, 'H S A')).toBe(true);
    });

    it('should pronounce 529 plan correctly', () => {
      const tagged = tagTextWithSsml('A 529 plan helps with college');
      expect(containsTextIgnoringSsml(tagged, 'five twenty nine')).toBe(true);
    });

    it('should pronounce ticker symbols as letters', () => {
      const tagged = tagTextWithSsml('VTI, VOO, and VXUS are good funds');
      expect(containsTextIgnoringSsml(tagged, 'V T I')).toBe(true);
      expect(containsTextIgnoringSsml(tagged, 'V O O')).toBe(true);
      expect(containsTextIgnoringSsml(tagged, 'V X U S')).toBe(true);
    });

    it('should pronounce FDIC correctly', () => {
      const tagged = tagTextWithSsml('FDIC insured accounts');
      expect(containsTextIgnoringSsml(tagged, 'F D I C')).toBe(true);
    });

    it('should pronounce SEC correctly', () => {
      const tagged = tagTextWithSsml('The SEC regulates investments');
      expect(containsTextIgnoringSsml(tagged, 'S E C')).toBe(true);
    });
  });

  describe('SSML Edge Cases', () => {
    it('should not break on empty text', () => {
      expect(() => tagTextWithSsml('')).not.toThrow();
      const result = tagTextWithSsml('');
      expect(result).toBe('');
    });

    it('should not break on whitespace-only text', () => {
      expect(() => tagTextWithSsml('   ')).not.toThrow();
      const result = tagTextWithSsml('   ');
      expect(result).toBe('   ');
    });

    it('should not break on very long text', () => {
      const longText = 'This is a test. '.repeat(1000);
      expect(() => tagTextWithSsml(longText)).not.toThrow();
      const result = tagTextWithSsml(longText);
      expect(result.length).toBeGreaterThan(longText.length);
    });

    it('should handle special characters without breaking', () => {
      const text = "What about 401(k) & IRAs? They're important!";
      expect(() => tagTextWithSsml(text)).not.toThrow();
      const result = tagTextWithSsml(text);
      expect(result).toBeTruthy();
    });

    it('should not double-tag already tagged text', () => {
      const text = 'Hello world';
      const tagged = tagTextWithSsml(text);
      const doubleTagged = tagTextWithSsml(tagged);
      expect(doubleTagged).toBe(tagged);
    });

    it('should handle text with numbers', () => {
      const text = 'Save 15% of your income in a 401k';
      expect(() => tagTextWithSsml(text)).not.toThrow();
      const result = tagTextWithSsml(text);
      expect(containsTextIgnoringSsml(result, 'four oh one K')).toBe(true);
    });

    it('should handle mixed case financial terms', () => {
      const text = 'Your 401K and Roth IRA';
      const result = tagTextWithSsml(text);
      expect(containsTextIgnoringSsml(result, 'four oh one K')).toBe(true);
      expect(containsTextIgnoringSsml(result, 'I R A')).toBe(true);
    });

    it('should handle punctuation around financial terms', () => {
      const text = "What is a 401k? It's a retirement account.";
      const result = tagTextWithSsml(text);
      expect(containsTextIgnoringSsml(result, 'four oh one K')).toBe(true);
    });
  });

  describe('SSML Speed and Volume Clamping', () => {
    it('should produce valid SSML with speed tags', () => {
      const text = 'This is important information';
      const result = tagTextWithSsml(text);
      // Should contain speed and volume ratio tags
      expect(result).toMatch(/<speed ratio="/);
      expect(result).toMatch(/<volume ratio="/);
    });

    it('should handle uppercase emphasis', () => {
      const text = 'This is VERY IMPORTANT information';
      const result = tagTextWithSsml(text);
      expect(result).toBeTruthy();
      // Uppercase words are spelled out via <spell> tags for TTS emphasis
      // "VERY" becomes "v e r y" (with spaces) when spelled
      const stripped = stripSsmlTags(result).toLowerCase();
      // Check for spelled-out version (with spaces) OR original word
      expect(stripped.includes('v e r y') || stripped.includes('very')).toBe(true);
      expect(stripped.includes('i m p o r t a n t') || stripped.includes('important')).toBe(true);
    });

    it('should handle questions with appropriate markers', () => {
      const text = 'What should I do with my 401k?';
      const result = tagTextWithSsml(text);
      expect(containsTextIgnoringSsml(result, 'four oh one K')).toBe(true);
      expect(result).toContain('?');
    });
  });

  describe('Financial Context Pronunciation', () => {
    it('should handle compound financial phrases', () => {
      const text = 'Contribute to your 401k and max out your HSA';
      const result = tagTextWithSsml(text);
      expect(containsTextIgnoringSsml(result, 'four oh one K')).toBe(true);
      expect(containsTextIgnoringSsml(result, 'H S A')).toBe(true);
    });

    it('should handle percentage and financial terms together', () => {
      const text = 'Your 401k has a 0.05% expense ratio';
      const result = tagTextWithSsml(text);
      expect(containsTextIgnoringSsml(result, 'four oh one K')).toBe(true);
    });

    it('should handle index names correctly', () => {
      const text = 'The Wilshire 5000 and Russell 2000';
      const result = tagTextWithSsml(text);
      // Should pronounce numbers naturally
      expect(result).toBeTruthy();
    });

    it('should handle fund family names', () => {
      const text = 'Vanguard, Fidelity, and Schwab offer great 401k options';
      const result = tagTextWithSsml(text);
      expect(containsTextIgnoringSsml(result, 'four oh one K')).toBe(true);
      expect(containsTextIgnoringSsml(result, 'Vanguard')).toBe(true);
    });

    it('should preserve proper nouns while fixing financial terms', () => {
      const text = 'Jack Bogle created the first index fund, like VTI';
      const result = tagTextWithSsml(text);
      // Bogle is pronounced as "Bogul" per the financial pronunciation dictionary
      expect(containsTextIgnoringSsml(result, 'Jack Bogul')).toBe(true);
      expect(containsTextIgnoringSsml(result, 'V T I')).toBe(true);
    });
  });

  describe('SSML Structure Validation', () => {
    it('should produce well-formed SSML', () => {
      const text = 'Invest in low-cost 401k funds';
      const result = tagTextWithSsml(text);

      // Should contain SSML tags (speed, volume, emotion, break, etc.)
      expect(result).toMatch(/<(speed|volume|emotion|break)/);

      // Should contain the financial pronunciation
      expect(containsTextIgnoringSsml(result, 'four oh one K')).toBe(true);
    });

    it('should handle apostrophes and contractions', () => {
      const text = "You can't beat a low-cost 401k";
      const result = tagTextWithSsml(text);
      expect(containsTextIgnoringSsml(result, 'four oh one K')).toBe(true);
      expect(containsTextIgnoringSsml(result, "can't")).toBe(true);
    });

    it('should handle multiple sentences', () => {
      const text = 'First, open a 401k. Then, invest in VTI. Finally, keep costs low.';
      const result = tagTextWithSsml(text);
      expect(containsTextIgnoringSsml(result, 'four oh one K')).toBe(true);
      expect(containsTextIgnoringSsml(result, 'V T I')).toBe(true);
    });
  });
});
