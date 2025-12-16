/**
 * Music Player Tests
 *
 * Tests for the LiveKit music player that streams audio into calls.
 *
 * NOTE: The CallMusicPlayer class has many external dependencies:
 * - LiveKit BackgroundAudioPlayer
 * - Room objects
 * - FFmpeg for audio processing
 * - File system operations
 *
 * Full testing requires integration tests with mocked LiveKit.
 * These unit tests focus on the testable parts:
 * - Type definitions
 * - Singleton management
 * - State structure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MusicTrack, MusicPlayerState, SessionMusicEntry } from '../music-player.js';

// Mock heavy dependencies
vi.mock('@livekit/agents', () => ({
  voice: {
    BackgroundAudioPlayer: vi.fn().mockImplementation(() => ({
      start: vi.fn().mockResolvedValue(undefined),
      play: vi.fn().mockReturnValue({ waitForPlayout: vi.fn().mockResolvedValue(undefined) }),
      stop: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

vi.mock('../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../config/feature-flags.js', () => ({
  isDebugEnabled: vi.fn(() => false),
}));

describe('Music Player Types', () => {
  describe('MusicTrack', () => {
    it('should have correct shape', () => {
      const track: MusicTrack = {
        name: 'Test Song',
        artist: 'Test Artist',
        uri: 'spotify:track:123',
        previewUrl: 'https://example.com/preview.mp3',
        duration: 30000,
        genre: 'pop',
      };

      expect(track.name).toBe('Test Song');
      expect(track.artist).toBe('Test Artist');
      expect(track.uri).toBe('spotify:track:123');
      expect(track.previewUrl).toBe('https://example.com/preview.mp3');
      expect(track.duration).toBe(30000);
      expect(track.genre).toBe('pop');
    });

    it('should allow minimal track with only required fields', () => {
      const minimalTrack: MusicTrack = {
        name: 'Minimal Song',
        artist: 'Unknown',
      };

      expect(minimalTrack.name).toBe('Minimal Song');
      expect(minimalTrack.artist).toBe('Unknown');
      expect(minimalTrack.uri).toBeUndefined();
      expect(minimalTrack.previewUrl).toBeUndefined();
    });
  });

  describe('MusicPlayerState', () => {
    it('should have correct default-like shape', () => {
      const state: MusicPlayerState = {
        isPlaying: false,
        currentTrack: null,
        volume: 0.25,
        duckingVolume: 0.08,
        isDucked: false,
        queue: [],
        isInitialized: false,
        isAmbientMode: false,
        isChangingTrack: false,
      };

      expect(state.isPlaying).toBe(false);
      expect(state.currentTrack).toBeNull();
      expect(state.volume).toBe(0.25);
      expect(state.duckingVolume).toBe(0.08);
      expect(state.isDucked).toBe(false);
      expect(state.queue).toEqual([]);
      expect(state.isInitialized).toBe(false);
      expect(state.isAmbientMode).toBe(false);
      expect(state.isChangingTrack).toBe(false);
    });

    it('should support playing state with track', () => {
      const track: MusicTrack = {
        name: 'Playing Now',
        artist: 'Current Artist',
      };

      const playingState: MusicPlayerState = {
        isPlaying: true,
        currentTrack: track,
        volume: 0.25,
        duckingVolume: 0.08,
        isDucked: false,
        queue: [],
        isInitialized: true,
        isAmbientMode: false,
        isChangingTrack: false,
      };

      expect(playingState.isPlaying).toBe(true);
      expect(playingState.currentTrack?.name).toBe('Playing Now');
      expect(playingState.isInitialized).toBe(true);
    });

    it('should support ducking state', () => {
      const duckedState: MusicPlayerState = {
        isPlaying: true,
        currentTrack: { name: 'Test', artist: 'Test' },
        volume: 0.25,
        duckingVolume: 0.08,
        isDucked: true, // Agent is speaking
        queue: [],
        isInitialized: true,
        isAmbientMode: true, // Ambient music
        isChangingTrack: false,
      };

      expect(duckedState.isDucked).toBe(true);
      expect(duckedState.isAmbientMode).toBe(true);
    });

    it('should support queue with multiple tracks', () => {
      const state: MusicPlayerState = {
        isPlaying: true,
        currentTrack: { name: 'Now Playing', artist: 'Artist 1' },
        volume: 0.25,
        duckingVolume: 0.08,
        isDucked: false,
        queue: [
          { name: 'Next Up', artist: 'Artist 2' },
          { name: 'After That', artist: 'Artist 3' },
        ],
        isInitialized: true,
        isAmbientMode: false,
        isChangingTrack: false,
      };

      expect(state.queue).toHaveLength(2);
      expect(state.queue[0].name).toBe('Next Up');
    });
  });

  describe('SessionMusicEntry', () => {
    it('should track music history correctly', () => {
      const entry: SessionMusicEntry = {
        track: {
          name: 'Jazz Tune',
          artist: 'Jazz Artist',
          genre: 'jazz',
        },
        playedAt: Date.now(),
        userMood: 'relaxed',
        wasRequested: false,
        wasFullyPlayed: true,
      };

      expect(entry.track.name).toBe('Jazz Tune');
      expect(entry.userMood).toBe('relaxed');
      expect(entry.wasRequested).toBe(false);
      expect(entry.wasFullyPlayed).toBe(true);
    });

    it('should track requested songs', () => {
      const requestedEntry: SessionMusicEntry = {
        track: {
          name: 'User Request',
          artist: 'Favorite Artist',
        },
        playedAt: Date.now(),
        wasRequested: true,
        wasFullyPlayed: false, // User skipped
      };

      expect(requestedEntry.wasRequested).toBe(true);
      expect(requestedEntry.wasFullyPlayed).toBe(false);
    });
  });
});

describe('Music Player Singleton', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  it('should export getMusicPlayer function', async () => {
    const { getMusicPlayer } = await import('../music-player.js');
    expect(typeof getMusicPlayer).toBe('function');
  });

  it('should export resetMusicPlayer function', async () => {
    const { resetMusicPlayer } = await import('../music-player.js');
    expect(typeof resetMusicPlayer).toBe('function');
  });

  it('should export initializeMusicPlayer function', async () => {
    const { initializeMusicPlayer } = await import('../music-player.js');
    expect(typeof initializeMusicPlayer).toBe('function');
  });

  it('should return same instance on multiple getMusicPlayer calls', async () => {
    const { getMusicPlayer } = await import('../music-player.js');

    const player1 = getMusicPlayer();
    const player2 = getMusicPlayer();

    expect(player1).toBe(player2);
  });

  it('should create new instance after resetMusicPlayer', async () => {
    const { getMusicPlayer, resetMusicPlayer } = await import('../music-player.js');

    const player1 = getMusicPlayer();
    resetMusicPlayer();
    const player2 = getMusicPlayer();

    expect(player1).not.toBe(player2);
  });
});

describe('CallMusicPlayer Class', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be exported', async () => {
    const { CallMusicPlayer } = await import('../music-player.js');
    expect(CallMusicPlayer).toBeDefined();
    expect(typeof CallMusicPlayer).toBe('function');
  });

  it('should be instantiable', async () => {
    const { CallMusicPlayer } = await import('../music-player.js');
    const player = new CallMusicPlayer();
    expect(player).toBeDefined();
  });

  it('should have getState method', async () => {
    const { CallMusicPlayer } = await import('../music-player.js');
    const player = new CallMusicPlayer();

    expect(typeof player.getState).toBe('function');

    const state = player.getState();
    expect(state).toBeDefined();
    expect(state.isPlaying).toBe(false);
    expect(state.isInitialized).toBe(false);
  });

  it('should have setVolume method', async () => {
    const { CallMusicPlayer } = await import('../music-player.js');
    const player = new CallMusicPlayer();

    expect(typeof player.setVolume).toBe('function');
  });

  it('should have addToQueue method', async () => {
    const { CallMusicPlayer } = await import('../music-player.js');
    const player = new CallMusicPlayer();

    expect(typeof player.addToQueue).toBe('function');
  });

  it('should expose queue through getState', async () => {
    const { CallMusicPlayer } = await import('../music-player.js');
    const player = new CallMusicPlayer();

    const state = player.getState();
    expect(Array.isArray(state.queue)).toBe(true);
    expect(state.queue.length).toBe(0);
  });
});

/**
 * Integration Tests for Music Player
 *
 * These tests require:
 * - Mocked LiveKit BackgroundAudioPlayer
 * - Mocked Room object
 * - Mock file system for downloads
 * - Mock ffmpeg execution
 *
 * @see Playwright e2e tests for full integration testing
 */
describe.skip('Music Player Integration Tests (TODO)', () => {
  it.todo('should initialize with LiveKit room');
  it.todo('should play track from Spotify preview URL');
  it.todo('should handle play errors gracefully');
  it.todo('should queue multiple tracks');
  it.todo('should duck volume when agent speaks');
  it.todo('should restore volume after agent finishes');
  it.todo('should skip to next track');
  it.todo('should emit track ended event');
  it.todo('should crossfade between tracks');
  it.todo('should track session history for DJ callbacks');
  it.todo('should apply ffmpeg fade-out to downloaded tracks');
  it.todo('should cleanup temp files on stop');
});
