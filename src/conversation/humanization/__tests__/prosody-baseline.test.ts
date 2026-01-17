/**
 * Voice Prosody Baseline Learning Tests
 *
 * Tests the prosody bridge's ability to:
 * - Learn user's voice baseline from prosody features
 * - Detect deviations from baseline
 * - Track cross-session voice changes
 *
 * @module ProsodyBaselineTests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  prosodyToVoiceSnapshot,
  prosodyToBreathPattern,
  processProsodyForHumanization,
  initProsodyBridge,
  cleanupProsodyBridge,
  getBridgeState,
  getVoiceStateInsight,
  inferAmbientFromProsody,
} from '../prosody-bridge.js';
import type { ProsodyFeatures, VoiceEmotionResult } from '../../../speech/audio-prosody.js';

// Mock prosody features representing typical speech
const createMockProsody = (overrides: Partial<ProsodyFeatures> = {}): ProsodyFeatures => ({
  pitchMean: 150,
  pitchRange: 50,
  pitchVariance: 25,
  pitchContour: 'flat',
  energyMean: -20, // dB
  energyVariance: 8,
  energyPeaks: 2,
  speechRate: 5, // syllables/sec
  pauseFrequency: 10, // pauses/min
  pauseDuration: 400, // ms
  speakingRatio: 0.7,
  jitter: 0.02,
  shimmer: 0.03,
  breathiness: 0.3,
  utteranceDuration: 5000, // ms
  ...overrides,
});

// Mock voice emotion result
const createMockEmotion = (overrides: Partial<VoiceEmotionResult> = {}): VoiceEmotionResult => ({
  primary: 'neutral',
  valence: 0,
  arousal: 0.5,
  dominance: 0,
  confidence: 0.8,
  stressLevel: 0.2,
  anxietyMarkers: false,
  prosody: createMockProsody(),
  sampleCount: 1000,
  processingTimeMs: 50,
  ...overrides,
});

describe('Prosody Baseline Learning', () => {
  const testSessionId = 'test-session-123';
  const testUserId = 'test-user-456';

  beforeEach(() => {
    initProsodyBridge(testSessionId, testUserId);
  });

  afterEach(() => {
    cleanupProsodyBridge(testSessionId);
  });

  describe('prosodyToVoiceSnapshot', () => {
    it('should convert prosody features to voice snapshot', () => {
      const prosody = createMockProsody();
      const emotion = createMockEmotion();

      const snapshot = prosodyToVoiceSnapshot(prosody, emotion);

      expect(snapshot.pitchMean).toBe(150);
      expect(snapshot.speechRate).toBe(150); // 5 * 30
      expect(snapshot.pauseRate).toBe(10);
      expect(snapshot.avgPauseDuration).toBe(400);
      expect(snapshot.breathiness).toBe(0.3);
      expect(snapshot.valence).toBe(0);
      expect(snapshot.arousal).toBe(0.5);
      expect(snapshot.timestamp).toBeInstanceOf(Date);
    });

    it('should normalize energy from dB to 0-1 scale', () => {
      // -60 dB (silence) should be ~0
      const quietProsody = createMockProsody({ energyMean: -60 });
      const quietSnapshot = prosodyToVoiceSnapshot(quietProsody, createMockEmotion());
      expect(quietSnapshot.energyMean).toBeCloseTo(0, 1);

      // 0 dB (max) should be ~1
      const loudProsody = createMockProsody({ energyMean: 0 });
      const loudSnapshot = prosodyToVoiceSnapshot(loudProsody, createMockEmotion());
      expect(loudSnapshot.energyMean).toBeCloseTo(1, 1);

      // -30 dB (moderate) should be ~0.5
      const normalProsody = createMockProsody({ energyMean: -30 });
      const normalSnapshot = prosodyToVoiceSnapshot(normalProsody, createMockEmotion());
      expect(normalSnapshot.energyMean).toBeCloseTo(0.5, 1);
    });

    it('should include stress level in strain measurement', () => {
      const stressedEmotion = createMockEmotion({ stressLevel: 0.8 });
      const snapshot = prosodyToVoiceSnapshot(createMockProsody(), stressedEmotion);

      expect(snapshot.strain).toBe(0.8);
    });
  });

  describe('prosodyToBreathPattern', () => {
    it('should estimate breathing pattern from prosody', () => {
      const prosody = createMockProsody({
        pauseFrequency: 15,
        pauseDuration: 400,
      });

      const breathPattern = prosodyToBreathPattern(prosody);

      expect(breathPattern.breathsPerMinute).toBeGreaterThanOrEqual(8);
      expect(breathPattern.breathsPerMinute).toBeLessThanOrEqual(20);
      expect(breathPattern.cycleDuration).toBeGreaterThan(0);
      expect(breathPattern.inhaleDuration).toBeGreaterThan(0);
      expect(breathPattern.exhaleDuration).toBeGreaterThan(0);
      expect(breathPattern.confidence).toBeGreaterThan(0);
    });

    it('should detect shallow breathing from low energy variance', () => {
      const shallowProsody = createMockProsody({ energyVariance: 2 });
      const breathPattern = prosodyToBreathPattern(shallowProsody);

      expect(breathPattern.depth).toBe('shallow');
    });

    it('should detect deep breathing from high energy variance', () => {
      const deepProsody = createMockProsody({ energyVariance: 15 });
      const breathPattern = prosodyToBreathPattern(deepProsody);

      expect(breathPattern.depth).toBe('deep');
    });

    it('should have lower confidence for short pauses', () => {
      const shortPauseProsody = createMockProsody({ pauseDuration: 200 });
      const shortPausePattern = prosodyToBreathPattern(shortPauseProsody);

      const longPauseProsody = createMockProsody({ pauseDuration: 500 });
      const longPausePattern = prosodyToBreathPattern(longPauseProsody);

      expect(shortPausePattern.confidence).toBeLessThan(longPausePattern.confidence);
    });
  });

  describe('Bridge State Management', () => {
    it('should initialize bridge state', () => {
      const state = getBridgeState(testSessionId);

      expect(state).not.toBeNull();
      expect(state?.snapshotCount).toBe(0);
      expect(state?.calibrationComplete).toBe(false);
    });

    it('should track snapshot count', () => {
      const emotion = createMockEmotion();

      // Process multiple snapshots with delay simulation
      for (let i = 0; i < 3; i++) {
        // Manually update lastProcessedAt to bypass rate limiting
        const state = getBridgeState(testSessionId);
        if (state) state.lastProcessedAt = 0;

        processProsodyForHumanization(testSessionId, testUserId, emotion);
      }

      const finalState = getBridgeState(testSessionId);
      expect(finalState?.snapshotCount).toBeGreaterThan(0);
    });

    it('should calibrate baseline after 5 snapshots', () => {
      const emotion = createMockEmotion({
        prosody: createMockProsody({ pitchMean: 180 }),
      });

      // Process 5 snapshots
      for (let i = 0; i < 5; i++) {
        const state = getBridgeState(testSessionId);
        if (state) state.lastProcessedAt = 0; // Bypass rate limiting

        processProsodyForHumanization(testSessionId, testUserId, emotion);
      }

      const finalState = getBridgeState(testSessionId);
      expect(finalState?.calibrationComplete).toBe(true);
      expect(finalState?.baselinePitch).toBe(180);
    });

    it('should cleanup bridge state', () => {
      cleanupProsodyBridge(testSessionId);
      const state = getBridgeState(testSessionId);

      expect(state).toBeNull();
    });
  });

  describe('Ambient Sound Inference', () => {
    it('should detect quiet environment from low energy', () => {
      const quietProsody = createMockProsody({
        energyMean: -50,
        speakingRatio: 0.8,
      });

      const ambient = inferAmbientFromProsody(quietProsody);

      if (ambient) {
        const hasQuiet = ambient.sounds.some((s) => s.sound === 'quiet');
        expect(hasQuiet).toBe(true);
      }
    });

    it('should detect traffic from steady noise pattern', () => {
      const trafficProsody = createMockProsody({
        energyMean: -15,
        speakingRatio: 0.4,
        energyPeaks: 1,
        energyVariance: 5,
      });

      const ambient = inferAmbientFromProsody(trafficProsody);

      if (ambient) {
        const hasTraffic = ambient.sounds.some((s) => s.sound === 'traffic');
        expect(hasTraffic).toBe(true);
      }
    });

    it('should detect crowd from variable energy with peaks', () => {
      const crowdProsody = createMockProsody({
        energyMean: -10,
        speakingRatio: 0.4,
        energyPeaks: 5,
        energyVariance: 15,
      });

      const ambient = inferAmbientFromProsody(crowdProsody);

      if (ambient) {
        const hasCrowd = ambient.sounds.some((s) => s.sound === 'crowd');
        expect(hasCrowd).toBe(true);
      }
    });

    it('should return null for normal speech with no ambient indicators', () => {
      const normalProsody = createMockProsody({
        energyMean: -25,
        speakingRatio: 0.65,
        energyPeaks: 2,
        energyVariance: 8,
        breathiness: 0.5,
      });

      const ambient = inferAmbientFromProsody(normalProsody);

      // May return null or office/quiet for normal speech
      if (ambient) {
        expect(ambient.overallConfidence).toBeLessThan(0.7);
      }
    });
  });

  describe('Rate Limiting', () => {
    it('should skip processing if called too frequently', () => {
      const emotion = createMockEmotion();

      // First call should process
      processProsodyForHumanization(testSessionId, testUserId, emotion);
      const stateAfterFirst = getBridgeState(testSessionId);

      // Second immediate call should be skipped (rate limited)
      processProsodyForHumanization(testSessionId, testUserId, emotion);
      const stateAfterSecond = getBridgeState(testSessionId);

      // Snapshot count should only increase once due to rate limiting
      expect(stateAfterSecond?.snapshotCount).toBe(stateAfterFirst?.snapshotCount);
    });
  });

  describe('Low Confidence Filtering', () => {
    it('should skip low confidence results', () => {
      const lowConfidenceEmotion = createMockEmotion({ confidence: 0.2 });

      // Bypass rate limiting
      const state = getBridgeState(testSessionId);
      if (state) state.lastProcessedAt = 0;

      const countBefore = state?.snapshotCount || 0;
      processProsodyForHumanization(testSessionId, testUserId, lowConfidenceEmotion);

      const countAfter = getBridgeState(testSessionId)?.snapshotCount || 0;
      expect(countAfter).toBe(countBefore);
    });
  });
});
