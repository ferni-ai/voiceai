/**
 * Voice Biomarker Pipeline Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createVoiceBiomarkerPipeline,
  type IVoiceBiomarkerPipeline,
  type VoiceFeatures,
} from '../index.js';

describe('VoiceBiomarkerPipeline', () => {
  let pipeline: IVoiceBiomarkerPipeline;

  beforeEach(() => {
    pipeline = createVoiceBiomarkerPipeline();
  });

  // ============================================================================
  // ANALYSIS TESTS
  // ============================================================================

  describe('analyze()', () => {
    it('detects stress from high speaking rate and energy', async () => {
      const features: VoiceFeatures = {
        speakingRate: 200, // Fast
        energy: 0.9, // High
        pitchVariance: 60, // High variability
      };

      const state = await pipeline.analyze(features);

      expect(state.biomarkers.some((b) => b.type === 'stress')).toBe(true);
      expect(state.stressLevel).toBeGreaterThan(0.5);
    });

    it('detects fatigue from low energy and slow speech', async () => {
      const features: VoiceFeatures = {
        speakingRate: 90, // Slow
        energy: 0.2, // Low
        pauseFrequency: 0.5, // Many pauses
      };

      const state = await pipeline.analyze(features);

      expect(state.biomarkers.some((b) => b.type === 'fatigue')).toBe(true);
    });

    it('detects anxiety from high pitch and jitter', async () => {
      const features: VoiceFeatures = {
        pitchMean: 280, // High
        jitter: 0.05, // High irregularity
        shimmer: 0.15,
        breathQuality: 'shallow',
      };

      const state = await pipeline.analyze(features);

      expect(state.biomarkers.some((b) => b.type === 'anxiety')).toBe(true);
    });

    it('detects sadness from low pitch and energy', async () => {
      const features: VoiceFeatures = {
        pitchMean: 130, // Low
        energy: 0.25, // Low
        speakingRate: 100, // Slow
      };

      const state = await pipeline.analyze(features);

      expect(state.biomarkers.some((b) => b.type === 'sadness')).toBe(true);
    });

    it('detects excitement from high energy and variability', async () => {
      const features: VoiceFeatures = {
        speakingRate: 175, // Fast
        energy: 0.8, // High
        pitchVariance: 50, // Variable
      };

      const state = await pipeline.analyze(features);

      expect(state.biomarkers.some((b) => b.type === 'excitement')).toBe(true);
    });

    it('detects calm from moderate features', async () => {
      const features: VoiceFeatures = {
        speakingRate: 135, // Moderate
        energy: 0.5, // Moderate
        jitter: 0.01, // Low
        breathQuality: 'deep',
      };

      const state = await pipeline.analyze(features);

      expect(state.biomarkers.some((b) => b.type === 'calm')).toBe(true);
    });

    it('returns neutral when no strong signals', async () => {
      const features: VoiceFeatures = {};

      const state = await pipeline.analyze(features);

      expect(state.primary).toBe('neutral');
      expect(state.biomarkers.length).toBe(0);
    });

    it('recommends slower pacing for stress', async () => {
      const features: VoiceFeatures = {
        speakingRate: 200,
        energy: 0.9,
        pitchVariance: 60,
      };

      const state = await pipeline.analyze(features);

      expect(state.recommendedPacing).toBe('slower');
    });
  });

  // ============================================================================
  // INTERVENTION TESTS
  // ============================================================================

  describe('getIntervention()', () => {
    it('recommends breathing for high stress', async () => {
      const features: VoiceFeatures = {
        speakingRate: 200,
        energy: 0.9,
        pitchVariance: 60,
        jitter: 0.04,
      };

      const state = await pipeline.analyze(features);
      const intervention = pipeline.getIntervention(state);

      expect(intervention.type).toBe('breathing-exercise');
      expect(intervention.script).toBeDefined();
    });

    it('recommends energy boost for fatigue', async () => {
      const features: VoiceFeatures = {
        speakingRate: 90,
        energy: 0.2,
        pauseFrequency: 0.5,
      };

      const state = await pipeline.analyze(features);
      const intervention = pipeline.getIntervention(state);

      expect(intervention.type).toBe('energy-boost');
    });

    it('recommends celebration for excitement', async () => {
      const features: VoiceFeatures = {
        speakingRate: 175,
        energy: 0.8,
        pitchVariance: 50,
      };

      const state = await pipeline.analyze(features);
      const intervention = pipeline.getIntervention(state);

      expect(intervention.type).toBe('celebration');
    });

    it('returns none for neutral state', async () => {
      const features: VoiceFeatures = {
        speakingRate: 135,
        energy: 0.5,
      };

      const state = await pipeline.analyze(features);
      const intervention = pipeline.getIntervention(state);

      // Could be calm or none
      expect(['none', 'celebration']).toContain(intervention.type);
    });
  });

  // ============================================================================
  // INTERVENTION RECORDING
  // ============================================================================

  describe('recordIntervention()', () => {
    it('records intervention without error', async () => {
      await expect(
        pipeline.recordIntervention(
          'user-123',
          {
            type: 'breathing-exercise',
            reason: 'Test',
            urgency: 'soon',
            confidence: 0.8,
          },
          true
        )
      ).resolves.not.toThrow();
    });
  });

  // ============================================================================
  // STATE HISTORY
  // ============================================================================

  describe('getStateHistory()', () => {
    it('returns empty for new user', async () => {
      const history = await pipeline.getStateHistory('new-user');
      expect(history).toEqual([]);
    });
  });

  // ============================================================================
  // CONTEXT INJECTION
  // ============================================================================

  describe('buildContextInjection()', () => {
    it('builds context for stressed state', async () => {
      const features: VoiceFeatures = {
        speakingRate: 200,
        energy: 0.9,
        pitchVariance: 60,
      };

      const state = await pipeline.analyze(features);
      const context = pipeline.buildContextInjection(state);

      expect(context).toContain('[VOICE STATE]');
      expect(context).toContain('stress');
    });

    it('includes stress level percentage', async () => {
      const features: VoiceFeatures = {
        speakingRate: 180,
        energy: 0.8,
      };

      const state = await pipeline.analyze(features);
      const context = pipeline.buildContextInjection(state);

      expect(context).toContain('%');
    });
  });

  // ============================================================================
  // RESET
  // ============================================================================

  describe('reset()', () => {
    it('resets without error', () => {
      expect(() => pipeline.reset()).not.toThrow();
    });
  });
});
