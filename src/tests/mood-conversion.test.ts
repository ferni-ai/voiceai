/**
 * Mood Conversion Tests
 *
 * Tests for the unified mood format conversion utilities.
 */

import { describe, it, expect } from 'vitest';
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
} from '../services/journal/mood-conversion.js';

// ============================================================================
// MOOD ID TO SCORE TESTS
// ============================================================================

describe('moodIdToScore', () => {
  it('should convert known mood IDs to scores', () => {
    expect(moodIdToScore('happy')).toBe(8);
    expect(moodIdToScore('excited')).toBe(9);
    expect(moodIdToScore('anxious')).toBe(3);
    expect(moodIdToScore('sad')).toBe(2);
    expect(moodIdToScore('calm')).toBe(7);
    expect(moodIdToScore('neutral')).toBe(5);
  });

  it('should handle case-insensitive input', () => {
    expect(moodIdToScore('HAPPY')).toBe(8);
    expect(moodIdToScore('Anxious')).toBe(3);
    expect(moodIdToScore('CaLm')).toBe(7);
  });

  it('should trim whitespace', () => {
    expect(moodIdToScore('  happy  ')).toBe(8);
    expect(moodIdToScore('\tanxious\n')).toBe(3);
  });

  it('should return neutral score (5) for unknown moods', () => {
    expect(moodIdToScore('unknown')).toBe(5);
    expect(moodIdToScore('gibberish')).toBe(5);
    expect(moodIdToScore('')).toBe(5);
  });

  it('should return neutral score (5) for null/undefined', () => {
    expect(moodIdToScore(null)).toBe(5);
    expect(moodIdToScore(undefined)).toBe(5);
  });
});

// ============================================================================
// SCORE TO MOOD ID TESTS
// ============================================================================

describe('scoreToMoodId', () => {
  it('should convert high scores to positive moods', () => {
    expect(scoreToMoodId(10)).toBe('excited');
    expect(scoreToMoodId(9)).toBe('excited');
    expect(scoreToMoodId(8)).toBe('happy');
    expect(scoreToMoodId(7)).toBe('calm');
  });

  it('should convert mid scores to neutral moods', () => {
    expect(scoreToMoodId(5)).toBe('neutral');
    expect(scoreToMoodId(4)).toBe('tired');
  });

  it('should convert low scores to negative moods', () => {
    expect(scoreToMoodId(3)).toBe('anxious');
    expect(scoreToMoodId(2)).toBe('sad');
    expect(scoreToMoodId(1)).toBe('overwhelmed');
  });

  it('should clamp out-of-range scores', () => {
    expect(scoreToMoodId(15)).toBe('excited'); // Clamped to 10
    expect(scoreToMoodId(-5)).toBe('overwhelmed'); // Clamped to 1
  });

  it('should return neutral for null/undefined', () => {
    expect(scoreToMoodId(null)).toBe('neutral');
    expect(scoreToMoodId(undefined)).toBe('neutral');
  });
});

// ============================================================================
// GET MOOD BY ID TESTS
// ============================================================================

describe('getMoodById', () => {
  it('should return full mood definition', () => {
    const happy = getMoodById('happy');
    expect(happy.id).toBe('happy');
    expect(happy.label).toBe('Happy');
    expect(happy.score).toBe(8);
    expect(happy.valence).toBe('positive');
    expect(happy.icon).toBe('smile');
  });

  it('should return neutral for unknown ID', () => {
    const unknown = getMoodById('unknown');
    expect(unknown.id).toBe('neutral');
    expect(unknown.label).toBe('Neutral');
  });

  it('should return neutral for null/undefined', () => {
    expect(getMoodById(null).id).toBe('neutral');
    expect(getMoodById(undefined).id).toBe('neutral');
  });
});

// ============================================================================
// GET MOOD LABEL TESTS
// ============================================================================

