/**
 * Marketing Domain Tests
 *
 * Tests for social media management tools that post to Twitter/LinkedIn.
 * NOTE: Full integration tests are deferred since these tools interact
 * with external APIs and require complex OAuth setup.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies BEFORE importing
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

// Mock all external dependencies to allow module loading
vi.mock('../twitter-client.js', () => ({
  TwitterClient: vi.fn().mockImplementation(() => ({
    isConfigured: () => false,
    postThread: vi.fn(),
  })),
}));

vi.mock('../linkedin-client.js', () => ({
  LinkedInClient: vi.fn().mockImplementation(() => ({
    isConfigured: () => false,
    post: vi.fn(),
  })),
}));

vi.mock('../storage.js', () => ({
  MarketingStorage: vi.fn().mockImplementation(() => ({
    saveDraft: vi.fn().mockResolvedValue('draft-123'),
    getDraft: vi.fn().mockResolvedValue(null),
    schedulePost: vi.fn().mockResolvedValue('schedule-123'),
    getScheduledPosts: vi.fn().mockResolvedValue([]),
    savePostedContent: vi.fn().mockResolvedValue(undefined),
    getAnalytics: vi.fn().mockResolvedValue(null),
  })),
}));

vi.mock('../content-generator.js', () => ({
  generateSocialContentFromBlog: vi.fn().mockResolvedValue({
    twitter: {
      thread: ['Tweet 1', 'Tweet 2', 'Tweet 3'],
      characterCounts: [100, 150, 120],
    },
    linkedin: {
      post: 'LinkedIn post content',
      hashtags: ['#AI', '#Ferni'],
    },
  }),
}));

// Import after mocks
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions, definitions } from '../index.js';

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'alex',
    agentDisplayName: 'Alex',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available in test');
      },
      getOptional: () => undefined,
    },
  };
}

describe('Marketing Domain', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // TOOL LOADING TESTS
  // ============================================================================

  describe('Tool Loading', () => {
    it('should load all marketing tool definitions', () => {
      expect(toolDefinitions).toBeDefined();
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should export definitions array', () => {
      expect(definitions).toBeDefined();
      expect(Array.isArray(definitions)).toBe(true);
    });

    it('should have expected tools', () => {
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('generateSocialContent');
      expect(toolIds).toContain('postToTwitter');
      expect(toolIds).toContain('postToLinkedIn');
      expect(toolIds).toContain('listScheduledPosts');
      expect(toolIds).toContain('getMarketingAnalytics');
    });

    it('should have domain set to marketing for all tools', () => {
      for (const tool of toolDefinitions) {
        expect(tool.domain).toBe('marketing');
      }
    });
  });

  // ============================================================================
  // GENERATE CONTENT TESTS
  // ============================================================================

  describe('generateSocialContent', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'generateSocialContent');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should have description explaining its purpose', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'generateSocialContent');
      expect(toolDef?.description).toContain('social media');
    });

    it('should have appropriate tags', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'generateSocialContent');
      expect(toolDef?.tags).toContain('marketing');
      expect(toolDef?.tags).toContain('content');
    });
  });

  // ============================================================================
  // TWITTER POSTING TESTS
  // ============================================================================

  describe('postToTwitter', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'postToTwitter');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
    });

    it('should have twitter tag', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'postToTwitter');
      expect(toolDef?.tags).toContain('twitter');
    });
  });

  // ============================================================================
  // LINKEDIN POSTING TESTS
  // ============================================================================

  describe('postToLinkedIn', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'postToLinkedIn');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
    });

    it('should have linkedin tag', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'postToLinkedIn');
      expect(toolDef?.tags).toContain('linkedin');
    });
  });

  // ============================================================================
  // SCHEDULED POSTS TESTS
  // ============================================================================

  describe('listScheduledPosts', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'listScheduledPosts');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should have correct domain and tags', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'listScheduledPosts');
      expect(toolDef?.domain).toBe('marketing');
      expect(toolDef?.tags).toContain('marketing');
    });
  });

  // ============================================================================
  // ANALYTICS TESTS
  // ============================================================================

  describe('getMarketingAnalytics', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getMarketingAnalytics');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should have correct domain and tags', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getMarketingAnalytics');
      expect(toolDef?.domain).toBe('marketing');
      expect(toolDef?.tags).toContain('marketing');
      expect(toolDef?.tags).toContain('analytics');
    });
  });

  // ============================================================================
  // TAG VALIDATION TESTS
  // ============================================================================

  describe('Tag Validation', () => {
    it('should have marketing tag on all tools', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.tags).toContain('marketing');
      }
    });
  });
});
