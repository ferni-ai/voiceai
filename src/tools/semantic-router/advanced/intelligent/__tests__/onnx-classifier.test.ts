/**
 * ONNX Classifier Tests
 *
 * Tests the ONNX-based tool classification system.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initializeOnnxClassifier,
  isOnnxClassifierAvailable,
  classifyWithOnnx,
  classifyWithOnnxSafe,
  getOnnxToolLabels,
  getOnnxToolCount,
  shutdownOnnxClassifier,
} from '../onnx-classifier.js';

describe('OnnxClassifier', () => {
  describe('initialization', () => {
    afterAll(() => {
      shutdownOnnxClassifier();
    });

    it('should initialize when model exists', async () => {
      try {
        await initializeOnnxClassifier();
        // If model exists, should be available
        const available = isOnnxClassifierAvailable();
        console.log('ONNX classifier available:', available);

        if (available) {
          const toolCount = getOnnxToolCount();
          expect(toolCount).toBeGreaterThan(0);
          console.log('Tools covered:', toolCount);

          const labels = getOnnxToolLabels();
          expect(labels.length).toBe(toolCount);
          console.log('Tool labels:', labels.slice(0, 5), '...');
        }
      } catch (error) {
        // Model might not exist in CI - that's OK
        console.log('ONNX initialization skipped:', (error as Error).message);
      }
    });
  });

  describe('classification', () => {
    beforeAll(async () => {
      try {
        await initializeOnnxClassifier();
      } catch {
        // Ignore - tests will skip if not available
      }
    });

    afterAll(() => {
      shutdownOnnxClassifier();
    });

    it('should classify music requests', () => {
      if (!isOnnxClassifierAvailable()) {
        console.log('Skipping - ONNX not available');
        return;
      }

      const result = classifyWithOnnx('play some jazz music');
      console.log('Music classification:', result);

      expect(result.predictions.length).toBeGreaterThan(0);
      expect(result.latencyMs).toBeLessThan(500); // Should be fast

      // Check if music-related tool is predicted (case-insensitive)
      const musicPrediction = result.predictions.find(
        (p) =>
          p.toolId.toLowerCase().includes('music') || p.toolId.toLowerCase().includes('play')
      );
      expect(musicPrediction).toBeDefined();
    });

    it('should classify weather requests', () => {
      if (!isOnnxClassifierAvailable()) {
        console.log('Skipping - ONNX not available');
        return;
      }

      const result = classifyWithOnnx("what's the weather like today");
      console.log('Weather classification:', result);

      expect(result.predictions.length).toBeGreaterThan(0);

      // Check if weather tool is predicted (case-insensitive)
      const weatherPrediction = result.predictions.find((p) =>
        p.toolId.toLowerCase().includes('weather')
      );
      expect(weatherPrediction).toBeDefined();
    });

    it('should handle unknown queries gracefully', () => {
      if (!isOnnxClassifierAvailable()) {
        console.log('Skipping - ONNX not available');
        return;
      }

      const result = classifyWithOnnx('asdfghjkl random gibberish');
      console.log('Unknown classification:', result);

      // Should still return predictions (might have low confidence)
      expect(result.predictions).toBeDefined();
      expect(result.latencyMs).toBeLessThan(500);
    });

    it('should return null safely when not initialized', () => {
      shutdownOnnxClassifier();
      const result = classifyWithOnnxSafe('play music');
      expect(result).toBeNull();
    });
  });
});