describe('getMoodLabel', () => {
  it('should get label from string ID', () => {
    expect(getMoodLabel('happy')).toBe('Happy');
    expect(getMoodLabel('anxious')).toBe('Anxious');
    expect(getMoodLabel('angry')).toBe('Frustrated'); // Note: angry = "Frustrated"
  });

  it('should get label from numeric score', () => {
    expect(getMoodLabel(9)).toBe('Excited');
    expect(getMoodLabel(8)).toBe('Happy');
    expect(getMoodLabel(3)).toBe('Anxious');
  });

  it('should return Neutral for unknown values', () => {
    expect(getMoodLabel('unknown')).toBe('Neutral');
    expect(getMoodLabel(null)).toBe('Neutral');
  });
});

// ============================================================================
// GET MOOD ICON TESTS
// ============================================================================

describe('getMoodIcon', () => {
  it('should return correct icons for moods', () => {
    expect(getMoodIcon('happy')).toBe('smile');
    expect(getMoodIcon('grateful')).toBe('heart');
    expect(getMoodIcon('sad')).toBe('frown');
  });

  it('should return icon from numeric score', () => {
    expect(getMoodIcon(9)).toBe('star'); // excited
    expect(getMoodIcon(2)).toBe('frown'); // sad
  });
});

// ============================================================================
// GET MOOD VALENCE TESTS
// ============================================================================

describe('getMoodValence', () => {
  it('should categorize positive moods', () => {
    expect(getMoodValence('happy')).toBe('positive');
    expect(getMoodValence('excited')).toBe('positive');
    expect(getMoodValence('grateful')).toBe('positive');
    expect(getMoodValence('calm')).toBe('positive');
  });

  it('should categorize negative moods', () => {
    expect(getMoodValence('anxious')).toBe('negative');
    expect(getMoodValence('sad')).toBe('negative');
    expect(getMoodValence('angry')).toBe('negative');
    expect(getMoodValence('overwhelmed')).toBe('negative');
  });

  it('should categorize neutral moods', () => {
    expect(getMoodValence('neutral')).toBe('neutral');
    expect(getMoodValence('tired')).toBe('neutral');
    expect(getMoodValence('reflective')).toBe('neutral');
  });

  it('should work with numeric scores', () => {
    expect(getMoodValence(9)).toBe('positive');
    expect(getMoodValence(5)).toBe('neutral');
    expect(getMoodValence(2)).toBe('negative');
  });
});

// ============================================================================
// NORMALIZE MOOD TESTS
// ============================================================================

describe('normalizeMood', () => {
  it('should normalize string ID', () => {
    const result = normalizeMood('happy');
    expect(result.id).toBe('happy');
    expect(result.score).toBe(8);
  });

  it('should normalize numeric score', () => {
    const result = normalizeMood(8);
    expect(result.id).toBe('happy');
    expect(result.score).toBe(8);
  });

  it('should normalize object with mood ID', () => {
    const result = normalizeMood({ mood: 'anxious' });
    expect(result.id).toBe('anxious');
    expect(result.score).toBe(3);
  });

  it('should normalize object with mood score', () => {
    const result = normalizeMood({ moodScore: 7 });
    expect(result.id).toBe('calm');
    expect(result.score).toBe(7);
  });

  it('should normalize object with both mood and moodScore', () => {
    const result = normalizeMood({ mood: 'happy', moodScore: 9 });
    expect(result.id).toBe('happy');
    expect(result.score).toBe(9); // Uses provided score, not default
  });

  it('should return neutral for null/undefined', () => {
    expect(normalizeMood(null).id).toBe('neutral');
    expect(normalizeMood(undefined).id).toBe('neutral');
  });

  it('should return neutral for empty object', () => {
    expect(normalizeMood({}).id).toBe('neutral');
  });
});

// ============================================================================
// CALCULATE AVERAGE MOOD TESTS
// ============================================================================

