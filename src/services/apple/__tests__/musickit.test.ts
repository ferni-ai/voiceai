/**
 * Apple MusicKit Service Tests
 *
 * Tests for Apple Music search, track retrieval, and voice formatting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock apple-jwt
vi.mock('../apple-jwt.js', () => ({
  isAppleConfigured: vi.fn().mockReturnValue(true),
  getMusicKitToken: vi.fn().mockReturnValue('mock-token'),
}));

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  isAppleMusicAvailable,
  searchAppleMusic,
  getAppleMusicTrack,
  formatTrackForVoice,
  formatSearchResultsForVoice,
  type AppleMusicTrack,
  type AppleMusicSearchResult,
} from '../musickit.js';

describe('MusicKit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isAppleMusicAvailable', () => {
    it('should return true when Apple is configured', () => {
      expect(isAppleMusicAvailable()).toBe(true);
    });

    it('should return false when Apple is not configured', async () => {
      const { isAppleConfigured } = await import('../apple-jwt.js');
      (isAppleConfigured as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

      expect(isAppleMusicAvailable()).toBe(false);
    });
  });

  describe('searchAppleMusic', () => {
    const mockSearchResponse = {
      results: {
        songs: {
          data: [
            {
              id: 'song-1',
              attributes: {
                name: 'Bohemian Rhapsody',
                artistName: 'Queen',
                albumName: 'A Night at the Opera',
                durationInMillis: 354000,
                previews: [{ url: 'https://example.com/preview1.m4a' }],
                artwork: { url: 'https://example.com/art/{w}x{h}bb.jpg' },
                contentRating: 'clean',
              },
            },
            {
              id: 'song-2',
              attributes: {
                name: 'We Will Rock You',
                artistName: 'Queen',
                albumName: 'News of the World',
                durationInMillis: 122000,
                previews: [{ url: 'https://example.com/preview2.m4a' }],
                artwork: { url: 'https://example.com/art2/{w}x{h}bb.jpg' },
                contentRating: 'explicit',
              },
            },
          ],
          meta: {
            total: 100,
          },
        },
      },
    };

    it('should return empty results when not configured', async () => {
      const { isAppleConfigured } = await import('../apple-jwt.js');
      (isAppleConfigured as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

      const result = await searchAppleMusic('queen');

      expect(result.tracks).toHaveLength(0);
      expect(result.totalResults).toBe(0);
    });

    it('should search and return tracks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchResponse),
      });

      const result = await searchAppleMusic('queen');

      expect(result.tracks).toHaveLength(2);
      expect(result.totalResults).toBe(100);
    });

    it('should parse track data correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchResponse),
      });

      const result = await searchAppleMusic('queen');

      expect(result.tracks[0].id).toBe('song-1');
      expect(result.tracks[0].name).toBe('Bohemian Rhapsody');
      expect(result.tracks[0].artistName).toBe('Queen');
      expect(result.tracks[0].albumName).toBe('A Night at the Opera');
      expect(result.tracks[0].durationMs).toBe(354000);
      expect(result.tracks[0].previewUrl).toBe('https://example.com/preview1.m4a');
      expect(result.tracks[0].isExplicit).toBe(false);
    });

    it('should handle explicit tracks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchResponse),
      });

      const result = await searchAppleMusic('queen');

      expect(result.tracks[1].isExplicit).toBe(true);
    });

    it('should replace artwork size placeholder', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchResponse),
      });

      const result = await searchAppleMusic('queen');

      expect(result.tracks[0].artworkUrl).toBe('https://example.com/art/300x300bb.jpg');
    });

    it('should encode search query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: { songs: { data: [] } } }),
      });

      await searchAppleMusic('rock & roll');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('rock%20%26%20roll'),
        expect.any(Object)
      );
    });

    it('should respect limit parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: { songs: { data: [] } } }),
      });

      await searchAppleMusic('queen', 10);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object)
      );
    });

    it('should respect storefront parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: { songs: { data: [] } } }),
      });

      await searchAppleMusic('queen', 5, 'gb');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/catalog/gb/'),
        expect.any(Object)
      );
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
      });

      const result = await searchAppleMusic('queen');

      expect(result.tracks).toHaveLength(0);
      expect(result.totalResults).toBe(0);
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await searchAppleMusic('queen');

      expect(result.tracks).toHaveLength(0);
      expect(result.totalResults).toBe(0);
    });

    it('should handle empty response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await searchAppleMusic('nonexistent artist xyz');

      expect(result.tracks).toHaveLength(0);
    });

    it('should handle missing attributes', async () => {
      const incompleteResponse = {
        results: {
          songs: {
            data: [
              {
                id: 'song-1',
                // Missing attributes
              },
            ],
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(incompleteResponse),
      });

      const result = await searchAppleMusic('test');

      expect(result.tracks[0].name).toBe('Unknown');
      expect(result.tracks[0].artistName).toBe('Unknown Artist');
      expect(result.tracks[0].previewUrl).toBeNull();
    });
  });

  describe('getAppleMusicTrack', () => {
    const mockTrackResponse = {
      data: [
        {
          id: 'song-1',
          attributes: {
            name: 'Bohemian Rhapsody',
            artistName: 'Queen',
            albumName: 'A Night at the Opera',
            durationInMillis: 354000,
            previews: [{ url: 'https://example.com/preview.m4a' }],
            artwork: { url: 'https://example.com/art/{w}x{h}bb.jpg' },
            contentRating: 'clean',
          },
        },
      ],
    };

    it('should return null when not configured', async () => {
      const { isAppleConfigured } = await import('../apple-jwt.js');
      (isAppleConfigured as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

      const result = await getAppleMusicTrack('song-1');

      expect(result).toBeNull();
    });

    it('should fetch track by ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTrackResponse),
      });

      const result = await getAppleMusicTrack('song-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('song-1');
      expect(result?.name).toBe('Bohemian Rhapsody');
    });

    it('should return null for missing track', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const result = await getAppleMusicTrack('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
      });

      const result = await getAppleMusicTrack('song-1');

      expect(result).toBeNull();
    });

    it('should respect storefront parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTrackResponse),
      });

      await getAppleMusicTrack('song-1', 'gb');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/catalog/gb/songs/song-1'),
        expect.any(Object)
      );
    });
  });

  describe('formatTrackForVoice', () => {
    const mockTrack: AppleMusicTrack = {
      id: 'song-1',
      name: 'Bohemian Rhapsody',
      artistName: 'Queen',
      albumName: 'A Night at the Opera',
      durationMs: 354000,
      previewUrl: 'https://example.com/preview.m4a',
      artworkUrl: 'https://example.com/art.jpg',
      isExplicit: false,
    };

    it('should format track name and artist', () => {
      const result = formatTrackForVoice(mockTrack);

      expect(result).toBe('Bohemian Rhapsody by Queen');
    });

    it('should handle tracks with special characters', () => {
      const trackWithSpecialChars: AppleMusicTrack = {
        ...mockTrack,
        name: "Rock 'n' Roll All Nite",
        artistName: 'KISS',
      };

      const result = formatTrackForVoice(trackWithSpecialChars);

      expect(result).toBe("Rock 'n' Roll All Nite by KISS");
    });
  });

  describe('formatSearchResultsForVoice', () => {
    it('should format empty results', () => {
      const result: AppleMusicSearchResult = {
        tracks: [],
        totalResults: 0,
      };

      const formatted = formatSearchResultsForVoice(result);

      expect(formatted).toContain("couldn't find any songs");
    });

    it('should format search results with top 3 tracks', () => {
      const result: AppleMusicSearchResult = {
        tracks: [
          {
            id: '1',
            name: 'Song One',
            artistName: 'Artist A',
            albumName: 'Album',
            durationMs: 180000,
            previewUrl: null,
            artworkUrl: null,
            isExplicit: false,
          },
          {
            id: '2',
            name: 'Song Two',
            artistName: 'Artist B',
            albumName: 'Album',
            durationMs: 200000,
            previewUrl: null,
            artworkUrl: null,
            isExplicit: false,
          },
          {
            id: '3',
            name: 'Song Three',
            artistName: 'Artist C',
            albumName: 'Album',
            durationMs: 220000,
            previewUrl: null,
            artworkUrl: null,
            isExplicit: false,
          },
          {
            id: '4',
            name: 'Song Four',
            artistName: 'Artist D',
            albumName: 'Album',
            durationMs: 240000,
            previewUrl: null,
            artworkUrl: null,
            isExplicit: false,
          },
        ],
        totalResults: 50,
      };

      const formatted = formatSearchResultsForVoice(result);

      expect(formatted).toContain('Found 50 songs');
      expect(formatted).toContain('1. Song One by Artist A');
      expect(formatted).toContain('2. Song Two by Artist B');
      expect(formatted).toContain('3. Song Three by Artist C');
      expect(formatted).not.toContain('Song Four');
    });

    it('should handle single result', () => {
      const result: AppleMusicSearchResult = {
        tracks: [
          {
            id: '1',
            name: 'Only Song',
            artistName: 'Solo Artist',
            albumName: 'Album',
            durationMs: 180000,
            previewUrl: null,
            artworkUrl: null,
            isExplicit: false,
          },
        ],
        totalResults: 1,
      };

      const formatted = formatSearchResultsForVoice(result);

      expect(formatted).toContain('Found 1 songs');
      expect(formatted).toContain('Only Song by Solo Artist');
    });
  });

  describe('Default exports', () => {
    it('should export all functions via default', async () => {
      const musickit = await import('../musickit.js');
      const defaultExport = musickit.default;

      expect(defaultExport.isAppleMusicAvailable).toBeDefined();
      expect(defaultExport.searchAppleMusic).toBeDefined();
      expect(defaultExport.getAppleMusicTrack).toBeDefined();
      expect(defaultExport.formatTrackForVoice).toBeDefined();
      expect(defaultExport.formatSearchResultsForVoice).toBeDefined();
    });
  });
});
