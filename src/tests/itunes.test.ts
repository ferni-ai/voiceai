/**
 * iTunes Integration Tests
 *
 * Tests the iTunes Search API service for free music previews.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch for API tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('iTunes Service', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('searchItunes', () => {
    it('should search for tracks and return results', async () => {
      const mockResponse = {
        resultCount: 2,
        results: [
          {
            trackId: 123,
            trackName: 'Shake It Off',
            artistName: 'Taylor Swift',
            collectionName: '1989',
            previewUrl: 'https://example.com/preview.m4a',
            artworkUrl100: 'https://example.com/artwork.jpg',
            trackTimeMillis: 219200,
            primaryGenreName: 'Pop',
            releaseDate: '2014-08-18T07:00:00Z',
          },
          {
            trackId: 456,
            trackName: 'Shake It Off (Remix)',
            artistName: 'Taylor Swift',
            collectionName: '1989 (Deluxe)',
            previewUrl: 'https://example.com/preview2.m4a',
            artworkUrl100: 'https://example.com/artwork2.jpg',
            trackTimeMillis: 230000,
            primaryGenreName: 'Pop',
            releaseDate: '2014-10-27T07:00:00Z',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { searchItunes } = await import('../services/itunes.js');
      const result = await searchItunes('Taylor Swift Shake It Off');

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('itunes.apple.com/search'));
      expect(result.resultCount).toBe(2);
      expect(result.results[0].trackName).toBe('Shake It Off');
      expect(result.results[0].previewUrl).toBe('https://example.com/preview.m4a');
    });

    it('should handle empty results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ resultCount: 0, results: [] }),
      });

      const { searchItunes } = await import('../services/itunes.js');
      const result = await searchItunes('xyznonexistentsong123');

      expect(result.resultCount).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { searchItunes } = await import('../services/itunes.js');
      const result = await searchItunes('test');

      expect(result.resultCount).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { searchItunes } = await import('../services/itunes.js');
      const result = await searchItunes('test');

      expect(result.resultCount).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('findTrack', () => {
    it('should find a track with preview URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            resultCount: 1,
            results: [
              {
                trackId: 123,
                trackName: 'Test Song',
                artistName: 'Test Artist',
                collectionName: 'Test Album',
                previewUrl: 'https://example.com/preview.m4a',
                artworkUrl100: 'https://example.com/art.jpg',
                trackTimeMillis: 180000,
                primaryGenreName: 'Rock',
                releaseDate: '2023-01-01T00:00:00Z',
              },
            ],
          }),
      });

      const { findTrack } = await import('../services/itunes.js');
      const result = await findTrack('test song');

      expect(result.found).toBe(true);
      expect(result.track?.name).toBe('Test Song');
      expect(result.track?.artist).toBe('Test Artist');
      expect(result.track?.previewUrl).toBe('https://example.com/preview.m4a');
    });

    it('should return not found for no results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ resultCount: 0, results: [] }),
      });

      const { findTrack } = await import('../services/itunes.js');
      const result = await findTrack('nonexistent');

      expect(result.found).toBe(false);
      expect(result.error).toContain("Couldn't find");
    });

    it('should skip tracks without preview URLs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            resultCount: 2,
            results: [
              {
                trackId: 1,
                trackName: 'No Preview',
                artistName: 'Artist',
                collectionName: 'Album',
                previewUrl: null, // No preview!
                artworkUrl100: '',
                trackTimeMillis: 180000,
                primaryGenreName: 'Pop',
                releaseDate: '2023-01-01',
              },
              {
                trackId: 2,
                trackName: 'Has Preview',
                artistName: 'Artist',
                collectionName: 'Album',
                previewUrl: 'https://example.com/preview.m4a',
                artworkUrl100: '',
                trackTimeMillis: 180000,
                primaryGenreName: 'Pop',
                releaseDate: '2023-01-01',
              },
            ],
          }),
      });

      const { findTrack } = await import('../services/itunes.js');
      const result = await findTrack('test');

      expect(result.found).toBe(true);
      expect(result.track?.name).toBe('Has Preview');
    });

    it('should include alternatives in results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            resultCount: 3,
            results: [
              {
                trackId: 1,
                trackName: 'Main Track',
                artistName: 'Artist',
                collectionName: 'Album',
                previewUrl: 'https://example.com/1.m4a',
                artworkUrl100: '',
                trackTimeMillis: 180000,
                primaryGenreName: 'Pop',
                releaseDate: '2023-01-01',
              },
              {
                trackId: 2,
                trackName: 'Alt Track 1',
                artistName: 'Artist',
                collectionName: 'Album',
                previewUrl: 'https://example.com/2.m4a',
                artworkUrl100: '',
                trackTimeMillis: 180000,
                primaryGenreName: 'Pop',
                releaseDate: '2023-01-01',
              },
              {
                trackId: 3,
                trackName: 'Alt Track 2',
                artistName: 'Artist',
                collectionName: 'Album',
                previewUrl: 'https://example.com/3.m4a',
                artworkUrl100: '',
                trackTimeMillis: 180000,
                primaryGenreName: 'Pop',
                releaseDate: '2023-01-01',
              },
            ],
          }),
      });

      const { findTrack } = await import('../services/itunes.js');
      const result = await findTrack('test');

      expect(result.found).toBe(true);
      expect(result.alternatives).toHaveLength(2);
      expect(result.alternatives?.[0].name).toBe('Alt Track 1');
    });
  });

  describe('searchByMood', () => {
    it('should search with mood-appropriate terms', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            resultCount: 1,
            results: [
              {
                trackId: 1,
                trackName: 'Relaxing Piano',
                artistName: 'Calm Artist',
                collectionName: 'Chill Album',
                previewUrl: 'https://example.com/relaxing.m4a',
                artworkUrl100: '',
                trackTimeMillis: 180000,
                primaryGenreName: 'Classical',
                releaseDate: '2023-01-01',
              },
            ],
          }),
      });

      const { searchByMood } = await import('../services/itunes.js');
      const result = await searchByMood('relaxing');

      expect(result.found).toBe(true);
      // The search should have used a relaxing-related query
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('isItunesAvailable', () => {
    it('should return true when API is reachable', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const { isItunesAvailable } = await import('../services/itunes.js');
      const available = await isItunesAvailable();

      expect(available).toBe(true);
    });

    it('should return false when API is down', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const { isItunesAvailable } = await import('../services/itunes.js');
      const available = await isItunesAvailable();

      expect(available).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { isItunesAvailable } = await import('../services/itunes.js');
      const available = await isItunesAvailable();

      expect(available).toBe(false);
    });
  });
});

describe('Music Tools Integration', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it('should use iTunes by default (free for everyone)', async () => {
    // Mock successful iTunes response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          resultCount: 1,
          results: [
            {
              trackId: 123,
              trackName: 'Free Preview Song',
              artistName: 'Any Artist',
              collectionName: 'Album',
              previewUrl: 'https://example.com/preview.m4a',
              artworkUrl100: '',
              trackTimeMillis: 30000,
              primaryGenreName: 'Pop',
              releaseDate: '2024-01-01',
            },
          ],
        }),
    });

    const { playViaItunes } = await import('../tools/music.js');

    // This should NOT throw and should use iTunes
    const result = await playViaItunes('test song');

    // Should indicate iTunes was used (via preview message)
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('itunes.apple.com'));
  });
});
