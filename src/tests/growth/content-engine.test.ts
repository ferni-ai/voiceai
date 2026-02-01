/**
 * Content Engine Tests
 *
 * Tests for AI content generation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateTikTokScript,
  generateSEOArticle,
  generateRedditPost,
  generateInfluencerEmail,
  TIKTOK_TOPIC_BANK,
  SEO_KEYWORD_BANK,
  REDDIT_TOPICS,
} from '../../../apps/cli/src/commands/growth/content-engine.js';
import * as storage from '../../../apps/cli/src/commands/growth/growth-storage.js';

// Mock storage
vi.mock('../../../apps/cli/src/commands/growth/growth-storage.js', () => ({
  getSettings: vi.fn(),
  addContent: vi.fn(),
  addSEOArticle: vi.fn(),
}));

// Mock fetch for OpenAI/Anthropic calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Content Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return API key
    (storage.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      openaiApiKey: 'test-openai-key',
      anthropicApiKey: null,
    });
    (storage.addContent as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'content-123',
      platform: 'tiktok',
      type: 'video_script',
      content: 'Generated content',
      status: 'draft',
      createdAt: new Date().toISOString(),
    });
    (storage.addSEOArticle as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'article-123',
      title: 'Test Article',
      slug: 'test-article',
      targetKeyword: 'test',
      status: 'drafted',
      createdAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Topic Banks', () => {
    it('should have TikTok topics for each angle', () => {
      expect(TIKTOK_TOPIC_BANK.main).toBeDefined();
      expect(TIKTOK_TOPIC_BANK.motivation).toBeDefined();
      expect(TIKTOK_TOPIC_BANK.productivity).toBeDefined();
      expect(TIKTOK_TOPIC_BANK.emotional).toBeDefined();
      expect(TIKTOK_TOPIC_BANK.comparison).toBeDefined();

      // Each should have multiple topics
      expect(TIKTOK_TOPIC_BANK.main.length).toBeGreaterThan(0);
      expect(TIKTOK_TOPIC_BANK.motivation.length).toBeGreaterThan(0);
    });

    it('should have SEO keywords with topics', () => {
      expect(SEO_KEYWORD_BANK.length).toBeGreaterThan(0);

      for (const entry of SEO_KEYWORD_BANK) {
        expect(entry.keyword).toBeDefined();
        expect(entry.topic).toBeDefined();
      }
    });

    it('should have Reddit topics for multiple subreddits', () => {
      expect(Object.keys(REDDIT_TOPICS).length).toBeGreaterThan(0);

      for (const subreddit of Object.keys(REDDIT_TOPICS)) {
        expect(REDDIT_TOPICS[subreddit as keyof typeof REDDIT_TOPICS].length).toBeGreaterThan(0);
      }
    });
  });

  describe('generateTikTokScript', () => {
    it('should generate script with OpenAI', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    hook: 'Stop what you are doing',
                    body: 'Let me tell you about Ferni...',
                    cta: 'Try Ferni free today',
                    duration: '45s',
                    hashtags: ['ai', 'companion'],
                  }),
                },
              },
            ],
          }),
      });

      const account = {
        id: '1',
        handle: '@ferni_ai',
        angle: 'main' as const,
        description: 'Main account',
        createdAt: new Date().toISOString(),
      };

      const result = await generateTikTokScript('AI companions for loneliness', account);

      expect(result).toBeDefined();
      expect(storage.addContent).toHaveBeenCalled();
    });

    it('should throw error when no API key configured', async () => {
      (storage.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        openaiApiKey: null,
        anthropicApiKey: null,
      });

      const account = {
        id: '1',
        handle: '@ferni',
        angle: 'main' as const,
        description: 'Test',
        createdAt: new Date().toISOString(),
      };

      await expect(generateTikTokScript('Test topic', account)).rejects.toThrow(/API key/);
    });
  });

  describe('generateSEOArticle', () => {
    it('should generate article with keyword optimization', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: 'Best AI Companions 2026',
                    metaDescription: 'Discover the top AI companion apps...',
                    outline: ['Introduction', 'Top 5 Apps', 'Conclusion'],
                    content: 'Full article content here...',
                    internalLinks: ['/features', '/pricing'],
                  }),
                },
              },
            ],
          }),
      });

      const result = await generateSEOArticle(
        'Best AI companion apps for mental health',
        'AI companion'
      );

      expect(result).toBeDefined();
      // generateSEOArticle stores via addContent, not addSEOArticle
      expect(storage.addContent).toHaveBeenCalled();
    });
  });

  describe('generateRedditPost', () => {
    it('should generate value-first post', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: 'How I overcame loneliness using AI',
                    body: 'Personal story and value...',
                    ferniMention: false,
                    engagementQuestion: 'What helps you feel connected?',
                  }),
                },
              },
            ],
          }),
      });

      const result = await generateRedditPost(
        'Dealing with loneliness',
        'selfimprovement',
        'value_post'
      );

      expect(result).toBeDefined();
      expect(storage.addContent).toHaveBeenCalled();
    });

    it('should generate natural mention post', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: 'Apps that helped my mental health journey',
                    body: 'Sharing what worked for me, including an AI companion called Ferni...',
                    ferniMention: true,
                    engagementQuestion: 'What tools help you?',
                  }),
                },
              },
            ],
          }),
      });

      const result = await generateRedditPost(
        'Mental health apps',
        'mentalhealth',
        'natural_mention'
      );

      expect(result).toBeDefined();
    });
  });

  describe('generateInfluencerEmail', () => {
    it('should generate cold outreach email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    subject: 'Love your content on self-improvement',
                    body: 'Hi [Name],\n\nI have been following your journey...',
                    cta: 'Would you be open to chatting?',
                  }),
                },
              },
            ],
          }),
      });

      const lead = {
        id: '1',
        name: 'Alex Creator',
        handle: '@alexcreator',
        platform: 'tiktok' as const,
        followers: 50000,
        tier: 'micro' as const,
        category: 'self-improvement',
        status: 'researched' as const,
        createdAt: new Date().toISOString(),
      };

      const result = await generateInfluencerEmail(lead, 'cold_outreach');

      expect(result).toBeDefined();
      expect(storage.addContent).toHaveBeenCalled();
    });

    it('should generate follow-up email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    subject: 'Following up on partnership',
                    body: 'Hi again,\n\nJust wanted to check in...',
                    cta: 'Let me know if you have questions',
                  }),
                },
              },
            ],
          }),
      });

      const lead = {
        id: '1',
        name: 'Test Creator',
        handle: '@test',
        platform: 'instagram' as const,
        followers: 100000,
        tier: 'mid' as const,
        category: 'mental-health',
        status: 'contacted' as const,
        createdAt: new Date().toISOString(),
      };

      const result = await generateInfluencerEmail(lead, 'follow_up');

      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const account = {
        id: '1',
        handle: '@ferni',
        angle: 'main' as const,
        description: 'Test',
        createdAt: new Date().toISOString(),
      };

      await expect(generateTikTokScript('Test', account)).rejects.toThrow();
    });

    it('should handle malformed API responses gracefully', async () => {
      // When API returns empty choices, implementation uses fallbacks
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [] }), // Empty choices
      });

      const account = {
        id: '1',
        handle: '@ferni',
        angle: 'main' as const,
        description: 'Test',
        createdAt: new Date().toISOString(),
      };

      // Implementation handles this gracefully with fallback content
      const result = await generateTikTokScript('Test', account);
      expect(result).toBeDefined();
      // Should still call addContent with whatever fallback content was used
      expect(storage.addContent).toHaveBeenCalled();
    });
  });
});
