/**
 * Online Learning Loop Tests
 *
 * Tests the SOTA online learning system that retrains semantic embeddings
 * from routing corrections.
 *
 * @module tools/semantic-router/learning/__tests__/online-learning-loop.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger first
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock embedding provider with inline functions
vi.mock('../../embedding-providers.js', () => ({
  getEmbedding: vi.fn().mockImplementation(async (text: string) => {
    // Return a deterministic embedding based on text hash
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return new Array(768).fill(0).map((_, i) => Math.sin(hash + i) * 0.1);
  }),
  cosineSimilarity: vi.fn().mockImplementation((a: number[], b: number[]) => {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }),
}));

// Mock tool embedding index
vi.mock('../../persistence/index.js', () => ({
  getToolEmbeddingIndex: () => ({
    batchGetToolEmbeddings: vi.fn().mockResolvedValue(new Map()),
    getStats: () => ({ totalTools: 0, cacheHits: 0, firestoreLoads: 0, computedFresh: 0 }),
  }),
}));

// Mock tool registry
vi.mock('../../registry.js', () => ({
  getToolRegistry: () => ({
    getRegistered: (toolId: string) => ({
      id: toolId,
      descriptionEmbedding: new Array(768).fill(0.1),
    }),
    getAll: () => [],
  }),
}));

// Mock learned retriever
vi.mock('../../advanced/learned-retriever.js', () => ({
  getLearnedRetriever: () => ({
    addCorrection: vi.fn(),
  }),
}));

// Import after mocks
import { OnlineLearningEngine, initializeOnlineLearning, shutdownOnlineLearning } from '../online-learning-loop.js';

describe('OnlineLearningEngine', () => {
  let engine: OnlineLearningEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new OnlineLearningEngine({
      minExamplesForRetrain: 3, // Lower threshold for testing
      autoRetrainInterval: 0, // Disable auto-retrain for predictable testing
    });
  });

  afterEach(() => {
    engine.stopAutoRetrain();
  });

  describe('addCorrection', () => {
    it('should add correction examples', async () => {
      await engine.addCorrection({
        query: 'play some jazz music',
        predictedToolId: 'searchWeb',
        actualToolId: 'playMusic',
        confidence: 0.9,
        timestamp: Date.now(),
        source: 'explicit',
      });

      const stats = engine.getStats();
      expect(stats.pendingExamples).toBe(1);
    });

    it('should track multiple corrections', async () => {
      for (let i = 0; i < 5; i++) {
        await engine.addCorrection({
          query: `query ${i}`,
          predictedToolId: 'wrong',
          actualToolId: 'correct',
          confidence: 0.8,
          timestamp: Date.now(),
          source: 'explicit',
        });
      }

      const stats = engine.getStats();
      expect(stats.pendingExamples).toBe(5);
    });
  });

  describe('triggerRetrain', () => {
    it('should process pending corrections', async () => {
      // Add corrections one by one and wait for each
      for (let i = 0; i < 5; i++) {
        await engine.addCorrection({
          query: `play song ${i}`,
          predictedToolId: 'searchWeb',
          actualToolId: 'playMusic',
          confidence: 0.85,
          timestamp: Date.now(),
          source: 'explicit',
        });
      }

      // Verify examples are pending
      const beforeStats = engine.getStats();
      expect(beforeStats.pendingExamples).toBe(5);

      // Trigger retrain
      const stats = await engine.triggerRetrain();

      expect(stats).not.toBeNull();
      expect(stats!.examplesProcessed).toBe(5);

      // Pending examples should be cleared
      const currentStats = engine.getStats();
      expect(currentStats.pendingExamples).toBe(0);
    });

    it('should skip if no pending examples', async () => {
      const stats = await engine.triggerRetrain();
      expect(stats).toBeNull();
    });

    it('should track retrain attempts', async () => {
      // Add single correction
      await engine.addCorrection({
        query: 'test query',
        predictedToolId: 'wrong',
        actualToolId: 'correct',
        confidence: 0.8,
        timestamp: Date.now(),
        source: 'explicit',
      });

      // First retrain should work
      const stats = await engine.triggerRetrain();
      expect(stats).not.toBeNull();
      expect(stats!.examplesProcessed).toBe(1);

      // Second retrain should have no examples
      const stats2 = await engine.triggerRetrain();
      expect(stats2).toBeNull();
    });
  });

  describe('getAdjustment', () => {
    it('should return undefined for unknown tools', () => {
      const adjustment = engine.getAdjustment('unknownTool');
      expect(adjustment).toBeUndefined();
    });

    it('should return adjustment after retrain', async () => {
      // Add corrections for a specific tool
      for (let i = 0; i < 5; i++) {
        await engine.addCorrection({
          query: `weather in city ${i}`,
          predictedToolId: 'searchWeb',
          actualToolId: 'getWeather',
          confidence: 0.9,
          timestamp: Date.now(),
          source: 'explicit',
        });
      }

      await engine.triggerRetrain();

      const adjustment = engine.getAdjustment('getWeather');
      expect(adjustment).toBeDefined();
      // Check that positive examples were recorded (count may vary based on filtering)
      expect(adjustment!.positiveExamples).toBeGreaterThan(0);
      expect(adjustment!.centroidDelta).toHaveLength(768);
    });
  });

  describe('applyAdjustmentToQuery', () => {
    it('should return original embedding if no adjustment exists', () => {
      const embedding = new Array(768).fill(0.5);
      const adjusted = engine.applyAdjustmentToQuery(embedding, 'unknownTool');
      expect(adjusted).toEqual(embedding);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      const initialStats = engine.getStats();
      expect(initialStats.pendingExamples).toBe(0);
      expect(initialStats.adjustedTools).toBe(0);
      expect(initialStats.lastRetrainTime).toBe(0);

      // Add corrections
      await engine.addCorrection({
        query: 'test query',
        predictedToolId: 'wrong',
        actualToolId: 'correct',
        confidence: 0.9,
        timestamp: Date.now(),
        source: 'explicit',
      });

      const afterAdd = engine.getStats();
      expect(afterAdd.pendingExamples).toBe(1);
    });
  });
});

describe('Module exports', () => {
  afterEach(() => {
    shutdownOnlineLearning();
  });

  it('should initialize and shutdown cleanly', () => {
    const engine = initializeOnlineLearning({
      autoRetrainInterval: 0, // Disable for testing
    });

    expect(engine).toBeDefined();
    expect(engine.getStats().pendingExamples).toBe(0);

    shutdownOnlineLearning();
  });
});

describe('Contrastive Learning', () => {
  let engine: OnlineLearningEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new OnlineLearningEngine({
      minExamplesForRetrain: 2,
      autoRetrainInterval: 0,
      learningRate: 0.1,
    });
  });

  afterEach(() => {
    engine.stopAutoRetrain();
  });

  it('should learn to separate positive and negative examples', async () => {
    // Add positive examples (correct routings)
    for (let i = 0; i < 5; i++) {
      await engine.addCorrection({
        query: `play jazz music ${i}`,
        predictedToolId: 'playMusic',
        actualToolId: 'playMusic',
        confidence: 0.9,
        timestamp: Date.now(),
        source: 'implicit',
      });
    }

    // Add negative examples (misrouted to playMusic)
    for (let i = 0; i < 3; i++) {
      await engine.addCorrection({
        query: `what is the weather ${i}`,
        predictedToolId: 'playMusic',
        actualToolId: 'getWeather',
        confidence: 0.8,
        timestamp: Date.now(),
        source: 'explicit',
      });
    }

    // Verify examples are pending
    const beforeStats = engine.getStats();
    expect(beforeStats.pendingExamples).toBe(8);

    const stats = await engine.triggerRetrain();

    expect(stats).not.toBeNull();
    expect(stats!.examplesProcessed).toBe(8);
    // At least one tool should be updated
    expect(stats!.toolsUpdated).toBeGreaterThanOrEqual(1);
  });
});
