/**
 * FTIS Classifier V2 Test Suite
 *
 * Comprehensive tests for production readiness.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  FTISClassifierV2,
  initializeFTISClassifierV2,
  resetFTISClassifierV2,
  type ClassificationResult,
} from '../tools/intelligence/ftis-classifier-v2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(__dirname, '../../models/ftis-merged');

// Check if models exist
async function modelsExist(): Promise<boolean> {
  const fs = await import('fs/promises');
  try {
    await fs.access(path.join(MODELS_DIR, 'stage1', 'model.onnx'));
    return true;
  } catch {
    return false;
  }
}

describe('FTIS Classifier V2', () => {
  let classifier: FTISClassifierV2;
  let hasModels = false;

  beforeAll(async () => {
    hasModels = await modelsExist();
    if (hasModels) {
      classifier = await initializeFTISClassifierV2({
        modelsDir: MODELS_DIR,
        fallbackThreshold: 0.85,
        enableFallback: true,
        enableMetrics: true,
      });
    }
  }, 60000); // 60s timeout for model loading

  afterAll(() => {
    resetFTISClassifierV2();
  });

  describe('Initialization', () => {
    it('should initialize successfully with models', async () => {
      if (!hasModels) {
        console.log('Skipping: Models not found at', MODELS_DIR);
        return;
      }
      expect(classifier.isReady()).toBe(true);
    });

    it('should load all 10 super-categories', async () => {
      if (!hasModels) return;
      const superCategories = classifier.getSuperCategories();
      expect(superCategories.length).toBe(10);
      expect(superCategories).toContain('media');
      expect(superCategories).toContain('calendar');
      expect(superCategories).toContain('emotional');
    });
  });

  describe('Standard Classification', () => {
    const standardQueries = [
      { query: 'Play some jazz music', expected: { super: 'media', fine: 'play_music' } },
      { query: 'Set an alarm for 7am', expected: { super: 'calendar', fine: 'alarm_set' } },
      { query: "I'm feeling anxious", expected: { super: 'emotional', fine: 'calm_support' } },
      { query: "What's the weather?", expected: { super: 'travel', fine: 'weather' } },
      { query: 'Call mom', expected: { super: 'communication', fine: 'call_make' } },
      { query: 'Add milk to my list', expected: { super: 'productivity', fine: 'item_add' } },
      { query: 'Turn off the lights', expected: { super: 'home', fine: 'lights' } },
    ];

    for (const { query, expected } of standardQueries) {
      it(`should classify "${query}" correctly`, async () => {
        if (!hasModels) return;

        const result = await classifier.classify(query);
        expect(result).not.toBeNull();
        expect(result?.superCategory).toBe(expected.super);
        expect(result?.fineCategory).toBe(expected.fine);
        expect(result?.combinedConfidence).toBeGreaterThan(0.8);
      });
    }
  });

  describe('Tool Mapping', () => {
    it('should return tool IDs for play_music category', async () => {
      if (!hasModels) return;

      const result = await classifier.classify('Play some music');
      expect(result?.toolIds).toBeDefined();
      expect(result?.toolIds.length).toBeGreaterThan(0);
      expect(result?.toolIds).toContain('spotify_play');
    });

    it('should return tool IDs via getToolsForCategory', () => {
      if (!hasModels) return;

      const tools = classifier.getToolsForCategory('play_music');
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('Confidence Handling', () => {
    it('should return confidence scores between 0 and 1', async () => {
      if (!hasModels) return;

      const result = await classifier.classify('Play jazz');
      expect(result?.superConfidence).toBeGreaterThanOrEqual(0);
      expect(result?.superConfidence).toBeLessThanOrEqual(1);
      expect(result?.fineConfidence).toBeGreaterThanOrEqual(0);
      expect(result?.fineConfidence).toBeLessThanOrEqual(1);
    });

    it('should return alternatives for fine categories', async () => {
      if (!hasModels) return;

      const result = await classifier.classify('Play some music');
      expect(result?.alternatives).toBeDefined();
      expect(result?.alternatives?.length).toBeGreaterThan(0);
    });
  });

  describe('Latency', () => {
    it('should classify in under 200ms after warmup', async () => {
      if (!hasModels) return;

      // Warmup
      await classifier.classify('warmup query');

      // Measure
      const start = Date.now();
      await classifier.classify('Play some music');
      const latency = Date.now() - start;

      expect(latency).toBeLessThan(200);
    });
  });

  describe('Metrics', () => {
    it('should track classification metrics', async () => {
      if (!hasModels) return;

      classifier.resetMetrics();

      // Run some classifications
      await classifier.classify('Play music');
      await classifier.classify('Set alarm');
      await classifier.classify('Weather');

      const metrics = classifier.getMetrics();
      expect(metrics.totalClassifications).toBe(3);
      expect(metrics.averageLatencyMs).toBeGreaterThan(0);
      expect(metrics.errorCount).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string', async () => {
      if (!hasModels) return;

      const result = await classifier.classify('');
      // Should still return a result (even if low confidence)
      expect(result).not.toBeNull();
    });

    it('should handle very long input', async () => {
      if (!hasModels) return;

      const longQuery = 'Play some jazz music '.repeat(100);
      const result = await classifier.classify(longQuery);
      expect(result).not.toBeNull();
      expect(result?.superCategory).toBe('media');
    });

    it('should handle special characters', async () => {
      if (!hasModels) return;

      const result = await classifier.classify("What's the weather? 🌧️");
      expect(result).not.toBeNull();
      expect(result?.superCategory).toBe('travel');
    });
  });

  describe('Fallback Behavior', () => {
    it('should use fallback for typos when confidence is low', async () => {
      if (!hasModels) return;

      const result = await classifier.classify('remindme workout');
      expect(result).not.toBeNull();
      // May or may not use fallback depending on ONNX confidence
      if (result?.usedFallback) {
        expect(result.latencyMs).toBeGreaterThan(100); // Fallback adds latency
      }
    });
  });
});
