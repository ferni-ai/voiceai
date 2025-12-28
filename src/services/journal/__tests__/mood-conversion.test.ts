/**
 * Mood Conversion Service Tests
 *
 * Tests for mood ID/score conversion, normalization, and analytics helpers.
 */

import { describe, it, expect, vi } from 'vitest';

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
  moodIdToScore,
  scoreToMoodId,
  getMoodById,
  getMoodLabel,
  getMoodIcon,
  getMoodValence,
  normalizeMood,
  calculateAverageMood,
  getMoodTrend,
  MOOD_DEFINITIONS,
  ALL_MOOD_IDS,
  type MoodId,
  type UnifiedMood,
} from '../mood-conversion.js';

describe('MoodConversion', () => {
  describe('MOOD_DEFINITIONS', () => {
    it('should have all expected moods defined', () => {
      const expectedMoods = [
        'happy',
        'calm',
        'anxious',
        'sad',
        'angry',
        'grateful',
        'tired',
        'excited',
        'neutral',
        'overwhelmed',
        'hopeful',
        'reflective',
      ];

      for (const mood of expectedMoods) {
        expect(MOOD_DEFINITIONS[mood as MoodId]).toBeDefined();
      }
    });

    it('should have 12 total moods', () => {
      expect(Object.keys(MOOD_DEFINITIONS)).toHaveLength(12);
    });

    it('should have consistent structure for each mood', () => {
      for (const [id, mood] of Object.entries(MOOD_DEFINITIONS)) {
        expect(mood.id).toBe(id);
        expect(typeof mood.label).toBe('string');
        expect(typeof mood.score).toBe('number');
        expect(mood.score).toBeGreaterThanOrEqual(1);
        expect(mood.score).toBeLessThanOrEqual(10);
        expect(['positive', 'negative', 'neutral']).toContain(mood.valence);
        expect(typeof mood.icon).toBe('string');
      }
    });

    it('should have positive moods with scores >= 7', () => {
      const positiveMoods = Object.values(MOOD_DEFINITIONS).filter((m) => m.valence === 'positive');

      for (const mood of positiveMoods) {
        expect(mood.score).toBeGreaterThanOrEqual(7);
      }
    });

    it('should have negative moods with scores <= 3', () => {
      const negativeMoods = Object.values(MOOD_DEFINITIONS).filter((m) => m.valence === 'negative');

      for (const mood of negativeMoods) {
        expect(mood.score).toBeLessThanOrEqual(3);
      }
    });

    it('should have neutral moods with scores 4-6', () => {
      const neutralMoods = Object.values(MOOD_DEFINITIONS).filter((m) => m.valence === 'neutral');

      for (const mood of neutralMoods) {
        expect(mood.score).toBeGreaterThanOrEqual(4);
        expect(mood.score).toBeLessThanOrEqual(6);
      }
    });
  });

  describe('ALL_MOOD_IDS', () => {
    it('should contain all mood IDs', () => {
      expect(ALL_MOOD_IDS).toHaveLength(12);
      expect(ALL_MOOD_IDS).toContain('happy');
      expect(ALL_MOOD_IDS).toContain('sad');
      expect(ALL_MOOD_IDS).toContain('neutral');
    });
  });

  describe('moodIdToScore', () => {
    it('should convert happy to score 8', () => {
      expect(moodIdToScore('happy')).toBe(8);
    });

    it('should convert anxious to score 3', () => {
      expect(moodIdToScore('anxious')).toBe(3);
    });

    it('should convert neutral to score 5', () => {
      expect(moodIdToScore('neutral')).toBe(5);
    });

    it('should return 5 for unknown mood', () => {
      expect(moodIdToScore('unknown')).toBe(5);
    });

    it('should return 5 for null/undefined', () => {
      expect(moodIdToScore(null)).toBe(5);
      expect(moodIdToScore(undefined)).toBe(5);
    });

    it('should be case insensitive', () => {
      expect(moodIdToScore('HAPPY')).toBe(8);
      expect(moodIdToScore('Happy')).toBe(8);
    });

    it('should handle whitespace', () => {
      expect(moodIdToScore('  happy  ')).toBe(8);
    });

    it('should match partial strings', () => {
      // Contains 'happy'
      expect(moodIdToScore('happyish')).toBe(8);
    });
  });

  describe('scoreToMoodId', () => {
    it('should convert score 9-10 to excited', () => {
      expect(scoreToMoodId(9)).toBe('excited');
      expect(scoreToMoodId(10)).toBe('excited');
    });

    it('should convert score 8 to happy', () => {
      expect(scoreToMoodId(8)).toBe('happy');
    });

    it('should convert score 7 to calm', () => {
      expect(scoreToMoodId(7)).toBe('calm');
    });

    it('should convert score 5 to neutral', () => {
      expect(scoreToMoodId(5)).toBe('neutral');
    });

    it('should convert score 3 to anxious', () => {
      expect(scoreToMoodId(3)).toBe('anxious');
    });

    it('should convert score 2 to sad', () => {
      expect(scoreToMoodId(2)).toBe('sad');
    });

    it('should convert score 1 to overwhelmed', () => {
      expect(scoreToMoodId(1)).toBe('overwhelmed');
    });

    it('should return neutral for null/undefined', () => {
      expect(scoreToMoodId(null)).toBe('neutral');
      expect(scoreToMoodId(undefined)).toBe('neutral');
    });

    it('should clamp scores below 1', () => {
      expect(scoreToMoodId(0)).toBe('overwhelmed');
      expect(scoreToMoodId(-5)).toBe('overwhelmed');
    });

    it('should clamp scores above 10', () => {
      expect(scoreToMoodId(11)).toBe('excited');
      expect(scoreToMoodId(100)).toBe('excited');
    });

    it('should handle decimal scores', () => {
      expect(scoreToMoodId(8.5)).toBe('happy');
      expect(scoreToMoodId(5.5)).toBe('neutral');
    });
  });

  describe('getMoodById', () => {
    it('should return mood definition for valid ID', () => {
      const mood = getMoodById('happy');

      expect(mood.id).toBe('happy');
      expect(mood.label).toBe('Happy');
      expect(mood.score).toBe(8);
    });

    it('should return neutral for unknown ID', () => {
      const mood = getMoodById('unknown');

      expect(mood.id).toBe('neutral');
    });

    it('should return neutral for null/undefined', () => {
      expect(getMoodById(null).id).toBe('neutral');
      expect(getMoodById(undefined).id).toBe('neutral');
    });

    it('should be case insensitive', () => {
      expect(getMoodById('HAPPY').id).toBe('happy');
    });
  });

  describe('getMoodLabel', () => {
    it('should get label from mood ID', () => {
      expect(getMoodLabel('happy')).toBe('Happy');
      expect(getMoodLabel('angry')).toBe('Frustrated'); // Note: angry's label is "Frustrated"
    });

    it('should get label from numeric score', () => {
      expect(getMoodLabel(8)).toBe('Happy');
      expect(getMoodLabel(3)).toBe('Anxious');
    });

    it('should return Neutral for unknown', () => {
      expect(getMoodLabel('unknown')).toBe('Neutral');
      expect(getMoodLabel(null)).toBe('Neutral');
    });
  });

  describe('getMoodIcon', () => {
    it('should get icon from mood ID', () => {
      expect(getMoodIcon('happy')).toBe('smile');
      expect(getMoodIcon('sad')).toBe('frown');
    });

    it('should get icon from numeric score', () => {
      expect(getMoodIcon(8)).toBe('smile'); // happy
      expect(getMoodIcon(5)).toBe('minus'); // neutral
    });

    it('should return minus for unknown', () => {
      expect(getMoodIcon('unknown')).toBe('minus');
    });
  });

  describe('getMoodValence', () => {
    it('should get valence from mood ID', () => {
      expect(getMoodValence('happy')).toBe('positive');
      expect(getMoodValence('sad')).toBe('negative');
      expect(getMoodValence('neutral')).toBe('neutral');
    });

    it('should get valence from numeric score', () => {
      expect(getMoodValence(8)).toBe('positive');
      expect(getMoodValence(5)).toBe('neutral');
      expect(getMoodValence(2)).toBe('negative');
    });

    it('should return neutral for unknown', () => {
      expect(getMoodValence('unknown')).toBe('neutral');
    });
  });

  describe('normalizeMood', () => {
    it('should normalize string mood ID', () => {
      const result = normalizeMood('happy');

      expect(result.id).toBe('happy');
      expect(result.score).toBe(8);
    });

    it('should normalize numeric score', () => {
      const result = normalizeMood(8);

      expect(result.id).toBe('happy');
      expect(result.score).toBe(8);
    });

    it('should normalize object with mood property', () => {
      const result = normalizeMood({ mood: 'happy', moodScore: 9 });

      expect(result.id).toBe('happy');
      expect(result.score).toBe(9);
    });

    it('should normalize object with moodId property', () => {
      const result = normalizeMood({ moodId: 'sad' });

      expect(result.id).toBe('sad');
      expect(result.score).toBe(2);
    });

    it('should normalize object with only score', () => {
      const result = normalizeMood({ moodScore: 7 });

      expect(result.id).toBe('calm');
      expect(result.score).toBe(7);
    });

    it('should return neutral for invalid input', () => {
      const result = normalizeMood(null);

      expect(result.id).toBe('neutral');
      expect(result.score).toBe(5);
    });

    it('should return neutral for empty string', () => {
      const result = normalizeMood('');

      expect(result.id).toBe('neutral');
    });

    it('should handle case insensitive object mood', () => {
      const result = normalizeMood({ mood: 'HAPPY' });

      expect(result.id).toBe('happy');
    });
  });

  describe('calculateAverageMood', () => {
    it('should calculate average from string IDs', () => {
      const moods = ['happy', 'happy', 'neutral'];
      const result = calculateAverageMood(moods);

      // (8 + 8 + 5) / 3 = 7
      expect(result.averageScore).toBe(7);
      expect(result.averageId).toBe('calm');
    });

    it('should calculate average from numeric scores', () => {
      const moods = [8, 6, 4];
      const result = calculateAverageMood(moods);

      // (8 + 6 + 4) / 3 = 6
      expect(result.averageScore).toBe(6);
      expect(result.averageId).toBe('hopeful');
    });

    it('should calculate average from mixed formats', () => {
      const moods = ['happy', 6, { mood: 'sad' }];
      const result = calculateAverageMood(moods);

      // (8 + 6 + 2) / 3 = 5.33
      expect(result.averageScore).toBeCloseTo(5.33, 1);
    });

    it('should return distribution of moods', () => {
      const moods = ['happy', 'happy', 'sad', 'neutral'];
      const result = calculateAverageMood(moods);

      expect(result.distribution.happy).toBe(2);
      expect(result.distribution.sad).toBe(1);
      expect(result.distribution.neutral).toBe(1);
    });

    it('should return neutral for empty array', () => {
      const result = calculateAverageMood([]);

      expect(result.averageScore).toBe(5);
      expect(result.averageId).toBe('neutral');
      expect(result.distribution).toEqual({});
    });
  });

  describe('getMoodTrend', () => {
    it('should return improving when recent moods are better', () => {
      const recent = ['happy', 'excited'];
      const older = ['sad', 'anxious'];

      expect(getMoodTrend(recent, older)).toBe('improving');
    });

    it('should return declining when recent moods are worse', () => {
      const recent = ['sad', 'anxious'];
      const older = ['happy', 'excited'];

      expect(getMoodTrend(recent, older)).toBe('declining');
    });

    it('should return stable when moods are similar', () => {
      const recent = ['neutral', 'calm'];
      const older = ['neutral', 'hopeful'];

      expect(getMoodTrend(recent, older)).toBe('stable');
    });

    it('should return stable for empty arrays', () => {
      expect(getMoodTrend([], [])).toBe('stable');
      expect(getMoodTrend(['happy'], [])).toBe('stable');
      expect(getMoodTrend([], ['happy'])).toBe('stable');
    });

    it('should work with numeric scores', () => {
      const recent = [8, 9];
      const older = [3, 2];

      expect(getMoodTrend(recent, older)).toBe('improving');
    });

    it('should detect small improvements as improving when diff >= 1', () => {
      const recent = [6];
      const older = [5];

      // Difference of 1 is enough to be improving
      expect(getMoodTrend(recent, older)).toBe('improving');
    });

    it('should detect very small changes as stable', () => {
      const recent = [5.4];
      const older = [5];

      // Difference < 1, should be stable
      expect(getMoodTrend(recent, older)).toBe('stable');
    });
  });

  describe('Mood valence categories', () => {
    it('should categorize positive moods correctly', () => {
      const positiveMoods: MoodId[] = ['happy', 'excited', 'grateful', 'hopeful', 'calm'];

      for (const moodId of positiveMoods) {
        expect(MOOD_DEFINITIONS[moodId].valence).toBe('positive');
      }
    });

    it('should categorize negative moods correctly', () => {
      const negativeMoods: MoodId[] = ['anxious', 'sad', 'angry', 'overwhelmed'];

      for (const moodId of negativeMoods) {
        expect(MOOD_DEFINITIONS[moodId].valence).toBe('negative');
      }
    });

    it('should categorize neutral moods correctly', () => {
      const neutralMoods: MoodId[] = ['neutral', 'reflective', 'tired'];

      for (const moodId of neutralMoods) {
        expect(MOOD_DEFINITIONS[moodId].valence).toBe('neutral');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long mood strings', () => {
      const result = moodIdToScore('this_is_a_very_long_mood_string_that_doesnt_exist');
      expect(result).toBe(5); // Default to neutral
    });

    it('should handle special characters in mood string', () => {
      const result = moodIdToScore('happy!@#$%');
      expect(result).toBe(8); // Should still match 'happy'
    });

    it('should handle unicode in mood string', () => {
      const result = moodIdToScore('happy 😊');
      expect(result).toBe(8);
    });

    it('should handle object with nested properties', () => {
      const result = normalizeMood({
        mood: { id: 'happy' }, // Nested object - should fall through
        moodScore: 7,
      });

      expect(result.id).toBe('calm'); // Uses score since mood is object
      expect(result.score).toBe(7);
    });

    it('should handle array input to normalizeMood', () => {
      const result = normalizeMood(['happy', 'sad']);

      // Array is not a valid mood format
      expect(result.id).toBe('neutral');
    });
  });

  describe('Default exports', () => {
    it('should export all functions via default', async () => {
      const moodConversion = await import('../mood-conversion.js');
      const defaultExport = moodConversion.default;

      expect(defaultExport.moodIdToScore).toBeDefined();
      expect(defaultExport.scoreToMoodId).toBeDefined();
      expect(defaultExport.getMoodById).toBeDefined();
      expect(defaultExport.getMoodLabel).toBeDefined();
      expect(defaultExport.getMoodIcon).toBeDefined();
      expect(defaultExport.getMoodValence).toBeDefined();
      expect(defaultExport.normalizeMood).toBeDefined();
      expect(defaultExport.calculateAverageMood).toBeDefined();
      expect(defaultExport.getMoodTrend).toBeDefined();
      expect(defaultExport.MOOD_DEFINITIONS).toBeDefined();
      expect(defaultExport.ALL_MOOD_IDS).toBeDefined();
    });
  });
});
