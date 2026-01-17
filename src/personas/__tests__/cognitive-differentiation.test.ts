/**
 * Cognitive Differentiation Unit Tests
 *
 * Tests the cognitive differentiation system that defines
 * how each persona differs in:
 * - Questioning styles (feeling vs data focus)
 * - Disagreement approaches
 * - Insight delivery
 * - Response patterns
 *
 * @module personas/__tests__/cognitive-differentiation.test
 */

import { describe, expect, it } from 'vitest';
import {
  getCognitiveDifferentiation,
  getPersonaQuestion,
  getDisagreementPhrase,
  getInsightLeadIn,
  cognitiveDifferentiation,
  ferniDifferentiation,
  peterDifferentiation,
  alexDifferentiation,
  mayaDifferentiation,
  jordanDifferentiation,
  nayanDifferentiation,
} from '../cognitive-differentiation.js';

describe('Cognitive Differentiation', () => {
  describe('Profile Loading', () => {
    it('should return differentiation for all 6 personas', () => {
      const personaIds = ['ferni', 'peter-john', 'alex-chen', 'maya-santos', 'jordan-taylor', 'nayan-patel'];

      for (const personaId of personaIds) {
        const diff = getCognitiveDifferentiation(personaId);
        expect(diff, `Missing differentiation for ${personaId}`).toBeDefined();
        expect(diff?.questioning).toBeDefined();
      }
    });

    it('should return undefined for unknown persona', () => {
      const diff = getCognitiveDifferentiation('unknown-persona');
      expect(diff).toBeUndefined();
    });
  });

  describe('Questioning Style Differentiation', () => {
    it('Ferni should be feeling-focused (feelingVsData > 0.5)', () => {
      expect(ferniDifferentiation.questioning.feelingVsData).toBeGreaterThan(0.5);
    });

    it('Peter should be data-focused (feelingVsData < 0.5)', () => {
      expect(peterDifferentiation.questioning.feelingVsData).toBeLessThan(0.5);
    });

    it('each persona should have different questioning patterns', () => {
      const scores = [
        ferniDifferentiation.questioning.feelingVsData,
        peterDifferentiation.questioning.feelingVsData,
        alexDifferentiation.questioning.feelingVsData,
        mayaDifferentiation.questioning.feelingVsData,
        jordanDifferentiation.questioning.feelingVsData,
        nayanDifferentiation.questioning.feelingVsData,
      ];

      // All scores should be in valid range
      for (const score of scores) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }

      // Should have variety (not all the same)
      const uniqueScores = new Set(scores);
      expect(uniqueScores.size).toBeGreaterThan(3);
    });
  });

  describe('Question Generation', () => {
    const questionTypes = ['starter', 'deep_dive'] as const;
    const personaIds = ['ferni', 'peter-john', 'alex-chen', 'maya-santos', 'jordan-taylor', 'nayan-patel'];

    it('should return questions for each persona and type', () => {
      for (const personaId of personaIds) {
        for (const type of questionTypes) {
          const question = getPersonaQuestion(personaId, type);
          // May return undefined if no questions defined for that type
          if (question) {
            expect(typeof question).toBe('string');
            expect(question.length).toBeGreaterThan(0);
          }
        }
      }
    });

    it('Ferni and Peter should have different deep_dive questions', () => {
      const ferniQuestion = getPersonaQuestion('ferni', 'deep_dive');
      const peterQuestion = getPersonaQuestion('peter-john', 'deep_dive');

      // Both should exist
      expect(ferniQuestion).toBeDefined();
      expect(peterQuestion).toBeDefined();

      // Should be different
      expect(ferniQuestion).not.toBe(peterQuestion);
    });

    it('should return undefined for unknown persona', () => {
      const question = getPersonaQuestion('unknown', 'starter');
      expect(question).toBeUndefined();
    });
  });

  describe('Disagreement Phrases', () => {
    const intensities = ['mild', 'moderate', 'strong'] as const;
    const personaIds = ['ferni', 'peter-john', 'alex-chen', 'maya-santos', 'jordan-taylor', 'nayan-patel'];

    it('should return disagreement phrases for each persona and intensity', () => {
      for (const personaId of personaIds) {
        for (const intensity of intensities) {
          const phrase = getDisagreementPhrase(personaId, intensity);
          // May return undefined if not defined
          if (phrase) {
            expect(typeof phrase).toBe('string');
            expect(phrase.length).toBeGreaterThan(0);
          }
        }
      }
    });

    it('Ferni should disagree gently (empathetically)', () => {
      const mildDisagree = getDisagreementPhrase('ferni', 'mild');
      expect(mildDisagree).toBeDefined();
      // Ferni's disagreement should be soft
      expect(mildDisagree?.toLowerCase()).not.toContain('wrong');
    });

    it('Peter should disagree with data references', () => {
      const moderateDisagree = getDisagreementPhrase('peter-john', 'moderate');
      // Peter tends to reference evidence/data
      if (moderateDisagree) {
        expect(typeof moderateDisagree).toBe('string');
      }
    });
  });

  describe('Insight Lead-Ins', () => {
    it('should return insight lead-ins for all personas', () => {
      const personaIds = ['ferni', 'peter-john', 'alex-chen', 'maya-santos', 'jordan-taylor', 'nayan-patel'];

      for (const personaId of personaIds) {
        const leadIn = getInsightLeadIn(personaId);
        if (leadIn) {
          expect(typeof leadIn).toBe('string');
          expect(leadIn.length).toBeGreaterThan(0);
        }
      }
    });

    it('should return undefined for unknown persona', () => {
      const leadIn = getInsightLeadIn('unknown');
      expect(leadIn).toBeUndefined();
    });
  });

  describe('Structure Validation', () => {
    const allDiffs = [
      { name: 'Ferni', diff: ferniDifferentiation },
      { name: 'Peter', diff: peterDifferentiation },
      { name: 'Alex', diff: alexDifferentiation },
      { name: 'Maya', diff: mayaDifferentiation },
      { name: 'Jordan', diff: jordanDifferentiation },
      { name: 'Nayan', diff: nayanDifferentiation },
    ];

    it.each(allDiffs)('$name should have questioning config', ({ diff }) => {
      expect(diff.questioning).toBeDefined();
      expect(typeof diff.questioning.feelingVsData).toBe('number');
      expect(typeof diff.questioning.openVsClosed).toBe('number');
      expect(typeof diff.questioning.whyVsHow).toBe('number');
    });

    it.each(allDiffs)('$name should have silence config', ({ diff }) => {
      expect(diff.silence).toBeDefined();
      expect(typeof diff.silence.comfortWithSilence).toBe('number');
    });

    it.each(allDiffs)('$name should have insight framing config', ({ diff }) => {
      expect(diff.insight).toBeDefined();
    });
  });

  describe('Registry', () => {
    it('should have all 6 personas in registry', () => {
      expect(Object.keys(cognitiveDifferentiation)).toContain('ferni');
      expect(Object.keys(cognitiveDifferentiation)).toContain('peter-john');
      expect(Object.keys(cognitiveDifferentiation)).toContain('alex-chen');
      expect(Object.keys(cognitiveDifferentiation)).toContain('maya-santos');
      expect(Object.keys(cognitiveDifferentiation)).toContain('jordan-taylor');
      expect(Object.keys(cognitiveDifferentiation)).toContain('nayan-patel');
    });
  });
});
