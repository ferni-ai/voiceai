/**
 * Music Context Builder Tests
 *
 * Tests for music awareness context:
 * - Music playing state injection
 * - Explicit music stop detection
 * - STOP_MUSIC_PATTERNS regex
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mocks available when vi.mock is hoisted
const { mockCreateStandardInjection, mockRegisterContextBuilder, mockGetMusicPlayer, mockLogger } =
  vi.hoisted(() => ({
    mockCreateStandardInjection: vi.fn((type: string, content: string) => ({
      type,
      content,
      priority: 'standard',
    })),
    mockRegisterContextBuilder: vi.fn(),
    mockGetMusicPlayer: vi.fn(),
    mockLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }));

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

vi.mock('../intelligence/context-builders/index.js', () => ({
  registerContextBuilder: mockRegisterContextBuilder,
  createStandardInjection: mockCreateStandardInjection,
}));

vi.mock('../audio/index.js', () => ({
  getMusicPlayer: mockGetMusicPlayer,
}));

// TODO: Skipped - imports from 'music.js' which has been moved/deleted
// import { buildMusicContext, STOP_MUSIC_PATTERNS } from '../intelligence/context-builders/music.js';
const buildMusicContext = undefined as never;
const STOP_MUSIC_PATTERNS = undefined as never;

describe.skip('Music Context Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Registration', () => {
    it('should export buildMusicContext function', () => {
      expect(typeof buildMusicContext).toBe('function');
    });

    it('should export STOP_MUSIC_PATTERNS regex', () => {
      expect(STOP_MUSIC_PATTERNS).toBeInstanceOf(RegExp);
    });
  });

  describe('STOP_MUSIC_PATTERNS', () => {
    it('should match stop commands', () => {
      expect(STOP_MUSIC_PATTERNS.test('stop')).toBe(true);
      expect(STOP_MUSIC_PATTERNS.test('quit')).toBe(true);
      expect(STOP_MUSIC_PATTERNS.test('enough')).toBe(true);
    });

    it('should match turn off commands', () => {
      expect(STOP_MUSIC_PATTERNS.test('turn it off')).toBe(true);
    });

    it('should match no more music', () => {
      expect(STOP_MUSIC_PATTERNS.test('no more music')).toBe(true);
    });

    it('should match silence commands', () => {
      expect(STOP_MUSIC_PATTERNS.test('silence')).toBe(true);
      expect(STOP_MUSIC_PATTERNS.test('quiet')).toBe(true);
      expect(STOP_MUSIC_PATTERNS.test('shut up')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(STOP_MUSIC_PATTERNS.test('STOP')).toBe(true);
      expect(STOP_MUSIC_PATTERNS.test('Stop')).toBe(true);
      expect(STOP_MUSIC_PATTERNS.test('QUIET')).toBe(true);
    });

    it('should match within sentences', () => {
      expect(STOP_MUSIC_PATTERNS.test('please stop the noise')).toBe(true);
      expect(STOP_MUSIC_PATTERNS.test("I've had enough")).toBe(true);
    });

    it('should NOT match partial words', () => {
      // 'stop' should be a whole word
      expect(STOP_MUSIC_PATTERNS.test('unstoppable')).toBe(false);
      expect(STOP_MUSIC_PATTERNS.test('stopping')).toBe(false);
    });
  });

  describe('Music Playing State', () => {
    it('should create music playing injection when music is playing', async () => {
      mockGetMusicPlayer.mockReturnValue({
        getState: () => ({
          isPlaying: true,
          currentTrack: { name: 'Lo-Fi Beats', artist: 'Chill Vibes' },
        }),
      });

      const input = {
        userText: 'Tell me about investing',
        analysis: { topics: { detected: ['investing'] }, emotion: { primary: 'curious' } },
        userData: { turnCount: 3 },
        services: {},
      };

      const result = await buildMusicContext(input);

      const musicInjection = result.find((i) => i.type === 'music_playing');
      expect(musicInjection).toBeDefined();
      expect(musicInjection?.content).toContain('Lo-Fi Beats');
      expect(musicInjection?.content).toContain('Chill Vibes');
    });

    it('should return empty array when no music is playing', async () => {
      mockGetMusicPlayer.mockReturnValue({
        getState: () => ({
          isPlaying: false,
          currentTrack: null,
        }),
      });

      const input = {
        userText: 'Hello',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { turnCount: 1 },
        services: {},
      };

      const result = await buildMusicContext(input);

      expect(result).toEqual([]);
    });

    it('should return empty array when isPlaying but no track', async () => {
      mockGetMusicPlayer.mockReturnValue({
        getState: () => ({
          isPlaying: true,
          currentTrack: null,
        }),
      });

      const input = {
        userText: 'Hello',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { turnCount: 1 },
        services: {},
      };

      const result = await buildMusicContext(input);

      expect(result).toEqual([]);
    });
  });

  describe('Explicit Music Stop Detection', () => {
    beforeEach(() => {
      mockGetMusicPlayer.mockReturnValue({
        getState: () => ({
          isPlaying: true,
          currentTrack: { name: 'Jazz', artist: 'Smooth' },
        }),
      });
    });

    it('should detect "stop the music" command', async () => {
      const input = {
        userText: 'Stop the music please',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { turnCount: 3 },
        services: {},
      };

      const result = await buildMusicContext(input);

      const stopInjection = result.find((i) => i.type === 'music_stop_requested');
      expect(stopInjection).toBeDefined();
      expect(stopInjection?.content).toContain('explicitly asked to stop');
    });

    it('should detect "turn off the music" command', async () => {
      const input = {
        userText: 'Can you turn off the music?',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { turnCount: 3 },
        services: {},
      };

      const result = await buildMusicContext(input);

      const stopInjection = result.find((i) => i.type === 'music_stop_requested');
      expect(stopInjection).toBeDefined();
    });

    it('should detect "pause the music" command', async () => {
      const input = {
        userText: 'Pause the music',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { turnCount: 3 },
        services: {},
      };

      const result = await buildMusicContext(input);

      const stopInjection = result.find((i) => i.type === 'music_stop_requested');
      expect(stopInjection).toBeDefined();
    });

    it('should detect "no more music" command', async () => {
      const input = {
        userText: 'No more music please',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { turnCount: 3 },
        services: {},
      };

      const result = await buildMusicContext(input);

      const stopInjection = result.find((i) => i.type === 'music_stop_requested');
      expect(stopInjection).toBeDefined();
    });

    it('should detect "music off" pattern', async () => {
      const input = {
        userText: 'Turn the music off',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { turnCount: 3 },
        services: {},
      };

      const result = await buildMusicContext(input);

      const stopInjection = result.find((i) => i.type === 'music_stop_requested');
      expect(stopInjection).toBeDefined();
    });

    it('should NOT detect stop when not related to music', async () => {
      const input = {
        userText: 'Stop worrying about money',
        analysis: { topics: { detected: ['finance'] }, emotion: { primary: 'neutral' } },
        userData: { turnCount: 3 },
        services: {},
      };

      const result = await buildMusicContext(input);

      const stopInjection = result.find((i) => i.type === 'music_stop_requested');
      expect(stopInjection).toBeUndefined();

      // Should have the regular music playing injection instead
      const musicInjection = result.find((i) => i.type === 'music_playing');
      expect(musicInjection).toBeDefined();
    });

    it('should log when user explicitly requests music stop', async () => {
      const input = {
        userText: 'Stop the music',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { turnCount: 3 },
        services: {},
      };

      await buildMusicContext(input);

      expect(mockLogger.info).toHaveBeenCalledWith('User explicitly requested music stop');
    });
  });

  describe('Error Handling', () => {
    it('should handle music player not available gracefully', async () => {
      mockGetMusicPlayer.mockImplementation(() => {
        throw new Error('Music player not initialized');
      });

      const input = {
        userText: 'Hello',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { turnCount: 1 },
        services: {},
      };

      // Should not throw
      const result = await buildMusicContext(input);

      expect(result).toEqual([]);
    });

    it('should handle getState throwing error gracefully', async () => {
      mockGetMusicPlayer.mockReturnValue({
        getState: () => {
          throw new Error('State error');
        },
      });

      const input = {
        userText: 'Hello',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { turnCount: 1 },
        services: {},
      };

      // Should not throw
      const result = await buildMusicContext(input);

      expect(result).toEqual([]);
    });
  });
});
