/**
 * Vocabulary Mirroring Tests
 *
 * Tests for the dynamic vocabulary learning and mirroring system.
 * This feature creates rapport by naturally using the user's language.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  getOrCreateProfile,
  analyzeVocabulary,
  getMirrorOpportunities,
  generateMirrorPhrase,
  markWordMirrored,
  shouldMirrorWord,
  getUserStyle,
  getTopVocabulary,
  getVocabSummary,
  clearUserProfile,
  clearAllProfiles,
  vocabularyMirroring,
  type VocabItem,
  type VocabCategory,
} from '../vocabulary-mirroring.js';

describe('VocabularyMirroring', () => {
  const testUserId = 'vocab-test-user';

  beforeEach(() => {
    clearAllProfiles();
  });

  describe('getOrCreateProfile', () => {
    it('should create a new profile for new user', () => {
      const profile = getOrCreateProfile(testUserId);

      expect(profile.userId).toBe(testUserId);
      expect(profile.items).toEqual([]);
      expect(profile.style.formalityLevel).toBe('mixed');
      expect(profile.style.intensityLevel).toBe('moderate');
    });

    it('should return existing profile for same user', () => {
      const profile1 = getOrCreateProfile(testUserId);
      profile1.items.push({
        word: 'recalibrate',
        category: 'unique',
        frequency: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        contexts: [],
        mirrored: false,
        mirrorCount: 0,
      });

      const profile2 = getOrCreateProfile(testUserId);
      expect(profile2.items.length).toBe(1);
      expect(profile2.items[0].word).toBe('recalibrate');
    });
  });

  describe('analyzeVocabulary', () => {
    it('should extract emotional vocabulary', () => {
      const newItems = analyzeVocabulary(testUserId, {
        userMessage: 'I feel overwhelmed and anxious about everything',
        turn: 1,
      });

      const profile = getOrCreateProfile(testUserId);
      const emotionalWords = profile.items.filter(i => i.category === 'emotional');

      expect(emotionalWords.length).toBeGreaterThan(0);
    });

    it('should extract intensifiers', () => {
      const newItems = analyzeVocabulary(testUserId, {
        userMessage: 'I am literally so excited about this super amazing thing',
        turn: 1,
      });

      const profile = getOrCreateProfile(testUserId);
      const intensifiers = profile.items.filter(i => i.category === 'intensifier');

      expect(intensifiers.some(i => i.word === 'literally' || i.word === 'super' || i.word === 'so')).toBe(true);
    });

    it('should extract fillers', () => {
      analyzeVocabulary(testUserId, {
        userMessage: 'Basically, I honestly think, you know, this is actually important',
        turn: 1,
      });

      const profile = getOrCreateProfile(testUserId);
      const fillers = profile.items.filter(i => i.category === 'filler');

      expect(fillers.length).toBeGreaterThan(0);
    });

    it('should extract unique long words', () => {
      analyzeVocabulary(testUserId, {
        userMessage: 'I need to recalibrate my expectations and reevaluate my priorities',
        turn: 1,
      });

      const profile = getOrCreateProfile(testUserId);
      const uniqueWords = profile.items.filter(i => i.category === 'unique');

      expect(uniqueWords.some(i => i.word.includes('recalibrat') || i.word.includes('reevalu'))).toBe(true);
    });

    it('should increment frequency for repeated words', () => {
      analyzeVocabulary(testUserId, {
        userMessage: 'I feel overwhelmed today',
        turn: 1,
      });

      analyzeVocabulary(testUserId, {
        userMessage: 'Still feeling overwhelmed by everything',
        turn: 2,
      });

      const profile = getOrCreateProfile(testUserId);
      const overwhelmed = profile.items.find(i => i.word === 'overwhelmed');

      expect(overwhelmed?.frequency).toBeGreaterThanOrEqual(2);
    });

    it('should track contexts', () => {
      analyzeVocabulary(testUserId, {
        userMessage: 'I feel stressed',
        turn: 1,
        topic: 'work',
      });

      analyzeVocabulary(testUserId, {
        userMessage: 'Still stressed about things',
        turn: 2,
        topic: 'family',
      });

      const profile = getOrCreateProfile(testUserId);
      const stressed = profile.items.find(i => i.word === 'stressed');

      expect(stressed?.contexts).toContain('work');
      expect(stressed?.contexts).toContain('family');
    });

    it('should ignore common words', () => {
      analyzeVocabulary(testUserId, {
        userMessage: 'The and but for not with you this that have',
        turn: 1,
      });

      const profile = getOrCreateProfile(testUserId);
      expect(profile.items.length).toBe(0);
    });

    it('should return newly added items', () => {
      const newItems = analyzeVocabulary(testUserId, {
        userMessage: 'I feel exhilarated and invigorated today',
        turn: 1,
      });

      expect(newItems.length).toBeGreaterThan(0);
    });
  });

  describe('style detection', () => {
    it('should detect formal communication style', () => {
      analyzeVocabulary(testUserId, {
        userMessage: 'Therefore, I believe furthermore that regarding this matter, additionally we should proceed',
        turn: 1,
      });

      const style = getUserStyle(testUserId);
      expect(style?.formalityLevel).toBe('formal');
    });

    it('should detect casual communication style', () => {
      analyzeVocabulary(testUserId, {
        userMessage: 'Yeah gonna wanna kinda do this nah lol haha',
        turn: 1,
      });

      const style = getUserStyle(testUserId);
      expect(style?.formalityLevel).toBe('casual');
    });

    it('should detect high intensity style', () => {
      analyzeVocabulary(testUserId, {
        userMessage: 'I am super literally totally absolutely extremely very really excited',
        turn: 1,
      });

      const style = getUserStyle(testUserId);
      expect(style?.intensityLevel).toBe('high');
    });

    it('should detect frequent filler usage', () => {
      analyzeVocabulary(testUserId, {
        userMessage: 'Basically honestly you know like I mean actually this is you know basically fine',
        turn: 1,
      });

      const style = getUserStyle(testUserId);
      expect(style?.fillerFrequency).toBe('frequent');
    });
  });

  describe('getMirrorOpportunities', () => {
    beforeEach(() => {
      // Build up vocabulary
      for (let i = 0; i < 3; i++) {
        analyzeVocabulary(testUserId, {
          userMessage: 'I need to recalibrate my life and feel overwhelmed by responsibilities',
          turn: i,
          topic: 'life',
        });
      }
    });

    it('should return mirror opportunities', () => {
      const opportunities = getMirrorOpportunities(testUserId, {
        topic: 'life',
      });

      expect(opportunities.length).toBeGreaterThan(0);
    });

    it('should prioritize frequently used words', () => {
      const opportunities = getMirrorOpportunities(testUserId, {});

      expect(opportunities.length).toBeGreaterThan(0);
      expect(opportunities[0].confidence).toBeGreaterThan(0);
    });

    it('should boost emotional words in vulnerable context', () => {
      const normalOpportunities = getMirrorOpportunities(testUserId, {});
      const vulnerableOpportunities = getMirrorOpportunities(testUserId, {
        isVulnerable: true,
      });

      // Both should return opportunities
      expect(normalOpportunities.length).toBeGreaterThan(0);
      expect(vulnerableOpportunities.length).toBeGreaterThan(0);
    });

    it('should respect max opportunities limit', () => {
      const opportunities = getMirrorOpportunities(testUserId, {}, 1);
      expect(opportunities.length).toBeLessThanOrEqual(1);
    });

    it('should include word and suggestion', () => {
      const opportunities = getMirrorOpportunities(testUserId, {});

      if (opportunities.length > 0) {
        expect(opportunities[0].word).toBeDefined();
        expect(opportunities[0].suggestion).toBeDefined();
        expect(opportunities[0].category).toBeDefined();
      }
    });
  });

  describe('generateMirrorPhrase', () => {
    it('should generate phrases for emotional category', () => {
      const phrases = generateMirrorPhrase('overwhelmed', 'emotional', {});

      expect(phrases.length).toBeGreaterThan(0);
      expect(phrases.some(p => p.includes('overwhelmed'))).toBe(true);
    });

    it('should generate phrases for unique category', () => {
      const phrases = generateMirrorPhrase('recalibrating', 'unique', {});

      expect(phrases.length).toBeGreaterThan(0);
      expect(phrases.some(p => p.includes('recalibrating'))).toBe(true);
    });

    it('should generate phrases for metaphor category', () => {
      const phrases = generateMirrorPhrase('spinning plates', 'metaphor', {});

      expect(phrases.length).toBeGreaterThan(0);
    });

    it('should generate phrases for intensifier category', () => {
      const phrases = generateMirrorPhrase('literally', 'intensifier', {});

      expect(phrases.length).toBeGreaterThan(0);
    });
  });

  describe('markWordMirrored', () => {
    beforeEach(() => {
      analyzeVocabulary(testUserId, {
        userMessage: 'I feel recalibrating my whole approach',
        turn: 1,
      });
    });

    it('should mark word as mirrored', () => {
      markWordMirrored(testUserId, 'recalibrating');

      const profile = getOrCreateProfile(testUserId);
      const word = profile.items.find(i => i.word === 'recalibrating');

      expect(word?.mirrored).toBe(true);
      expect(word?.mirrorCount).toBe(1);
    });

    it('should increment mirror count', () => {
      markWordMirrored(testUserId, 'recalibrating');
      markWordMirrored(testUserId, 'recalibrating');

      const profile = getOrCreateProfile(testUserId);
      const word = profile.items.find(i => i.word === 'recalibrating');

      expect(word?.mirrorCount).toBe(2);
    });

    it('should track if mirroring landed', () => {
      markWordMirrored(testUserId, 'recalibrating', true);

      const profile = getOrCreateProfile(testUserId);
      const word = profile.items.find(i => i.word === 'recalibrating');

      expect(word?.mirrorLanded).toBe(true);
    });

    it('should handle non-existent word gracefully', () => {
      expect(() => {
        markWordMirrored(testUserId, 'nonexistentword');
      }).not.toThrow();
    });
  });

  describe('shouldMirrorWord', () => {
    beforeEach(() => {
      // Add word with some frequency
      for (let i = 0; i < 3; i++) {
        analyzeVocabulary(testUserId, {
          userMessage: 'I keep recalibrating everything',
          turn: i,
        });
      }
    });

    it('should recommend mirroring frequent words', () => {
      const result = shouldMirrorWord(testUserId, 'recalibrating');

      expect(result.should).toBe(true);
      expect(result.reason).toContain('Used');
    });

    it('should not recommend mirroring unknown words', () => {
      const result = shouldMirrorWord(testUserId, 'unknownword');

      expect(result.should).toBe(false);
      expect(result.reason).toContain('not in vocabulary');
    });

    it('should not over-mirror', () => {
      // Mirror the word many times
      for (let i = 0; i < 5; i++) {
        markWordMirrored(testUserId, 'recalibrating');
      }

      const result = shouldMirrorWord(testUserId, 'recalibrating');

      expect(result.should).toBe(false);
      expect(result.reason).toContain('Already mirrored');
    });

    it('should not mirror if it didn\'t land before', () => {
      markWordMirrored(testUserId, 'recalibrating', false);

      const result = shouldMirrorWord(testUserId, 'recalibrating');

      expect(result.should).toBe(false);
      expect(result.reason).toContain("Didn't land");
    });
  });

  describe('getTopVocabulary', () => {
    beforeEach(() => {
      // Build vocabulary with different frequencies
      analyzeVocabulary(testUserId, {
        userMessage: 'overwhelmed overwhelmed overwhelmed stressed stressed recalibrating',
        turn: 1,
      });
    });

    it('should return top vocabulary sorted by frequency', () => {
      const topVocab = getTopVocabulary(testUserId);

      expect(topVocab.length).toBeGreaterThan(0);
      // First should have highest frequency
      if (topVocab.length > 1) {
        expect(topVocab[0].frequency).toBeGreaterThanOrEqual(topVocab[1].frequency);
      }
    });

    it('should filter by category', () => {
      const emotionalVocab = getTopVocabulary(testUserId, 'emotional');

      for (const item of emotionalVocab) {
        expect(item.category).toBe('emotional');
      }
    });

    it('should respect limit', () => {
      const topVocab = getTopVocabulary(testUserId, undefined, 2);

      expect(topVocab.length).toBeLessThanOrEqual(2);
    });

    it('should return empty for unknown user', () => {
      const topVocab = getTopVocabulary('unknown-user');
      expect(topVocab).toEqual([]);
    });
  });

  describe('getVocabSummary', () => {
    beforeEach(() => {
      for (let i = 0; i < 3; i++) {
        analyzeVocabulary(testUserId, {
          userMessage: 'I feel overwhelmed and need to recalibrate my expectations',
          turn: i,
        });
      }
    });

    it('should return summary with top words', () => {
      const summary = getVocabSummary(testUserId);

      expect(summary.topWords.length).toBeGreaterThan(0);
    });

    it('should include style description', () => {
      const summary = getVocabSummary(testUserId);

      expect(summary.style).toBeDefined();
    });

    it('should include words ready to mirror', () => {
      const summary = getVocabSummary(testUserId);

      expect(Array.isArray(summary.mirrorReady)).toBe(true);
    });

    it('should return default for unknown user', () => {
      const summary = getVocabSummary('unknown-user');

      expect(summary.topWords).toEqual([]);
      expect(summary.style).toBe('unknown');
      expect(summary.mirrorReady).toEqual([]);
    });
  });

  describe('clearUserProfile / clearAllProfiles', () => {
    it('should clear specific user profile', () => {
      analyzeVocabulary(testUserId, {
        userMessage: 'I feel overwhelmed',
        turn: 1,
      });

      clearUserProfile(testUserId);

      const profile = getOrCreateProfile(testUserId);
      expect(profile.items).toEqual([]);
    });

    it('should clear all profiles', () => {
      analyzeVocabulary('user1', { userMessage: 'I feel stressed', turn: 1 });
      analyzeVocabulary('user2', { userMessage: 'I feel anxious', turn: 1 });

      clearAllProfiles();

      expect(getOrCreateProfile('user1').items).toEqual([]);
      expect(getOrCreateProfile('user2').items).toEqual([]);
    });
  });

  describe('vocabularyMirroring export', () => {
    it('should expose all main functions', () => {
      expect(vocabularyMirroring.getProfile).toBeDefined();
      expect(vocabularyMirroring.analyze).toBeDefined();
      expect(vocabularyMirroring.getOpportunities).toBeDefined();
      expect(vocabularyMirroring.generatePhrase).toBeDefined();
      expect(vocabularyMirroring.shouldMirror).toBeDefined();
      expect(vocabularyMirroring.markMirrored).toBeDefined();
      expect(vocabularyMirroring.getStyle).toBeDefined();
      expect(vocabularyMirroring.getTopVocab).toBeDefined();
      expect(vocabularyMirroring.getSummary).toBeDefined();
      expect(vocabularyMirroring.clearUser).toBeDefined();
      expect(vocabularyMirroring.clearAll).toBeDefined();
    });
  });

  describe('profile size management', () => {
    it('should cap profile at 200 items', () => {
      // Generate many unique words
      for (let i = 0; i < 250; i++) {
        analyzeVocabulary(testUserId, {
          userMessage: `I feel superuniquetestword${i} today`,
          turn: i,
        });
      }

      const profile = getOrCreateProfile(testUserId);
      expect(profile.items.length).toBeLessThanOrEqual(200);
    });
  });
});
