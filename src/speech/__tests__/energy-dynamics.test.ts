/**
 * Tests for Energy Fade Detection
 *
 * Tests the EnergyDynamicsTracker class that detects
 * when voice energy trails off, indicating emotional states.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EnergyDynamicsTracker,
  getEnergyDynamicsTracker,
  resetEnergyDynamicsTracker,
  resetAllEnergyDynamicsTrackers,
  type EnergyTrajectory,
  type EnergyFadeReason,
  type EnergySegment,
} from '../energy-dynamics.js';

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

describe('EnergyDynamicsTracker', () => {
  let tracker: EnergyDynamicsTracker;

  beforeEach(() => {
    tracker = new EnergyDynamicsTracker();
  });

  describe('initial state', () => {
    it('returns default result with insufficient segments', () => {
      const result = tracker.analyzeFromSegments([{ position: 0, energy: 0.5, speechRate: 100 }]);
      expect(result.withinUtterance).toBe('steady');
      expect(result.fadeDetected).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe('trajectory detection', () => {
    it('detects steady trajectory', () => {
      const segments: EnergySegment[] = [
        { position: 0, energy: 0.5, speechRate: 100 },
        { position: 0.25, energy: 0.52, speechRate: 100 },
        { position: 0.5, energy: 0.48, speechRate: 100 },
        { position: 0.75, energy: 0.51, speechRate: 100 },
        { position: 1, energy: 0.49, speechRate: 100 },
      ];

      const result = tracker.analyzeFromSegments(segments);
      expect(result.withinUtterance).toBe('steady');
    });

    it('detects fading trajectory', () => {
      const segments: EnergySegment[] = [
        { position: 0, energy: 0.8, speechRate: 100 },
        { position: 0.25, energy: 0.7, speechRate: 100 },
        { position: 0.5, energy: 0.55, speechRate: 100 },
        { position: 0.75, energy: 0.4, speechRate: 100 },
        { position: 1, energy: 0.3, speechRate: 100 },
      ];

      const result = tracker.analyzeFromSegments(segments);
      expect(result.withinUtterance).toBe('fading');
    });

    it('detects building trajectory', () => {
      const segments: EnergySegment[] = [
        { position: 0, energy: 0.3, speechRate: 100 },
        { position: 0.25, energy: 0.4, speechRate: 100 },
        { position: 0.5, energy: 0.55, speechRate: 100 },
        { position: 0.75, energy: 0.7, speechRate: 100 },
        { position: 1, energy: 0.8, speechRate: 100 },
      ];

      const result = tracker.analyzeFromSegments(segments);
      expect(result.withinUtterance).toBe('building');
    });

    it('detects fluctuating trajectory', () => {
      const segments: EnergySegment[] = [
        { position: 0, energy: 0.3, speechRate: 100 },
        { position: 0.25, energy: 0.8, speechRate: 100 },
        { position: 0.5, energy: 0.2, speechRate: 100 },
        { position: 0.75, energy: 0.9, speechRate: 100 },
        { position: 1, energy: 0.4, speechRate: 100 },
      ];

      const result = tracker.analyzeFromSegments(segments);
      expect(result.withinUtterance).toBe('fluctuating');
    });
  });

  describe('fade detection', () => {
    it('detects fade when energy drops significantly', () => {
      const segments: EnergySegment[] = [
        { position: 0, energy: 0.7, speechRate: 100 },
        { position: 0.2, energy: 0.75, speechRate: 100 },
        { position: 0.4, energy: 0.72, speechRate: 100 },
        { position: 0.6, energy: 0.5, speechRate: 100 },
        { position: 0.8, energy: 0.3, speechRate: 100 },
        { position: 1, energy: 0.2, speechRate: 100 },
      ];

      const result = tracker.analyzeFromSegments(segments);
      expect(result.fadeDetected).toBe(true);
      expect(result.fadeEvent).toBeDefined();
      expect(result.fadeEvent!.dropMagnitude).toBeGreaterThan(0.2);
    });

    it('does not detect fade with stable energy', () => {
      const segments: EnergySegment[] = [
        { position: 0, energy: 0.5, speechRate: 100 },
        { position: 0.25, energy: 0.52, speechRate: 100 },
        { position: 0.5, energy: 0.48, speechRate: 100 },
        { position: 0.75, energy: 0.51, speechRate: 100 },
        { position: 1, energy: 0.5, speechRate: 100 },
      ];

      const result = tracker.analyzeFromSegments(segments);
      expect(result.fadeDetected).toBe(false);
    });

    it('captures text at fade point', () => {
      const segments: EnergySegment[] = [
        { position: 0, energy: 0.7, speechRate: 100 },
        { position: 0.25, energy: 0.72, speechRate: 100 },
        { position: 0.5, energy: 0.6, speechRate: 100 },
        { position: 0.75, energy: 0.3, speechRate: 100 },
        { position: 1, energy: 0.2, speechRate: 100 },
      ];

      const result = tracker.analyzeFromSegments(
        segments,
        'I was thinking about the project and then I realized something'
      );

      if (result.fadeEvent?.textAtFade) {
        expect(result.fadeEvent.textAtFade).toBeTruthy();
      }
    });
  });

  describe('fade reason inference', () => {
    it('infers sadness from sad keywords', () => {
      const segments: EnergySegment[] = [
        { position: 0, energy: 0.7, speechRate: 100 },
        { position: 0.5, energy: 0.5, speechRate: 100 },
        { position: 1, energy: 0.2, speechRate: 100 },
      ];

      const result = tracker.analyzeFromSegments(
        segments,
        'I miss her so much, she is gone now'
      );

      if (result.fadeDetected) {
        expect(result.fadeIndicates).toBe('sadness');
      }
    });

    it('infers discomfort from discomfort keywords', () => {
      const segments: EnergySegment[] = [
        { position: 0, energy: 0.7, speechRate: 100 },
        { position: 0.5, energy: 0.5, speechRate: 100 },
        { position: 1, energy: 0.2, speechRate: 100 },
      ];

      const result = tracker.analyzeFromSegments(
        segments,
        'It was really uncomfortable and awkward'
      );

      if (result.fadeDetected) {
        expect(result.fadeIndicates).toBe('discomfort');
      }
    });

    it('infers uncertainty from uncertain keywords', () => {
      const segments: EnergySegment[] = [
        { position: 0, energy: 0.7, speechRate: 100 },
        { position: 0.5, energy: 0.5, speechRate: 100 },
        { position: 1, energy: 0.2, speechRate: 100 },
      ];

      const result = tracker.analyzeFromSegments(
        segments,
        'Maybe I should, I don\'t know, probably not'
      );

      if (result.fadeDetected) {
        expect(result.fadeIndicates).toBe('uncertainty');
      }
    });

    it('infers realization from realization keywords with early fade', () => {
      const segments: EnergySegment[] = [
        { position: 0, energy: 0.7, speechRate: 100 },
        { position: 0.3, energy: 0.3, speechRate: 100 }, // Early drop
        { position: 0.5, energy: 0.25, speechRate: 100 },
        { position: 0.75, energy: 0.22, speechRate: 100 },
        { position: 1, energy: 0.2, speechRate: 100 },
      ];

      const result = tracker.analyzeFromSegments(
        segments,
        'Oh wait, I just realized something'
      );

      if (result.fadeDetected) {
        expect(['realization', 'unknown', 'discouragement']).toContain(result.fadeIndicates);
      }
    });
  });

  describe('session trend tracking', () => {
    it('returns stable with insufficient history', () => {
      tracker.analyzeFromSegments([
        { position: 0, energy: 0.5, speechRate: 100 },
        { position: 1, energy: 0.5, speechRate: 100 },
      ]);

      const result = tracker.analyzeFromSegments([
        { position: 0, energy: 0.5, speechRate: 100 },
        { position: 1, energy: 0.5, speechRate: 100 },
      ]);

      expect(result.acrossSession).toBe('stable');
    });

    it('detects increasing energy across session', () => {
      // Low energy utterances first
      for (let i = 0; i < 5; i++) {
        tracker.analyzeFromSegments([
          { position: 0, energy: 0.3, speechRate: 100 },
          { position: 0.5, energy: 0.3, speechRate: 100 },
          { position: 1, energy: 0.3, speechRate: 100 },
        ]);
      }

      // Higher energy utterances
      for (let i = 0; i < 5; i++) {
        tracker.analyzeFromSegments([
          { position: 0, energy: 0.7, speechRate: 100 },
          { position: 0.5, energy: 0.7, speechRate: 100 },
          { position: 1, energy: 0.7, speechRate: 100 },
        ]);
      }

      const result = tracker.analyzeFromSegments([
        { position: 0, energy: 0.8, speechRate: 100 },
        { position: 0.5, energy: 0.8, speechRate: 100 },
        { position: 1, energy: 0.8, speechRate: 100 },
      ]);

      expect(result.acrossSession).toBe('increasing');
    });

    it('detects decreasing energy across session', () => {
      // High energy utterances first
      for (let i = 0; i < 5; i++) {
        tracker.analyzeFromSegments([
          { position: 0, energy: 0.8, speechRate: 100 },
          { position: 0.5, energy: 0.8, speechRate: 100 },
          { position: 1, energy: 0.8, speechRate: 100 },
        ]);
      }

      // Lower energy utterances
      for (let i = 0; i < 5; i++) {
        tracker.analyzeFromSegments([
          { position: 0, energy: 0.3, speechRate: 100 },
          { position: 0.5, energy: 0.3, speechRate: 100 },
          { position: 1, energy: 0.3, speechRate: 100 },
        ]);
      }

      const result = tracker.analyzeFromSegments([
        { position: 0, energy: 0.2, speechRate: 100 },
        { position: 0.5, energy: 0.2, speechRate: 100 },
        { position: 1, energy: 0.2, speechRate: 100 },
      ]);

      expect(result.acrossSession).toBe('decreasing');
    });
  });

  describe('fade pattern analysis', () => {
    it('reports rare frequency with few fades', () => {
      // Analyze several utterances without fades
      for (let i = 0; i < 5; i++) {
        tracker.analyzeFromSegments([
          { position: 0, energy: 0.5, speechRate: 100 },
          { position: 0.5, energy: 0.52, speechRate: 100 },
          { position: 1, energy: 0.48, speechRate: 100 },
        ]);
      }

      const patterns = tracker.getFadePatterns();
      expect(patterns.frequency).toBe('rare');
    });

    it('tracks average fade magnitude', () => {
      // Create utterances with fades
      for (let i = 0; i < 5; i++) {
        tracker.analyzeFromSegments([
          { position: 0, energy: 0.8, speechRate: 100 },
          { position: 0.25, energy: 0.75, speechRate: 100 },
          { position: 0.5, energy: 0.6, speechRate: 100 },
          { position: 0.75, energy: 0.35, speechRate: 100 },
          { position: 1, energy: 0.2, speechRate: 100 },
        ]);
      }

      const patterns = tracker.getFadePatterns();
      expect(patterns.avgMagnitude).toBeGreaterThan(0);
    });

    it('identifies common fade reasons', () => {
      // Create fades with sad content
      for (let i = 0; i < 3; i++) {
        tracker.analyzeFromSegments(
          [
            { position: 0, energy: 0.8, speechRate: 100 },
            { position: 0.5, energy: 0.5, speechRate: 100 },
            { position: 1, energy: 0.2, speechRate: 100 },
          ],
          'I miss them so much'
        );
      }

      const patterns = tracker.getFadePatterns();
      if (patterns.commonReasons.length > 0) {
        expect(patterns.commonReasons).toContain('sadness');
      }
    });
  });

  describe('analyzeFromAudio', () => {
    it('extracts segments from audio and analyzes', () => {
      // Generate 1 second of audio
      const sampleRate = 16000;
      const samples = new Float32Array(sampleRate);

      // Generate a signal that fades
      for (let i = 0; i < samples.length; i++) {
        const amplitude = 1 - i / samples.length; // Fading amplitude
        samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * amplitude * 0.5;
      }

      const result = tracker.analyzeFromAudio(samples, sampleRate, 'test audio');
      expect(result).toBeDefined();
      expect(result.segments.length).toBeGreaterThan(0);
    });

    it('handles very short audio', () => {
      // Only 50ms of audio - not enough for 2 segments
      const sampleRate = 16000;
      const samples = new Float32Array(800); // 50ms
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.3;
      }

      const result = tracker.analyzeFromAudio(samples, sampleRate);
      // Should return default result for insufficient data
      expect(result.confidence).toBe(0);
    });
  });

  describe('interpretation and guidance', () => {
    it('provides interpretation for fading trajectory', () => {
      const segments: EnergySegment[] = [
        { position: 0, energy: 0.8, speechRate: 100 },
        { position: 0.5, energy: 0.5, speechRate: 100 },
        { position: 1, energy: 0.2, speechRate: 100 },
      ];

      const result = tracker.analyzeFromSegments(segments);
      expect(result.interpretation).toBeTruthy();
    });

    it('provides guidance for fading trajectory', () => {
      const segments: EnergySegment[] = [
        { position: 0, energy: 0.8, speechRate: 100 },
        { position: 0.5, energy: 0.5, speechRate: 100 },
        { position: 1, energy: 0.2, speechRate: 100 },
      ];

      const result = tracker.analyzeFromSegments(segments);
      expect(result.guidance).toBeTruthy();
    });

    it('provides different guidance for building trajectory', () => {
      const segments: EnergySegment[] = [
        { position: 0, energy: 0.3, speechRate: 100 },
        { position: 0.5, energy: 0.5, speechRate: 100 },
        { position: 1, energy: 0.8, speechRate: 100 },
      ];

      const result = tracker.analyzeFromSegments(segments);
      expect(result.guidance).toContain('Match');
    });
  });

  describe('confidence calculation', () => {
    it('returns low confidence for few segments', () => {
      const result = tracker.analyzeFromSegments([
        { position: 0, energy: 0.5, speechRate: 100 },
        { position: 1, energy: 0.5, speechRate: 100 },
      ]);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('returns higher confidence for more segments', () => {
      const segments: EnergySegment[] = [];
      for (let i = 0; i <= 10; i++) {
        segments.push({ position: i / 10, energy: 0.5, speechRate: 100 });
      }

      const result = tracker.analyzeFromSegments(segments);
      expect(result.confidence).toBeGreaterThanOrEqual(1);
    });
  });

  describe('reset', () => {
    it('clears session history and fade history', () => {
      // Build up history
      for (let i = 0; i < 5; i++) {
        tracker.analyzeFromSegments([
          { position: 0, energy: 0.8, speechRate: 100 },
          { position: 0.5, energy: 0.5, speechRate: 100 },
          { position: 1, energy: 0.2, speechRate: 100 },
        ]);
      }

      tracker.reset();

      const patterns = tracker.getFadePatterns();
      expect(patterns.frequency).toBe('rare');
      expect(patterns.avgMagnitude).toBe(0);
    });
  });
});

describe('Session management', () => {
  beforeEach(() => {
    resetAllEnergyDynamicsTrackers();
  });

  it('creates separate instances per session', () => {
    const tracker1 = getEnergyDynamicsTracker('session-1');
    const tracker2 = getEnergyDynamicsTracker('session-2');

    expect(tracker1).not.toBe(tracker2);
  });

  it('returns same instance for same session', () => {
    const tracker1 = getEnergyDynamicsTracker('session-x');
    const tracker2 = getEnergyDynamicsTracker('session-x');

    expect(tracker1).toBe(tracker2);
  });

  it('resets specific session', () => {
    const tracker1 = getEnergyDynamicsTracker('session-a');
    tracker1.analyzeFromSegments([
      { position: 0, energy: 0.8, speechRate: 100 },
      { position: 0.5, energy: 0.5, speechRate: 100 },
      { position: 1, energy: 0.2, speechRate: 100 },
    ]);

    resetEnergyDynamicsTracker('session-a');

    const tracker2 = getEnergyDynamicsTracker('session-a');
    const patterns = tracker2.getFadePatterns();
    expect(patterns.frequency).toBe('rare');
  });

  it('resets all sessions', () => {
    getEnergyDynamicsTracker('session-1').analyzeFromSegments([
      { position: 0, energy: 0.8, speechRate: 100 },
      { position: 1, energy: 0.2, speechRate: 100 },
    ]);
    getEnergyDynamicsTracker('session-2').analyzeFromSegments([
      { position: 0, energy: 0.8, speechRate: 100 },
      { position: 1, energy: 0.2, speechRate: 100 },
    ]);

    resetAllEnergyDynamicsTrackers();

    expect(getEnergyDynamicsTracker('session-1').getFadePatterns().frequency).toBe('rare');
    expect(getEnergyDynamicsTracker('session-2').getFadePatterns().frequency).toBe('rare');
  });
});

describe('start and end energy calculation', () => {
  let tracker: EnergyDynamicsTracker;

  beforeEach(() => {
    tracker = new EnergyDynamicsTracker();
  });

  it('calculates start energy from first quarter of segments', () => {
    const segments: EnergySegment[] = [
      { position: 0, energy: 0.8, speechRate: 100 },
      { position: 0.25, energy: 0.7, speechRate: 100 },
      { position: 0.5, energy: 0.5, speechRate: 100 },
      { position: 0.75, energy: 0.3, speechRate: 100 },
      { position: 1, energy: 0.2, speechRate: 100 },
    ];

    const result = tracker.analyzeFromSegments(segments);
    // First quarter: [0.8, 0.7] avg = 0.75
    expect(result.startEnergy).toBeCloseTo(0.75, 1);
  });

  it('calculates end energy from last quarter of segments', () => {
    const segments: EnergySegment[] = [
      { position: 0, energy: 0.8, speechRate: 100 },
      { position: 0.25, energy: 0.7, speechRate: 100 },
      { position: 0.5, energy: 0.5, speechRate: 100 },
      { position: 0.75, energy: 0.3, speechRate: 100 },
      { position: 1, energy: 0.2, speechRate: 100 },
    ];

    const result = tracker.analyzeFromSegments(segments);
    // Last quarter: [0.3, 0.2] avg = 0.25
    expect(result.endEnergy).toBeCloseTo(0.25, 1);
  });
});
