/**
 * Preference Extractor Tests
 *
 * Comprehensive tests for the general preference extraction system.
 * Validates that Ferni can learn user preferences from natural conversation.
 *
 * @module tests/preference-extractor
 */

import { describe, it, expect } from 'vitest';
import {
  extractPreferences,
  hasPreferenceContent,
  type ExtractedPreference,
} from '../intelligence/preference-extractor.js';

describe('preference-extractor', () => {
  // ============================================================================
  // SPORTS TEAM DETECTION
  // ============================================================================
  describe('Sports Team Detection', () => {
    it('detects explicit fan declarations', () => {
      const testCases = [
        {
          text: "I'm an Eagles fan",
          expected: { category: 'sports_team', value: 'eagles', context: 'NFL' },
        },
        {
          text: "We're huge Cowboys fans",
          expected: { category: 'sports_team', value: 'cowboys', context: 'NFL' },
        },
        {
          text: 'I love the Lakers',
          expected: { category: 'sports_team', value: 'lakers', context: 'NBA' },
        },
        {
          text: 'Go Eagles!',
          expected: { category: 'sports_team', value: 'eagles', context: 'NFL' },
        },
        {
          text: 'The Sixers are my team',
          expected: { category: 'sports_team', value: 'sixers', context: 'NBA' },
        },
      ];

      for (const { text, expected } of testCases) {
        const results = extractPreferences(text);
        expect(results.length).toBeGreaterThanOrEqual(1);
        const sportsTeam = results.find((r) => r.category === 'sports_team');
        expect(sportsTeam).toBeDefined();
        expect(sportsTeam?.value).toBe(expected.value);
        expect(sportsTeam?.context).toBe(expected.context);
      }
    });

    it('detects teams from different leagues', () => {
      const leagues = [
        { text: "I'm a Phillies fan", league: 'MLB' },
        { text: 'I follow the Flyers', league: 'NHL' },
        { text: 'I root for the Warriors', league: 'NBA' },
        { text: 'I support the Chiefs', league: 'NFL' },
      ];

      for (const { text, league } of leagues) {
        const results = extractPreferences(text);
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0]?.context).toBe(league);
      }
    });

    it('does NOT extract team mentions without fan context', () => {
      // Casual mentions shouldn't trigger extraction
      const noExtract = [
        'Did you see the Eagles played yesterday?',
        'The weather is nice today',
        'What time is it?',
      ];

      for (const text of noExtract) {
        const results = extractPreferences(text);
        // Should be empty or low confidence
        const highConfidence = results.filter((r) => r.confidence >= 0.75);
        expect(highConfidence.length).toBe(0);
      }
    });
  });

  // ============================================================================
  // STOCK WATCHLIST DETECTION
  // ============================================================================
  describe('Stock Watchlist Detection', () => {
    it('detects stock ownership mentions', () => {
      const testCases = [
        { text: 'I own some Apple stock', expected: 'AAPL' },
        { text: 'I bought Tesla shares last week', expected: 'TSLA' },
        { text: 'I have invested in Google', expected: 'GOOGL' },
        { text: "I'm following NVIDIA", expected: 'NVDA' },
      ];

      for (const { text, expected } of testCases) {
        const results = extractPreferences(text);
        const stockPref = results.find((r) => r.category === 'stock_watchlist');
        expect(stockPref).toBeDefined();
        expect(stockPref?.value).toBe(expected);
      }
    });

    it('normalizes company names to tickers', () => {
      const results = extractPreferences("I'm watching Microsoft closely");
      const stockPref = results.find((r) => r.category === 'stock_watchlist');
      expect(stockPref?.value).toBe('MSFT');
    });

    it('ignores non-stock mentions', () => {
      const results = extractPreferences('I have a nice car');
      const stockPref = results.find((r) => r.category === 'stock_watchlist');
      expect(stockPref).toBeUndefined();
    });
  });

  // ============================================================================
  // NEWS PREFERENCE DETECTION
  // ============================================================================
  describe('News Preference Detection', () => {
    it('detects news interests', () => {
      const testCases = [
        { text: 'I like tech news', expected: 'tech' },
        { text: 'Keep me updated on finance', expected: 'finance' },
        { text: "I'm interested in science", expected: 'science' },
      ];

      for (const { text, expected } of testCases) {
        const results = extractPreferences(text);
        const newsPref = results.find((r) => r.category === 'news_interest');
        expect(newsPref).toBeDefined();
        expect(newsPref?.value).toBe(expected);
      }
    });

    it('detects topics to avoid', () => {
      const testCases = [
        { text: "I don't want to hear about politics", expected: 'politics', isNegative: true },
        { text: 'Politics stresses me out', expected: 'politics', isNegative: true },
        { text: 'Skip the political stuff', expected: 'political', isNegative: true },
      ];

      for (const { text, expected, isNegative } of testCases) {
        const results = extractPreferences(text);
        const avoidPref = results.find((r) => r.category === 'avoid_topic');
        expect(avoidPref).toBeDefined();
        expect(avoidPref?.isNegative).toBe(isNegative);
      }
    });
  });

  // ============================================================================
  // LOCATION DETECTION
  // ============================================================================
  describe('Location Detection', () => {
    it('detects home location', () => {
      const testCases = [
        { text: 'I live in Philadelphia', category: 'home_location' },
        { text: "I'm from Boston", category: 'home_location' },
        { text: 'My home is in Seattle', category: 'home_location' },
      ];

      for (const { text, category } of testCases) {
        const results = extractPreferences(text);
        const locationPref = results.find((r) => r.category === category);
        expect(locationPref).toBeDefined();
      }
    });

    it('detects work location', () => {
      const testCases = [
        { text: 'I work in NYC', category: 'work_location' },
        { text: 'My office is in Chicago', category: 'work_location' },
        { text: 'I commute to San Francisco', category: 'work_location' },
      ];

      for (const { text, category } of testCases) {
        const results = extractPreferences(text);
        const locationPref = results.find((r) => r.category === category);
        expect(locationPref).toBeDefined();
      }
    });
  });

  // ============================================================================
  // HEALTH & ALLERGY DETECTION
  // ============================================================================
  describe('Health & Allergy Detection', () => {
    it('detects allergies', () => {
      const testCases = [
        { text: 'I have peanut allergies', expected: 'peanut' },
        { text: "I'm allergic to shellfish", expected: 'shellfish' },
        { text: 'My seasonal allergies are terrible', expected: 'seasonal' },
      ];

      for (const { text, expected } of testCases) {
        const results = extractPreferences(text);
        const allergyPref = results.find((r) => r.category === 'allergy');
        expect(allergyPref).toBeDefined();
        expect(allergyPref?.value).toBe(expected);
      }
    });

    it('detects health conditions', () => {
      const results = extractPreferences('I have asthma');
      const healthPref = results.find((r) => r.category === 'health_condition');
      expect(healthPref).toBeDefined();
      expect(healthPref?.value).toBe('asthma');
    });
  });

  // ============================================================================
  // HASPREFERENCECONTENT HELPER
  // ============================================================================
  describe('hasPreferenceContent', () => {
    it('returns true for preference-related text', () => {
      const hasContent = [
        "I'm a fan of the Eagles",
        'I love tech news',
        'I live in Boston',
        "I'm allergic to peanuts",
        'I own Tesla stock',
        "I don't want to hear about politics",
      ];

      for (const text of hasContent) {
        expect(hasPreferenceContent(text)).toBe(true);
      }
    });

    it('returns false for non-preference text', () => {
      const noContent = ['Hello Ferni', 'What time is it?', 'Thank you', 'Good morning'];

      for (const text of noContent) {
        expect(hasPreferenceContent(text)).toBe(false);
      }
    });
  });

  // ============================================================================
  // CONFIDENCE LEVELS
  // ============================================================================
  describe('Confidence Levels', () => {
    it('assigns higher confidence to explicit declarations', () => {
      const explicit = extractPreferences("I'm a huge Eagles fan");
      const implicit = extractPreferences('Eagles won last night');

      const explicitTeam = explicit.find((r) => r.category === 'sports_team');
      const implicitTeam = implicit.find((r) => r.category === 'sports_team');

      expect(explicitTeam?.confidence).toBeGreaterThan(0.8);
      // Implicit should be lower or not extracted
      if (implicitTeam) {
        expect(implicitTeam.confidence).toBeLessThan(explicitTeam!.confidence);
      }
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================
  describe('Edge Cases', () => {
    it('handles empty text', () => {
      const results = extractPreferences('');
      expect(results).toEqual([]);
    });

    it('handles very short text', () => {
      const results = extractPreferences('Hi');
      expect(results).toEqual([]);
    });

    it('handles multiple preferences in one message', () => {
      const text = "I'm an Eagles fan and I live in Philly. I'm allergic to peanuts.";
      const results = extractPreferences(text);

      // Should extract sports team, location, and allergy
      expect(results.length).toBeGreaterThanOrEqual(2);

      const categories = results.map((r) => r.category);
      expect(categories).toContain('sports_team');
      // Either location or allergy
      expect(categories.some((c) => ['home_location', 'allergy'].includes(c))).toBe(true);
    });

    it('is case-insensitive', () => {
      const results1 = extractPreferences("I'M AN EAGLES FAN");
      const results2 = extractPreferences("i'm an eagles fan");

      expect(results1.length).toEqual(results2.length);
    });
  });
});
