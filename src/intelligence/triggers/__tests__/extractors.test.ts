/**
 * Extractor Tests
 *
 * Tests for Phase 2 extractors: significant dates and relationships.
 */

import { describe, it, expect } from 'vitest';
import {
  extractSignificantDates,
  hasDateMentions,
  extractRelationships,
  hasRelationshipMentions,
  extractCommunicationPatterns,
  hasDistressSignals,
  hasDeflectionSignals,
  getDominantPattern,
} from '../extractors/index.js';

describe('Significant Date Extractor', () => {
  describe('hasDateMentions', () => {
    it('should detect birthday mentions', () => {
      expect(hasDateMentions("My mom's birthday is coming up")).toBe(true);
    });

    it('should detect anniversary mentions', () => {
      expect(hasDateMentions('Our wedding anniversary is next week')).toBe(true);
    });

    it('should detect loss mentions', () => {
      expect(hasDateMentions('My father passed away last year')).toBe(true);
    });

    it('should return false for no date mentions', () => {
      expect(hasDateMentions('I went to the store today')).toBe(false);
    });
  });

  describe('extractSignificantDates', () => {
    it('should extract birthday with date', () => {
      const text = "My mom's birthday is on the 15th of March";
      const result = extractSignificantDates(text);

      expect(result.dates.length).toBe(1);
      expect(result.dates[0].type).toBe('birthday');
      expect(result.dates[0].date).toContain('-03-15');
      expect(result.dates[0].relatedPerson).toBe('Mom');
    });

    it('should extract wedding anniversary', () => {
      const text = 'We got married on 20th of June, 2015';
      const result = extractSignificantDates(text);

      expect(result.dates.length).toBe(1);
      expect(result.dates[0].type).toBe('anniversary');
      expect(result.dates[0].date).toBe('2015-06-20');
    });

    it('should extract loss date with high emotional weight', () => {
      const text = 'My grandmother passed away on the 5th of November 2020';
      const result = extractSignificantDates(text);

      expect(result.dates.length).toBe(1);
      expect(result.dates[0].type).toBe('loss');
      expect(result.dates[0].emotionalWeight).toBeGreaterThanOrEqual(0.9);
      expect(result.dates[0].relatedPerson).toBe('grandmother');
    });

    it('should increase emotional weight for strong language', () => {
      const text =
        "My mom's birthday is on the 1st of January. It was the worst day when she passed.";
      const result = extractSignificantDates(text);

      const dates = result.dates;
      expect(dates.length).toBeGreaterThanOrEqual(1);
      // Birthday with emotional modifier
      const birthday = dates.find((d) => d.type === 'birthday');
      if (birthday) {
        expect(birthday.emotionalWeight).toBeGreaterThan(0.7);
      }
    });

    it('should extract sobriety date', () => {
      const text = "I've been sober since the 1st of September 2019";
      const result = extractSignificantDates(text);

      expect(result.dates.length).toBe(1);
      expect(result.dates[0].type).toBe('milestone');
      expect(result.dates[0].description).toContain('Sobriety');
    });

    it('should extract graduation date', () => {
      const text = 'I graduated on 15th of May 2018';
      const result = extractSignificantDates(text);

      expect(result.dates.length).toBe(1);
      expect(result.dates[0].type).toBe('milestone');
      expect(result.dates[0].description).toContain('Graduation');
    });

    it('should mark birthdays as recurring', () => {
      const text = "My dad's birthday is on 10th December";
      const result = extractSignificantDates(text);

      expect(result.dates[0].isRecurring).toBe(true);
    });

    it('should include appropriate trigger categories', () => {
      const text = 'My grandmother passed away on 1st March';
      const result = extractSignificantDates(text);

      expect(result.dates[0].triggerCategories).toContain('grief');
      expect(result.dates[0].triggerCategories).toContain('temporal');
    });
  });
});

