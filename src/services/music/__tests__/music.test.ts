/**
 * Music Service Tests
 *
 * Tests for music intent detection and provider selection.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  detectMusicIntent,
  type MusicIntent,
  type MusicSource,
  type MusicTrackInfo,
  type PlayMusicResult,
} from '../index.js';

describe('MusicService', () => {
  describe('detectMusicIntent', () => {
    describe('ambient intent', () => {
      it('should detect "play some jazz" as ambient', () => {
        const intent = detectMusicIntent('play some jazz');
        expect(intent).toBe('ambient');
      });

      it('should detect background music as ambient', () => {
        const intent = detectMusicIntent('put on some background music');
        expect(intent).toBe('ambient');
      });

      it('should detect chill vibes as ambient', () => {
        const intent = detectMusicIntent('I want some chill music');
        expect(intent).toBe('ambient');
      });

      it('should detect mood-based requests as ambient', () => {
        const intent = detectMusicIntent('play something for a relaxing mood');
        expect(intent).toBe('ambient');
      });

      it('should detect work music as ambient', () => {
        const intent = detectMusicIntent('play some work music');
        expect(intent).toBe('ambient');
      });

      it('should detect study music as ambient', () => {
        const intent = detectMusicIntent('I need study music');
        expect(intent).toBe('ambient');
      });

      it('should detect focus music as ambient', () => {
        const intent = detectMusicIntent('play focus music please');
        expect(intent).toBe('ambient');
      });

      it('should detect "while I work" as ambient', () => {
        const intent = detectMusicIntent('put on music while I work');
        expect(intent).toBe('ambient');
      });
    });

    describe('search intent', () => {
      it('should detect explicit search requests', () => {
        const intent = detectMusicIntent('search for Taylor Swift songs');
        expect(intent).toBe('search');
      });

      it('should detect find requests as search', () => {
        const intent = detectMusicIntent('find that song called Bohemian Rhapsody');
        expect(intent).toBe('search');
      });
    });

    describe('listening intent', () => {
      it('should detect specific play requests as listening', () => {
        const intent = detectMusicIntent('play Shake It Off');
        expect(intent).toBe('listening');
      });

      it('should detect "I want to hear" as listening', () => {
        const intent = detectMusicIntent('I want to hear the new Adele album');
        expect(intent).toBe('listening');
      });

      it('should detect artist-specific requests as listening', () => {
        // "by" is a listening indicator for artist-specific requests
        // Note: "play something by" contains "something" which is ambient, so use different phrasing
        const intent = detectMusicIntent('play a song by The Beatles');
        expect(intent).toBe('listening');
      });

      it('should detect "full song" as listening', () => {
        const intent = detectMusicIntent('play the full song');
        expect(intent).toBe('listening');
      });

      it('should detect "whole song" as listening', () => {
        const intent = detectMusicIntent('I want to hear the whole song');
        expect(intent).toBe('listening');
      });
    });

    describe('edge cases', () => {
      it('should handle empty string', () => {
        const intent = detectMusicIntent('');
        expect(['ambient', 'listening', 'search']).toContain(intent);
      });

      it('should handle uppercase input', () => {
        const intent = detectMusicIntent('PLAY SOME JAZZ');
        expect(intent).toBe('ambient');
      });

      it('should handle mixed case', () => {
        const intent = detectMusicIntent('Play Some Background Music');
        expect(intent).toBe('ambient');
      });
    });
  });

  describe('MusicIntent type', () => {
    it('should only allow valid intent values', () => {
      const validIntents: MusicIntent[] = ['ambient', 'listening', 'search'];

      for (const intent of validIntents) {
        expect(['ambient', 'listening', 'search']).toContain(intent);
      }
    });
  });

  describe('MusicSource type', () => {
    it('should only allow valid source values', () => {
      const validSources: MusicSource[] = ['itunes', 'apple_music', 'spotify'];

      for (const source of validSources) {
        expect(['itunes', 'apple_music', 'spotify']).toContain(source);
      }
    });
  });

  describe('MusicTrackInfo interface', () => {
    it('should have required properties', () => {
      const track: MusicTrackInfo = {
        name: 'Test Song',
        artist: 'Test Artist',
        source: 'itunes',
      };

      expect(track.name).toBe('Test Song');
      expect(track.artist).toBe('Test Artist');
      expect(track.source).toBe('itunes');
    });

    it('should support optional properties', () => {
      const track: MusicTrackInfo = {
        name: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album',
        previewUrl: 'https://example.com/preview.mp3',
        spotifyUri: 'spotify:track:123',
        duration: 180,
        source: 'spotify',
      };

      expect(track.album).toBe('Test Album');
      expect(track.previewUrl).toBe('https://example.com/preview.mp3');
      expect(track.spotifyUri).toBe('spotify:track:123');
      expect(track.duration).toBe(180);
    });
  });

  describe('PlayMusicResult interface', () => {
    it('should represent successful result', () => {
      const result: PlayMusicResult = {
        success: true,
        source: 'itunes',
        track: {
          name: 'Jazz Song',
          artist: 'Jazz Artist',
          source: 'itunes',
        },
        message: 'Playing Jazz Song by Jazz Artist',
        isPreview: true,
      };

      expect(result.success).toBe(true);
      expect(result.source).toBe('itunes');
      expect(result.track).toBeDefined();
      expect(result.isPreview).toBe(true);
    });

    it('should represent failed result', () => {
      const result: PlayMusicResult = {
        success: false,
        source: 'spotify',
        message: 'Could not find the requested song',
        isPreview: false,
      };

      expect(result.success).toBe(false);
      expect(result.track).toBeUndefined();
    });
  });

  describe('Intent priority', () => {
    it('should prioritize search over other intents', () => {
      // "search" indicator should win
      const intent = detectMusicIntent('search and play some jazz');
      expect(intent).toBe('search');
    });

    it('should prioritize ambient indicators correctly', () => {
      // "some" is an ambient indicator
      const intent = detectMusicIntent('play some music');
      expect(intent).toBe('ambient');
    });
  });
});
