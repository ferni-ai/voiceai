/**
 * Environment Tracker Tests
 *
 * Tests ambient sound reactivity: baseline tracking, event detection,
 * TTS adjustments, and acknowledgment generation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ENVIRONMENT_CONFIG,
  EnvironmentTracker,
  getActiveEnvironmentTrackerCount,
  getEnvironmentTracker,
  resetEnvironmentTracker,
} from '../environment-tracker.js';
import type { AudioSnapshot } from '../types.js';

describe('EnvironmentTracker', () => {
  const testSessionId = 'test-session-123';

  // Helper to create audio snapshots
  function createSnapshot(overrides: Partial<AudioSnapshot> = {}): AudioSnapshot {
    return {
      timestamp: Date.now(),
      noiseDb: -40,
      snr: 20,
      hasSpeech: false,
      hasMusic: false,
      environment: 'quiet',
      spectralCentroid: 1000,
      bandEnergies: {
        subBass: 0.1,
        bass: 0.1,
        lowMid: 0.1,
        mid: 0.2,
        highMid: 0.1,
        presence: 0.1,
        brilliance: 0.1,
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    resetEnvironmentTracker(testSessionId);
  });

  afterEach(() => {
    resetEnvironmentTracker(testSessionId);
  });

  describe('Tracker Lifecycle', () => {
    it('creates a new tracker for a session', () => {
      const tracker = getEnvironmentTracker(testSessionId);
      expect(tracker).toBeDefined();
      expect(tracker).toBeInstanceOf(EnvironmentTracker);
    });

    it('returns the same tracker for the same session', () => {
      const tracker1 = getEnvironmentTracker(testSessionId);
      const tracker2 = getEnvironmentTracker(testSessionId);
      expect(tracker1).toBe(tracker2);
    });

    it('creates different trackers for different sessions', () => {
      const tracker1 = getEnvironmentTracker('session-1');
      const tracker2 = getEnvironmentTracker('session-2');
      expect(tracker1).not.toBe(tracker2);

      // Cleanup
      resetEnvironmentTracker('session-1');
      resetEnvironmentTracker('session-2');
    });

    it('resets tracker state', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Build up some state
      for (let i = 0; i < 5; i++) {
        tracker.processSnapshot(createSnapshot());
      }

      expect(tracker.getState().baselineSampleCount).toBeGreaterThan(0);

      // Reset
      tracker.reset();

      expect(tracker.getState().baselineSampleCount).toBe(0);
      expect(tracker.getState().recentEvents).toHaveLength(0);
    });

    it('tracks active tracker count', () => {
      resetEnvironmentTracker('session-a');
      resetEnvironmentTracker('session-b');

      const initialCount = getActiveEnvironmentTrackerCount();

      getEnvironmentTracker('session-a');
      expect(getActiveEnvironmentTrackerCount()).toBe(initialCount + 1);

      getEnvironmentTracker('session-b');
      expect(getActiveEnvironmentTrackerCount()).toBe(initialCount + 2);

      resetEnvironmentTracker('session-a');
      expect(getActiveEnvironmentTrackerCount()).toBe(initialCount + 1);

      resetEnvironmentTracker('session-b');
      expect(getActiveEnvironmentTrackerCount()).toBe(initialCount);
    });
  });

  describe('Baseline Tracking', () => {
    it('builds baseline from initial samples', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Process baseline samples
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -35 }));
      }

      const state = tracker.getState();
      expect(state.baselineSampleCount).toBe(ENVIRONMENT_CONFIG.BASELINE_SAMPLES);
      expect(state.baselineNoiseDb).toBeCloseTo(-35, 1);
    });

    it('maintains rolling baseline with new samples', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Fill baseline with -40 dB
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -40 }));
      }

      // Add more samples at -30 dB
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -30 }));
      }

      // Baseline should have shifted toward -30 dB
      const state = tracker.getState();
      expect(state.baselineNoiseDb).toBeCloseTo(-30, 1);
    });

    it('uses default baseline when empty', () => {
      const tracker = getEnvironmentTracker(testSessionId);
      const state = tracker.getState();

      // Default baseline is -40 dB (quiet environment)
      expect(state.baselineNoiseDb).toBe(-40);
    });
  });

  describe('Noise Increase Detection', () => {
    it('detects minor noise increase (>3dB)', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish baseline at -40 dB
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -40 }));
      }

      // Increase to -36 dB (4 dB increase)
      const event = tracker.processSnapshot(createSnapshot({ noiseDb: -36 }));

      expect(event).not.toBeNull();
      expect(event?.type).toBe('noise_increase');
      expect(event?.severity).toBe('minor');
      expect(event?.confidence).toBeGreaterThan(ENVIRONMENT_CONFIG.CONFIDENCE_THRESHOLD);
    });

    it('detects moderate noise increase (>6dB)', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish baseline at -40 dB
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -40 }));
      }

      // Increase to -32 dB (8 dB increase)
      const event = tracker.processSnapshot(createSnapshot({ noiseDb: -32 }));

      expect(event).not.toBeNull();
      expect(event?.type).toBe('noise_increase');
      expect(event?.severity).toBe('moderate');
    });

    it('detects major noise increase (>12dB)', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish baseline at -40 dB
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -40 }));
      }

      // Increase to -25 dB (15 dB increase)
      const event = tracker.processSnapshot(createSnapshot({ noiseDb: -25 }));

      expect(event).not.toBeNull();
      expect(event?.type).toBe('noise_increase');
      expect(event?.severity).toBe('major');
    });
  });

  describe('Noise Decrease Detection', () => {
    it('detects noise decrease (>6dB drop)', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish baseline at -30 dB (noisy)
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -30 }));
      }

      // Decrease to -40 dB (10 dB decrease)
      const event = tracker.processSnapshot(createSnapshot({ noiseDb: -40 }));

      expect(event).not.toBeNull();
      expect(event?.type).toBe('noise_decrease');
      expect(event?.severity).toBe('minor');
    });
  });

  describe('Environment Event Detection', () => {
    it('detects new voice in quiet environment', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish quiet baseline
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ environment: 'quiet' }));
      }

      // New speech appears
      const event = tracker.processSnapshot(
        createSnapshot({
          hasSpeech: true,
          environment: 'speech',
        })
      );

      expect(event).not.toBeNull();
      expect(event?.type).toBe('new_voice');
      expect(event?.severity).toBe('major');
    });

    it('detects crowd noise', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish quiet baseline
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ environment: 'quiet' }));
      }

      // Crowd noise
      const event = tracker.processSnapshot(createSnapshot({ environment: 'crowd' }));

      expect(event).not.toBeNull();
      expect(event?.type).toBe('crowd_noise');
      expect(event?.severity).toBe('moderate');
    });

    it('detects music start', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish quiet baseline
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ environment: 'quiet' }));
      }

      // Music starts
      const event = tracker.processSnapshot(
        createSnapshot({
          hasMusic: true,
          environment: 'music',
        })
      );

      expect(event).not.toBeNull();
      expect(event?.type).toBe('music_start');
      expect(event?.severity).toBe('minor');
    });

    it('detects doorbell pattern (high frequency burst)', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish baseline
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot());
      }

      // High-frequency burst (doorbell pattern)
      const event = tracker.processSnapshot(
        createSnapshot({
          bandEnergies: {
            subBass: 0.1,
            bass: 0.1,
            lowMid: 0.1,
            mid: 0.2,
            highMid: 0.3,
            presence: 0.5, // High
            brilliance: 0.5, // High
          },
        })
      );

      expect(event).not.toBeNull();
      expect(event?.type).toBe('doorbell');
      expect(event?.severity).toBe('major');
    });
  });

  describe('Event Cooldown', () => {
    it('respects event cooldown', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish baseline
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -40 }));
      }

      // First noise increase
      const event1 = tracker.processSnapshot(createSnapshot({ noiseDb: -25 }));
      expect(event1).not.toBeNull();

      // Immediate second increase - should be blocked by cooldown
      const event2 = tracker.processSnapshot(createSnapshot({ noiseDb: -20 }));
      expect(event2).toBeNull();
    });

    it('allows events after cooldown expires', async () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish baseline
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -40 }));
      }

      // First event
      tracker.processSnapshot(createSnapshot({ noiseDb: -25 }));

      // We can't wait for real cooldown, but we can test different event types
      // which have separate cooldowns
      const newVoiceEvent = tracker.processSnapshot(
        createSnapshot({
          noiseDb: -40,
          hasSpeech: true,
          environment: 'speech',
        })
      );

      // New voice has its own cooldown, so it should work
      expect(newVoiceEvent).not.toBeNull();
      expect(newVoiceEvent?.type).toBe('new_voice');
    });
  });

  describe('TTS Adjustments', () => {
    it('returns default adjustments with no events', () => {
      const tracker = getEnvironmentTracker(testSessionId);
      const adjustments = tracker.getTtsAdjustments();

      expect(adjustments.volumeBoost).toBe(0);
      expect(adjustments.clarityMode).toBe(false);
      expect(adjustments.speedMultiplier).toBe(1.0);
      expect(adjustments.extraPauseMs).toBe(0);
      expect(adjustments.reason).toBe('No recent events');
    });

    it('applies minor adjustments for minor events', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish baseline
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -40 }));
      }

      // Minor noise increase
      tracker.processSnapshot(createSnapshot({ noiseDb: -36 }));

      const adjustments = tracker.getTtsAdjustments();
      expect(adjustments.volumeBoost).toBe(ENVIRONMENT_CONFIG.TTS_ADJUSTMENTS.minor.volumeBoost);
      expect(adjustments.clarityMode).toBe(false);
    });

    it('applies moderate adjustments for moderate events', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish baseline
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -40 }));
      }

      // Moderate noise increase
      tracker.processSnapshot(createSnapshot({ noiseDb: -32 }));

      const adjustments = tracker.getTtsAdjustments();
      expect(adjustments.volumeBoost).toBe(ENVIRONMENT_CONFIG.TTS_ADJUSTMENTS.moderate.volumeBoost);
      expect(adjustments.clarityMode).toBe(true);
      expect(adjustments.speedMultiplier).toBe(0.95);
    });

    it('applies major adjustments for major events', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish baseline
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -40 }));
      }

      // Major noise increase
      tracker.processSnapshot(createSnapshot({ noiseDb: -25 }));

      const adjustments = tracker.getTtsAdjustments();
      expect(adjustments.volumeBoost).toBe(ENVIRONMENT_CONFIG.TTS_ADJUSTMENTS.major.volumeBoost);
      expect(adjustments.clarityMode).toBe(true);
      expect(adjustments.speedMultiplier).toBe(0.9);
      expect(adjustments.extraPauseMs).toBe(200);
    });
  });

  describe('Acknowledgments', () => {
    it('generates acknowledgment for major events', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish quiet baseline with speech
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ environment: 'quiet' }));
      }

      // New voice (major event)
      tracker.processSnapshot(
        createSnapshot({
          hasSpeech: true,
          environment: 'speech',
        })
      );

      expect(tracker.hasPendingAcknowledgment()).toBe(true);

      const ack = tracker.consumeAcknowledgment();
      expect(ack).not.toBeNull();
      expect(ack?.eventType).toBe('new_voice');
      expect(ack?.shouldPause).toBe(true);
      expect(ack?.phrase).toBeTruthy();
    });

    it('consumes acknowledgment only once', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish baseline
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ environment: 'quiet' }));
      }

      // Major event
      tracker.processSnapshot(
        createSnapshot({
          hasSpeech: true,
          environment: 'speech',
        })
      );

      // First consume
      const ack1 = tracker.consumeAcknowledgment();
      expect(ack1).not.toBeNull();

      // Second consume - should be null
      const ack2 = tracker.consumeAcknowledgment();
      expect(ack2).toBeNull();
    });

    it('does not generate acknowledgment for minor events', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish baseline
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -40 }));
      }

      // Minor noise increase
      tracker.processSnapshot(createSnapshot({ noiseDb: -36 }));

      expect(tracker.hasPendingAcknowledgment()).toBe(false);
    });

    it('includes acknowledgment for doorbell event', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish baseline
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot());
      }

      // Doorbell
      tracker.processSnapshot(
        createSnapshot({
          bandEnergies: {
            subBass: 0.1,
            bass: 0.1,
            lowMid: 0.1,
            mid: 0.2,
            highMid: 0.3,
            presence: 0.5,
            brilliance: 0.5,
          },
        })
      );

      const ack = tracker.consumeAcknowledgment();
      expect(ack).not.toBeNull();
      expect(ack?.eventType).toBe('doorbell');
      // Doorbell phrases may mention "door" or offer to wait
      expect(ack?.phrase.length).toBeGreaterThan(0);
    });
  });

  describe('State Reporting', () => {
    it('returns complete state', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Process some snapshots
      for (let i = 0; i < 5; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -35 }));
      }

      const state = tracker.getState();

      expect(state.sessionId).toBe(testSessionId);
      expect(state.baselineNoiseDb).toBeDefined();
      expect(state.currentNoiseDb).toBeDefined();
      expect(state.noiseChangeDb).toBeDefined();
      expect(state.isNoisy).toBeDefined();
      expect(state.environment).toBeDefined();
      expect(state.recentEvents).toBeInstanceOf(Array);
      expect(state.currentAdjustments).toBeDefined();
      expect(state.baselineSampleCount).toBeGreaterThan(0);
    });

    it('correctly reports isNoisy flag', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish baseline
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -40 }));
      }

      // Not noisy initially
      expect(tracker.getState().isNoisy).toBe(false);

      // Make it noisy (> moderate threshold)
      tracker.processSnapshot(createSnapshot({ noiseDb: -30 }));
      expect(tracker.getState().isNoisy).toBe(true);
    });

    it('tracks recent events', () => {
      const tracker = getEnvironmentTracker(testSessionId);

      // Establish baseline
      for (let i = 0; i < ENVIRONMENT_CONFIG.BASELINE_SAMPLES; i++) {
        tracker.processSnapshot(createSnapshot({ noiseDb: -40 }));
      }

      // Trigger event
      tracker.processSnapshot(createSnapshot({ noiseDb: -25 }));

      const state = tracker.getState();
      expect(state.recentEvents.length).toBeGreaterThan(0);
      expect(state.recentEvents[0].type).toBe('noise_increase');
    });
  });
});
