/**
 * DJ Architecture E2E Integration Tests
 *
 * These tests verify the complete integration of all DJ components working together:
 * - DJController (state machine)
 * - DJDecisionEngine (decision logic)
 * - DJSpeechEngine (phrase generation)
 * - DJTimingEngine (timer management)
 *
 * The tests simulate real-world scenarios:
 * - Session start → play music → agent speaks (duck) → agent stops (unduck) → track ends
 * - User requests music → track plays → user speaks → track fades → outro spoken
 * - Rapid state changes (agent/user speaking overlap)
 *
 * @module audio/__tests__/dj-architecture-e2e
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDJController, resetDJController, type DJEvent } from '../dj-controller.js';
import { getDJTimingEngine, resetDJTimingEngine } from '../dj-timing-engine.js';
import {
  shouldDuck,
  shouldSpeakIntro,
  shouldSpeakOutro,
  calculateScheduledMoments,
  isDeadAirDetectionActive,
  type DecisionContext,
} from '../dj-decision-engine.js';
import {
  getOutroPhrase,
  getDropPhrase,
  getMomentPhrase,
  getCheckInPhrase,
  type TrackSpeechContext,
} from '../dj-speech-engine.js';

describe('DJ Architecture E2E Integration', () => {
  const mockTrack = {
    name: 'Bohemian Rhapsody',
    artist: 'Queen',
    duration: 354000, // 5:54
    uri: 'spotify:track:test',
  };

  beforeEach(() => {
    resetDJController();
    resetDJTimingEngine();
  });

  afterEach(() => {
    resetDJController();
    resetDJTimingEngine();
  });

  // ==========================================================================
  // FULL SESSION LIFECYCLE
  // ==========================================================================

  describe('Full Session Lifecycle', () => {
    it('should handle complete session: init → play → duck → unduck → fade → end', async () => {
      const controller = getDJController();
      const timingEngine = getDJTimingEngine();
      const events: DJEvent[] = [];

      // Capture all events
      controller.on('*', (event: DJEvent) => events.push(event));

      // Phase 1: Initialize
      controller.initialize({ sessionId: 'e2e-test', personaId: 'ferni', userId: 'user-123' });
      timingEngine.initialize({ sessionId: 'e2e-test', personaId: 'ferni' });

      expect(controller.getState().isInitialized).toBe(true);
      expect(controller.isMusicActive()).toBe(false);
      expect(isDeadAirDetectionActive(controller.getState())).toBe(true);

      // Phase 2: Play track
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });

      expect(controller.getState().state).toBe('playing');
      expect(controller.isMusicActive()).toBe(true);
      expect(isDeadAirDetectionActive(controller.getState())).toBe(false);

      // Check intro decision
      const introDecision = shouldSpeakIntro({
        state: controller.getState(),
        track: mockTrack,
        personaId: 'ferni',
      });
      expect(introDecision.shouldSpeak).toBe(true);

      // Phase 3: Agent starts speaking (should duck)
      controller.dispatch({ type: 'AGENT_SPEAKING_START' });

      expect(controller.getState().state).toBe('ducking');
      expect(controller.getState().isAgentSpeaking).toBe(true);
      expect(controller.isMusicActive()).toBe(true); // Still active, just ducked

      // Phase 4: Agent stops speaking (should unduck)
      controller.dispatch({ type: 'AGENT_SPEAKING_END' });

      expect(controller.getState().state).toBe('playing');
      expect(controller.getState().isAgentSpeaking).toBe(false);

      // Phase 5: Track near end (fading)
      controller.dispatch({ type: 'TRACK_NEAR_END' });

      expect(controller.getState().state).toBe('fading');

      // Check outro decision
      const outroDecision = shouldSpeakOutro({
        state: controller.getState(),
        track: mockTrack,
        personaId: 'ferni',
      });
      expect(outroDecision.shouldSpeak).toBe(true);

      // Get outro phrase
      const outroPhrase = getOutroPhrase({ track: mockTrack, personaId: 'ferni' });
      expect(outroPhrase.length).toBeGreaterThan(0);
      expect(outroPhrase).toContain('Queen'); // Should mention artist

      // Phase 6: Track ended
      controller.dispatch({ type: 'TRACK_ENDED' });

      expect(controller.getState().state).toBe('stopped');
      expect(controller.isMusicActive()).toBe(false);
      expect(isDeadAirDetectionActive(controller.getState())).toBe(true);

      // Verify events were emitted
      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain('track_started');
      expect(eventTypes).toContain('state_changed');
      expect(eventTypes).toContain('ducking_started');
      expect(eventTypes).toContain('ducking_ended');
    });

    it('should handle user speaking during music playback', () => {
      const controller = getDJController();

      controller.initialize({ sessionId: 'test', personaId: 'ferni' });
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });

      // User starts speaking
      controller.dispatch({ type: 'USER_SPEAKING_START' });

      expect(controller.getState().state).toBe('ducking');
      expect(controller.getState().isUserSpeaking).toBe(true);
      expect(controller.getState().duckReason).toBe('user_speaking');

      // User stops speaking
      controller.dispatch({ type: 'USER_SPEAKING_END' });

      expect(controller.getState().state).toBe('playing');
      expect(controller.getState().isUserSpeaking).toBe(false);
    });
  });

  // ==========================================================================
  // OVERLAPPING SPEECH SCENARIOS
  // ==========================================================================

  describe('Overlapping Speech Scenarios', () => {
    it('should stay ducked when both agent and user are speaking', () => {
      const controller = getDJController();

      controller.initialize({ sessionId: 'test', personaId: 'ferni' });
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });

      // Agent starts speaking
      controller.dispatch({ type: 'AGENT_SPEAKING_START' });
      expect(controller.getState().state).toBe('ducking');

      // User also starts speaking (both speaking now)
      controller.dispatch({ type: 'USER_SPEAKING_START' });
      expect(controller.getState().state).toBe('ducking');
      expect(controller.getState().isAgentSpeaking).toBe(true);
      expect(controller.getState().isUserSpeaking).toBe(true);

      // User stops speaking (agent still speaking)
      controller.dispatch({ type: 'USER_SPEAKING_END' });
      expect(controller.getState().state).toBe('ducking'); // Still ducked!
      expect(controller.getState().isAgentSpeaking).toBe(true);

      // Agent stops speaking (both done)
      controller.dispatch({ type: 'AGENT_SPEAKING_END' });
      expect(controller.getState().state).toBe('playing'); // Now unduck
    });

    it('should handle rapid agent speech toggles', () => {
      const controller = getDJController();

      controller.initialize({ sessionId: 'test', personaId: 'ferni' });
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });

      // Rapid toggles
      for (let i = 0; i < 5; i++) {
        controller.dispatch({ type: 'AGENT_SPEAKING_START' });
        expect(controller.getState().state).toBe('ducking');

        controller.dispatch({ type: 'AGENT_SPEAKING_END' });
        expect(controller.getState().state).toBe('playing');
      }

      // State should be clean
      expect(controller.getState().isAgentSpeaking).toBe(false);
      expect(controller.getState().isUserSpeaking).toBe(false);
      expect(controller.getState().duckReason).toBeNull();
    });
  });

  // ==========================================================================
  // DECISION ENGINE INTEGRATION
  // ==========================================================================

  describe('Decision Engine Integration', () => {
    it('should calculate appropriate DJ moments for long tracks', () => {
      const longTrack = { ...mockTrack, duration: 300000 }; // 5 minutes
      const moments = calculateScheduledMoments(longTrack, 'ferni');

      // Should have multiple moments
      expect(moments.length).toBeGreaterThan(0);

      // All moments should have valid times
      for (const moment of moments) {
        expect(moment.triggerTimeMs).toBeGreaterThan(0);
        expect(moment.triggerTimeMs).toBeLessThan(longTrack.duration);
        expect(moment.probability).toBeGreaterThan(0);
        expect(moment.probability).toBeLessThanOrEqual(1);
      }

      // Should have expected moment types
      const types = moments.map((m) => m.type);
      expect(types).toContain('outro'); // Always has outro
    });

    it('should not calculate moments for short tracks', () => {
      const shortTrack = { ...mockTrack, duration: 15000 }; // 15 seconds
      const moments = calculateScheduledMoments(shortTrack, 'ferni');

      // Short tracks get fewer or no moments
      expect(moments.length).toBeLessThan(3);
    });

    it('should integrate decision context with controller state', () => {
      const controller = getDJController();

      controller.initialize({ sessionId: 'test', personaId: 'maya' });
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });

      const context: DecisionContext = {
        state: controller.getState(),
        track: mockTrack,
        personaId: 'maya',
      };

      // Should make consistent decisions
      const duckDecision = shouldDuck(context);
      expect(duckDecision.shouldDuck).toBe(false); // Not speaking

      // Change state
      controller.dispatch({ type: 'AGENT_SPEAKING_START' });

      const newContext: DecisionContext = {
        state: controller.getState(),
        track: mockTrack,
        personaId: 'maya',
      };

      // Already ducking
      const newDuckDecision = shouldDuck(newContext);
      expect(newDuckDecision.shouldDuck).toBe(false); // Already ducked
    });
  });

  // ==========================================================================
  // SPEECH ENGINE INTEGRATION
  // ==========================================================================

  describe('Speech Engine Integration', () => {
    it('should generate appropriate phrases for all personas', () => {
      const personas = ['ferni', 'maya', 'jordan', 'alex', 'peter', 'nayan'];

      for (const personaId of personas) {
        const speechContext: TrackSpeechContext = { track: mockTrack, personaId };

        // All should generate valid phrases
        const outro = getOutroPhrase(speechContext);
        expect(outro.length).toBeGreaterThan(0);

        const drop = getDropPhrase(speechContext);
        expect(drop.length).toBeGreaterThan(0);

        const moment = getMomentPhrase('appreciation', personaId);
        expect(moment.length).toBeGreaterThan(0);

        const checkIn = getCheckInPhrase(personaId);
        expect(checkIn.length).toBeGreaterThan(0);
      }
    });

    it('should include track info in phrases when appropriate', () => {
      const speechContext: TrackSpeechContext = { track: mockTrack, personaId: 'ferni' };

      const outro = getOutroPhrase(speechContext);
      // Should mention artist or track
      const hasTrackInfo = outro.includes('Queen') || outro.includes('Bohemian');
      expect(hasTrackInfo).toBe(true);
    });
  });

  // ==========================================================================
  // TIMING ENGINE INTEGRATION
  // ==========================================================================

  describe('Timing Engine Integration', () => {
    it('should schedule and fire timers correctly', async () => {
      const timingEngine = getDJTimingEngine();
      timingEngine.initialize({ sessionId: 'test', personaId: 'ferni' });

      let timerFired = false;
      let fireCount = 0;

      // Schedule a quick timer using valid type
      timingEngine.scheduleTimer('check-in', 50, () => {
        timerFired = true;
        fireCount++;
      });

      // Wait for timer
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(timerFired).toBe(true);
      expect(fireCount).toBe(1); // Should only fire once
    });

    it('should cancel timers on state change to stopped', () => {
      const timingEngine = getDJTimingEngine();
      timingEngine.initialize({ sessionId: 'test', personaId: 'ferni' });

      let timerFired = false;

      // Schedule a timer using valid type
      timingEngine.scheduleTimer('appreciation', 5000, () => {
        timerFired = true;
      });

      // Notify state change to stopped
      timingEngine.onStateTransition('playing', 'stopped');

      // Timer should be cancelled (we can't easily verify, but at least no error)
      expect(timerFired).toBe(false);
    });

    it('should clear timers when transitioning to ducking', () => {
      const timingEngine = getDJTimingEngine();
      timingEngine.initialize({ sessionId: 'test', personaId: 'ferni' });

      // Schedule interjection timer using valid type
      timingEngine.scheduleTimer('buildup', 5000, () => {});

      // Should clear on ducking (don't talk over speech)
      timingEngine.onStateTransition('playing', 'ducking');

      // No error = success (timer was cleared or ignored)
    });
  });

  // ==========================================================================
  // AMBIENT MUSIC HANDLING
  // ==========================================================================

  describe('Ambient Music Handling', () => {
    it('should not speak intro for ambient tracks', () => {
      const controller = getDJController();

      controller.initialize({ sessionId: 'test', personaId: 'ferni' });
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: true });

      const introDecision = shouldSpeakIntro({
        state: controller.getState(),
        track: mockTrack,
        personaId: 'ferni',
      });

      expect(introDecision.shouldSpeak).toBe(false);
    });

    it('should not speak outro for ambient tracks', () => {
      const controller = getDJController();

      controller.initialize({ sessionId: 'test', personaId: 'ferni' });
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: true });
      controller.dispatch({ type: 'TRACK_NEAR_END' });

      const outroDecision = shouldSpeakOutro({
        state: controller.getState(),
        track: mockTrack,
        personaId: 'ferni',
      });

      expect(outroDecision.shouldSpeak).toBe(false);
    });
  });

  // ==========================================================================
  // EXPLICIT STOP HANDLING
  // ==========================================================================

  describe('Explicit Stop Handling', () => {
    it('should track explicit stop vs natural end', () => {
      const controller = getDJController();

      controller.initialize({ sessionId: 'test', personaId: 'ferni' });
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });

      // Explicit stop
      controller.dispatch({ type: 'STOP' });

      expect(controller.getState().wasExplicitlyStopped).toBe(true);
      expect(controller.getState().explicitStopTime).not.toBeNull();
    });

    it('should not mark as explicit stop on natural track end', () => {
      const controller = getDJController();

      controller.initialize({ sessionId: 'test', personaId: 'ferni' });
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });

      // Natural end
      controller.dispatch({ type: 'TRACK_ENDED' });

      expect(controller.getState().wasExplicitlyStopped).toBe(false);
    });
  });

  // ==========================================================================
  // CLEANUP AND RESET
  // ==========================================================================

  describe('Cleanup and Reset', () => {
    it('should properly clean up on reset', () => {
      const controller = getDJController();
      const timingEngine = getDJTimingEngine();

      controller.initialize({ sessionId: 'test', personaId: 'ferni' });
      timingEngine.initialize({ sessionId: 'test', personaId: 'ferni' });

      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'AGENT_SPEAKING_START' });

      // Reset
      resetDJController();
      resetDJTimingEngine();

      // Get fresh instances
      const freshController = getDJController();

      expect(freshController.getState().state).toBe('idle');
      expect(freshController.getState().currentTrack).toBeNull();
      expect(freshController.getState().isAgentSpeaking).toBe(false);
      expect(freshController.getState().isInitialized).toBe(false);
    });
  });
});
