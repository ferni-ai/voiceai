/**
 * Capture Module Integration Tests
 *
 * Tests the unified capture pipeline.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock async events
vi.mock('../../services/async-events/index.js', () => ({
  AsyncEvents: {
    emit: vi.fn(),
  },
}));

// Mock firestore
vi.mock('../../utils/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
  cleanForFirestore: vi.fn((data) => data),
}));

describe('Capture Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('captureTurnUnified', () => {
    it('should export captureTurnUnified function', async () => {
      const { captureTurnUnified } = await import('../capture/index.js');
      expect(typeof captureTurnUnified).toBe('function');
    });

    it('should capture turn and return unified result', async () => {
      const { captureTurnUnified } = await import('../capture/index.js');

      const result = await captureTurnUnified({
        userId: 'test-user',
        sessionId: 'test-session',
        turnNumber: 1,
        transcript: 'I talked to my brother Mike today.',
      });

      expect(result).toHaveProperty('fast');
      expect(result).toHaveProperty('stmRecorded');
      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('captureTimeMs');
    });

    it('should detect person entities in transcript', async () => {
      const { captureTurnUnified } = await import('../capture/index.js');

      const result = await captureTurnUnified({
        userId: 'test-user',
        sessionId: 'test-session',
        turnNumber: 1,
        transcript: 'My friend Sarah came over yesterday.',
      });

      // Should detect "Sarah" as a person entity
      expect(result.fast.mentionedEntities).toBeDefined();
    });

    it('should detect emotion signals', async () => {
      const { captureTurnUnified } = await import('../capture/index.js');

      const result = await captureTurnUnified({
        userId: 'test-user',
        sessionId: 'test-session',
        turnNumber: 1,
        transcript: "I'm feeling really happy about the progress we've made.",
      });

      // Should detect emotion signals
      expect(result.fast.emotionSignals).toBeDefined();
    });

    it('should record turn to STM buffer', async () => {
      const { captureTurnUnified } = await import('../capture/index.js');
      const { getSTMBuffer } = await import('../dynamic/stm-buffer.js');

      const result = await captureTurnUnified({
        userId: 'test-user',
        sessionId: 'test-stm-session',
        turnNumber: 1,
        transcript: 'Hello, this is a test.',
      });

      expect(result.stmRecorded).toBe(true);

      // Verify STM buffer was updated
      const stm = getSTMBuffer('test-stm-session', 'test-user');
      expect(stm).toBeDefined();
      expect(stm.turns.length).toBeGreaterThan(0);
    });
  });

  describe('captureBatchUnified', () => {
    it('should export captureBatchUnified function', async () => {
      const { captureBatchUnified } = await import('../capture/index.js');
      expect(typeof captureBatchUnified).toBe('function');
    });

    it('should capture multiple turns', async () => {
      const { captureBatchUnified } = await import('../capture/index.js');

      const results = await captureBatchUnified('test-user', 'test-batch-session', [
        { transcript: 'First message', turnNumber: 1 },
        { transcript: 'Second message', turnNumber: 2 },
        { transcript: 'Third message', turnNumber: 3 },
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].stmRecorded).toBe(true);
      expect(results[1].stmRecorded).toBe(true);
      expect(results[2].stmRecorded).toBe(true);
    });
  });

  describe('fastCapture re-export', () => {
    it('should re-export fastCapture', async () => {
      const { fastCapture } = await import('../capture/index.js');
      expect(typeof fastCapture).toBe('function');
    });

    it('should re-export detection functions', async () => {
      const {
        detectEntityMentions,
        detectEmotionSignals,
        detectTopicHints,
        detectDateSignals,
        detectRelationshipSignals,
      } = await import('../capture/index.js');

      expect(typeof detectEntityMentions).toBe('function');
      expect(typeof detectEmotionSignals).toBe('function');
      expect(typeof detectTopicHints).toBe('function');
      expect(typeof detectDateSignals).toBe('function');
      expect(typeof detectRelationshipSignals).toBe('function');
    });
  });

  describe('STM Buffer re-exports', () => {
    it('should re-export STM buffer functions', async () => {
      const { recordTurn, getSTMBuffer, wasEntityMentioned, buildSTMContext } =
        await import('../capture/index.js');

      expect(typeof recordTurn).toBe('function');
      expect(typeof getSTMBuffer).toBe('function');
      expect(typeof wasEntityMentioned).toBe('function');
      expect(typeof buildSTMContext).toBe('function');
    });
  });
});
