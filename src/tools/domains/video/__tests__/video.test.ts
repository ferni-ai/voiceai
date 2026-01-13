/**
 * Video Domain Tools Tests
 * Run with: npx vitest run src/tools/domains/video/__tests__/video.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted to ensure mock functions are available before vi.mock executes
const {
  mockSearchVideos,
  mockGetVideoDetails,
  mockGetTrendingVideos,
  mockGetVideoRecommendations,
  mockGetApiKeyConfigured,
} = vi.hoisted(() => ({
  mockSearchVideos: vi.fn(),
  mockGetVideoDetails: vi.fn(),
  mockGetTrendingVideos: vi.fn(),
  mockGetVideoRecommendations: vi.fn(),
  mockGetApiKeyConfigured: vi.fn(),
}));

// Standard mocks
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
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

// Mock the video service
vi.mock('../../../../services/video/index.js', () => ({
  searchVideos: mockSearchVideos,
  getVideoDetails: mockGetVideoDetails,
  getTrendingVideos: mockGetTrendingVideos,
  getVideoRecommendations: mockGetVideoRecommendations,
  getApiKeyConfigured: mockGetApiKeyConfigured,
}));

// Import after mocks
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
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

describe('Video Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetApiKeyConfigured.mockReturnValue(true); // API key is configured by default
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Loading', () => {
    it('should load all video tool definitions', async () => {
      expect(toolDefinitions.length).toBe(4);
    });

    it('should have correct tool IDs', () => {
      const ids = toolDefinitions.map((t) => t.id);
      expect(ids).toContain('searchYouTube');
      expect(ids).toContain('getVideoRecommendations');
      expect(ids).toContain('getTrendingVideos');
      expect(ids).toContain('getVideoDetails');
    });

    it('should have correct domain assignment', () => {
      toolDefinitions.forEach((def) => {
        expect(def.domain).toBe('video');
      });
    });
  });

  describe('API Key Check', () => {
    it('should return error message when API key not configured', async () => {
      mockGetApiKeyConfigured.mockReturnValue(false);

      const toolDef = toolDefinitions.find((t) => t.id === 'searchYouTube')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ query: 'test' });

      expect(result).toContain('not configured');
      expect(result).toContain('YOUTUBE_API_KEY');
    });
  });

  describe('searchYouTube', () => {
    it('should search for videos and return formatted results', async () => {
      mockSearchVideos.mockResolvedValue({
        found: true,
        videos: [
          {
            id: 'vid1',
            title: 'Learn TypeScript',
            channelTitle: 'Code Academy',
            durationSeconds: 630, // 10m 30s
            viewCount: 1500000,
            url: 'https://youtube.com/watch?v=vid1',
          },
          {
            id: 'vid2',
            title: 'JavaScript Basics',
            channelTitle: 'Web Dev Pro',
            durationSeconds: 1800, // 30m
            viewCount: 500000,
            url: 'https://youtube.com/watch?v=vid2',
          },
        ],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'searchYouTube')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ query: 'typescript tutorial', limit: 5 });

      expect(mockSearchVideos).toHaveBeenCalledWith('typescript tutorial', {
        limit: 5,
        duration: 'any',
      });
      expect(result).toContain('Learn TypeScript');
      expect(result).toContain('Code Academy');
      expect(result).toContain('10m 30s');
      expect(result).toContain('1.5M views');
    });

    it('should apply duration filter', async () => {
      mockSearchVideos.mockResolvedValue({
        found: true,
        videos: [
          {
            id: 'short1',
            title: 'Quick Tip',
            channelTitle: 'Tips Channel',
            durationSeconds: 180, // 3m
            url: 'https://youtube.com/watch?v=short1',
          },
        ],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'searchYouTube')!;
      const tool = toolDef.create(mockContext);
      await tool.execute({ query: 'quick tips', duration: 'short' });

      expect(mockSearchVideos).toHaveBeenCalledWith('quick tips', {
        limit: 5,
        duration: 'short',
      });
    });

    it('should handle no results gracefully', async () => {
      mockSearchVideos.mockResolvedValue({
        found: false,
        videos: [],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'searchYouTube')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ query: 'xyznonexistent' });

      expect(result).toContain("Couldn't find");
      expect(result).toContain('xyznonexistent');
    });

    it('should handle service errors gracefully', async () => {
      mockSearchVideos.mockRejectedValue(new Error('API Error'));

      const toolDef = toolDefinitions.find((t) => t.id === 'searchYouTube')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ query: 'test' });

      expect(result).toContain("couldn't search");
    });
  });

  describe('getVideoRecommendations', () => {
    it('should get recommendations based on interests', async () => {
      mockGetVideoRecommendations.mockResolvedValue({
        found: true,
        videos: [
          {
            id: 'rec1',
            title: 'Italian Cooking Masterclass',
            channelTitle: 'Chef Italiano',
            viewCount: 2000000,
            url: 'https://youtube.com/watch?v=rec1',
          },
        ],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getVideoRecommendations')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        interests: ['cooking', 'Italian recipes'],
      });

      expect(result).toContain('Italian Cooking Masterclass');
      expect(result).toContain('cooking');
      expect(result).toContain('Italian recipes');
    });

    it('should handle no recommendations gracefully', async () => {
      mockGetVideoRecommendations.mockResolvedValue({
        found: false,
        videos: [],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getVideoRecommendations')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ interests: ['obscure topic'] });

      expect(result).toContain("Couldn't find");
    });
  });

  describe('getTrendingVideos', () => {
    it('should get trending videos', async () => {
      mockGetTrendingVideos.mockResolvedValue({
        found: true,
        videos: [
          {
            id: 'trend1',
            title: 'Viral Video of the Day',
            channelTitle: 'Trending Channel',
            viewCount: 10000000,
            url: 'https://youtube.com/watch?v=trend1',
          },
        ],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getTrendingVideos')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('trending');
      expect(result).toContain('Viral Video of the Day');
    });

    it('should filter by category when provided', async () => {
      mockGetTrendingVideos.mockResolvedValue({
        found: true,
        videos: [
          {
            id: 'music1',
            title: 'New Hit Song',
            channelTitle: 'Artist Official',
            url: 'https://youtube.com/watch?v=music1',
          },
        ],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getTrendingVideos')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ category: 'music' });

      expect(mockGetTrendingVideos).toHaveBeenCalledWith({ category: 'music', limit: 5 });
      expect(result).toContain('music');
    });

    it('should handle no trending videos for category', async () => {
      mockGetTrendingVideos.mockResolvedValue({
        found: false,
        videos: [],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getTrendingVideos')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ category: 'obscure_category' });

      expect(result).toContain("Couldn't find trending");
      expect(result).toContain('obscure_category');
    });
  });

  describe('getVideoDetails', () => {
    it('should get video details', async () => {
      mockGetVideoDetails.mockResolvedValue({
        found: true,
        video: {
          id: 'vid123',
          title: 'Detailed Video',
          channelTitle: 'Channel Name',
          durationSeconds: 1230, // 20m 30s
          viewCount: 500000,
          likeCount: 25000,
          description: 'This is a detailed description of the video content...',
          url: 'https://youtube.com/watch?v=vid123',
        },
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getVideoDetails')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ videoId: 'vid123' });

      expect(result).toContain('Detailed Video');
      expect(result).toContain('Channel Name');
      expect(result).toContain('20m 30s');
      expect(result).toContain('500');
      expect(result).toContain('25,000');
      expect(result).toContain('Watch:');
    });

    it('should handle video not found', async () => {
      mockGetVideoDetails.mockResolvedValue({
        found: false,
        video: null,
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getVideoDetails')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ videoId: 'nonexistent' });

      expect(result).toContain("Couldn't find");
      expect(result).toContain('unavailable');
    });
  });

  describe('Duration Formatting', () => {
    it('should format durations correctly', async () => {
      mockSearchVideos.mockResolvedValue({
        found: true,
        videos: [
          { id: 'v1', title: 'Short', channelTitle: 'C', durationSeconds: 45, url: 'http://x' },
          { id: 'v2', title: 'Medium', channelTitle: 'C', durationSeconds: 600, url: 'http://x' },
          {
            id: 'v3',
            title: 'Long',
            channelTitle: 'C',
            durationSeconds: 7200,
            url: 'http://x',
          },
        ],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'searchYouTube')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ query: 'test' });

      expect(result).toContain('45s');
      expect(result).toContain('10m');
      expect(result).toContain('2h');
    });
  });

  describe('View Count Formatting', () => {
    it('should format view counts correctly', async () => {
      mockSearchVideos.mockResolvedValue({
        found: true,
        videos: [
          { id: 'v1', title: 'Low', channelTitle: 'C', viewCount: 500, url: 'http://x' },
          { id: 'v2', title: 'Medium', channelTitle: 'C', viewCount: 50000, url: 'http://x' },
          { id: 'v3', title: 'High', channelTitle: 'C', viewCount: 5000000, url: 'http://x' },
        ],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'searchYouTube')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ query: 'test' });

      expect(result).toContain('500 views');
      expect(result).toContain('50.0K views');
      expect(result).toContain('5.0M views');
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text in results', async () => {
      mockSearchVideos.mockResolvedValue({
        found: true,
        videos: [{ id: 'v1', title: 'Real Video', channelTitle: 'Real Channel', url: 'http://x' }],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'searchYouTube')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ query: 'test' });

      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
      expect(result).not.toContain('undefined');
    });
  });
});
