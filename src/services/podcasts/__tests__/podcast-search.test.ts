/**
 * Podcast Search Service Tests
 * Run with: npx vitest run src/services/podcasts/__tests__/podcast-search.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../utils/circuit-breaker.js', () => ({
  getCircuitBreaker: () => ({
    canRequest: () => true,
    execute: async <T>(fn: () => Promise<T>) => fn(),
  }),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));

vi.mock('../../../utils/rate-limiter.js', () => ({
  getSlidingWindowLimiter: () => ({
    tryRequest: () => true,
    getResetTime: () => 60000,
  }),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocks
import {
  searchPodcasts,
  getPodcastEpisodes,
  getTopPodcasts,
  getPodcastRecommendations,
  isPodcastApiAvailable,
  type PodcastShow,
  type PodcastSearchResult,
} from '../podcast-search.js';

describe('Podcast Search Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('searchPodcasts', () => {
    it('should search for podcasts successfully', async () => {
      const mockResponse = {
        resultCount: 2,
        results: [
          {
            collectionId: 123,
            collectionName: 'Tech Talk',
            artistName: 'John Doe',
            artworkUrl600: 'https://example.com/art.jpg',
            feedUrl: 'https://example.com/feed.xml',
            primaryGenreName: 'Technology',
            trackCount: 100,
            collectionExplicitness: 'notExplicit',
          },
          {
            collectionId: 456,
            collectionName: 'Science Weekly',
            artistName: 'Jane Smith',
            artworkUrl600: 'https://example.com/art2.jpg',
            feedUrl: 'https://example.com/feed2.xml',
            primaryGenreName: 'Science',
            trackCount: 50,
            collectionExplicitness: 'notExplicit',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await searchPodcasts('technology');

      expect(result.found).toBe(true);
      expect(result.shows).toHaveLength(2);
      expect(result.shows[0].name).toBe('Tech Talk');
      expect(result.shows[0].publisher).toBe('John Doe');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('itunes.apple.com/search'),
        expect.any(Object)
      );
    });

    it('should handle empty results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resultCount: 0, results: [] }),
      });

      const result = await searchPodcasts('nonexistent podcast xyz');

      expect(result.found).toBe(false);
      expect(result.shows).toHaveLength(0);
      expect(result.error).toContain("Couldn't find");
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await searchPodcasts('test');

      expect(result.found).toBe(false);
      expect(result.error).toBe('Search failed');
    });

    it('should respect limit parameter', async () => {
      const mockResults = Array.from({ length: 20 }, (_, i) => ({
        collectionId: i,
        collectionName: `Podcast ${i}`,
        artistName: 'Author',
        primaryGenreName: 'Comedy',
        trackCount: 10,
        collectionExplicitness: 'notExplicit',
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resultCount: 20, results: mockResults }),
      });

      const result = await searchPodcasts('comedy', 5);

      expect(result.found).toBe(true);
      // The API returns up to 20, but we should respect our limit
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=5'),
        expect.any(Object)
      );
    });
  });

  describe('getTopPodcasts', () => {
    it('should get top podcasts by genre', async () => {
      const mockResponse = {
        resultCount: 5,
        results: Array.from({ length: 5 }, (_, i) => ({
          collectionId: i,
          collectionName: `Top Podcast ${i}`,
          artistName: 'Popular Host',
          primaryGenreName: 'Comedy',
          trackCount: 100,
          collectionExplicitness: 'notExplicit',
        })),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getTopPodcasts('comedy', 5);

      expect(result.found).toBe(true);
      expect(result.shows.length).toBeLessThanOrEqual(5);
    });

    it('should work without genre filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [
            {
              collectionId: 1,
              collectionName: 'Popular Show',
              artistName: 'Host',
              primaryGenreName: 'General',
              trackCount: 50,
              collectionExplicitness: 'notExplicit',
            },
          ],
        }),
      });

      const result = await getTopPodcasts();

      expect(result.found).toBe(true);
    });
  });

  describe('getPodcastRecommendations', () => {
    it('should get recommendations based on interests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resultCount: 3,
          results: [
            {
              collectionId: 1,
              collectionName: 'AI Weekly',
              artistName: 'Tech Expert',
              primaryGenreName: 'Technology',
              trackCount: 75,
              collectionExplicitness: 'notExplicit',
            },
          ],
        }),
      });

      const result = await getPodcastRecommendations([
        'artificial intelligence',
        'machine learning',
      ]);

      expect(result.found).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('artificial%20intelligence'),
        expect.any(Object)
      );
    });
  });

  describe('isPodcastApiAvailable', () => {
    it('should return true when API is available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resultCount: 1, results: [] }),
      });

      const result = await isPodcastApiAvailable();

      expect(result).toBe(true);
    });

    it('should return false when API is unavailable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await isPodcastApiAvailable();

      expect(result).toBe(false);
    });
  });
});
