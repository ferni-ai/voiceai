/**
 * DJ Controller Unit Tests
 *
 * Tests the state machine transitions and API of the DJController.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DJController, getDJController, resetDJController, type DJState, type DJControllerState } from '../dj-controller.js';

describe('DJController', () => {
  let controller: DJController;

  beforeEach(() => {
    resetDJController();
    controller = getDJController();
    controller.initialize({ sessionId: 'test-session', personaId: 'ferni', userId: 'test-user' });
  });

  // ==========================================================================
  // INITIALIZATION TESTS
  // ==========================================================================

  describe('initialization', () => {
    it('should start in idle state', () => {
      resetDJController();
      const fresh = getDJController();
      const state = fresh.getState();
      expect(state.state).toBe('idle');
      expect(state.currentTrack).toBeNull();
      expect(state.isInitialized).toBe(false);
    });

    it('should be initialized after calling initialize()', () => {
      const state = controller.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.sessionId).toBe('test-session');
    });

    it('should reset state on session change', () => {
      const mockTrack = { name: 'Test', artist: 'Artist', duration: 180000, uri: 'test' };
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });

      // New session should reset
      controller.initialize({ sessionId: 'new-session', personaId: 'ferni', userId: 'test-user' });
      const state = controller.getState();
      expect(state.state).toBe('idle');
      expect(state.currentTrack).toBeNull();
    });
  });

  // ==========================================================================
  // STATE TRANSITION TESTS
  // ==========================================================================

  describe('state transitions', () => {
    const mockTrack = { name: 'Test Song', artist: 'Test Artist', duration: 180000, uri: 'spotify:track:test' };

    it('should transition from idle to playing on PLAY_TRACK', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });

      const state = controller.getState();
      expect(state.state).toBe('playing');
      expect(state.currentTrack?.name).toBe('Test Song');
      expect(state.isAmbient).toBe(false);
    });

    it('should transition from playing to ducking on DUCK', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'DUCK', reason: 'agent_speaking' });

      const state = controller.getState();
      expect(state.state).toBe('ducking');
      expect(state.duckReason).toBe('agent_speaking');
    });

    it('should transition from ducking to playing on UNDUCK', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'DUCK', reason: 'agent_speaking' });
      controller.dispatch({ type: 'UNDUCK' });

      const state = controller.getState();
      expect(state.state).toBe('playing');
      expect(state.duckReason).toBeNull();
    });

    it('should transition from playing to fading on TRACK_NEAR_END', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'TRACK_NEAR_END' });

      const state = controller.getState();
      expect(state.state).toBe('fading');
    });

    it('should transition to stopped on TRACK_ENDED', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'TRACK_ENDED' });

      const state = controller.getState();
      expect(state.state).toBe('stopped');
      expect(state.wasExplicitlyStopped).toBe(false);
    });

    it('should mark explicit stop on STOP command', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'STOP' });

      const state = controller.getState();
      expect(state.state).toBe('stopped');
      expect(state.wasExplicitlyStopped).toBe(true);
    });

    it('should transition from playing to paused on PAUSE', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'PAUSE' });

      const state = controller.getState();
      expect(state.state).toBe('paused');
    });

    it('should transition from paused to playing on RESUME', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'PAUSE' });
      controller.dispatch({ type: 'RESUME' });

      const state = controller.getState();
      expect(state.state).toBe('playing');
    });
  });

  // ==========================================================================
  // AGENT/USER SPEAKING TESTS
  // ==========================================================================

  describe('agent/user speaking integration', () => {
    const mockTrack = { name: 'Test', artist: 'Artist', duration: 180000, uri: 'test' };

    it('should duck when agent starts speaking', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'AGENT_SPEAKING_START' });

      const state = controller.getState();
      expect(state.state).toBe('ducking');
      expect(state.isAgentSpeaking).toBe(true);
      expect(state.duckReason).toBe('agent_speaking');
    });

    it('should unduck when agent stops speaking', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'AGENT_SPEAKING_START' });
      controller.dispatch({ type: 'AGENT_SPEAKING_END' });

      const state = controller.getState();
      expect(state.state).toBe('playing');
      expect(state.isAgentSpeaking).toBe(false);
    });

    it('should duck when user starts speaking', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'USER_SPEAKING_START' });

      const state = controller.getState();
      expect(state.state).toBe('ducking');
      expect(state.isUserSpeaking).toBe(true);
      expect(state.duckReason).toBe('user_speaking');
    });

    it('should stay ducked if both agent and user are speaking, then user stops', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'AGENT_SPEAKING_START' });
      controller.dispatch({ type: 'USER_SPEAKING_START' });
      controller.dispatch({ type: 'USER_SPEAKING_END' });

      const state = controller.getState();
      expect(state.state).toBe('ducking'); // Still ducked because agent is speaking
      expect(state.isAgentSpeaking).toBe(true);
      expect(state.isUserSpeaking).toBe(false);
    });

    it('should unduck only when both agent and user stop speaking', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'AGENT_SPEAKING_START' });
      controller.dispatch({ type: 'USER_SPEAKING_START' });
      controller.dispatch({ type: 'USER_SPEAKING_END' });
      controller.dispatch({ type: 'AGENT_SPEAKING_END' });

      const state = controller.getState();
      expect(state.state).toBe('playing');
    });
  });

  // ==========================================================================
  // HELPER METHOD TESTS
  // ==========================================================================

  describe('helper methods', () => {
    const mockTrack = { name: 'Test', artist: 'Artist', duration: 180000, uri: 'test' };

    it('isMusicActive() returns false when idle', () => {
      expect(controller.isMusicActive()).toBe(false);
    });

    it('isMusicActive() returns true when playing', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      expect(controller.isMusicActive()).toBe(true);
    });

    it('isMusicActive() returns true when ducking', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'DUCK', reason: 'agent_speaking' });
      expect(controller.isMusicActive()).toBe(true);
    });

    it('isMusicActive() returns true when fading', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'TRACK_NEAR_END' });
      expect(controller.isMusicActive()).toBe(true);
    });

    it('isMusicActive() returns false when stopped', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'STOP' });
      expect(controller.isMusicActive()).toBe(false);
    });
  });

  // ==========================================================================
  // EVENT EMISSION TESTS
  // ==========================================================================

  describe('events', () => {
    const mockTrack = { name: 'Test', artist: 'Artist', duration: 180000, uri: 'test' };

    it('should emit state_changed event on state transition', () => {
      const handler = vi.fn();
      controller.on('state_changed', handler);

      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'idle',
          to: 'playing',
        })
      );
    });

    it('should emit track_started event when track begins', () => {
      const handler = vi.fn();
      controller.on('track_started', handler);

      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          track: mockTrack,
          isAmbient: false,
        })
      );
    });

    it('should emit track_ended event when track ends', () => {
      const handler = vi.fn();
      controller.on('track_ended', handler);

      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'TRACK_ENDED' });

      expect(handler).toHaveBeenCalled();
    });

    it('should emit ducking_started event when music ducks', () => {
      const handler = vi.fn();
      controller.on('ducking_started', handler);

      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'DUCK', reason: 'agent_speaking' });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ducking_started',
          reason: 'agent_speaking',
        })
      );
    });

    it('should emit ducking_ended event when music unducks', () => {
      const handler = vi.fn();
      controller.on('ducking_ended', handler);

      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'DUCK', reason: 'agent_speaking' });
      controller.dispatch({ type: 'UNDUCK' });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ducking_ended',
        })
      );
    });
  });

  // ==========================================================================
  // EDGE CASE TESTS
  // ==========================================================================

  describe('edge cases', () => {
    const mockTrack = { name: 'Test', artist: 'Artist', duration: 180000, uri: 'test' };

    it('should ignore DUCK when not playing', () => {
      controller.dispatch({ type: 'DUCK', reason: 'agent_speaking' });

      const state = controller.getState();
      expect(state.state).toBe('idle'); // Should stay idle
    });

    it('should ignore UNDUCK when not ducking', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'UNDUCK' });

      const state = controller.getState();
      expect(state.state).toBe('playing'); // Should stay playing
    });

    it('should update duck reason when already ducking', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'DUCK', reason: 'agent_speaking' });
      controller.dispatch({ type: 'DUCK', reason: 'user_speaking' });

      const state = controller.getState();
      expect(state.state).toBe('ducking');
      expect(state.duckReason).toBe('user_speaking');
    });

    it('should handle reset gracefully', () => {
      controller.dispatch({ type: 'PLAY_TRACK', track: mockTrack, isAmbient: false });
      controller.dispatch({ type: 'DUCK', reason: 'agent_speaking' });

      controller.reset();

      const state = controller.getState();
      expect(state.state).toBe('idle');
      expect(state.currentTrack).toBeNull();
      expect(state.isAgentSpeaking).toBe(false);
      expect(state.isUserSpeaking).toBe(false);
    });
  });
});
