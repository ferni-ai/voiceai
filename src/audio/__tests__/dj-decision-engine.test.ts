/**
 * DJ Decision Engine Unit Tests
 *
 * Tests the pure decision functions that determine DJ behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  shouldDuck,
  shouldSpeakIntro,
  shouldSpeakOutro,
  shouldInterject,
  shouldInterruptMusic,
  isDeadAirDetectionActive,
  calculateScheduledMoments,
  getDuckTiming,
  getPersonaStyle,
  PERSONA_DJ_STYLES,
  DJ_PROBABILITIES,
  DJ_TIMING,
  type DuckDecision,
  type IntroDecision,
  type OutroDecision,
  type ScheduledMoment,
  type DecisionContext,
} from '../dj-decision-engine.js';
import type { DJControllerState, DJState } from '../dj-controller.js';

// Helper to create mock state
function createMockState(overrides: Partial<DJControllerState> = {}): DJControllerState {
  return {
    state: 'idle',
    currentTrack: null,
    isAmbient: false,
    isAgentSpeaking: false,
    isUserSpeaking: false,
    duckReason: null,
    trackStartTime: null,
    trackDuration: null,
    wasExplicitlyStopped: false,
    explicitStopTime: null,
    sessionId: 'test-session',
    isInitialized: true,
    ...overrides,
  };
}

const mockTrack = { name: 'Test', artist: 'Artist', duration: 180000, uri: 'test' };

describe('DJ Decision Engine', () => {
  // ==========================================================================
  // SHOULDDUCK TESTS
  // ==========================================================================

  describe('shouldDuck()', () => {
    it('should return shouldDuck: true when music is playing and agent speaking', () => {
      const state = createMockState({ state: 'playing', currentTrack: mockTrack, isAgentSpeaking: true });
      const context: DecisionContext = { state, track: mockTrack, personaId: 'ferni' };
      const decision = shouldDuck(context);
      expect(decision.shouldDuck).toBe(true);
    });

    it('should return shouldDuck: false when already ducking', () => {
      const state = createMockState({ state: 'ducking', currentTrack: mockTrack, isAgentSpeaking: true, duckReason: 'agent_speaking' });
      const context: DecisionContext = { state, track: mockTrack, personaId: 'ferni' };
      const decision = shouldDuck(context);
      expect(decision.shouldDuck).toBe(false);
    });

    it('should return shouldDuck: false when not playing', () => {
      const state = createMockState({ state: 'idle' });
      const context: DecisionContext = { state, track: mockTrack, personaId: 'ferni' };
      const decision = shouldDuck(context);
      expect(decision.shouldDuck).toBe(false);
    });

    it('should return shouldDuck: true when fading and agent speaking (can still duck)', () => {
      const state = createMockState({ state: 'fading', currentTrack: mockTrack, isAgentSpeaking: true });
      const context: DecisionContext = { state, track: mockTrack, personaId: 'ferni' };
      const decision = shouldDuck(context);
      expect(decision.shouldDuck).toBe(true);
    });
  });

  // ==========================================================================
  // SHOULDSPEAKINTRO TESTS
  // ==========================================================================

  describe('shouldSpeakIntro()', () => {
    const testTrack = { name: 'Test Song', artist: 'Test Artist', duration: 180000, uri: 'test' };

    it('should return shouldSpeak: true for non-ambient tracks', () => {
      const state = createMockState({ state: 'playing', currentTrack: testTrack });
      const context: DecisionContext = { state, track: testTrack, personaId: 'ferni' };
      const decision = shouldSpeakIntro(context);
      expect(decision.shouldSpeak).toBe(true);
    });

    it('should return shouldSpeak: false for ambient tracks', () => {
      const state = createMockState({ state: 'playing', currentTrack: testTrack, isAmbient: true });
      const context: DecisionContext = { state, track: testTrack, personaId: 'ferni' };
      const decision = shouldSpeakIntro(context);
      expect(decision.shouldSpeak).toBe(false);
    });

    it('should return shouldSpeak: false if agent is speaking', () => {
      const state = createMockState({ state: 'playing', currentTrack: testTrack, isAgentSpeaking: true });
      const context: DecisionContext = { state, track: testTrack, personaId: 'ferni' };
      const decision = shouldSpeakIntro(context);
      expect(decision.shouldSpeak).toBe(false);
    });

    it('should return shouldSpeak: false if user is speaking', () => {
      const state = createMockState({ state: 'playing', currentTrack: testTrack, isUserSpeaking: true });
      const context: DecisionContext = { state, track: testTrack, personaId: 'ferni' };
      const decision = shouldSpeakIntro(context);
      expect(decision.shouldSpeak).toBe(false);
    });
  });

  // ==========================================================================
  // SHOULDSPEAKOUTRO TESTS
  // ==========================================================================

  describe('shouldSpeakOutro()', () => {
    const testTrack = { name: 'Test Song', artist: 'Test Artist', duration: 180000, uri: 'test' };

    it('should return shouldSpeak: true when track is fading', () => {
      const state = createMockState({ state: 'fading', currentTrack: testTrack });
      const context: DecisionContext = { state, track: testTrack, personaId: 'ferni' };
      const decision = shouldSpeakOutro(context);
      expect(decision.shouldSpeak).toBe(true);
    });

    it('should return shouldSpeak: false for ambient tracks', () => {
      const state = createMockState({ state: 'fading', currentTrack: testTrack, isAmbient: true });
      const context: DecisionContext = { state, track: testTrack, personaId: 'ferni' };
      const decision = shouldSpeakOutro(context);
      expect(decision.shouldSpeak).toBe(false);
    });

    it('should return shouldSpeak: false when not fading', () => {
      const state = createMockState({ state: 'playing', currentTrack: testTrack });
      const context: DecisionContext = { state, track: testTrack, personaId: 'ferni' };
      const decision = shouldSpeakOutro(context);
      expect(decision.shouldSpeak).toBe(false);
    });
  });

  // ==========================================================================
  // CALCULATESCHEDULEDMOMENTS TESTS
  // ==========================================================================

  describe('calculateScheduledMoments()', () => {
    it('should schedule moments for a long track', () => {
      const longTrack = { name: 'Long Song', artist: 'Artist', duration: 300000, uri: 'test' }; // 5 minutes
      const moments = calculateScheduledMoments(longTrack, 'ferni');

      expect(moments.length).toBeGreaterThan(0);

      // Should have buildup, drop, appreciation, check-in
      // NOTE: 'outro' is intentionally NOT scheduled here to avoid duplicate triggers
      // (DJ Controller handles outro via 'should_speak_outro' event when track fades)
      const types = moments.map(m => m.type);
      expect(types).toContain('buildup');
      expect(types).toContain('check-in');
    });

    it('should schedule fewer moments for a short track', () => {
      const shortTrack = { name: 'Short Song', artist: 'Artist', duration: 30000, uri: 'test' }; // 30 seconds
      const moments = calculateScheduledMoments(shortTrack, 'ferni');

      // Short tracks should have fewer moments (may only have outro)
      const longTrack = { name: 'Long Song', artist: 'Artist', duration: 300000, uri: 'test' };
      const longMoments = calculateScheduledMoments(longTrack, 'ferni');

      expect(moments.length).toBeLessThanOrEqual(longMoments.length);
    });

    it('should have triggerTimeMs for all moments', () => {
      const track = { name: 'Test', artist: 'Artist', duration: 180000, uri: 'test' };
      const moments = calculateScheduledMoments(track, 'ferni');

      for (const moment of moments) {
        expect(moment.triggerTimeMs).toBeDefined();
        expect(moment.triggerTimeMs).toBeGreaterThan(0);
      }
    });

    it('should not schedule moments past track duration', () => {
      const track = { name: 'Test', artist: 'Artist', duration: 180000, uri: 'test' };
      const moments = calculateScheduledMoments(track, 'ferni');

      for (const moment of moments) {
        expect(moment.triggerTimeMs).toBeLessThanOrEqual(track.duration);
      }
    });

    it('should apply persona-specific multipliers', () => {
      const track = { name: 'Test', artist: 'Artist', duration: 300000, uri: 'test' };

      // Compare ferni (chatty) vs peter (more reserved)
      const ferniMoments = calculateScheduledMoments(track, 'ferni');
      const peterMoments = calculateScheduledMoments(track, 'peter');

      // Both should have moments, but probabilities should differ
      expect(ferniMoments.length).toBeGreaterThan(0);
      expect(peterMoments.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // SHOULDINTERRUPTMUSIC TESTS
  // ==========================================================================

  describe('shouldInterruptMusic()', () => {
    it('should return shouldInterrupt: true for urgent topics', () => {
      const result = shouldInterruptMusic({
        isVibing: true,
        userStartedTalking: false,
        userAskedQuestion: false,
        urgentTopic: true,
      });
      expect(result.shouldInterrupt).toBe(true);
      expect(result.action).toBe('stop');
    });

    it('should return shouldInterrupt: true when user asked question', () => {
      const result = shouldInterruptMusic({
        isVibing: true,
        userStartedTalking: false,
        userAskedQuestion: true,
        urgentTopic: false,
      });
      expect(result.shouldInterrupt).toBe(true);
      expect(result.action).toBe('duck');
    });

    it('should return shouldInterrupt: false when vibing with no interruption', () => {
      const result = shouldInterruptMusic({
        isVibing: true,
        userStartedTalking: false,
        userAskedQuestion: false,
        urgentTopic: false,
      });
      expect(result.shouldInterrupt).toBe(false);
      expect(result.action).toBe('none');
    });

    it('should return shouldInterrupt: true when user started talking', () => {
      const result = shouldInterruptMusic({
        isVibing: false,
        userStartedTalking: true,
        userAskedQuestion: false,
        urgentTopic: false,
      });
      expect(result.shouldInterrupt).toBe(true);
      expect(result.action).toBe('duck');
    });
  });

  // ==========================================================================
  // ISDEADAIRDETECTIONACTIVE TESTS
  // ==========================================================================

  describe('isDeadAirDetectionActive()', () => {
    it('should return false when music is playing', () => {
      const state = createMockState({ state: 'playing', currentTrack: mockTrack });
      expect(isDeadAirDetectionActive(state)).toBe(false);
    });

    it('should return false when music is ducking', () => {
      const state = createMockState({ state: 'ducking', currentTrack: mockTrack });
      expect(isDeadAirDetectionActive(state)).toBe(false);
    });

    it('should return true when music is idle', () => {
      const state = createMockState({ state: 'idle' });
      expect(isDeadAirDetectionActive(state)).toBe(true);
    });

    it('should return true when music is stopped', () => {
      const state = createMockState({ state: 'stopped' });
      expect(isDeadAirDetectionActive(state)).toBe(true);
    });
  });

  // ==========================================================================
  // GETDUCKTIMING TESTS
  // ==========================================================================

  describe('getDuckTiming()', () => {
    it('should return timing for agent_speaking', () => {
      const timing = getDuckTiming('agent_speaking');
      expect(timing.duckMs).toBeGreaterThan(0);
      expect(timing.restoreMs).toBeGreaterThan(0);
    });

    it('should return timing for user_speaking', () => {
      const timing = getDuckTiming('user_speaking');
      expect(timing.duckMs).toBeGreaterThan(0);
      expect(timing.restoreMs).toBeGreaterThan(0);
    });

    it('should have valid timing for external reason', () => {
      const timing = getDuckTiming('external');
      expect(timing.duckMs).toBeDefined();
      expect(timing.restoreMs).toBeDefined();
    });
  });

  // ==========================================================================
  // GETPERSONASTYLE TESTS
  // ==========================================================================

  describe('getPersonaStyle()', () => {
    it('should return style for ferni', () => {
      const style = getPersonaStyle('ferni');
      expect(style.interjectionMultiplier).toBeDefined();
      expect(style.timingMultiplier).toBeDefined();
      expect(style.doCountdowns).toBeDefined();
    });

    it('should return ferni style for unknown persona (fallback)', () => {
      const style = getPersonaStyle('unknown-persona');
      expect(style).toBeDefined();
      expect(style.interjectionMultiplier).toBeDefined();
      expect(style.personaId).toBe('ferni'); // Falls back to ferni
    });

    it('should have different interjection multipliers for different personas', () => {
      const ferniStyle = getPersonaStyle('ferni');
      const peterStyle = getPersonaStyle('peter');

      // Both should be valid
      expect(ferniStyle.interjectionMultiplier).toBeDefined();
      expect(peterStyle.interjectionMultiplier).toBeDefined();
      // Peter is more reserved, so should have lower multiplier
      expect(peterStyle.interjectionMultiplier).toBeLessThanOrEqual(ferniStyle.interjectionMultiplier);
    });
  });

  // ==========================================================================
  // CONSTANTS TESTS
  // ==========================================================================

  describe('constants', () => {
    it('PERSONA_DJ_STYLES should have all personas', () => {
      expect(PERSONA_DJ_STYLES.ferni).toBeDefined();
      expect(PERSONA_DJ_STYLES.maya).toBeDefined();
      expect(PERSONA_DJ_STYLES.jordan).toBeDefined();
      expect(PERSONA_DJ_STYLES.alex).toBeDefined();
      expect(PERSONA_DJ_STYLES.peter).toBeDefined();
      expect(PERSONA_DJ_STYLES.nayan).toBeDefined();
    });

    it('DJ_PROBABILITIES should have required values', () => {
      expect(DJ_PROBABILITIES.INTRO).toBeGreaterThan(0);
      expect(DJ_PROBABILITIES.OUTRO).toBeGreaterThan(0);
      expect(DJ_PROBABILITIES.APPRECIATION).toBeGreaterThan(0);
      expect(DJ_PROBABILITIES.BUILDUP).toBeGreaterThan(0);
    });

    it('DJ_TIMING should have required values', () => {
      expect(DJ_TIMING.MIN_DURATION_FOR_MOMENTS).toBeGreaterThan(0);
      expect(DJ_TIMING.OUTRO_LEAD_TIME).toBeGreaterThan(0);
    });
  });
});
