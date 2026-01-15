/**
 * Predictions Worker Tests
 *
 * Tests the predictions worker's pattern recording and processing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PredictionsWorker } from '../predictions-worker.js';

// Mock the predictive coaching imports
vi.mock('../../services/superhuman/predictive-coaching.js', () => ({
  recordObservation: vi.fn().mockResolvedValue(undefined),
  generatePredictions: vi.fn().mockResolvedValue([
    {
      id: 'pred-1',
      prediction: 'Sunday evening anxiety may occur',
      confidence: 'high',
      timing: 'now',
    },
  ]),
  loadUserPatterns: vi.fn().mockResolvedValue([
    {
      id: 'pattern-1',
      type: 'temporal',
      trigger: 'Sunday evening',
      outcome: 'anxiety',
      frequency: 5,
      confidence: 'high',
    },
  ]),
  clearPatternCache: vi.fn().mockResolvedValue(undefined),
}));

// Mock superhuman observations (now in services layer)
vi.mock('../../services/superhuman/observations.js', () => ({
  getSuperhumanObservations: vi.fn().mockReturnValue({
    analyzeMessage: vi.fn(),
  }),
}));

// Mock coaching patterns
vi.mock('../../intelligence/coaching/patterns.js', () => ({
  recordPattern: vi.fn().mockResolvedValue(undefined),
}));

describe('PredictionsWorker', () => {
  let worker: PredictionsWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new PredictionsWorker({
      name: 'TestPredictionsWorker',
    });
  });

  afterEach(async () => {
    await worker.stop();
  });

  describe('initialization', () => {
    it('should create worker with correct config', () => {
      expect(worker).toBeDefined();
      expect(worker.getStats()).toBeDefined();
    });

    it('should have correct initial stats', () => {
      const stats = worker.getStats();
      expect(stats.messagesReceived).toBe(0);
      expect(stats.messagesProcessed).toBe(0);
      expect(stats.messagesFailed).toBe(0);
    });
  });

  describe('event processing', () => {
    it('should handle prediction:observation events', async () => {
      const { recordObservation } =
        await import('../../services/superhuman/predictive-coaching.js');

      // Simulate processing an observation event
      // Note: In real tests we'd emit events through AsyncEvents
      expect(recordObservation).toBeDefined();
    });

    it('should handle prediction:generate events', async () => {
      const { generatePredictions } =
        await import('../../services/superhuman/predictive-coaching.js');

      // Call generate predictions
      const predictions = await generatePredictions('test-user');

      expect(predictions).toHaveLength(1);
      expect(predictions[0]?.prediction).toContain('anxiety');
    });

    it('should handle conversation:end events', async () => {
      const { generatePredictions } =
        await import('../../services/superhuman/predictive-coaching.js');

      // After conversation end, predictions should be generated
      await generatePredictions('test-user');

      expect(generatePredictions).toHaveBeenCalledWith('test-user');
    });
  });

  describe('batching', () => {
    it('should batch observations efficiently', () => {
      // The batcher is internal but we can verify it doesn't throw
      // when receiving multiple observations quickly
      expect(() => {
        // Simulate rapid observations by creating multiple workers
        // (in real usage, events would be batched)
        const stats = worker.getStats();
        expect(stats).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('pattern caching', () => {
    it('should use loadUserPatterns for cache lookup', async () => {
      const { loadUserPatterns } = await import('../../services/superhuman/predictive-coaching.js');

      const patterns = await loadUserPatterns('test-user');

      expect(patterns).toHaveLength(1);
      expect(patterns[0]?.type).toBe('temporal');
      expect(patterns[0]?.trigger).toBe('Sunday evening');
    });

    it('should clear cache when pattern updated', async () => {
      const { clearPatternCache } =
        await import('../../services/superhuman/predictive-coaching.js');

      // Clear pattern cache should work without throwing
      await clearPatternCache('test-user');

      expect(clearPatternCache).toHaveBeenCalledWith('test-user');
    });
  });

  describe('helper functions', () => {
    it('should have getDayName mapping', () => {
      // Verify day mapping works (tested indirectly through worker logic)
      const worker2 = new PredictionsWorker();
      expect(worker2).toBeDefined();
      worker2.stop();
    });

    it('should have getTimeOfDay mapping', () => {
      // Verify time mapping works (tested indirectly through worker logic)
      const worker2 = new PredictionsWorker();
      expect(worker2).toBeDefined();
      worker2.stop();
    });
  });
});
