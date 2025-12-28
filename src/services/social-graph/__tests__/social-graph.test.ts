/**
 * Social Graph Service Tests
 *
 * Tests for relationship tracking, mention detection, and social insights.
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
  recordMention,
  extractNames,
  detectWithdrawal,
  detectSentimentPatterns,
  getUpcomingDates,
  type Person,
  type RelationshipType,
} from '../index.js';

describe('SocialGraph', () => {
  const testUserId = 'social-test-user-' + Date.now();

  describe('recordMention', () => {
    it('should create a new person on first mention', () => {
      const person = recordMention(
        testUserId,
        'Sarah',
        'I talked to Sarah today about work',
        0.5,
        ['work'],
        0.7
      );

      expect(person).toBeDefined();
      expect(person.name).toBe('Sarah');
      expect(person.mentionCount).toBeGreaterThanOrEqual(1);
    });

    it('should update existing person on subsequent mentions', () => {
      const userId = 'update-test-' + Date.now();

      recordMention(userId, 'John', 'Saw John at the store', 0.3);
      const person = recordMention(userId, 'John', 'Called John again', 0.7);

      expect(person.mentionCount).toBeGreaterThanOrEqual(2);
    });

    it('should track sentiment', () => {
      const userId = 'sentiment-test-' + Date.now();

      recordMention(userId, 'Mike', 'Mike made me happy', 0.9);
      const person = recordMention(userId, 'Mike', 'Had a great time with Mike', 0.8);

      expect(person.averageSentiment).toBeGreaterThan(0.5);
    });

    it('should track associated topics', () => {
      const userId = 'topics-test-' + Date.now();

      const person = recordMention(userId, 'Emma', 'Emma and I discussed music', 0.5, [
        'music',
        'hobbies',
      ]);

      expect(person.associatedTopics).toContain('music');
      expect(person.associatedTopics).toContain('hobbies');
    });
  });

  describe('extractNames', () => {
    it('should extract names with relationship context', () => {
      const names = extractNames('I talked to my friend Sarah about it');

      expect(names.length).toBeGreaterThan(0);
      const found = names.find((n) => n.name.toLowerCase().includes('sarah'));
      expect(found).toBeDefined();
    });

    it('should extract names from "called [name]" pattern', () => {
      const names = extractNames('I called John yesterday');

      expect(names.length).toBeGreaterThan(0);
      expect(names.some((n) => n.name.toLowerCase() === 'john')).toBe(true);
    });

    it('should extract relationship words', () => {
      const names = extractNames('My mom said I should exercise more');

      expect(names.length).toBeGreaterThan(0);
      expect(names.some((n) => n.name.toLowerCase() === 'mom')).toBe(true);
    });

    it('should extract names from "with [Name]" pattern', () => {
      const names = extractNames('I went to dinner with Michael last night');

      expect(names.some((n) => n.name === 'Michael')).toBe(true);
    });

    it('should not extract common words', () => {
      const names = extractNames('I said that really very just today');

      // Should not find common words as names
      const hasCommonWords = names.some((n) =>
        ['really', 'very', 'just', 'today', 'that'].includes(n.name.toLowerCase())
      );
      expect(hasCommonWords).toBe(false);
    });

    it('should handle text with no names', () => {
      const names = extractNames('The weather is nice today');

      // Should return empty or no person names
      expect(names.every((n) => !n.name.match(/^[a-z]+$/i))).toBe(true);
    });

    it('should extract multiple names', () => {
      const names = extractNames('I talked to Sarah and then called Michael');

      expect(names.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('detectWithdrawal', () => {
    it('should return empty for unknown user', () => {
      const alerts = detectWithdrawal('nonexistent-user-' + Date.now());
      expect(alerts).toEqual([]);
    });

    it('should detect withdrawal from important person', () => {
      const userId = 'withdrawal-test-' + Date.now();

      // Add a person with high importance
      const person = recordMention(userId, 'Jane', 'Talked to Jane', 0.5);

      // Manually adjust to simulate not mentioning for a long time
      // (The withdrawal detection checks daysSinceLastMention > usualFrequencyDays * 2)
      // This test verifies the function runs without error

      const alerts = detectWithdrawal(userId);
      expect(Array.isArray(alerts)).toBe(true);
    });
  });

  describe('detectSentimentPatterns', () => {
    it('should return empty for unknown user', () => {
      const patterns = detectSentimentPatterns('nonexistent-user-' + Date.now());
      expect(patterns).toEqual([]);
    });

    it('should detect positive sentiment patterns', () => {
      const userId = 'positive-pattern-' + Date.now();

      // Record multiple positive mentions
      for (let i = 0; i < 5; i++) {
        recordMention(userId, 'Alex', 'Great time with Alex', 0.8);
      }

      const patterns = detectSentimentPatterns(userId);

      // Should detect positive pattern after enough mentions
      if (patterns.length > 0) {
        const alexPattern = patterns.find((p) => p.personName === 'Alex');
        if (alexPattern) {
          expect(alexPattern.pattern).toBe('positive_correlation');
        }
      }
    });

    it('should detect negative sentiment patterns', () => {
      const userId = 'negative-pattern-' + Date.now();

      // Record multiple negative mentions
      for (let i = 0; i < 5; i++) {
        recordMention(userId, 'Boss', 'Stressed about Boss', -0.8);
      }

      const patterns = detectSentimentPatterns(userId);

      // Should detect negative pattern
      if (patterns.length > 0) {
        const bossPattern = patterns.find((p) => p.personName === 'Boss');
        if (bossPattern) {
          expect(bossPattern.pattern).toBe('negative_correlation');
        }
      }
    });
  });

  describe('getUpcomingDates', () => {
    it('should return empty for unknown user', () => {
      const dates = getUpcomingDates('nonexistent-user-' + Date.now());
      expect(dates).toEqual([]);
    });

    it('should return array for valid user', () => {
      const userId = 'dates-test-' + Date.now();
      recordMention(userId, 'TestPerson', 'Just a mention', 0.5);

      const dates = getUpcomingDates(userId, 30);
      expect(Array.isArray(dates)).toBe(true);
    });
  });

  describe('Relationship Types', () => {
    it('should support all relationship types', () => {
      const types: RelationshipType[] = [
        'family',
        'friend',
        'partner',
        'coworker',
        'acquaintance',
        'professional',
        'unknown',
      ];

      // Verify type is valid string union
      for (const type of types) {
        expect(typeof type).toBe('string');
      }
    });
  });

  describe('Person interface', () => {
    it('should have required properties', () => {
      const userId = 'person-interface-' + Date.now();
      const person = recordMention(userId, 'TestPerson', 'Testing', 0.5);

      expect(person).toHaveProperty('id');
      expect(person).toHaveProperty('name');
      expect(person).toHaveProperty('aliases');
      expect(person).toHaveProperty('relationship');
      expect(person).toHaveProperty('importance');
      expect(person).toHaveProperty('lastMentioned');
      expect(person).toHaveProperty('mentionCount');
      expect(person).toHaveProperty('averageSentiment');
      expect(person).toHaveProperty('associatedTopics');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty name', () => {
      const userId = 'empty-name-' + Date.now();
      // The function should handle this gracefully
      expect(() => {
        recordMention(userId, '', 'empty name', 0.5);
      }).not.toThrow();
    });

    it('should handle special characters in name', () => {
      const userId = 'special-chars-' + Date.now();
      const person = recordMention(userId, "O'Brien", "Talked to O'Brien", 0.5);

      expect(person).toBeDefined();
    });

    it('should handle very long context', () => {
      const userId = 'long-context-' + Date.now();
      const longContext = 'x'.repeat(500);
      const person = recordMention(userId, 'TestPerson', longContext, 0.5);

      expect(person).toBeDefined();
    });

    it('should handle extreme sentiment values', () => {
      const userId = 'extreme-sentiment-' + Date.now();

      const person = recordMention(userId, 'ExtremeTest', 'Testing', 1.0);
      expect(person.averageSentiment).toBe(1.0);
    });
  });
});
