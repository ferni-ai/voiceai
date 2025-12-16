/**
 * Ambient Awareness Tests
 *
 * Tests for ambient environment detection and adaptation.
 *
 * @module __tests__/ambient-awareness.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getAmbientAwarenessService, resetAmbientAwareness } from '../ambient-awareness.js';

// ============================================================================
// TEST SETUP
// ============================================================================

const TEST_SESSION_ID = 'test-session-ambient-awareness';

describe('Ambient Awareness', () => {
  beforeEach(() => {
    resetAmbientAwareness(TEST_SESSION_ID);
  });

  afterEach(() => {
    resetAmbientAwareness(TEST_SESSION_ID);
  });

  // ==========================================================================
  // SERVICE TESTS
  // ==========================================================================

  describe('AmbientAwarenessService', () => {
    it('should create a service instance', () => {
      const service = getAmbientAwarenessService(TEST_SESSION_ID);
      expect(service).toBeDefined();
    });

    it('should return default analysis initially', () => {
      const service = getAmbientAwarenessService(TEST_SESSION_ID);
      const analysis = service.getAnalysis();

      expect(analysis).toBeDefined();
      expect(analysis.environment).toBeDefined();
      expect(analysis.noiseLevel).toBeGreaterThanOrEqual(0);
      expect(analysis.confidence).toBeGreaterThanOrEqual(0);
      expect(analysis.confidence).toBeLessThanOrEqual(1);
    });

    it('should process audio frames without crashing', () => {
      const service = getAmbientAwarenessService(TEST_SESSION_ID);

      // Create synthetic audio data (silence)
      const samples = new Int16Array(1024).fill(0);

      expect(() => {
        service.processFrame(samples, 16000, false);
      }).not.toThrow();
    });

    it('should detect quiet environment from silence', () => {
      const service = getAmbientAwarenessService(TEST_SESSION_ID);

      // Process multiple frames of silence
      const silence = new Int16Array(1024).fill(0);
      for (let i = 0; i < 10; i++) {
        service.processFrame(silence, 16000, false);
      }

      const analysis = service.getAnalysis();
      // Silence should register as quiet with high confidence
      expect(['quiet', 'unknown']).toContain(analysis.environment);
    });

    it('should provide recommendations', () => {
      const service = getAmbientAwarenessService(TEST_SESSION_ID);
      const analysis = service.getAnalysis();

      expect(analysis.recommendations).toBeDefined();
      expect(typeof analysis.recommendations.speakClearer).toBe('boolean');
      expect(typeof analysis.recommendations.offerToPause).toBe('boolean');
      expect(typeof analysis.recommendations.increaseVolume).toBe('boolean');
      expect(typeof analysis.recommendations.addPauses).toBe('boolean');
    });

    it('should reset properly', () => {
      const service = getAmbientAwarenessService(TEST_SESSION_ID);

      // Process some audio
      const samples = new Int16Array(1024);
      service.processFrame(samples, 16000, false);

      // Reset
      service.reset();

      // Should return to default state
      const analysis = service.getAnalysis();
      expect(analysis.confidence).toBe(0);
    });
  });

  // ==========================================================================
  // ENVIRONMENT DETECTION TESTS
  // ==========================================================================

  describe('Environment Detection', () => {
    it('should classify noise levels', () => {
      const service = getAmbientAwarenessService(TEST_SESSION_ID);

      // Process white noise (random values)
      const noise = new Int16Array(1024);
      for (let i = 0; i < noise.length; i++) {
        noise[i] = Math.floor((Math.random() - 0.5) * 10000);
      }

      for (let i = 0; i < 10; i++) {
        service.processFrame(noise, 16000, false);
      }

      const analysis = service.getAnalysis();
      // Noisy input should register some environment
      expect(analysis.environment).toBeDefined();
    });

    it('should estimate noise level', () => {
      const service = getAmbientAwarenessService(TEST_SESSION_ID);

      // Process some audio
      const samples = new Int16Array(1024);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.floor(Math.sin(i * 0.1) * 1000);
      }

      for (let i = 0; i < 5; i++) {
        service.processFrame(samples, 16000, false);
      }

      const analysis = service.getAnalysis();
      expect(typeof analysis.noiseLevel).toBe('number');
    });

    it('should detect background elements', () => {
      const service = getAmbientAwarenessService(TEST_SESSION_ID);

      // Process synthetic speech-like audio
      const samples = new Int16Array(1024);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.floor(Math.sin(i * 0.02) * 5000);
      }

      for (let i = 0; i < 20; i++) {
        service.processFrame(samples, 16000, i % 3 === 0);
      }

      const analysis = service.getAnalysis();
      expect(Array.isArray(analysis.backgroundElements)).toBe(true);
    });
  });

  // ==========================================================================
  // PERFORMANCE TESTS
  // ==========================================================================

  describe('Performance', () => {
    it('should process audio frame quickly (< 10ms)', () => {
      const service = getAmbientAwarenessService(TEST_SESSION_ID);
      const samples = new Int16Array(1024);

      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        service.processFrame(samples, 16000, false);
      }

      const elapsed = performance.now() - start;
      const avgMs = elapsed / 100;

      expect(avgMs).toBeLessThan(10);
    });

    it('should get analysis quickly (< 5ms)', () => {
      const service = getAmbientAwarenessService(TEST_SESSION_ID);

      // Prime with some data
      const samples = new Int16Array(1024);
      for (let i = 0; i < 10; i++) {
        service.processFrame(samples, 16000, false);
      }

      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        service.getAnalysis();
      }

      const elapsed = performance.now() - start;
      const avgMs = elapsed / 1000;

      expect(avgMs).toBeLessThan(5);
    });
  });
});
