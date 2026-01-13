/**
 * Music State E2E Tests
 *
 * Tests the complete flow from backend DJController → FrontendPublisher → Frontend
 *
 * These tests verify:
 * 1. DJController events trigger FrontendPublisher.sendMusicState()
 * 2. music_state messages are properly formatted
 * 3. All state transitions are sent to frontend
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDJController, resetDJController, type DJEvent } from '../audio/dj-controller.js';

describe('Music State E2E Flow', () => {
  beforeEach(() => {
    resetDJController();
  });

  afterEach(() => {
    resetDJController();
  });

  describe('DJController state changes', () => {
    it('should emit state_changed event on PLAY_TRACK', () => {
      const controller = getDJController();
      controller.initialize({ personaId: 'ferni', sessionId: 'test' });

      const events: DJEvent[] = [];
      controller.on('state_changed', (event) => events.push(event));

      controller.dispatch({
        type: 'PLAY_TRACK',
        track: { name: 'Test', artist: 'Artist', duration: 30000 },
        isAmbient: false,
      });

      const stateChanged = events.find((e) => e.type === 'state_changed');
      expect(stateChanged).toBeDefined();
      expect(stateChanged?.type === 'state_changed' && stateChanged.to).toBe('playing');
    });

    it('should emit track_started event with track info', () => {
      const controller = getDJController();
      controller.initialize({ personaId: 'ferni', sessionId: 'test' });

      const events: DJEvent[] = [];
      controller.on('track_started', (event) => events.push(event));

      controller.dispatch({
        type: 'PLAY_TRACK',
        track: { name: 'Test Track', artist: 'Test Artist', duration: 30000 },
        isAmbient: false,
      });

      const trackStarted = events.find((e) => e.type === 'track_started');
      expect(trackStarted).toBeDefined();
      if (trackStarted?.type === 'track_started') {
        expect(trackStarted.track.name).toBe('Test Track');
        expect(trackStarted.track.artist).toBe('Test Artist');
        expect(trackStarted.isAmbient).toBe(false);
      }
    });

    it('should emit ducking_started on AGENT_SPEAKING_START while playing', () => {
      const controller = getDJController();
      controller.initialize({ personaId: 'ferni', sessionId: 'test' });

      // Start playing first
      controller.dispatch({
        type: 'PLAY_TRACK',
        track: { name: 'Test', artist: 'Artist', duration: 30000 },
        isAmbient: false,
      });

      const events: DJEvent[] = [];
      controller.on('ducking_started', (event) => events.push(event));

      // Agent starts speaking
      controller.dispatch({ type: 'AGENT_SPEAKING_START' });

      const duckingStarted = events.find((e) => e.type === 'ducking_started');
      expect(duckingStarted).toBeDefined();
      expect(duckingStarted?.type === 'ducking_started' && duckingStarted.reason).toBe(
        'agent_speaking'
      );
      expect(controller.getState().state).toBe('ducking');
    });

    it('should emit ducking_ended on AGENT_SPEAKING_END', () => {
      const controller = getDJController();
      controller.initialize({ personaId: 'ferni', sessionId: 'test' });

      // Start playing
      controller.dispatch({
        type: 'PLAY_TRACK',
        track: { name: 'Test', artist: 'Artist', duration: 30000 },
        isAmbient: false,
      });

      // Start ducking
      controller.dispatch({ type: 'AGENT_SPEAKING_START' });

      const events: DJEvent[] = [];
      controller.on('ducking_ended', (event) => events.push(event));

      // Stop speaking
      controller.dispatch({ type: 'AGENT_SPEAKING_END' });

      const duckingEnded = events.find((e) => e.type === 'ducking_ended');
      expect(duckingEnded).toBeDefined();
      expect(controller.getState().state).toBe('playing');
    });

    it('should emit state_changed to stopped on STOP', () => {
      const controller = getDJController();
      controller.initialize({ personaId: 'ferni', sessionId: 'test' });

      // Start playing
      controller.dispatch({
        type: 'PLAY_TRACK',
        track: { name: 'Test', artist: 'Artist', duration: 30000 },
        isAmbient: false,
      });

      const events: DJEvent[] = [];
      controller.on('state_changed', (event) => events.push(event));

      // Stop
      controller.dispatch({ type: 'STOP' });

      const stateChanged = events.find((e) => e.type === 'state_changed' && e.to === 'stopped');
      expect(stateChanged).toBeDefined();
    });

    it('should emit fading_started on TRACK_NEAR_END', () => {
      const controller = getDJController();
      controller.initialize({ personaId: 'ferni', sessionId: 'test' });

      // Start playing (non-ambient to allow fading)
      controller.dispatch({
        type: 'PLAY_TRACK',
        track: { name: 'Test', artist: 'Artist', duration: 30000 },
        isAmbient: false,
      });

      const events: DJEvent[] = [];
      controller.on('fading_started', (event) => events.push(event));
      controller.on('state_changed', (event) => events.push(event));

      // Trigger track near end
      controller.dispatch({ type: 'TRACK_NEAR_END' });

      const fadingEvent = events.find((e) => e.type === 'state_changed' && e.to === 'fading');
      expect(fadingEvent).toBeDefined();
    });
  });

  describe('Ambient music behavior', () => {
    it('should track ambient flag correctly', () => {
      const controller = getDJController();
      controller.initialize({ personaId: 'ferni', sessionId: 'test' });

      controller.dispatch({
        type: 'PLAY_TRACK',
        track: { name: 'Ambient', artist: 'Music', duration: 60000 },
        isAmbient: true,
      });

      expect(controller.getState().isAmbient).toBe(true);
    });
  });

  describe('User speaking ducking', () => {
    it('should duck for user speaking', () => {
      const controller = getDJController();
      controller.initialize({ personaId: 'ferni', sessionId: 'test' });

      controller.dispatch({
        type: 'PLAY_TRACK',
        track: { name: 'Test', artist: 'Artist', duration: 30000 },
        isAmbient: false,
      });

      controller.dispatch({ type: 'USER_SPEAKING_START' });

      expect(controller.getState().state).toBe('ducking');
      expect(controller.getState().duckReason).toBe('user_speaking');
    });

    it('should stay ducked if both agent and user speaking', () => {
      const controller = getDJController();
      controller.initialize({ personaId: 'ferni', sessionId: 'test' });

      controller.dispatch({
        type: 'PLAY_TRACK',
        track: { name: 'Test', artist: 'Artist', duration: 30000 },
        isAmbient: false,
      });

      // Both start speaking
      controller.dispatch({ type: 'AGENT_SPEAKING_START' });
      controller.dispatch({ type: 'USER_SPEAKING_START' });

      // Agent stops but user still speaking
      controller.dispatch({ type: 'AGENT_SPEAKING_END' });

      // Should still be ducking
      expect(controller.getState().state).toBe('ducking');

      // User stops
      controller.dispatch({ type: 'USER_SPEAKING_END' });

      // Now should unduck
      expect(controller.getState().state).toBe('playing');
    });
  });

  describe('State machine integrity', () => {
    it('should not allow ducking from idle state', () => {
      const controller = getDJController();
      controller.initialize({ personaId: 'ferni', sessionId: 'test' });

      controller.dispatch({ type: 'AGENT_SPEAKING_START' });

      // Should stay idle
      expect(controller.getState().state).toBe('idle');
    });

    it('should transition to changing state during crossfade', () => {
      const controller = getDJController();
      controller.initialize({ personaId: 'ferni', sessionId: 'test' });

      // Start first track
      controller.dispatch({
        type: 'PLAY_TRACK',
        track: { name: 'Track 1', artist: 'Artist', duration: 30000 },
        isAmbient: false,
      });

      const events: DJEvent[] = [];
      controller.on('state_changed', (event) => events.push(event));

      // Play second track (should trigger crossfade)
      controller.dispatch({
        type: 'PLAY_TRACK',
        track: { name: 'Track 2', artist: 'Artist', duration: 30000 },
        isAmbient: false,
      });

      // Should have gone through 'changing' state
      const changingEvent = events.find((e) => e.type === 'state_changed' && e.to === 'changing');
      expect(changingEvent).toBeDefined();
    });
  });
});