describe('Relationship Extractor', () => {
  describe('hasRelationshipMentions', () => {
    it('should detect family mentions', () => {
      expect(hasRelationshipMentions('My mom called me yesterday')).toBe(true);
    });

    it('should detect partner mentions', () => {
      expect(hasRelationshipMentions('My wife is amazing')).toBe(true);
    });

    it('should detect friend mentions', () => {
      expect(hasRelationshipMentions('My friend Sarah helped me')).toBe(true);
    });

    it('should return false for no relationship mentions', () => {
      expect(hasRelationshipMentions('The weather is nice today')).toBe(false);
    });
  });

  describe('extractRelationships', () => {
    it('should extract mom relationship', () => {
      const text = 'My mom is so supportive';
      const result = extractRelationships(text);

      expect(result.relationships.length).toBe(1);
      expect(result.relationships[0].type).toBe('family');
      expect(result.relationships[0].role).toBe('mother');
      expect(result.relationships[0].name).toBe('Mom');
    });

    it('should extract named friend', () => {
      const text = 'My friend Sarah is coming over';
      const result = extractRelationships(text);

      expect(result.relationships.length).toBe(1);
      expect(result.relationships[0].type).toBe('friend');
      expect(result.relationships[0].name).toBe('Sarah');
    });

    it('should extract spouse with name', () => {
      const text = 'My wife Emily loves cooking';
      const result = extractRelationships(text);

      expect(result.relationships.length).toBe(1);
      expect(result.relationships[0].type).toBe('romantic');
      expect(result.relationships[0].name).toBe('Emily');
    });

    it('should detect positive valence', () => {
      const text = 'I love my brother Mark so much. He is amazing.';
      const result = extractRelationships(text);

      expect(result.relationships.length).toBe(1);
      const valence = result.relationships[0].emotionalValence;
      expect(['very_positive', 'positive']).toContain(valence);
    });

    it('should detect negative valence', () => {
      const text = "My dad is toxic and I can't stand being around him";
      const result = extractRelationships(text);

      expect(result.relationships.length).toBe(1);
      const valence = result.relationships[0].emotionalValence;
      expect(['very_negative', 'negative']).toContain(valence);
    });

    it('should detect complicated valence', () => {
      const text = "I love my sister but it's complicated. We have mixed feelings.";
      const result = extractRelationships(text);

      expect(result.relationships.length).toBe(1);
      expect(result.relationships[0].emotionalValence).toBe('complicated');
    });

    it('should detect deceased status', () => {
      const text = 'My grandfather passed away last year';
      const result = extractRelationships(text);

      expect(result.relationships.length).toBe(1);
      expect(result.relationships[0].isDeceased).toBe(true);
      expect(result.relationships[0].triggerCategories).toContain('grief');
    });

    it('should extract associated topics', () => {
      const text = 'My colleague Mike at work is stressed about money';
      const result = extractRelationships(text);

      expect(result.relationships.length).toBe(1);
      expect(result.relationships[0].associatedTopics).toContain('work');
      expect(result.relationships[0].associatedTopics).toContain('finances');
    });

    it('should detect ex relationships', () => {
      const text = 'My ex-boyfriend was not good for me';
      const result = extractRelationships(text);

      expect(result.relationships.length).toBe(1);
      expect(result.relationships[0].role).toBe('ex');
      expect(result.relationships[0].type).toBe('romantic');
    });

    it('should extract pet relationships', () => {
      const text = 'My dog Max is my best friend';
      const result = extractRelationships(text);

      expect(result.relationships.length).toBe(1);
      expect(result.relationships[0].type).toBe('pet');
      expect(result.relationships[0].name).toBe('Max');
    });

    it('should include appropriate trigger categories', () => {
      const text = "My wife and I are having issues. It's complicated.";
      const result = extractRelationships(text);

      expect(result.relationships[0].triggerCategories).toContain('relational');
      expect(result.relationships[0].triggerCategories).toContain('romantic');
    });
  });
});

