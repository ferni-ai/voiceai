/**
 * Prosody Routing Integration Tests
 *
 * Tests the SOTA voice prosody analysis and routing adjustment system.
 *
 * @module tools/semantic-router/advanced/__tests__/prosody-routing.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger - use vi.hoisted() to ensure mockLogger is defined before vi.mock() runs
const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
}));

vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
}));

// Import after mocks
import { AudioProsodyExtractor } from '../audio-prosody-extractor.js';
import {
  ProsodyRoutingEngine,
  getProsodyRoutingEngine,
  initializeProsodyRouting,
  shutdownProsodyRouting,
} from '../prosody-routing-integration.js';
import type { SemanticToolMatch } from '../../types.js';

describe('AudioProsodyExtractor', () => {
  let extractor: AudioProsodyExtractor;

  beforeEach(() => {
    extractor = new AudioProsodyExtractor();
  });

  describe('processAudioChunk', () => {
    it('should extract features from audio samples', () => {
      // Create a simple sine wave at 440Hz (A4 note)
      const sampleRate = 16000;
      const duration = 0.1; // 100ms
      const frequency = 440;
      const numSamples = Math.floor(sampleRate * duration);
      const samples = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        samples[i] = Math.sin(2 * Math.PI * frequency * t);
      }

      const features = extractor.processAudioChunk(samples);

      // Should extract features
      expect(features).not.toBeNull();
      if (features) {
        expect(features.totalDuration).toBeGreaterThan(0);
        expect(features.pitchMean).toBeGreaterThan(0);
        // Energy is in dB (can be negative)
        expect(features.energyMean).toBeDefined();
        expect(typeof features.energyMean).toBe('number');
      }
    });

    it('should return null for very short audio', () => {
      const samples = new Float32Array(100); // Too short
      const features = extractor.processAudioChunk(samples);
      expect(features).toBeNull();
    });

    it('should handle silence gracefully', () => {
      const samples = new Float32Array(1600).fill(0);
      const features = extractor.processAudioChunk(samples);
      // Should still return features even for silence
      expect(features).not.toBeNull();
    });
  });

  describe('featuresToProsodySignals', () => {
    it('should convert acoustic features to prosody signals', () => {
      // Mock features
      const features = {
        pitchMean: 200,
        pitchStd: 40,
        pitchMin: 150,
        pitchMax: 280,
        pitchRange: 130,
        energyMean: -20,
        energyStd: 5,
        energyMax: -10,
        speechRate: 4.5,
        articulationRate: 5.0,
        phonationRatio: 0.8,
        pauseCount: 2,
        pauseMeanDuration: 0.3,
        pauseMaxDuration: 0.5,
        totalPauseDuration: 0.6,
        jitter: 0.02,
        shimmer: 0.05,
        hnr: 15,
        totalDuration: 3,
        voicedDuration: 2.4,
        spectralCentroid: 2000,
        spectralFlux: 0.5,
        timestamp: Date.now(),
      };

      const signals = extractor.featuresToProsodySignals(features);

      expect(signals).toBeDefined();
      expect(signals.arousal).toBeGreaterThanOrEqual(0);
      expect(signals.arousal).toBeLessThanOrEqual(1);
      expect(signals.valence).toBeGreaterThanOrEqual(-1);
      expect(signals.valence).toBeLessThanOrEqual(1);
      expect(signals.stressLevel).toBeGreaterThanOrEqual(0);
      expect(signals.stressLevel).toBeLessThanOrEqual(1);
    });
  });

  describe('baseline learning', () => {
    it('should accumulate samples for baseline', () => {
      const sampleRate = 16000;
      const numSamples = 1600;

      // Process multiple chunks to build up samples
      for (let i = 0; i < 60; i++) {
        const samples = new Float32Array(numSamples);
        for (let j = 0; j < numSamples; j++) {
          samples[j] = Math.sin((2 * Math.PI * 200 * j) / sampleRate) * 0.5;
        }
        extractor.processAudioChunk(samples);
      }

      const baseline = extractor.learnBaseline();
      expect(baseline).not.toBeNull();
    });

    it('should return null if not enough samples', () => {
      const baseline = extractor.learnBaseline();
      expect(baseline).toBeNull();
    });
  });
});

describe('ProsodyRoutingEngine', () => {
  let engine: ProsodyRoutingEngine;

  beforeEach(() => {
    engine = new ProsodyRoutingEngine({
      enabled: true,
      minConfidenceForBoost: 0.3,
      maxBoostMultiplier: 1.5,
      suppressMultiplier: 0.5,
      emergencyThreshold: 0.8,
      learnBaseline: true,
      minSamplesForBaseline: 50,
    });
  });

  afterEach(() => {
    engine.clearAll();
  });

  describe('processAudio', () => {
    it('should process audio and return prosody signals', () => {
      const userId = 'test-user';
      const sessionId = 'test-session';

      // Create test audio (sine wave)
      const samples = new Float32Array(1600);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.sin((2 * Math.PI * 300 * i) / 16000);
      }

      const signals = engine.processAudio(userId, sessionId, samples);

      // May return null if not enough data yet
      // Just verify no errors
      expect(signals === null || typeof signals === 'object').toBe(true);
    });

    it('should return null when disabled', () => {
      const disabledEngine = new ProsodyRoutingEngine({ enabled: false });
      const signals = disabledEngine.processAudio('user', 'session', new Float32Array(1600));
      expect(signals).toBeNull();
    });
  });

  describe('adjustRouting', () => {
    it('should return original matches when no prosody data', () => {
      const matches: SemanticToolMatch[] = [
        {
          toolId: 'playMusic',
          confidence: 0.85,
          matchedBy: ['keyword'],
          layerScores: {
            pattern: 0,
            keyword: 0.85,
            embedding: 0,
            context: 0,
            history: 0,
            holistic: 0,
          },
          extractedArgs: { query: 'jazz' },
          missingArgs: [],
          matchReason: 'keyword match',
        },
      ];

      const result = engine.adjustRouting('user', 'session', matches);

      expect(result.adjustedMatches).toEqual(matches);
      expect(result.boostedTools).toHaveLength(0);
      expect(result.suppressedTools).toHaveLength(0);
      expect(result.emergencyDetected).toBe(false);
    });

    it('should return original matches when disabled', () => {
      const disabledEngine = new ProsodyRoutingEngine({ enabled: false });

      const matches: SemanticToolMatch[] = [
        {
          toolId: 'test',
          confidence: 0.8,
          matchedBy: ['keyword'],
          layerScores: {
            pattern: 0,
            keyword: 0.8,
            embedding: 0,
            context: 0,
            history: 0,
            holistic: 0,
          },
          extractedArgs: {},
          missingArgs: [],
          matchReason: 'test',
        },
      ];

      const result = disabledEngine.adjustRouting('user', 'session', matches);
      expect(result.adjustedMatches).toEqual(matches);
      expect(result.reason).toContain('disabled');
    });

    it('should handle empty matches', () => {
      const result = engine.adjustRouting('user', 'session', []);
      expect(result.adjustedMatches).toHaveLength(0);
      expect(result.reason).toContain('disabled or no matches');
    });
  });

  describe('getStats', () => {
    it('should return stats for a session', () => {
      const userId = 'test-user';
      const sessionId = 'test-session';

      // Process some audio to create session state
      const samples = new Float32Array(1600);
      engine.processAudio(userId, sessionId, samples);

      const stats = engine.getStats(userId, sessionId);

      expect(stats).toBeDefined();
      expect(stats!.sampleCount).toBeGreaterThanOrEqual(0);
      expect(stats!.hasBaseline).toBe(false);
      expect(stats!.emergencySignals).toBe(0);
    });

    it('should return null for unknown session', () => {
      const stats = engine.getStats('unknown', 'unknown');
      expect(stats).toBeNull();
    });
  });

  describe('session management', () => {
    it('should clear session state', () => {
      const userId = 'test-user';
      const sessionId = 'test-session';

      // Create session
      engine.processAudio(userId, sessionId, new Float32Array(1600));
      expect(engine.getStats(userId, sessionId)).not.toBeNull();

      // Clear session
      engine.clearSession(userId, sessionId);
      expect(engine.getStats(userId, sessionId)).toBeNull();
    });

    it('should clear all state', () => {
      // Create multiple sessions
      engine.processAudio('user1', 'session1', new Float32Array(1600));
      engine.processAudio('user2', 'session2', new Float32Array(1600));

      // Clear all
      engine.clearAll();

      expect(engine.getStats('user1', 'session1')).toBeNull();
      expect(engine.getStats('user2', 'session2')).toBeNull();
    });
  });
});

describe('Module exports', () => {
  afterEach(() => {
    shutdownProsodyRouting();
  });

  it('should initialize and shutdown cleanly', () => {
    const engine = initializeProsodyRouting({
      enabled: true,
      minConfidenceForBoost: 0.4,
    });

    expect(engine).toBeDefined();

    shutdownProsodyRouting();
  });

  it('should get singleton instance', () => {
    const engine1 = getProsodyRoutingEngine();
    const engine2 = getProsodyRoutingEngine();

    expect(engine1).toBe(engine2);
  });
});
