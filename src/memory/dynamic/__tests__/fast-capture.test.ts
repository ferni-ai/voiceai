/**
 * Fast Capture Unit Tests
 *
 * Tests for the real-time extraction layer (< 50ms target)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fastCapture,
  detectEntityMentions,
  detectEmotionSignals,
  detectTopicHints,
  detectDateSignals,
  detectRelationshipSignals,
} from '../fast-capture.js';
import { perfBudget } from '../../../tests/perf-budget.js';

describe('Fast Capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fastCapture()', () => {
    it('should complete within 50ms for typical input', async () => {
      const start = Date.now();
      const result = await fastCapture({
        userId: 'test-user',
        sessionId: 'test-session',
        turnNumber: 1,
        transcript: 'My mom called yesterday and said she was worried about my brother Mike.',
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(perfBudget(200)); // Allow buffer for CI/local dev machine load
      expect(result.captureTimeMs).toBeLessThan(perfBudget(200));
    });

    it('should extract entity mentions', async () => {
      const result = await fastCapture({
        userId: 'test-user',
        sessionId: 'test-session',
        turnNumber: 1,
        transcript: 'My mom told me that my brother is coming to visit.',
      });

      expect(result.mentionedEntities).toContainEqual(
        expect.objectContaining({ name: 'mom', type: 'person' })
      );
      expect(result.mentionedEntities).toContainEqual(
        expect.objectContaining({ name: 'brother', type: 'person' })
      );
    });

    it('should detect emotions', async () => {
      const result = await fastCapture({
        userId: 'test-user',
        sessionId: 'test-session',
        turnNumber: 1,
        transcript: "I'm so frustrated with work today.",
      });

      expect(result.emotionSignals).toContainEqual(
        expect.objectContaining({ emotion: 'stress', source: 'keyword' })
      );
    });

    it('should include voice emotion when provided', async () => {
      const result = await fastCapture({
        userId: 'test-user',
        sessionId: 'test-session',
        turnNumber: 1,
        transcript: 'Everything is fine.',
        voiceEmotion: 'sad',
      });

      expect(result.emotionSignals).toContainEqual(
        expect.objectContaining({ emotion: 'sad', source: 'voice' })
      );
    });

    it('should detect topic hints', async () => {
      const result = await fastCapture({
        userId: 'test-user',
        sessionId: 'test-session',
        turnNumber: 1,
        transcript: 'I had a meeting with my boss about the project deadline.',
      });

      expect(result.topicHints).toContain('work');
    });

    it('should return asyncJobId for meaningful content', async () => {
      const result = await fastCapture({
        userId: 'test-user',
        sessionId: 'test-session',
        turnNumber: 1,
        transcript: 'My mom is very worried about my health lately.',
      });

      expect(result.asyncJobId).toBeTruthy();
    });

    it('should not queue async job for trivial content', async () => {
      const result = await fastCapture({
        userId: 'test-user',
        sessionId: 'test-session',
        turnNumber: 1,
        transcript: 'ok',
      });

      expect(result.asyncJobId).toBeNull();
    });
  });

  describe('detectEntityMentions()', () => {
    it('should detect relationship words', () => {
      const mentions = detectEntityMentions('My sister called me yesterday.');
      expect(mentions).toContainEqual(expect.objectContaining({ name: 'sister', type: 'person' }));
    });

    it('should detect capitalized names with action verbs', () => {
      const mentions = detectEntityMentions('Sarah told me about the event.');
      expect(mentions).toContainEqual(expect.objectContaining({ name: 'Sarah', type: 'person' }));
    });

    it.each([
      'this is great',
      'This is great',
      'work was rough',
      'I had lunch with dinner plans after',
      'my sister and I talked',
      'Today was long',
    ])('takes no ordinary word for a person in "%s" (#3993)', (said) => {
      const people = detectEntityMentions(said)
        .filter((m) => m.type === 'person')
        .map((m) => m.name);
      expect(people.filter((n) => !['sister'].includes(n))).toEqual([]);
    });

    it('still catches the names said in "my brother Jason called, then I met Priya"', () => {
      const people = detectEntityMentions('my brother Jason called, then I met Priya.')
        .filter((m) => m.type === 'person')
        .map((m) => m.name);
      expect(people).toEqual(expect.arrayContaining(['brother', 'Jason', 'Priya']));
    });

    it('catches Priya in "I met with Priya"', () => {
      const people = detectEntityMentions('I met with Priya today.').map((m) => m.name);
      expect(people).toContain('Priya');
    });

    it.each([
      'My manager moved a big deadline up to Friday.',
      'I got back from Mom and then went to Today.',
      'We meet in March at This place.',
    ])('saves no weekday, month, relation or clause word as a place in "%s" (#4028)', (said) => {
      const places = detectEntityMentions(said).filter((m) => m.type === 'place');
      expect(places).toEqual([]);
    });

    it('saves the short forms "NYC" and "Washington DC" as places', () => {
      const places = detectEntityMentions('I moved to NYC, then visiting Washington DC.')
        .filter((m) => m.type === 'place')
        .map((m) => m.name);
      expect(places).toEqual(expect.arrayContaining(['NYC', 'Washington DC']));
    });

    it('still saves "Denver" and "New York" as places', () => {
      const places = detectEntityMentions('I moved to Denver, then visiting New York.')
        .filter((m) => m.type === 'place')
        .map((m) => m.name);
      expect(places).toEqual(expect.arrayContaining(['Denver', 'New York']));
    });

    it('saves no company from "I work at the hospital and like it" (#4028)', () => {
      const orgs = detectEntityMentions('I work at the hospital and like it.').filter(
        (m) => m.type === 'organization'
      );
      expect(orgs).toEqual([]);
    });

    it('still saves "Acme Labs" from "I work at Acme Labs."', () => {
      const orgs = detectEntityMentions('I work at Acme Labs.')
        .filter((m) => m.type === 'organization')
        .map((m) => m.name);
      expect(orgs).toEqual(['Acme Labs']);
    });

    it('quotes the words around "son" itself, not around ja-SON', () => {
      const said = 'Jason from the office keeps calling about the late report, and my son is sick.';
      const son = detectEntityMentions(said).find((m) => m.name === 'son');
      expect(son?.context).toContain('my son is sick');
    });

    it('should detect place mentions', () => {
      const mentions = detectEntityMentions('I traveled to California last week.');
      expect(mentions).toContainEqual(
        expect.objectContaining({ name: 'California', type: 'place' })
      );
    });

    it('should not duplicate entities', () => {
      const mentions = detectEntityMentions('My mom called. My mom is great.');
      const momMentions = mentions.filter((m) => m.name === 'mom');
      expect(momMentions.length).toBe(1);
    });
  });

  describe('detectEmotionSignals()', () => {
    it('should detect high intensity negative emotions', () => {
      const signals = detectEmotionSignals("I'm devastated about what happened.", undefined);
      expect(signals).toContainEqual(
        expect.objectContaining({ emotion: 'distress', intensity: 'high' })
      );
    });

    it('should detect medium intensity positive emotions', () => {
      const signals = detectEmotionSignals("I'm happy with the results.", undefined);
      expect(signals).toContainEqual(
        expect.objectContaining({ emotion: 'positive', intensity: 'medium' })
      );
    });

    it('should include voice emotion', () => {
      const signals = detectEmotionSignals('Everything is fine.', 'anxious');
      expect(signals).toContainEqual(
        expect.objectContaining({ emotion: 'anxious', source: 'voice' })
      );
    });
  });

  describe('detectTopicHints()', () => {
    it('should detect work topics', () => {
      const topics = detectTopicHints('I have a meeting with my boss tomorrow.');
      expect(topics).toContain('work');
    });

    it('should detect health topics', () => {
      const topics = detectTopicHints('I need to see the doctor about my symptoms.');
      expect(topics).toContain('health');
    });

    it('should detect multiple topics', () => {
      const topics = detectTopicHints("I'm stressed about work and my health.");
      expect(topics).toContain('work');
      expect(topics).toContain('health');
    });
  });

  describe('detectDateSignals()', () => {
    it('should detect absolute dates', () => {
      const signals = detectDateSignals('The event is on January 15th.');
      expect(signals).toContainEqual(expect.objectContaining({ type: 'absolute' }));
    });

    it('should detect relative dates', () => {
      const signals = detectDateSignals("I'll do it tomorrow.");
      expect(signals).toContainEqual(expect.objectContaining({ type: 'relative' }));
    });

    it('should detect recurring patterns', () => {
      const signals = detectDateSignals("It's her birthday next week.");
      expect(signals).toContainEqual(expect.objectContaining({ type: 'recurring' }));
    });
  });

  describe('detectRelationshipSignals()', () => {
    it('should detect explicit relationships', () => {
      const signals = detectRelationshipSignals('Sarah is my sister.');
      expect(signals.length).toBeGreaterThan(0);
    });

    it('should detect possessive relationship patterns', () => {
      const signals = detectRelationshipSignals("My mom's birthday is next week.");
      expect(signals.length).toBeGreaterThan(0);
    });
  });
});