describe('calculateAverageMood', () => {
  it('should calculate average from string IDs', () => {
    const result = calculateAverageMood(['happy', 'sad', 'calm']);
    // happy=8, sad=2, calm=7 => avg=5.67
    expect(result.averageScore).toBeCloseTo(5.67, 1);
  });

  it('should calculate average from numeric scores', () => {
    const result = calculateAverageMood([8, 6, 4]);
    expect(result.averageScore).toBe(6);
    expect(result.averageId).toBe('hopeful'); // score 6 maps to hopeful
  });

  it('should calculate mood distribution', () => {
    const result = calculateAverageMood(['happy', 'happy', 'sad', 'happy']);
    expect(result.distribution.happy).toBe(3);
    expect(result.distribution.sad).toBe(1);
  });

  it('should handle mixed formats', () => {
    const result = calculateAverageMood(['happy', 8, { mood: 'calm' }]);
    // happy=8, 8=8, calm=7 => avg=7.67
    expect(result.averageScore).toBeCloseTo(7.67, 1);
  });

  it('should return neutral for empty array', () => {
    const result = calculateAverageMood([]);
    expect(result.averageScore).toBe(5);
    expect(result.averageId).toBe('neutral');
  });
});

// ============================================================================
// GET MOOD TREND TESTS
// ============================================================================

describe('getMoodTrend', () => {
  it('should detect improving trend', () => {
    const recent = ['happy', 'excited', 'grateful']; // avg ~8.7
    const older = ['sad', 'anxious', 'tired']; // avg ~3
    expect(getMoodTrend(recent, older)).toBe('improving');
  });

  it('should detect declining trend', () => {
    const recent = ['sad', 'anxious']; // avg ~2.5
    const older = ['happy', 'calm']; // avg ~7.5
    expect(getMoodTrend(recent, older)).toBe('declining');
  });

  it('should detect stable trend', () => {
    const recent = ['neutral', 'calm']; // avg ~6
    const older = ['hopeful', 'neutral']; // avg ~6
    expect(getMoodTrend(recent, older)).toBe('stable');
  });

  it('should return stable for empty arrays', () => {
    expect(getMoodTrend([], ['happy'])).toBe('stable');
    expect(getMoodTrend(['happy'], [])).toBe('stable');
    expect(getMoodTrend([], [])).toBe('stable');
  });
});

// ============================================================================
// MOOD DEFINITIONS INTEGRITY TESTS
// ============================================================================

describe('MOOD_DEFINITIONS integrity', () => {
  it('should have all expected mood types', () => {
    const expectedMoods: MoodId[] = [
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

    expectedMoods.forEach((mood) => {
      expect(MOOD_DEFINITIONS[mood]).toBeDefined();
    });
  });

  it('should have valid scores for all moods', () => {
    ALL_MOOD_IDS.forEach((id) => {
      const mood = MOOD_DEFINITIONS[id];
      expect(mood.score).toBeGreaterThanOrEqual(1);
      expect(mood.score).toBeLessThanOrEqual(10);
    });
  });

  it('should have valid valence for all moods', () => {
    ALL_MOOD_IDS.forEach((id) => {
      const mood = MOOD_DEFINITIONS[id];
      expect(['positive', 'negative', 'neutral']).toContain(mood.valence);
    });
  });

  it('should have non-empty labels and icons', () => {
    ALL_MOOD_IDS.forEach((id) => {
      const mood = MOOD_DEFINITIONS[id];
      expect(mood.label.length).toBeGreaterThan(0);
      expect(mood.icon.length).toBeGreaterThan(0);
    });
  });

  it('should have consistent valence and score alignment', () => {
    ALL_MOOD_IDS.forEach((id) => {
      const mood = MOOD_DEFINITIONS[id];
      if (mood.valence === 'positive') {
        expect(mood.score).toBeGreaterThanOrEqual(7);
      } else if (mood.valence === 'negative') {
        expect(mood.score).toBeLessThanOrEqual(3);
      } else {
        expect(mood.score).toBeGreaterThanOrEqual(4);
        expect(mood.score).toBeLessThanOrEqual(6);
      }
    });
  });
});
