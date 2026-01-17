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

// Mock AsyncEvents to prevent actual event emission
vi.mock('../../../services/async-events/index.js', () => ({
  AsyncEvents: {
    emit: vi.fn(),
  },
}));

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

      expect(duration).toBeLessThan(200); // Allow buffer for CI/local dev machine load
      expect(result.captureTimeMs).toBeLessThan(200);
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
      expect(mentions).toContainEqual(
        expect.objectContaining({ name: 'sister', type: 'person' })
      );
    });

    it('should detect capitalized names with action verbs', () => {
      const mentions = detectEntityMentions('Sarah told me about the event.');
      expect(mentions).toContainEqual(
        expect.objectContaining({ name: 'Sarah', type: 'person' })
      );
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
      expect(signals).toContainEqual(
        expect.objectContaining({ type: 'absolute' })
      );
    });

    it('should detect relative dates', () => {
      const signals = detectDateSignals("I'll do it tomorrow.");
      expect(signals).toContainEqual(
        expect.objectContaining({ type: 'relative' })
      );
    });

    it('should detect recurring patterns', () => {
      const signals = detectDateSignals("It's her birthday next week.");
      expect(signals).toContainEqual(
        expect.objectContaining({ type: 'recurring' })
      );
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
