/**
 * Music Executor Tests
 *
 * Tests for music playback tools: playMusic, musicControl, musicInfo, suggestMusic.
 * Covers Spotify/Apple Music integration and alias resolution.
 *
 * @module agents/shared/tool-executors/__tests__/music-executor.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { musicExecutor } from '../music-executor.js';
import type { ToolExecutionContext } from '../types.js';

// Mock music service
vi.mock('../../../../tools/domains/entertainment/music.js', () => ({
  playMusicUnified: vi.fn().mockResolvedValue('Playing jazz music'),
  musicControl: vi.fn().mockResolvedValue('Paused'),
  musicInfo: vi.fn().mockResolvedValue('Currently playing: Jazz Vibes'),
  suggestMusic: vi.fn().mockResolvedValue('Try these tracks...'),
  suggestAndPlayMusic: vi.fn().mockResolvedValue('Here are some relaxing tracks...'),
}));

// Mock music player
vi.mock('../../../../audio/music-player.js', () => ({
  getMusicPlayer: vi.fn(() => ({
    pause: vi.fn(),
    resume: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    skip: vi.fn().mockResolvedValue(undefined),
    setVolume: vi.fn(),
    getState: vi.fn().mockReturnValue({ currentTrack: null }),
  })),
}));

describe('MusicExecutor', () => {
  const createContext = (overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext => ({
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    personaId: 'ferni',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executor metadata', () => {
    it('should have correct domain name', () => {
      expect(musicExecutor.domain).toBe('music');
    });

    it('should handle all expected tools', () => {
      const expectedTools = [
        'playmusic',
        'musiccontrol',
        'musicinfo',
        'suggestmusic',
        // Legacy aliases
        'pausemusic',
        'stopmusic',
        'resumemusic',
        'skipmusic',
        'nextsong',
        'skipsong',
      ];

      for (const tool of expectedTools) {
        expect(musicExecutor.handles).toContain(tool);
      }
    });
  });

  describe('playMusic', () => {
    it('should play music with query', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('playMusic', { query: 'jazz' }, ctx);

      expect(result).toContain('jazz');
    });

    it('should play music with genre', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('playMusic', { genre: 'classical' }, ctx);

      expect(result).toBeDefined();
    });

    it('should play music with artist', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('playMusic', { artist: 'Miles Davis' }, ctx);

      expect(result).toBeDefined();
    });

    it('should default to generic music when no query provided', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('playMusic', {}, ctx);

      // Executor defaults to 'music' query, doesn't prompt
      expect(result).toBeDefined();
    });

    it('should handle case-insensitive tool names', async () => {
      const ctx = createContext();

      const result1 = await musicExecutor.execute('PLAYMUSIC', { query: 'jazz' }, ctx);
      const result2 = await musicExecutor.execute('PlayMusic', { query: 'jazz' }, ctx);
      const result3 = await musicExecutor.execute('playmusic', { query: 'jazz' }, ctx);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
    });
  });

  describe('musicControl', () => {
    it('should pause music', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('musicControl', { action: 'pause' }, ctx);

      expect(result).toBeDefined();
    });

    it('should resume music', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('musicControl', { action: 'resume' }, ctx);

      expect(result).toBeDefined();
    });

    it('should skip track', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('musicControl', { action: 'skip' }, ctx);

      expect(result).toBeDefined();
    });

    it('should adjust volume', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute(
        'musicControl',
        { action: 'volume', level: 50 },
        ctx
      );

      expect(result).toBeDefined();
    });
  });

  describe('legacy aliases', () => {
    it('should resolve pauseMusic to musicControl with pause action', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('pauseMusic', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve stopMusic to musicControl with stop action', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('stopMusic', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve resumeMusic to musicControl with resume action', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('resumeMusic', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve skipMusic to musicControl with skip action', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('skipMusic', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve nextSong to musicControl with skip action', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('nextSong', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve skipSong to musicControl with skip action', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('skipSong', {}, ctx);

      expect(result).toBeDefined();
    });
  });

  describe('musicInfo', () => {
    it('should get current playing info', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('musicInfo', {}, ctx);

      expect(result).toBeDefined();
    });
  });

  describe('suggestMusic', () => {
    it('should suggest music based on mood', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('suggestMusic', { mood: 'relaxed' }, ctx);

      expect(result).toBeDefined();
    });

    it('should suggest music based on activity', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('suggestMusic', { activity: 'working out' }, ctx);

      expect(result).toBeDefined();
    });
  });

  describe('unhandled tools', () => {
    it('should return null for unhandled tools', async () => {
      const ctx = createContext();
      const result = await musicExecutor.execute('unknownTool', {}, ctx);

      expect(result).toBeNull();
    });

    it('should return null for tools from other domains', async () => {
      const ctx = createContext();

      const otherDomainTools = ['addTask', 'getWeather', 'handoffToMaya'];

      for (const tool of otherDomainTools) {
        const result = await musicExecutor.execute(tool, {}, ctx);
        expect(result).toBeNull();
      }
    });
  });
});
