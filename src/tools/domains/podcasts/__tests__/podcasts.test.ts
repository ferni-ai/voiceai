/**
 * Podcast Domain Tools Tests
 * Run with: npx vitest run src/tools/domains/podcasts/__tests__/podcasts.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted to ensure mock functions are available before vi.mock executes
const {
  mockSearchPodcasts,
  mockGetPodcastEpisodes,
  mockGetTopPodcasts,
  mockGetPodcastRecommendations,
} = vi.hoisted(() => ({
  mockSearchPodcasts: vi.fn(),
  mockGetPodcastEpisodes: vi.fn(),
  mockGetTopPodcasts: vi.fn(),
  mockGetPodcastRecommendations: vi.fn(),
}));

// Standard mocks
vi.mock('../../../../utils/safe-logger.js', () => ({
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

// Mock the podcast service
vi.mock('../../../../services/podcasts/index.js', () => ({
  searchPodcasts: mockSearchPodcasts,
  getPodcastEpisodes: mockGetPodcastEpisodes,
  getTopPodcasts: mockGetTopPodcasts,
  getPodcastRecommendations: mockGetPodcastRecommendations,
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

describe('Podcast Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Loading', () => {
    it('should load all podcast tool definitions', async () => {
      expect(toolDefinitions.length).toBe(4);
    });

    it('should have correct tool IDs', () => {
      const ids = toolDefinitions.map((t) => t.id);
      expect(ids).toContain('searchPodcasts');
      expect(ids).toContain('getPodcastRecommendations');
      expect(ids).toContain('getPodcastEpisodes');
      expect(ids).toContain('getTopPodcasts');
    });

    it('should have correct domain assignment', () => {
      toolDefinitions.forEach((def) => {
        expect(def.domain).toBe('podcasts');
      });
    });
  });

  describe('searchPodcasts', () => {
    it('should search for podcasts and return formatted results', async () => {
      mockSearchPodcasts.mockResolvedValue({
        found: true,
        shows: [
          { name: 'Tech Talk', publisher: 'John Doe', totalEpisodes: 100 },
          { name: 'Science Weekly', publisher: 'Jane Smith', totalEpisodes: 50 },
        ],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'searchPodcasts')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ query: 'technology', limit: 5 });

      expect(mockSearchPodcasts).toHaveBeenCalledWith('technology', 5);
      expect(result).toContain('Tech Talk');
      expect(result).toContain('Science Weekly');
    });

    it('should handle no results gracefully', async () => {
      mockSearchPodcasts.mockResolvedValue({
        found: false,
        shows: [],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'searchPodcasts')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ query: 'xyznonexistent' });

      expect(result).toContain("Couldn't find");
      expect(result).toContain('xyznonexistent');
    });

    it('should handle service errors gracefully', async () => {
      mockSearchPodcasts.mockRejectedValue(new Error('API Error'));

      const toolDef = toolDefinitions.find((t) => t.id === 'searchPodcasts')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ query: 'test' });

      expect(result).toContain("couldn't search");
    });
  });

  describe('getPodcastRecommendations', () => {
    it('should get recommendations based on interests', async () => {
      mockGetPodcastRecommendations.mockResolvedValue({
        found: true,
        shows: [{ name: 'AI Weekly', publisher: 'Tech Expert', totalEpisodes: 75 }],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getPodcastRecommendations')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        interests: ['artificial intelligence', 'machine learning'],
      });

      expect(result).toContain('AI Weekly');
      expect(result).toContain('artificial intelligence');
    });

    it('should include mood in the intro when provided', async () => {
      mockGetPodcastRecommendations.mockResolvedValue({
        found: true,
        shows: [{ name: 'Relaxation Station', publisher: 'Calm Co', totalEpisodes: 30 }],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getPodcastRecommendations')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        interests: ['meditation'],
        mood: 'relaxing',
      });

      expect(result).toContain('relaxing');
    });

    it('should handle no recommendations gracefully', async () => {
      mockGetPodcastRecommendations.mockResolvedValue({
        found: false,
        shows: [],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getPodcastRecommendations')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ interests: ['obscure topic'] });

      expect(result).toContain("Couldn't find");
    });
  });

  describe('getPodcastEpisodes', () => {
    it('should get episodes for a podcast', async () => {
      mockGetPodcastEpisodes.mockResolvedValue({
        found: true,
        episodes: [
          { title: 'Episode 1: Getting Started', durationMs: 3600000 },
          { title: 'Episode 2: Deep Dive', durationMs: 5400000 },
        ],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getPodcastEpisodes')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ podcastId: 'podcast123' });

      expect(mockGetPodcastEpisodes).toHaveBeenCalledWith('podcast123', 5);
      expect(result).toContain('Episode 1');
      expect(result).toContain('60 minutes'); // 3600000ms = 60 min
    });

    it('should handle podcast not found', async () => {
      mockGetPodcastEpisodes.mockResolvedValue({
        found: false,
        episodes: [],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getPodcastEpisodes')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ podcastId: 'nonexistent' });

      expect(result).toContain("Couldn't find episodes");
    });
  });

  describe('getTopPodcasts', () => {
    it('should get top podcasts', async () => {
      mockGetTopPodcasts.mockResolvedValue({
        found: true,
        shows: [{ name: 'Bestseller', publisher: 'Famous Host', totalEpisodes: 200 }],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getTopPodcasts')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('Popular podcasts');
      expect(result).toContain('Bestseller');
    });

    it('should filter by genre when provided', async () => {
      mockGetTopPodcasts.mockResolvedValue({
        found: true,
        shows: [{ name: 'Comedy Hour', publisher: 'Funny Person', totalEpisodes: 50 }],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getTopPodcasts')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ genre: 'comedy' });

      expect(mockGetTopPodcasts).toHaveBeenCalledWith('comedy', 5);
      expect(result).toContain('comedy');
    });

    it('should handle no results for genre', async () => {
      mockGetTopPodcasts.mockResolvedValue({
        found: false,
        shows: [],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getTopPodcasts')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ genre: 'obscure_genre' });

      expect(result).toContain("Couldn't find popular");
      expect(result).toContain('obscure_genre');
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text in results', async () => {
      mockSearchPodcasts.mockResolvedValue({
        found: true,
        shows: [{ name: 'Real Show', publisher: 'Real Publisher' }],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'searchPodcasts')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ query: 'test' });

      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
      expect(result).not.toContain('undefined');
    });

    it('should mark explicit content appropriately', async () => {
      mockSearchPodcasts.mockResolvedValue({
        found: true,
        shows: [{ name: 'Adult Show', publisher: 'Publisher', explicit: true }],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'searchPodcasts')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ query: 'adult' });

      expect(result).toContain('explicit');
    });
  });
});
