/**
 * Tests for Rust-accelerated batch tool scoring
 *
 * @module memory/__tests__/batch-tool-scoring.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the logger before imports
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import {
  batchScoreToolsOptimized,
  isBatchToolScoringNativeAvailable,
  cosineSimilarity,
  type DetailedScoringResult,
} from '../rust-accelerator.js';

describe('Batch Tool Scoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('batchScoreToolsOptimized', () => {
    it('should score tools based on pattern matching', () => {
      const profiles = [
        {
          toolId: 'playMusic',
          patterns: [/play.*music/i, /listen.*song/i],
          keywords: new Map([
            ['play', 1.0],
            ['music', 0.8],
            ['song', 0.6],
          ]),
          embedding: null,
        },
        {
          toolId: 'getWeather',
          patterns: [/weather/i, /forecast/i],
          keywords: new Map([
            ['weather', 1.0],
            ['forecast', 0.9],
            ['temperature', 0.7],
          ]),
          embedding: null,
        },
        {
          toolId: 'setReminder',
          patterns: [/remind/i, /reminder/i],
          keywords: new Map([
            ['remind', 1.0],
            ['reminder', 0.9],
            ['alarm', 0.7],
          ]),
          embedding: null,
        },
      ];

      // Test pattern matching
      const results = batchScoreToolsOptimized('play some music', profiles, null);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].toolId).toBe('playMusic');
      expect(results[0].patternScore).toBeGreaterThan(0);
    });

    it('should score tools based on keyword matching', () => {
      const profiles = [
        {
          toolId: 'searchNews',
          patterns: [],
          keywords: new Map([
            ['news', 1.0],
            ['headlines', 0.9],
            ['article', 0.7],
          ]),
          embedding: null,
        },
        {
          toolId: 'sendEmail',
          patterns: [],
          keywords: new Map([
            ['email', 1.0],
            ['send', 0.9],
            ['message', 0.7],
          ]),
          embedding: null,
        },
      ];

      const results = batchScoreToolsOptimized('show me the news headlines', profiles, null);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].toolId).toBe('searchNews');
      expect(results[0].keywordScore).toBeGreaterThan(0);
    });

    it('should score tools based on embedding similarity', () => {
      // Create mock embeddings (small dimension for testing)
      const queryEmbedding = new Float32Array([0.5, 0.3, 0.2, 0.1, 0.4, 0.6, 0.7, 0.8]);
      const toolEmbedding1 = new Float32Array([0.5, 0.3, 0.2, 0.1, 0.4, 0.6, 0.7, 0.8]); // Same as query
      const toolEmbedding2 = new Float32Array([-0.5, -0.3, -0.2, -0.1, -0.4, -0.6, -0.7, -0.8]); // Opposite

      const profiles = [
        {
          toolId: 'similarTool',
          patterns: [],
          keywords: new Map<string, number>(),
          embedding: toolEmbedding1,
        },
        {
          toolId: 'dissimilarTool',
          patterns: [],
          keywords: new Map<string, number>(),
          embedding: toolEmbedding2,
        },
      ];

      const results = batchScoreToolsOptimized('test query', profiles, queryEmbedding, {
        embeddingWeight: 1.0,
        patternWeight: 0,
        keywordWeight: 0,
      });

      // The similar tool should score higher
      const similarResult = results.find((r) => r.toolId === 'similarTool');
      const dissimilarResult = results.find((r) => r.toolId === 'dissimilarTool');

      expect(similarResult).toBeDefined();
      expect(similarResult!.embeddingScore).toBeCloseTo(1.0, 1);

      // Dissimilar may or may not be in results depending on threshold
      if (dissimilarResult) {
        expect(dissimilarResult.embeddingScore).toBeLessThan(0);
      }
    });

    it('should combine pattern, keyword, and embedding scores', () => {
      const queryEmbedding = new Float32Array([0.5, 0.3, 0.2, 0.1, 0.4, 0.6, 0.7, 0.8]);

      const profiles = [
        {
          toolId: 'bestMatch',
          patterns: [/test/i],
          keywords: new Map([['test', 1.0]]),
          embedding: new Float32Array([0.5, 0.3, 0.2, 0.1, 0.4, 0.6, 0.7, 0.8]),
        },
        {
          toolId: 'partialMatch',
          patterns: [],
          keywords: new Map([['other', 1.0]]),
          embedding: new Float32Array([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
        },
      ];

      const results = batchScoreToolsOptimized('test query', profiles, queryEmbedding);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].toolId).toBe('bestMatch');
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].patternScore).toBeGreaterThan(0);
      expect(results[0].keywordScore).toBeGreaterThan(0);
      expect(results[0].embeddingScore).toBeGreaterThan(0);
    });

    it('should respect config weights', () => {
      const profiles = [
        {
          toolId: 'patternOnly',
          patterns: [/test/i],
          keywords: new Map<string, number>(),
          embedding: null,
        },
        {
          toolId: 'keywordOnly',
          patterns: [],
          keywords: new Map([['test', 1.0]]),
          embedding: null,
        },
      ];

      // With pattern weight = 1, keyword weight = 0
      const patternResults = batchScoreToolsOptimized('test', profiles, null, {
        patternWeight: 1.0,
        keywordWeight: 0,
        embeddingWeight: 0,
      });

      expect(patternResults[0].toolId).toBe('patternOnly');

      // With pattern weight = 0, keyword weight = 1
      const keywordResults = batchScoreToolsOptimized('test', profiles, null, {
        patternWeight: 0,
        keywordWeight: 1.0,
        embeddingWeight: 0,
      });

      expect(keywordResults[0].toolId).toBe('keywordOnly');
    });

    it('should handle empty profiles array', () => {
      const results = batchScoreToolsOptimized('test query', [], null);
      expect(results).toEqual([]);
    });

    it('should handle queries with no matches', () => {
      const profiles = [
        {
          toolId: 'specificTool',
          patterns: [/very specific pattern that wont match/i],
          keywords: new Map([['uniqueword', 1.0]]),
          embedding: null,
        },
      ];

      const results = batchScoreToolsOptimized('completely different query', profiles, null);

      // Should return empty or very low scores
      expect(results.every((r) => r.score < 0.1)).toBe(true);
    });
  });

  describe('isBatchToolScoringNativeAvailable', () => {
    it('should return a boolean', () => {
      const result = isBatchToolScoringNativeAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('cosineSimilarity (baseline)', () => {
    it('should compute similarity correctly', () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);

      const c = [1, 0, 0];
      const d = [0, 1, 0];
      expect(cosineSimilarity(c, d)).toBeCloseTo(0);

      const e = [1, 0, 0];
      const f = [-1, 0, 0];
      expect(cosineSimilarity(e, f)).toBeCloseTo(-1.0);
    });

    it('should handle Float32Arrays', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([1, 0, 0]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
    });
  });
});
