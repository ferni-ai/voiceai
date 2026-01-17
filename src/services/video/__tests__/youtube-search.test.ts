/**
 * YouTube Search Service Tests
 * Run with: npx vitest run src/services/video/__tests__/youtube-search.test.ts
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

// Store original env
const originalEnv = process.env;

// Import after mocks
import {
  searchVideos,
  getVideoDetails,
  getTrendingVideos,
  getVideoRecommendations,
  isYouTubeApiAvailable,
  type YouTubeVideo,
  type YouTubeSearchResult,
} from '../youtube-search.js';

describe('YouTube Search Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set API key for tests
    process.env = { ...originalEnv, YOUTUBE_API_KEY: 'test-api-key' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('searchVideos', () => {
    it('should search for videos successfully', async () => {
      const mockSearchResponse = {
        items: [
          {
            id: { videoId: 'abc123' },
            snippet: {
              title: 'Learn TypeScript',
              description: 'A tutorial on TypeScript',
              channelTitle: 'Code Academy',
              channelId: 'channel1',
              publishedAt: '2024-01-15T10:00:00Z',
              thumbnails: {
                high: { url: 'https://img.youtube.com/vi/abc123/hqdefault.jpg' },
              },
            },
          },
          {
            id: { videoId: 'def456' },
            snippet: {
              title: 'JavaScript Basics',
              description: 'Getting started with JS',
              channelTitle: 'Web Dev Pro',
              channelId: 'channel2',
              publishedAt: '2024-02-20T14:00:00Z',
              thumbnails: {
                high: { url: 'https://img.youtube.com/vi/def456/hqdefault.jpg' },
              },
            },
          },
        ],
        pageInfo: { totalResults: 100 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse,
      });

      const result = await searchVideos('typescript tutorial');

      expect(result.found).toBe(true);
      expect(result.videos).toHaveLength(2);
      expect(result.videos[0].title).toBe('Learn TypeScript');
      expect(result.videos[0].channelTitle).toBe('Code Academy');
      expect(result.videos[0].id).toBe('abc123');
    });

    it('should handle empty results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], pageInfo: { totalResults: 0 } }),
      });

      const result = await searchVideos('nonexistent video xyz123');

      expect(result.found).toBe(false);
      expect(result.videos).toHaveLength(0);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      const result = await searchVideos('test');

      expect(result.found).toBe(false);
      expect(result.error).toBe('Search failed');
    });

    it('should apply duration filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: { videoId: 'short1' },
              snippet: {
                title: 'Quick Tip',
                description: 'A quick tip',
                channelTitle: 'Tips',
                channelId: 'channel1',
                publishedAt: '2024-01-01T00:00:00Z',
                thumbnails: { high: { url: 'https://example.com/thumb.jpg' } },
              },
            },
          ],
        }),
      });

      await searchVideos('tips', { duration: 'short' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('videoDuration=short'),
        expect.any(Object)
      );
    });

    it('should return error when API key not configured', async () => {
      process.env = { ...originalEnv };
      delete process.env.YOUTUBE_API_KEY;

      // Re-import to get fresh module state - but since we're testing the actual function
      // we just need to check it handles the missing key
      const result = await searchVideos('test');

      expect(result.found).toBe(false);
      expect(result.error).toContain('not configured');
    });
  });

  describe('getVideoDetails', () => {
    it('should get video details successfully', async () => {
      const mockDetailsResponse = {
        items: [
          {
            id: 'abc123',
            snippet: {
              title: 'Detailed Video',
              description: 'Full description here',
              channelTitle: 'Channel Name',
              channelId: 'channel1',
              publishedAt: '2024-01-15T10:00:00Z',
              thumbnails: {
                high: { url: 'https://img.youtube.com/vi/abc123/hqdefault.jpg' },
              },
              categoryId: '22',
            },
            contentDetails: {
              duration: 'PT10M30S',
            },
            statistics: {
              viewCount: '1000000',
              likeCount: '50000',
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDetailsResponse,
      });

      const result = await getVideoDetails('abc123');

      expect(result.found).toBe(true);
      expect(result.video).toBeDefined();
      expect(result.video!.title).toBe('Detailed Video');
      expect(result.video!.viewCount).toBe(1000000);
      expect(result.video!.durationSeconds).toBe(630); // 10*60 + 30
    });

    it('should handle video not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });

      const result = await getVideoDetails('nonexistent');

      expect(result.found).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('getTrendingVideos', () => {
    it('should get trending videos', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'trend1',
              snippet: {
                title: 'Trending Now',
                description: 'A trending video',
                channelTitle: 'Popular Channel',
                channelId: 'channel1',
                publishedAt: '2024-12-01T00:00:00Z',
                thumbnails: { high: { url: 'https://example.com/thumb.jpg' } },
                categoryId: '22',
              },
              contentDetails: {
                duration: 'PT5M',
              },
              statistics: {
                viewCount: '500000',
                likeCount: '10000',
              },
            },
          ],
        }),
      });

      const result = await getTrendingVideos();

      expect(result.found).toBe(true);
      expect(result.videos.length).toBeGreaterThan(0);
    });

    it('should filter by category', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'gaming1',
              snippet: {
                title: 'Gaming Highlight',
                description: 'Epic gaming moment',
                channelTitle: 'Gamer',
                channelId: 'channel1',
                publishedAt: '2024-12-01T00:00:00Z',
                thumbnails: { high: { url: 'https://example.com/thumb.jpg' } },
                categoryId: '20',
              },
              contentDetails: {
                duration: 'PT15M',
              },
              statistics: {
                viewCount: '100000',
                likeCount: '5000',
              },
            },
          ],
        }),
      });

      await getTrendingVideos({ category: 'gaming' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('videoCategoryId=20'),
        expect.any(Object)
      );
    });
  });

  describe('getVideoRecommendations', () => {
    it('should get recommendations based on interests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: { videoId: 'rec1' },
              snippet: {
                title: 'Recommended Video',
                description: 'A recommended video',
                channelTitle: 'Interesting Channel',
                channelId: 'channel1',
                publishedAt: '2024-01-01T00:00:00Z',
                thumbnails: { high: { url: 'https://example.com/thumb.jpg' } },
              },
            },
          ],
        }),
      });

      const result = await getVideoRecommendations(['cooking', 'recipes']);

      expect(result.found).toBe(true);
    });
  });

  describe('isYouTubeApiAvailable', () => {
    it('should return true when API is available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });

      const result = await isYouTubeApiAvailable();

      expect(result).toBe(true);
    });

    it('should return false when API key not set', async () => {
      process.env = { ...originalEnv };
      delete process.env.YOUTUBE_API_KEY;

      const result = await isYouTubeApiAvailable();

      expect(result).toBe(false);
    });

    it('should return false when API is unavailable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await isYouTubeApiAvailable();

      expect(result).toBe(false);
    });
  });
});
