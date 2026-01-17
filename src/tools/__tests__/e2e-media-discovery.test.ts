/**
 * E2E Media Discovery Tool Chain Tests
 *
 * Tests the complete flow of media discovery tools across:
 * - Podcasts (iTunes API)
 * - Video (YouTube API)
 * - Books (Google Books API + Reading List)
 *
 * Run with: npx vitest run src/tools/__tests__/e2e-media-discovery.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Standard mocks
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// ============================================================================
// PODCAST SERVICE MOCKS
// ============================================================================

vi.mock('../../services/podcasts/index.js', () => ({
  searchPodcasts: vi.fn(),
  getPodcastEpisodes: vi.fn(),
  getTopPodcasts: vi.fn(),
  getPodcastRecommendations: vi.fn(),
}));

// ============================================================================
// VIDEO SERVICE MOCKS
// ============================================================================

vi.mock('../../services/video/index.js', () => ({
  searchVideos: vi.fn(),
  getVideoDetails: vi.fn(),
  getTrendingVideos: vi.fn(),
  getVideoRecommendations: vi.fn(),
  getApiKeyConfigured: vi.fn(() => true),
}));

// ============================================================================
// BOOKS SERVICE MOCKS
// ============================================================================

vi.mock('../../services/books/google-books.js', () => ({
  searchBooks: vi.fn(),
  getBookDetails: vi.fn(),
  getBookRecommendations: vi.fn(),
  getPopularBooks: vi.fn(),
}));

vi.mock('../../services/books/reading-list-store.js', () => ({
  addToReadingList: vi.fn(),
  getReadingList: vi.fn(),
  updateReadingStatus: vi.fn(),
  markBookAsRead: vi.fn(),
  removeFromReadingList: vi.fn(),
  getReadingStats: vi.fn(),
}));

// ============================================================================
// IMPORTS AFTER MOCKS
// ============================================================================

import type { ToolContext, ToolDefinition } from '../registry/types.js';
import { getToolDefinitions as getPodcastTools } from '../domains/podcasts/index.js';
import { getToolDefinitions as getVideoTools } from '../domains/video/index.js';
import { getToolDefinitions as getBookTools } from '../domains/books/index.js';

// Import mocked services to access the mocked functions
import * as podcastService from '../../services/podcasts/index.js';
import * as videoService from '../../services/video/index.js';
import * as booksService from '../../services/books/google-books.js';
import * as readingListStore from '../../services/books/reading-list-store.js';

// ============================================================================
// HELPERS
// ============================================================================

function createMockContext(userId = 'test-user-e2e'): ToolContext {
  return {
    userId,
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Not available');
      },
      getOptional: () => undefined,
    },
  };
}

async function executeToolChain(
  tools: ToolDefinition[],
  chain: Array<{ toolId: string; params: Record<string, unknown> }>,
  context: ToolContext
): Promise<{ results: string[]; success: boolean }> {
  const results: string[] = [];

  for (const step of chain) {
    const toolDef = tools.find((t) => t.id === step.toolId);
    if (!toolDef) {
      return { results, success: false };
    }

    const tool = toolDef.create(context);
    const result = await tool.execute(step.params);
    results.push(result);

    // Check for error indicators
    if (result.includes("Couldn't") || result.includes('error') || result.includes('Sorry')) {
      // Log but continue - some steps may intentionally fail
    }
  }

  return { results, success: true };
}

// ============================================================================
// E2E TESTS
// ============================================================================

describe('E2E Media Discovery Tool Chains', () => {
  let podcastTools: ToolDefinition[];
  let videoTools: ToolDefinition[];
  let bookTools: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mocks with default successful responses
    // Using 'as unknown as X' pattern for test fixtures with partial data
    vi.mocked(podcastService.searchPodcasts).mockResolvedValue({
      found: true,
      shows: [
        {
          id: 'p1',
          name: 'Test Podcast',
          publisher: 'Test Publisher',
          description: 'Test',
          imageUrl: '',
          genres: [],
          explicit: false,
          source: 'itunes',
          totalEpisodes: 100,
        },
      ],
    });
    vi.mocked(podcastService.getPodcastEpisodes).mockResolvedValue({
      found: true,
      episodes: [
        {
          id: 'ep1',
          showId: 'p1',
          showName: 'Test',
          title: 'Episode 1',
          description: '',
          durationMs: 3600000,
          releaseDate: new Date().toISOString(),
          source: 'itunes',
        },
      ],
    });
    vi.mocked(podcastService.getTopPodcasts).mockResolvedValue({
      found: true,
      shows: [
        {
          id: 'p2',
          name: 'Top Show',
          publisher: 'Famous Host',
          description: 'Top',
          imageUrl: '',
          genres: [],
          explicit: false,
          source: 'itunes',
        },
      ],
    });
    vi.mocked(podcastService.getPodcastRecommendations).mockResolvedValue({
      found: true,
      shows: [
        {
          id: 'p3',
          name: 'Recommended Pod',
          publisher: 'Expert',
          description: 'Rec',
          imageUrl: '',
          genres: [],
          explicit: false,
          source: 'itunes',
        },
      ],
    });

    vi.mocked(videoService.searchVideos).mockResolvedValue({
      found: true,
      videos: [
        {
          id: 'vid1',
          title: 'Test Video',
          description: 'Test',
          channelId: 'c1',
          channelTitle: 'Channel',
          publishedAt: new Date().toISOString(),
          thumbnailUrl: '',
          url: 'http://youtube.com/vid1',
        },
      ],
    });
    vi.mocked(videoService.getVideoDetails).mockResolvedValue({
      found: true,
      video: {
        id: 'vid1',
        title: 'Detailed Video',
        description: 'Detail',
        channelId: 'c1',
        channelTitle: 'Channel',
        publishedAt: new Date().toISOString(),
        thumbnailUrl: '',
        url: 'http://youtube.com/vid1',
      },
    });
    vi.mocked(videoService.getTrendingVideos).mockResolvedValue({
      found: true,
      videos: [
        {
          id: 't1',
          title: 'Trending',
          description: 'Trend',
          channelId: 'c2',
          channelTitle: 'Popular',
          publishedAt: new Date().toISOString(),
          thumbnailUrl: '',
          url: 'http://youtube.com/t1',
        },
      ],
    });
    vi.mocked(videoService.getVideoRecommendations).mockResolvedValue({
      found: true,
      videos: [
        {
          id: 'rec1',
          title: 'Recommended',
          description: 'Rec',
          channelId: 'c3',
          channelTitle: 'Rec Channel',
          publishedAt: new Date().toISOString(),
          thumbnailUrl: '',
          url: 'http://youtube.com/rec1',
        },
      ],
    });

    vi.mocked(booksService.searchBooks).mockResolvedValue({
      found: true,
      books: [
        {
          id: 'book1',
          title: 'Test Book',
          authors: ['Author'],
          categories: [],
          infoLink: '',
          language: 'en',
        },
      ],
    });
    vi.mocked(booksService.getBookDetails).mockResolvedValue({
      found: true,
      book: {
        id: 'book1',
        title: 'Detailed Book',
        authors: ['Author'],
        categories: [],
        infoLink: '',
        language: 'en',
      },
    });
    vi.mocked(booksService.getBookRecommendations).mockResolvedValue({
      found: true,
      books: [
        {
          id: 'book2',
          title: 'Recommended Book',
          authors: ['Expert Author'],
          categories: [],
          infoLink: '',
          language: 'en',
        },
      ],
    });
    vi.mocked(booksService.getPopularBooks).mockResolvedValue({
      found: true,
      books: [
        {
          id: 'book3',
          title: 'Bestseller',
          authors: ['Famous Author'],
          categories: [],
          infoLink: '',
          language: 'en',
        },
      ],
    });

    vi.mocked(readingListStore.addToReadingList).mockResolvedValue({
      success: true,
      entry: {
        id: 'entry1',
        userId: 'user1',
        bookId: 'book1',
        title: 'Added Book',
        authors: ['Author'],
        status: 'want_to_read',
        listName: 'default',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    vi.mocked(readingListStore.getReadingList).mockResolvedValue({
      success: true,
      list: {
        entries: [
          {
            id: 'entry1',
            userId: 'user1',
            bookId: 'book1',
            title: 'Book',
            authors: ['A'],
            status: 'reading',
            listName: 'default',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        stats: { total: 1, wantToRead: 0, reading: 1, completed: 0 },
      },
    });
    vi.mocked(readingListStore.markBookAsRead).mockResolvedValue({
      success: true,
      entry: {
        id: 'entry2',
        userId: 'user1',
        bookId: 'book2',
        title: 'Completed Book',
        authors: ['B'],
        status: 'completed',
        listName: 'default',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rating: 5,
      },
    });
    vi.mocked(readingListStore.getReadingStats).mockResolvedValue({
      success: true,
      stats: {
        totalBooks: 5,
        booksReading: 2,
        booksCompleted: 3,
        booksWantToRead: 0,
        pagesRead: 1000,
        averageRating: 4.5,
        readingStreak: 7,
      },
    });

    // Load tools
    podcastTools = await getPodcastTools();
    videoTools = await getVideoTools();
    bookTools = await getBookTools();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // PODCAST JOURNEY
  // ==========================================================================

  describe('Podcast Discovery Journey', () => {
    it('should chain: search → get episodes → get recommendations', async () => {
      const chain = [
        { toolId: 'searchPodcasts', params: { query: 'technology', limit: 3 } },
        { toolId: 'getPodcastEpisodes', params: { podcastId: 'pod123', limit: 5 } },
        { toolId: 'getPodcastRecommendations', params: { interests: ['technology', 'AI'] } },
      ];

      const { results, success } = await executeToolChain(podcastTools, chain, mockContext);

      expect(success).toBe(true);
      expect(results).toHaveLength(3);
      expect(results[0]).toContain('Test Podcast');
      expect(results[1]).toContain('Episode 1');
      expect(results[2]).toContain('Recommended Pod');
    });

    it('should chain: get top podcasts → search within genre', async () => {
      const chain = [
        { toolId: 'getTopPodcasts', params: { genre: 'comedy', limit: 3 } },
        { toolId: 'searchPodcasts', params: { query: 'comedy shows', limit: 5 } },
      ];

      const { results, success } = await executeToolChain(podcastTools, chain, mockContext);

      expect(success).toBe(true);
      expect(results).toHaveLength(2);
    });
  });

  // ==========================================================================
  // VIDEO JOURNEY
  // ==========================================================================

  describe('Video Discovery Journey', () => {
    it('should chain: search → get details → get recommendations', async () => {
      const chain = [
        { toolId: 'searchYouTube', params: { query: 'typescript tutorial', limit: 3 } },
        { toolId: 'getVideoDetails', params: { videoId: 'vid1' } },
        { toolId: 'getVideoRecommendations', params: { interests: ['programming', 'typescript'] } },
      ];

      const { results, success } = await executeToolChain(videoTools, chain, mockContext);

      expect(success).toBe(true);
      expect(results).toHaveLength(3);
      expect(results[0]).toContain('Test Video');
      expect(results[1]).toContain('Detailed Video');
      expect(results[2]).toContain('Recommended');
    });

    it('should chain: get trending → filter by duration', async () => {
      const chain = [
        { toolId: 'getTrendingVideos', params: { category: 'music', limit: 5 } },
        { toolId: 'searchYouTube', params: { query: 'music', duration: 'short', limit: 3 } },
      ];

      const { results, success } = await executeToolChain(videoTools, chain, mockContext);

      expect(success).toBe(true);
      expect(results).toHaveLength(2);
    });
  });

  // ==========================================================================
  // BOOK JOURNEY
  // ==========================================================================

  describe('Book Discovery and Reading List Journey', () => {
    it('should chain: search → add to list → get reading list', async () => {
      const chain = [
        { toolId: 'searchBooks', params: { query: 'clean code programming', limit: 3 } },
        {
          toolId: 'addToReadingList',
          params: {
            bookId: 'book1',
            title: 'Clean Code',
            authors: ['Robert Martin'],
            priority: 'high',
          },
        },
        { toolId: 'getReadingList', params: {} },
      ];

      const { results, success } = await executeToolChain(bookTools, chain, mockContext);

      expect(success).toBe(true);
      expect(results).toHaveLength(3);
      expect(results[0]).toContain('Test Book');
      expect(results[1]).toContain('Added');
      expect(results[2]).toContain('reading list');
    });

    it('should chain: get recommendations → add to list → mark as read → view stats', async () => {
      const chain = [
        { toolId: 'getBookRecommendations', params: { interests: ['productivity', 'habits'] } },
        {
          toolId: 'addToReadingList',
          params: {
            bookId: 'rec1',
            title: 'Atomic Habits',
            authors: ['James Clear'],
          },
        },
        { toolId: 'markBookRead', params: { entryId: 'entry1', rating: 5 } },
        { toolId: 'getReadingStats', params: {} },
      ];

      const { results, success } = await executeToolChain(bookTools, chain, mockContext);

      expect(success).toBe(true);
      expect(results).toHaveLength(4);
      expect(results[0]).toContain('Recommended Book');
      expect(results[1]).toContain('Added');
      expect(results[2]).toContain('completed');
      expect(results[3]).toContain('Reading Stats');
    });

    it('should chain: get popular → get details → add to list', async () => {
      const chain = [
        { toolId: 'getPopularBooks', params: { genre: 'self_help', limit: 3 } },
        { toolId: 'getBookDetails', params: { bookId: 'best1' } },
        {
          toolId: 'addToReadingList',
          params: {
            bookId: 'best1',
            title: 'Bestseller',
            authors: ['Famous Author'],
            notes: 'Recommended by a friend',
          },
        },
      ];

      const { results, success } = await executeToolChain(bookTools, chain, mockContext);

      expect(success).toBe(true);
      expect(results).toHaveLength(3);
    });
  });

  // ==========================================================================
  // CROSS-DOMAIN SCENARIOS
  // ==========================================================================

  describe('Cross-Domain Discovery Scenarios', () => {
    it('should discover content across all media types for a topic', async () => {
      const topic = 'productivity';

      // Search across all domains
      const podcastResult = await podcastTools
        .find((t) => t.id === 'searchPodcasts')!
        .create(mockContext)
        .execute({ query: topic });

      const videoResult = await videoTools
        .find((t) => t.id === 'searchYouTube')!
        .create(mockContext)
        .execute({ query: topic });

      const bookResult = await bookTools
        .find((t) => t.id === 'searchBooks')!
        .create(mockContext)
        .execute({ query: topic });

      // All should return valid results
      expect(podcastResult).toContain('Test Podcast');
      expect(videoResult).toContain('Test Video');
      expect(bookResult).toContain('Test Book');
    });

    it('should handle mixed success/failure gracefully', async () => {
      // Simulate podcast API failing
      vi.mocked(podcastService.searchPodcasts).mockResolvedValue({
        found: false,
        shows: [],
      });

      const podcastResult = await podcastTools
        .find((t) => t.id === 'searchPodcasts')!
        .create(mockContext)
        .execute({ query: 'test' });

      const videoResult = await videoTools
        .find((t) => t.id === 'searchYouTube')!
        .create(mockContext)
        .execute({ query: 'test' });

      // Podcast fails gracefully, video still works
      expect(podcastResult).toContain("Couldn't find");
      expect(videoResult).toContain('Test Video');
    });
  });

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  describe('Error Handling Across Domains', () => {
    it('should handle API errors gracefully across all domains', async () => {
      vi.mocked(podcastService.searchPodcasts).mockRejectedValue(new Error('Network error'));
      vi.mocked(videoService.searchVideos).mockRejectedValue(new Error('Quota exceeded'));
      vi.mocked(booksService.searchBooks).mockRejectedValue(new Error('API unavailable'));

      const podcastResult = await podcastTools
        .find((t) => t.id === 'searchPodcasts')!
        .create(mockContext)
        .execute({ query: 'test' });

      const videoResult = await videoTools
        .find((t) => t.id === 'searchYouTube')!
        .create(mockContext)
        .execute({ query: 'test' });

      const bookResult = await bookTools
        .find((t) => t.id === 'searchBooks')!
        .create(mockContext)
        .execute({ query: 'test' });

      // All should return friendly error messages
      expect(podcastResult).toContain("couldn't");
      expect(videoResult).toContain("couldn't");
      expect(bookResult).toContain("couldn't");

      // None should expose technical errors
      expect(podcastResult).not.toContain('Network error');
      expect(videoResult).not.toContain('Quota exceeded');
      expect(bookResult).not.toContain('API unavailable');
    });

    it('should handle reading list store errors gracefully', async () => {
      vi.mocked(readingListStore.addToReadingList).mockResolvedValue({
        success: false,
        error: 'Database not available',
      });

      const result = await bookTools
        .find((t) => t.id === 'addToReadingList')!
        .create(mockContext)
        .execute({
          bookId: 'book1',
          title: 'Test',
          authors: ['Author'],
        });

      expect(result).toContain('Database not available');
    });
  });
});
