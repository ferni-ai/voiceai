/**
 * Tests for MusicStateManager
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getMusicStateManager,
  resetMusicStateManager,
  type MusicStateEvent,
} from '../src/services/music-state-manager.js';
import type { MusicEvent, MusicPlaybackState } from '../src/types/events.js';

describe('MusicStateManager', () => {
  beforeEach(() => {
    resetMusicStateManager();
  });

  describe('initialization', () => {
    it('should initialize with idle state', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      const state = manager.getState();
      expect(state.state).toBe('idle');
      expect(state.currentTrack).toBeNull();
      expect(state.isAmbient).toBe(false);
      expect(state.isDucked).toBe(false);
    });

    it('should return same instance on multiple calls', () => {
      const manager1 = getMusicStateManager();
      const manager2 = getMusicStateManager();
      expect(manager1).toBe(manager2);
    });
  });

  describe('handleStateChange', () => {
    it('should update state when track starts playing', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      const event: MusicEvent = {
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        duration: 30000,
        timestamp: Date.now(),
      };

      manager.handleStateChange(event);

      const state = manager.getState();
      expect(state.state).toBe('playing');
      expect(state.currentTrack).toEqual({
        name: 'Test Song',
        artist: 'Test Artist',
        duration: 30000,
        isAmbient: undefined,
        isOurSong: undefined,
        ourSongContext: undefined,
      });
    });

    it('should emit track_started event on new track', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      const events: MusicStateEvent[] = [];
      manager.subscribe((event) => events.push(event));

      const musicEvent: MusicEvent = {
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      };

      manager.handleStateChange(musicEvent);

      const trackStarted = events.find((e) => e.type === 'track_started');
      expect(trackStarted).toBeDefined();
      expect(trackStarted?.type === 'track_started' && trackStarted.track.name).toBe('Test Song');
    });

    it('should emit track_ended event when stopped', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      // First start a track
      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      });

      const events: MusicStateEvent[] = [];
      manager.subscribe((event) => events.push(event));

      // Then stop it
      manager.handleStateChange({
        type: 'music',
        state: 'stopped',
        timestamp: Date.now(),
      });

      const trackEnded = events.find((e) => e.type === 'track_ended');
      expect(trackEnded).toBeDefined();
    });

    it('should clear track on stopped state', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      });

      manager.handleStateChange({
        type: 'music',
        state: 'stopped',
        timestamp: Date.now(),
      });

      const state = manager.getState();
      expect(state.state).toBe('stopped');
      expect(state.currentTrack).toBeNull();
    });
  });

  describe('ducking', () => {
    it('should emit ducking_started when state changes to ducking', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      // Start playing
      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      });

      const events: MusicStateEvent[] = [];
      manager.subscribe((event) => events.push(event));

      // Then duck
      manager.handleStateChange({
        type: 'music',
        state: 'ducking',
        timestamp: Date.now(),
      });

      const duckingStarted = events.find((e) => e.type === 'ducking_started');
      expect(duckingStarted).toBeDefined();
      expect(manager.isDucked()).toBe(true);
    });

    it('should emit ducking_ended when returning to playing', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      // Start playing
      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      });

      // Duck
      manager.handleStateChange({
        type: 'music',
        state: 'ducking',
        timestamp: Date.now(),
      });

      const events: MusicStateEvent[] = [];
      manager.subscribe((event) => events.push(event));

      // Unduck
      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        timestamp: Date.now(),
      });

      const duckingEnded = events.find((e) => e.type === 'ducking_ended');
      expect(duckingEnded).toBeDefined();
      expect(manager.isDucked()).toBe(false);
    });

    it('should duck when agent starts speaking', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      // Start playing
      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      });

      const events: MusicStateEvent[] = [];
      manager.subscribe((event) => events.push(event));

      manager.notifyAgentSpeakingStart();

      expect(manager.isDucked()).toBe(true);
      const duckingStarted = events.find((e) => e.type === 'ducking_started');
      expect(duckingStarted).toBeDefined();
    });

    it('should unduck when agent stops speaking', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      // Start playing
      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      });

      manager.notifyAgentSpeakingStart();

      const events: MusicStateEvent[] = [];
      manager.subscribe((event) => events.push(event));

      manager.notifyAgentSpeakingEnd();

      expect(manager.isDucked()).toBe(false);
      const duckingEnded = events.find((e) => e.type === 'ducking_ended');
      expect(duckingEnded).toBeDefined();
    });

    it('should stay ducked if both agent and user are speaking', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      // Start playing
      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      });

      manager.notifyAgentSpeakingStart();
      manager.notifyUserSpeakingStart();

      // Agent stops but user still speaking
      manager.notifyAgentSpeakingEnd();

      expect(manager.isDucked()).toBe(true);
    });
  });

  describe('isMusicActive', () => {
    it('should return true when playing', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      });

      expect(manager.isMusicActive()).toBe(true);
    });

    it('should return true when ducking', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      manager.handleStateChange({
        type: 'music',
        state: 'ducking',
        timestamp: Date.now(),
      });

      expect(manager.isMusicActive()).toBe(true);
    });

    it('should return false when idle', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      expect(manager.isMusicActive()).toBe(false);
    });

    it('should return false when stopped', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      manager.handleStateChange({
        type: 'music',
        state: 'stopped',
        timestamp: Date.now(),
      });

      expect(manager.isMusicActive()).toBe(false);
    });
  });

  describe('subscription', () => {
    it('should allow unsubscription', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      const events: MusicStateEvent[] = [];
      const unsubscribe = manager.subscribe((event) => events.push(event));

      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      });

      expect(events.length).toBeGreaterThan(0);

      unsubscribe();
      events.length = 0;

      manager.handleStateChange({
        type: 'music',
        state: 'stopped',
        timestamp: Date.now(),
      });

      expect(events.length).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should reset state on cleanup', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      });

      manager.cleanup();

      const state = manager.getState();
      expect(state.state).toBe('idle');
      expect(state.currentTrack).toBeNull();
    });
  });
});
