/**
 * Now Playing UI Integration Tests
 *
 * Tests the E2E flow from music_state messages to UI display.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getMusicStateManager,
  resetMusicStateManager,
  type MusicStateEvent,
} from '../src/services/music-state-manager.js';
import { getNowPlayingUI, resetNowPlayingUI } from '../src/ui/now-playing.ui.js';
import type { MusicEvent } from '../src/types/events.js';

// Mock Web Animations API for JSDOM
Element.prototype.animate = vi.fn(() => ({
  finished: Promise.resolve(),
  cancel: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  reverse: vi.fn(),
  finish: vi.fn(),
  onfinish: null,
  oncancel: null,
  currentTime: 0,
  playbackRate: 1,
  effect: null,
  timeline: null,
  id: '',
  pending: false,
  playState: 'finished',
  commitStyles: vi.fn(),
  persist: vi.fn(),
  ready: Promise.resolve(),
  updatePlaybackRate: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(() => true),
}));

describe('Now Playing Integration', () => {
  beforeEach(() => {
    // Reset singletons
    resetMusicStateManager();
    resetNowPlayingUI();

    // Set up minimal DOM
    document.body.innerHTML = '';
  });

  afterEach(() => {
    // Clean up
    resetNowPlayingUI();
    resetMusicStateManager();
    document.body.innerHTML = '';
  });

  describe('MusicStateManager → NowPlayingUI subscription', () => {
    it('should show NowPlayingUI when track_started event fires', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      const nowPlayingUI = getNowPlayingUI();
      // Initialize triggers subscription
      nowPlayingUI.show({ name: 'Test', artist: 'Artist' });

      // Simulate track started via state manager
      const event: MusicEvent = {
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      };

      manager.handleStateChange(event);

      // NowPlayingUI should be visible
      expect(nowPlayingUI.isShowing()).toBe(true);
      expect(nowPlayingUI.getCurrentTrack()?.name).toBe('Test Song');
    });

    it('should hide NowPlayingUI when track_ended event fires', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      const nowPlayingUI = getNowPlayingUI();
      // Initialize UI first by showing it
      nowPlayingUI.show({ name: 'Test Song', artist: 'Test Artist' });

      // Start playing
      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      });

      // Verify it's showing
      expect(nowPlayingUI.isShowing()).toBe(true);

      // Stop playing
      manager.handleStateChange({
        type: 'music',
        state: 'stopped',
        timestamp: Date.now(),
      });

      // Should transition to stopped state
      // (In real UI, this triggers hide animation)
      expect(nowPlayingUI.getState()).toBe('stopped');
    });

    it('should update state to ducking when ducking_started fires', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      const nowPlayingUI = getNowPlayingUI();
      // Initialize UI first by showing it (required before it tracks state)
      nowPlayingUI.show({ name: 'Test Song', artist: 'Test Artist' });
      nowPlayingUI.updateState('playing');

      // Start playing via state manager
      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      });

      // Trigger ducking via agent speaking
      manager.notifyAgentSpeakingStart();

      // Should update to ducking
      expect(nowPlayingUI.getState()).toBe('ducking');
    });

    it('should return to playing when ducking_ended fires', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      const nowPlayingUI = getNowPlayingUI();
      // Initialize UI first by showing it
      nowPlayingUI.show({ name: 'Test Song', artist: 'Test Artist' });
      nowPlayingUI.updateState('playing');

      // Start playing via state manager
      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test Song',
        artistName: 'Test Artist',
        timestamp: Date.now(),
      });

      // Duck
      manager.notifyAgentSpeakingStart();
      expect(nowPlayingUI.getState()).toBe('ducking');

      // Unduck
      manager.notifyAgentSpeakingEnd();
      expect(nowPlayingUI.getState()).toBe('playing');
    });
  });

  describe('music_state message normalization', () => {
    it('should normalize backend music_state to MusicEvent', async () => {
      const { isMusicMessage, normalizeMusicMessage } = await import(
        '../src/types/events.js'
      );

      // Backend format
      const backendMessage = {
        type: 'music_state',
        state: 'playing',
        track: {
          name: 'Test Track',
          artist: 'Test Artist',
        },
        isAmbient: false,
        isOurSong: true,
        ourSongContext: 'First dance',
        timestamp: Date.now(),
      };

      expect(isMusicMessage(backendMessage)).toBe(true);

      const normalized = normalizeMusicMessage(backendMessage);
      expect(normalized).not.toBeNull();
      expect(normalized?.type).toBe('music');
      expect(normalized?.trackName).toBe('Test Track');
      expect(normalized?.artistName).toBe('Test Artist');
      expect(normalized?.isOurSong).toBe(true);
      expect(normalized?.ourSongContext).toBe('First dance');
    });

    it('should accept legacy music type', async () => {
      const { isMusicMessage, normalizeMusicMessage } = await import(
        '../src/types/events.js'
      );

      const legacyMessage = {
        type: 'music',
        state: 'playing',
        trackName: 'Legacy Track',
        artistName: 'Legacy Artist',
        timestamp: Date.now(),
      };

      expect(isMusicMessage(legacyMessage)).toBe(true);

      const normalized = normalizeMusicMessage(legacyMessage);
      expect(normalized?.type).toBe('music');
      expect(normalized?.trackName).toBe('Legacy Track');
    });
  });

  describe('Our Song feature', () => {
    it('should pass ourSong info through the state manager', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      const events: MusicStateEvent[] = [];
      manager.subscribe((event) => events.push(event));

      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Our Song',
        artistName: 'Artist',
        isOurSong: true,
        ourSongContext: 'Wedding first dance',
        timestamp: Date.now(),
      });

      const trackStarted = events.find((e) => e.type === 'track_started');
      expect(trackStarted).toBeDefined();
      if (trackStarted?.type === 'track_started') {
        expect(trackStarted.track.isOurSong).toBe(true);
        expect(trackStarted.track.ourSongContext).toBe('Wedding first dance');
      }
    });
  });

  describe('state transitions', () => {
    it('should handle playing → ducking → playing cycle', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      // Start playing
      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test',
        artistName: 'Artist',
        timestamp: Date.now(),
      });

      expect(manager.getState().state).toBe('playing');
      expect(manager.isDucked()).toBe(false);

      // Duck via backend message
      manager.handleStateChange({
        type: 'music',
        state: 'ducking',
        timestamp: Date.now(),
      });

      expect(manager.getState().state).toBe('ducking');
      expect(manager.isDucked()).toBe(true);

      // Return to playing
      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        timestamp: Date.now(),
      });

      expect(manager.getState().state).toBe('playing');
      expect(manager.isDucked()).toBe(false);
    });

    it('should handle fading state', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Test',
        artistName: 'Artist',
        timestamp: Date.now(),
      });

      manager.handleStateChange({
        type: 'music',
        state: 'fading',
        timestamp: Date.now(),
      });

      expect(manager.getState().state).toBe('fading');
      expect(manager.isMusicActive()).toBe(true); // Still active during fade
    });

    it('should handle changing state (crossfade)', () => {
      const manager = getMusicStateManager();
      manager.initialize();

      manager.handleStateChange({
        type: 'music',
        state: 'playing',
        trackName: 'Track 1',
        artistName: 'Artist',
        timestamp: Date.now(),
      });

      manager.handleStateChange({
        type: 'music',
        state: 'changing',
        timestamp: Date.now(),
      });

      expect(manager.getState().state).toBe('changing');
      expect(manager.isMusicActive()).toBe(true); // Still active during crossfade
    });
  });
});
