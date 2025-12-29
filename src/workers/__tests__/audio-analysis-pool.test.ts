/**
 * Audio Analysis Worker Pool Tests
 *
 * Tests the audio analysis worker pool's job processing and thread management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAudioAnalysisPool,
  initializeAudioAnalysisPool,
  shutdownAudioAnalysisPool,
} from '../audio-analysis-pool.js';

// Skip worker thread tests - they require compiled JS and proper worker_threads setup
// These are integration tests that should be run manually with proper setup
const skipWorkerTests = true;

describe('AudioAnalysisWorkerPool', () => {
  describe('initialization', () => {
    it('should create pool via getAudioAnalysisPool', () => {
      const pool = getAudioAnalysisPool();
      expect(pool).toBeDefined();
    });
  });

  describe('stats', () => {
    it('should have correct initial stats', () => {
      const pool = getAudioAnalysisPool();
      const stats = pool.getStats();

      expect(stats.totalJobs).toBe(0);
      expect(stats.completedJobs).toBe(0);
      expect(stats.failedJobs).toBe(0);
      expect(stats.activeJobs).toBe(0);
      expect(stats.queueLength).toBe(0);
    });
  });

  describe.skipIf(skipWorkerTests)('job processing', () => {
    beforeEach(() => {
      initializeAudioAnalysisPool();
    });

    afterEach(async () => {
      await shutdownAudioAnalysisPool();
    });

    const pool = () => getAudioAnalysisPool();

    it('should process prosody analysis job', async () => {
      const result = await pool().analyze({
        id: 'test-1',
        type: 'prosody',
        audioData: new Float32Array([0.1, 0.2, 0.3, 0.2, 0.1]),
        sampleRate: 16000,
        sessionId: 'test-session',
      });

      expect(result.jobId).toBe('test-1');
      expect(result.type).toBe('prosody');
      expect(result.result).toBeDefined();
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should process emotion classification job', async () => {
      const result = await pool().analyze({
        id: 'test-2',
        type: 'emotion',
        audioData: new Float32Array([0.1, 0.2, 0.5, 0.2, 0.1]),
        sampleRate: 16000,
        sessionId: 'test-session',
      });

      expect(result.jobId).toBe('test-2');
      expect(result.type).toBe('emotion');
      expect(result.result).toHaveProperty('primary');
      expect(result.result).toHaveProperty('confidence');
    });

    it('should process laughter detection job', async () => {
      const result = await pool().analyze({
        id: 'test-3',
        type: 'laughter',
        audioData: new Float32Array([0.1, 0.5, 0.1, 0.5, 0.1, 0.5]),
        sampleRate: 16000,
        sessionId: 'test-session',
      });

      expect(result.jobId).toBe('test-3');
      expect(result.type).toBe('laughter');
      expect(result.result).toHaveProperty('isLaughing');
    });

    it('should process boundary detection job', async () => {
      const result = await pool().analyze({
        id: 'test-4',
        type: 'boundaries',
        audioData: new Float32Array([0.0, 0.0, 0.5, 0.5, 0.0, 0.0]),
        sampleRate: 16000,
        sessionId: 'test-session',
      });

      expect(result.jobId).toBe('test-4');
      expect(result.type).toBe('boundaries');
      expect(result.result).toHaveProperty('speechSegments');
      expect(result.result).toHaveProperty('silenceSegments');
    });

    it('should update stats after processing', async () => {
      await pool().analyze({
        id: 'stats-test',
        type: 'prosody',
        audioData: new Float32Array([0.1]),
        sampleRate: 16000,
        sessionId: 'test-session',
      });

      const stats = pool().getStats();
      expect(stats.totalJobs).toBeGreaterThan(0);
    });
  });

  describe('backpressure', () => {
    it('should reject jobs when pool is shutting down', async () => {
      initializeAudioAnalysisPool();
      const pool = getAudioAnalysisPool();
      await shutdownAudioAnalysisPool();

      await expect(
        pool.analyze({
          id: 'reject-test',
          type: 'prosody',
          audioData: new Float32Array([0.1]),
          sampleRate: 16000,
          sessionId: 'test-session',
        })
      ).rejects.toThrow('shutting down');
    });
  });

  describe('singleton pattern', () => {
    afterEach(async () => {
      await shutdownAudioAnalysisPool();
    });

    it('should return same instance from getAudioAnalysisPool', () => {
      const pool1 = getAudioAnalysisPool();
      const pool2 = getAudioAnalysisPool();
      expect(pool1).toBe(pool2);
    });

    it('should initialize pool via initializeAudioAnalysisPool', () => {
      expect(() => initializeAudioAnalysisPool()).not.toThrow();
    });
  });
});
