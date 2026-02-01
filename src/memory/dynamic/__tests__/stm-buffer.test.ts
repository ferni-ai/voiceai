/**
 * STM Buffer Unit Tests
 *
 * Tests for the in-memory short-term memory layer
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getSTMBuffer,
  recordTurn,
  getRecentTurns,
  getFrequentEntities,
  getRecentTopics,
  wasEntityMentioned,
  isTopicContinuing,
  buildSTMContext,
  cleanupSession,
  getSTMStats,
  configureSTMBuffer,
} from '../stm-buffer.js';
import type { FastCaptureResult } from '../fast-capture.js';

describe('STM Buffer', () => {
  const testSessionId = 'test-session-' + Date.now();
  const testUserId = 'test-user';

  // Helper to create a mock FastCaptureResult
  function createMockCaptureResult(
    entities: Array<{ name: string; type: 'person' | 'place' }> = [],
    emotions: string[] = [],
    topics: string[] = []
  ): FastCaptureResult {
    return {
      mentionedEntities: entities.map((e) => ({
        name: e.name,
        type: e.type,
        context: `mentioned ${e.name}`,
        confidence: 0.8,
      })),
      emotionSignals: emotions.map((e) => ({
        emotion: e,
        intensity: 'medium' as const,
        source: 'keyword' as const,
      })),
      topicHints: topics,
      dateSignals: [],
      relationshipSignals: [],
      linkingSignals: [],
      asyncJobId: null,
      captureTimeMs: 20,
    };
  }

  afterEach(() => {
    cleanupSession(testSessionId);
  });

  describe('getSTMBuffer()', () => {
    it('should create a new buffer for a session', () => {
      const buffer = getSTMBuffer(testSessionId, testUserId);

      expect(buffer.sessionId).toBe(testSessionId);
      expect(buffer.userId).toBe(testUserId);
      expect(buffer.turns).toEqual([]);
      expect(buffer.entityFrequency.size).toBe(0);
    });

    it('should return the same buffer for the same session', () => {
      const buffer1 = getSTMBuffer(testSessionId, testUserId);
      const buffer2 = getSTMBuffer(testSessionId, testUserId);

      expect(buffer1).toBe(buffer2);
    });
  });

  describe('recordTurn()', () => {
    it('should record a turn in the buffer', () => {
      const capture = createMockCaptureResult(
        [{ name: 'Mom', type: 'person' }],
        ['happy'],
        ['family']
      );

      recordTurn(testSessionId, testUserId, capture, 'My mom called.', 1);

      const turns = getRecentTurns(testSessionId);
      expect(turns.length).toBe(1);
      expect(turns[0].transcript).toBe('My mom called.');
      expect(turns[0].turnNumber).toBe(1);
    });

    it('should track entity frequency', () => {
      // Mention "Mom" 3 times
      for (let i = 0; i < 3; i++) {
        const capture = createMockCaptureResult([{ name: 'Mom', type: 'person' }]);
        recordTurn(testSessionId, testUserId, capture, `Mom mention ${i}`, i);
      }

      const entities = getFrequentEntities(testSessionId);
      expect(entities.length).toBe(1);
      expect(entities[0].name).toBe('Mom');
      expect(entities[0].mentionCount).toBe(3);
    });

    it('should update topic history', () => {
      recordTurn(
        testSessionId,
        testUserId,
        createMockCaptureResult([], [], ['work']),
        'Work stuff',
        1
      );
      recordTurn(
        testSessionId,
        testUserId,
        createMockCaptureResult([], [], ['family']),
        'Family stuff',
        2
      );

      const topics = getRecentTopics(testSessionId);
      expect(topics[0]).toBe('family'); // Most recent first
      expect(topics[1]).toBe('work');
    });

    it('should evict old turns when buffer is full', () => {
      // Configure small buffer for testing
      configureSTMBuffer({ maxTurns: 3 });

      // Record 5 turns
      for (let i = 0; i < 5; i++) {
        recordTurn(testSessionId, testUserId, createMockCaptureResult(), `Turn ${i}`, i);
      }

      const turns = getRecentTurns(testSessionId);
      expect(turns.length).toBe(3);
      expect(turns[0].turnNumber).toBe(2); // Oldest kept
      expect(turns[2].turnNumber).toBe(4); // Most recent

      // Reset config
      configureSTMBuffer({ maxTurns: 10 });
    });
  });

  describe('Query Functions', () => {
    beforeEach(() => {
      // Set up some test data
      recordTurn(
        testSessionId,
        testUserId,
        createMockCaptureResult([{ name: 'Mom', type: 'person' }], ['happy'], ['family']),
        'My mom is great.',
        1
      );
      recordTurn(
        testSessionId,
        testUserId,
        createMockCaptureResult([{ name: 'Mike', type: 'person' }], ['stressed'], ['work']),
        'Mike at work is stressful.',
        2
      );
    });

    it('wasEntityMentioned() should return true for mentioned entities', () => {
      expect(wasEntityMentioned(testSessionId, 'Mom')).toBe(true);
      expect(wasEntityMentioned(testSessionId, 'mom')).toBe(true); // case insensitive
      expect(wasEntityMentioned(testSessionId, 'Unknown')).toBe(false);
    });

    it('isTopicContinuing() should detect ongoing topics', () => {
      expect(isTopicContinuing(testSessionId, 'family')).toBe(true);
      expect(isTopicContinuing(testSessionId, 'work')).toBe(true);
      expect(isTopicContinuing(testSessionId, 'health')).toBe(false);
    });

    it('getFrequentEntities() should return sorted by frequency', () => {
      // Add more Mom mentions
      recordTurn(
        testSessionId,
        testUserId,
        createMockCaptureResult([{ name: 'Mom', type: 'person' }]),
        'Mom again',
        3
      );

      const entities = getFrequentEntities(testSessionId);
      expect(entities[0].name).toBe('Mom');
      expect(entities[0].mentionCount).toBe(2);
    });
  });

  describe('buildSTMContext()', () => {
    it('should return null for empty session', () => {
      const newSessionId = 'empty-session-' + Date.now();
      const context = buildSTMContext(newSessionId);
      expect(context).toBeNull();
      cleanupSession(newSessionId);
    });

    it('should build context with topics and entities', () => {
      recordTurn(
        testSessionId,
        testUserId,
        createMockCaptureResult([{ name: 'Mom', type: 'person' }], ['happy'], ['family']),
        'My mom called.',
        1
      );

      const context = buildSTMContext(testSessionId);
      expect(context).toContain('Recent topics');
      expect(context).toContain('family');
      expect(context).toContain('Mom');
    });
  });

  describe('cleanupSession()', () => {
    it('should remove session data', () => {
      recordTurn(testSessionId, testUserId, createMockCaptureResult(), 'Test', 1);

      expect(getRecentTurns(testSessionId).length).toBe(1);

      cleanupSession(testSessionId);

      expect(getRecentTurns(testSessionId).length).toBe(0);
    });
  });

  describe('getSTMStats()', () => {
    it('should return aggregate stats', () => {
      recordTurn(testSessionId, testUserId, createMockCaptureResult(), 'Test', 1);

      const stats = getSTMStats();
      expect(stats.activeSessions).toBeGreaterThanOrEqual(1);
      expect(stats.totalTurns).toBeGreaterThanOrEqual(1);
    });
  });
});
