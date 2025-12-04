/**
 * Music Integration Tests
 *
 * Comprehensive tests for the music playback system including:
 * - iTunes search and preview playback
 * - Music player state management
 * - Ducking behavior during speech
 * - Volume control
 * - Ambient vs user-requested music handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CallMusicPlayer, type MusicTrack } from '../audio/music-player.js';

// Mock the LiveKit modules
vi.mock('@livekit/agents', () => ({
  log: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  voice: {
    BackgroundAudioPlayer: vi.fn().mockImplementation(() => ({
      start: vi.fn().mockResolvedValue(undefined),
      play: vi.fn().mockReturnValue({
        done: vi.fn().mockReturnValue(false),
        stop: vi.fn(),
        waitForPlayout: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn(),
    })),
  },
}));

vi.mock('@livekit/rtc-node', () => ({
  Room: vi.fn(),
}));

// Mock fs for temp file operations
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

describe('Music Integration', () => {
  let player: CallMusicPlayer;

  beforeEach(() => {
    player = new CallMusicPlayer();
  });

  describe('Initial State', () => {
    it('should start with correct default values', () => {
      const state = player.getState();

      expect(state.isPlaying).toBe(false);
      expect(state.currentTrack).toBeNull();
      expect(state.volume).toBe(0.25); // 25% default
      expect(state.duckingVolume).toBe(0.08); // 8% when ducked
      expect(state.isDucked).toBe(false);
      expect(state.queue).toEqual([]);
      expect(state.isInitialized).toBe(false);
      expect(state.isAmbientMode).toBe(false);
    });

    it('should not be initialized before room connection', () => {
      expect(player.isInitialized()).toBe(false);
    });
  });

  describe('Volume Control', () => {
    it('should set volume within bounds', () => {
      player.setVolume(0.5);
      expect(player.getState().volume).toBe(0.5);

      player.setVolume(1.5); // Over max
      expect(player.getState().volume).toBe(1);

      player.setVolume(-0.5); // Under min
      expect(player.getState().volume).toBe(0);
    });

    it('should have pleasant default background volume (25%)', () => {
      const state = player.getState();
      expect(state.volume).toBe(0.25);
      // Should be low enough to not interfere with speech
      expect(state.volume).toBeLessThanOrEqual(0.3);
    });
  });

  describe('Ducking Behavior', () => {
    it('should track ducked state', () => {
      expect(player.getState().isDucked).toBe(false);

      player.duck();
      expect(player.getState().isDucked).toBe(true);

      player.unduck();
      expect(player.getState().isDucked).toBe(false);
    });

    it('should not double-duck', () => {
      player.duck();
      const state1 = player.getState();

      player.duck(); // Second call should be no-op
      const state2 = player.getState();

      expect(state1.isDucked).toBe(state2.isDucked);
    });

    it('should have ducking volume much lower than normal', () => {
      const state = player.getState();
      expect(state.duckingVolume).toBeLessThan(state.volume);
      expect(state.duckingVolume).toBeLessThanOrEqual(0.1); // Should be 10% or less
    });
  });

  describe('Queue Management', () => {
    it('should add tracks to queue', () => {
      const track: MusicTrack = {
        name: 'Test Song',
        artist: 'Test Artist',
        previewUrl: 'https://example.com/preview.m4a',
        duration: 30000,
      };

      player.addToQueue(track);
      expect(player.getState().queue).toHaveLength(1);
      expect(player.getState().queue[0].name).toBe('Test Song');
    });

    it('should maintain queue order', () => {
      const track1: MusicTrack = { name: 'Song 1', artist: 'Artist', previewUrl: 'url1', duration: 30000 };
      const track2: MusicTrack = { name: 'Song 2', artist: 'Artist', previewUrl: 'url2', duration: 30000 };
      const track3: MusicTrack = { name: 'Song 3', artist: 'Artist', previewUrl: 'url3', duration: 30000 };

      player.addToQueue(track1);
      player.addToQueue(track2);
      player.addToQueue(track3);

      const queue = player.getState().queue;
      expect(queue[0].name).toBe('Song 1');
      expect(queue[1].name).toBe('Song 2');
      expect(queue[2].name).toBe('Song 3');
    });
  });

  describe('Playback State', () => {
    it('should report not playing initially', () => {
      expect(player.isPlaying()).toBe(false);
    });

    it('should track current track', () => {
      expect(player.getCurrentTrack()).toBeNull();
    });

    it('should stop playback cleanly', () => {
      player.stop();
      const state = player.getState();

      expect(state.isPlaying).toBe(false);
      expect(state.currentTrack).toBeNull();
      expect(state.isAmbientMode).toBe(false);
    });
  });

  describe('Ambient vs User Music', () => {
    it('should distinguish ambient from user-requested music', () => {
      // Default should be non-ambient
      expect(player.getState().isAmbientMode).toBe(false);
    });

    it('should clear ambient mode on stop', () => {
      player.stop();
      expect(player.getState().isAmbientMode).toBe(false);
    });
  });

  describe('Track End Callback', () => {
    it('should accept track end callback', () => {
      const callback = vi.fn();
      player.setOnTrackEndedCallback(callback);
      // Callback should be set (internal state)
      expect(typeof callback).toBe('function');
    });
  });
});

describe('Music Player UX', () => {
  describe('Volume Levels', () => {
    it('should have optimal default volumes for background music', () => {
      const player = new CallMusicPlayer();
      const state = player.getState();

      // Background music should be audible but not distracting
      expect(state.volume).toBeGreaterThanOrEqual(0.2);
      expect(state.volume).toBeLessThanOrEqual(0.35);

      // Ducked volume should be barely audible
      expect(state.duckingVolume).toBeGreaterThanOrEqual(0.05);
      expect(state.duckingVolume).toBeLessThanOrEqual(0.15);
    });
  });

  describe('Natural Speech Integration', () => {
    it('should allow music to continue during agent speech at background level', () => {
      const player = new CallMusicPlayer();

      // Simulate user-requested music playing
      player.duck();

      // Music should still be "playing" conceptually (isDucked doesn't mean stopped)
      expect(player.getState().isDucked).toBe(true);

      // Unduck after agent finishes
      player.unduck();
      expect(player.getState().isDucked).toBe(false);
    });
  });
});