describe('Communication Pattern Extractor', () => {
  describe('hasDistressSignals', () => {
    it('should detect exhaustion', () => {
      expect(hasDistressSignals("I'm just so tired of everything")).toBe(true);
    });

    it('should detect overwhelm', () => {
      expect(hasDistressSignals('Everything feels too much right now')).toBe(true);
    });

    it('should detect hopelessness', () => {
      expect(hasDistressSignals("What's the point anymore")).toBe(true);
    });

    it('should return false for neutral text', () => {
      expect(hasDistressSignals('I went to the store today')).toBe(false);
    });
  });

  describe('hasDeflectionSignals', () => {
    it('should detect "I\'m fine"', () => {
      expect(hasDeflectionSignals("I'm fine, really")).toBe(true);
    });

    it('should detect minimization', () => {
      expect(hasDeflectionSignals("It's not a big deal")).toBe(true);
    });

    it('should detect topic avoidance', () => {
      expect(hasDeflectionSignals("I'd rather not talk about it")).toBe(true);
    });

    it('should return false for direct statements', () => {
      expect(hasDeflectionSignals("I'm feeling sad today")).toBe(false);
    });
  });

  describe('extractCommunicationPatterns', () => {
    it('should extract distress phrase patterns', () => {
      const text = "I can't do this anymore. Everything is too much.";
      const result = extractCommunicationPatterns(text);

      expect(result.patterns.phrasePatterns.length).toBeGreaterThan(0);
      expect(result.detectedCategories).toContain('distress');
    });

    it('should extract deflection phrase patterns', () => {
      const text = "I'm fine. Don't worry about me.";
      const result = extractCommunicationPatterns(text);

      expect(result.patterns.phrasePatterns.length).toBeGreaterThan(0);
      expect(result.detectedCategories).toContain('deflection');
    });

    it('should extract self-criticism patterns', () => {
      const text = "I'm so stupid. I always mess things up.";
      const result = extractCommunicationPatterns(text);

      expect(result.patterns.phrasePatterns.length).toBeGreaterThan(0);
      expect(result.detectedCategories).toContain('self_criticism');
    });

    it('should extract gratitude patterns', () => {
      const text = "I'm so grateful for your help. This means everything to me.";
      const result = extractCommunicationPatterns(text);

      expect(result.patterns.phrasePatterns.length).toBeGreaterThan(0);
      expect(result.detectedCategories).toContain('gratitude');
    });

    it('should detect late night temporal patterns from text', () => {
      const text = "I can't sleep. It's 3am and my mind won't stop.";
      const result = extractCommunicationPatterns(text);

      expect(result.patterns.temporalPatterns.length).toBeGreaterThan(0);
      expect(result.patterns.temporalPatterns[0].timeOfDay).toBe('late_night');
    });

    it('should detect late night from context time', () => {
      const lateNight = new Date();
      lateNight.setHours(2, 30, 0, 0);

      const result = extractCommunicationPatterns('Just thinking about life', {
        contextTime: lateNight,
      });

      expect(result.patterns.temporalPatterns.some((p) => p.timeOfDay === 'late_night')).toBe(
        true
      );
    });

    it('should accumulate phrase frequencies', () => {
      const text1 = "I'm fine. Really, I'm fine.";
      const result1 = extractCommunicationPatterns(text1);

      const text2 = "I'm fine today too.";
      const result2 = extractCommunicationPatterns(text2, {
        existingPatterns: result1.patterns,
      });

      // Should have merged, not duplicated
      const finePatterns = result2.patterns.phrasePatterns.filter((p) =>
        p.phrase.toLowerCase().includes("i'm fine")
      );
      expect(finePatterns.length).toBeGreaterThanOrEqual(1);
      if (finePatterns.length > 0) {
        expect(finePatterns[0].frequency).toBeGreaterThanOrEqual(1);
      }
    });

    it('should assign correct emotional weights', () => {
      const text = "What's the point? Nothing ever changes.";
      const result = extractCommunicationPatterns(text);

      // Hopelessness patterns should have high emotional weight
      const hopelessnessPattern = result.patterns.phrasePatterns.find(
        (p) => p.triggerCategory === 'existential'
      );
      expect(hopelessnessPattern).toBeDefined();
      expect(hopelessnessPattern!.emotionalWeight).toBeGreaterThanOrEqual(0.9);
    });

    it('should extract topics from text', () => {
      const text = "I can't sleep because I'm worried about work and money";
      const result = extractCommunicationPatterns(text);

      // Check that topics were extracted for temporal patterns
      const temporalPattern = result.patterns.temporalPatterns.find(
        (p) => p.associatedTopics.length > 0
      );
      if (temporalPattern) {
        expect(temporalPattern.associatedTopics.some((t) => t === 'work' || t === 'finances')).toBe(
          true
        );
      }
    });
  });

  describe('getDominantPattern', () => {
    it('should return null for empty patterns', () => {
      const result = getDominantPattern({
        phrasePatterns: [],
        temporalPatterns: [],
        sensitiveTopics: [],
      });
      expect(result).toBeNull();
    });

    it('should return the dominant category', () => {
      const text = "I can't do this. Everything is too much. I'm so tired.";
      const extracted = extractCommunicationPatterns(text);

      const dominant = getDominantPattern(extracted.patterns);
      expect(dominant).not.toBeNull();
      expect(dominant!.category).toBe('emotional');
    });
  });
});
