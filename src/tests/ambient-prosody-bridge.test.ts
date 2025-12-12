/**
 * Ambient inference from prosody tests
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils/safe-logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

const mockProcessDetection = vi.fn();
vi.mock('../conversation/humanization/ambient-awareness.js', () => ({
  getAmbientAwarenessEngine: vi.fn(() => ({
    processDetection: mockProcessDetection,
  })),
}));

// These engines are referenced by processProsodyForHumanization; keep them no-op
vi.mock('../conversation/humanization/breathing-sync.js', () => ({
  getBreathingSyncEngine: vi.fn(() => ({ updateUserPattern: vi.fn() })),
}));
vi.mock('../conversation/humanization/voice-print.js', () => ({
  getVoicePrintEngine: vi.fn(() => ({ recordSnapshot: vi.fn(), isCalibrated: vi.fn(() => true) })),
}));
vi.mock('../conversation/humanization/cross-session-voice.js', () => ({
  getCrossSessionVoiceEngine: vi.fn(() => ({ generateAcknowledgment: vi.fn(() => null) })),
}));

import {
  inferAmbientFromProsody,
  processProsodyForHumanization,
} from '../conversation/humanization/prosody-bridge.js';

describe('inferAmbientFromProsody', () => {
  it('returns quiet in low-energy environments', () => {
    const result = inferAmbientFromProsody({
      pitchMean: 150,
      pitchVariance: 20,
      pitchRange: 60,
      pitchContour: 'flat',
      energyMean: -55,
      energyVariance: 2,
      energyPeaks: 0,
      speechRate: 3,
      pauseDuration: 400,
      pauseFrequency: 10,
      jitter: 0.02,
      shimmer: 0.02,
      breathiness: 0.8,
      utteranceDuration: 2,
      speakingRatio: 0.8,
    });

    expect(result?.sounds[0]?.sound).toBe('quiet');
  });

  it('detects traffic-like steady noise', () => {
    const result = inferAmbientFromProsody({
      pitchMean: 150,
      pitchVariance: 20,
      pitchRange: 60,
      pitchContour: 'flat',
      energyMean: -15,
      energyVariance: 6,
      energyPeaks: 1,
      speechRate: 3,
      pauseDuration: 300,
      pauseFrequency: 8,
      jitter: 0.03,
      shimmer: 0.02,
      breathiness: 0.4,
      utteranceDuration: 2,
      speakingRatio: 0.4,
    });

    expect(result?.sounds.map((s) => s.sound)).toContain('traffic');
  });

  it('detects crowd-like busy environments', () => {
    const result = inferAmbientFromProsody({
      pitchMean: 170,
      pitchVariance: 30,
      pitchRange: 90,
      pitchContour: 'dynamic',
      energyMean: -12,
      energyVariance: 18,
      energyPeaks: 6,
      speechRate: 4,
      pauseDuration: 250,
      pauseFrequency: 6,
      jitter: 0.03,
      shimmer: 0.03,
      breathiness: 0.4,
      utteranceDuration: 2,
      speakingRatio: 0.35,
    });

    expect(result?.sounds.map((s) => s.sound)).toContain('crowd');
  });
});

describe('processProsodyForHumanization ambient wiring', () => {
  it('pushes ambient detections into AmbientAwarenessEngine', () => {
    processProsodyForHumanization('session-1', 'user-1', {
      primary: 'neutral',
      confidence: 0.8,
      valence: 0,
      arousal: 0,
      dominance: 0,
      stressLevel: 0.1,
      anxietyMarkers: false,
      sampleCount: 1,
      processingTimeMs: 1,
      prosody: {
        pitchMean: 170,
        pitchVariance: 30,
        pitchRange: 90,
        pitchContour: 'dynamic',
        energyMean: -12,
        energyVariance: 18,
        energyPeaks: 6,
        speechRate: 4,
        pauseDuration: 250,
        pauseFrequency: 6,
        jitter: 0.03,
        shimmer: 0.03,
        breathiness: 0.4,
        utteranceDuration: 2,
        speakingRatio: 0.35,
      },
    });

    expect(mockProcessDetection).toHaveBeenCalledTimes(1);
  });
});
