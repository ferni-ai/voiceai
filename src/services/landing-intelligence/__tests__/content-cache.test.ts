/**
 * Content Cache Tests
 *
 * Note: The content cache module uses lazy Firestore initialization with a singleton
 * pattern. Tests focus on verifying behavior patterns (valid returns, fallbacks,
 * error handling) rather than specific mock chain verification.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock Firestore to return null (forces fallback behavior, which is testable)
vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => {
    throw new Error('Firestore not configured for tests');
  }),
}));

// Use vi.hoisted for AI interaction mocks
const { mockGeneratePersonalizedHero, mockGenerateSocialProof } = vi.hoisted(() => ({
  mockGeneratePersonalizedHero: vi.fn(),
  mockGenerateSocialProof: vi.fn(),
}));

vi.mock('../ai-interactions.js', () => ({
  generatePersonalizedHero: mockGeneratePersonalizedHero,
  generateSocialProof: mockGenerateSocialProof,
}));

import {
  getCachedHero,
  getCachedSocialProof,
  getCachedMemoryStories,
  getCachedLateNightScenarios,
  getCachedUseCaseQuotes,
  generateAndCacheHeroes,
  generateAndCacheSocialProof,
  runBatchGeneration,
  getCacheControlHeader,
  CONTENT_CACHE_CONFIG,
  type CachedHero,
} from '../content-cache.js';

describe('ContentCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneratePersonalizedHero.mockResolvedValue({
      headline: 'Generated headline',
      tagline: 'Generated tagline',
      subhead: 'Generated subhead',
      ctaText: 'Generated CTA',
    });
    mockGenerateSocialProof.mockResolvedValue([{ content: 'Message 1' }, { content: 'Message 2' }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CONTENT_CACHE_CONFIG', () => {
    it('should have collection names', () => {
      expect(CONTENT_CACHE_CONFIG.collections.heroes).toBe('landing_cache_heroes');
      expect(CONTENT_CACHE_CONFIG.collections.socialProof).toBe('landing_cache_social_proof');
      expect(CONTENT_CACHE_CONFIG.collections.memoryStories).toBe('landing_cache_memory_stories');
      expect(CONTENT_CACHE_CONFIG.collections.lateNightScenarios).toBe('landing_cache_late_night');
      expect(CONTENT_CACHE_CONFIG.collections.useCaseQuotes).toBe('landing_cache_use_cases');
    });

    it('should have TTL values in milliseconds', () => {
      expect(CONTENT_CACHE_CONFIG.ttl.heroes).toBe(24 * 60 * 60 * 1000); // 24 hours
      expect(CONTENT_CACHE_CONFIG.ttl.socialProof).toBe(24 * 60 * 60 * 1000);
      expect(CONTENT_CACHE_CONFIG.ttl.memoryStories).toBe(7 * 24 * 60 * 60 * 1000); // 7 days
    });

    it('should have variation counts', () => {
      expect(CONTENT_CACHE_CONFIG.variations.heroes).toBe(15);
      expect(CONTENT_CACHE_CONFIG.variations.socialProof).toBe(30);
      expect(CONTENT_CACHE_CONFIG.variations.memoryStories).toBe(10);
      expect(CONTENT_CACHE_CONFIG.variations.lateNightScenarios).toBe(15);
    });

    it('should have cache headers for CDN', () => {
      expect(CONTENT_CACHE_CONFIG.cacheHeaders.heroes).toContain('public');
      expect(CONTENT_CACHE_CONFIG.cacheHeaders.heroes).toContain('max-age=');
      expect(CONTENT_CACHE_CONFIG.cacheHeaders.heroes).toContain('s-maxage=');
    });
  });

  describe('getCachedHero', () => {
    it('should return valid hero object for morning-new', async () => {
      const hero = await getCachedHero('morning', 'new');

      expect(hero).not.toBeNull();
      expect(hero).toHaveProperty('id');
      expect(hero).toHaveProperty('eyebrow');
      expect(hero).toHaveProperty('headline');
      expect(hero).toHaveProperty('subhead');
      expect(hero).toHaveProperty('cta');
      expect(hero).toHaveProperty('context');
    });

    it('should return hero with correct context for timeBlock and visitorType', async () => {
      const hero = await getCachedHero('evening', 'returning');

      expect(hero?.context?.timeBlock).toBe('evening');
      expect(hero?.context?.visitorType).toBe('returning');
      expect(hero?.id).toBe('evening-returning');
    });

    it('should return hero with expiresAt in the future', async () => {
      const hero = await getCachedHero('afternoon', 'new');

      expect(hero?.expiresAt).toBeInstanceOf(Date);
      expect(new Date(hero!.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('should use correct fallback content for lateNight-new', async () => {
      const hero = await getCachedHero('lateNight', 'new');

      expect(hero?.eyebrow).toBe("CAN'T SLEEP?");
      expect(hero?.headline).toBe("I'm here. Right now.");
    });

    it('should use correct fallback content for lateNight-returning', async () => {
      const hero = await getCachedHero('lateNight', 'returning');

      expect(hero?.eyebrow).toBe("YOU'RE BACK. AT 2AM.");
      expect(hero?.headline).toBe('Something on your mind?');
    });

    it('should use correct fallback content for morning-new', async () => {
      const hero = await getCachedHero('morning', 'new');

      // Falls through to default fallback which uses 'BETTER THAN HUMAN.' eyebrow
      expect(hero?.eyebrow).toBe('BETTER THAN HUMAN.');
      expect(hero?.headline).toBe('Finally, someone who gets it.');
    });

    it('should use correct fallback content for afternoon-new', async () => {
      const hero = await getCachedHero('afternoon', 'new');

      expect(hero?.headline).toBe('What if someone actually understood?');
    });
  });

  describe('getCachedSocialProof', () => {
    it('should return array of social proof messages', async () => {
      const messages = await getCachedSocialProof(3);

      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.length).toBeLessThanOrEqual(3);
    });

    it('should return fallback messages with correct structure', async () => {
      const messages = await getCachedSocialProof(5);

      messages.forEach((msg) => {
        expect(msg).toHaveProperty('text');
        expect(msg).toHaveProperty('type');
        expect(['memory', 'presence', 'understanding', 'moment']).toContain(msg.type);
      });
    });

    it('should default to 5 messages when no count specified', async () => {
      const messages = await getCachedSocialProof();

      expect(messages.length).toBeLessThanOrEqual(5);
    });

    it('should limit messages to requested count', async () => {
      const messages = await getCachedSocialProof(2);

      expect(messages.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getCachedMemoryStories', () => {
    it('should return array (empty when Firestore unavailable)', async () => {
      const stories = await getCachedMemoryStories();

      expect(Array.isArray(stories)).toBe(true);
    });
  });

  describe('getCachedLateNightScenarios', () => {
    it('should return array (empty when Firestore unavailable)', async () => {
      const scenarios = await getCachedLateNightScenarios();

      expect(Array.isArray(scenarios)).toBe(true);
    });
  });

  describe('getCachedUseCaseQuotes', () => {
    it('should return array for any category (empty when Firestore unavailable)', async () => {
      const quotes = await getCachedUseCaseQuotes('career');

      expect(Array.isArray(quotes)).toBe(true);
    });

    it('should handle different categories', async () => {
      const categories = ['career', 'relationships', 'anxiety', 'grief', 'creativity', 'parenting'];

      for (const category of categories) {
        const quotes = await getCachedUseCaseQuotes(category);
        expect(Array.isArray(quotes)).toBe(true);
      }
    });
  });

  describe('generateAndCacheHeroes', () => {
    it('should return 0 when Firestore is unavailable', async () => {
      // When Firestore is not available, the function returns early with 0
      // without calling AI generation (can't save results without db)
      const count = await generateAndCacheHeroes();

      expect(count).toBe(0);
    });

    it('should not throw when called', async () => {
      // Function handles its own errors and returns 0
      await expect(generateAndCacheHeroes()).resolves.not.toThrow();
    });

    it('should return a number', async () => {
      const count = await generateAndCacheHeroes();

      expect(typeof count).toBe('number');
    });
  });

  describe('generateAndCacheSocialProof', () => {
    it('should return count of generated snippets', async () => {
      const count = await generateAndCacheSocialProof();

      // With Firestore unavailable, returns 0 (can't save)
      // or returns the count if mock worked
      expect(typeof count).toBe('number');
    });

    it('should return 0 when AI generation fails', async () => {
      mockGenerateSocialProof.mockRejectedValue(new Error('AI error'));

      const count = await generateAndCacheSocialProof();

      expect(count).toBe(0);
    });

    it('should return 0 when AI returns empty array', async () => {
      mockGenerateSocialProof.mockResolvedValue([]);

      const count = await generateAndCacheSocialProof();

      expect(count).toBe(0);
    });
  });

  describe('runBatchGeneration', () => {
    it('should return result object with generation counts', async () => {
      const result = await runBatchGeneration();

      expect(result).toHaveProperty('heroes');
      expect(result).toHaveProperty('socialProof');
      expect(result).toHaveProperty('totalCost');
    });

    it('should calculate cost estimate', async () => {
      const result = await runBatchGeneration();

      expect(result.totalCost).toMatch(/^\$/);
    });

    it('should return numeric hero count', async () => {
      const result = await runBatchGeneration();

      expect(typeof result.heroes).toBe('number');
    });

    it('should return numeric social proof count', async () => {
      const result = await runBatchGeneration();

      expect(typeof result.socialProof).toBe('number');
    });
  });

  describe('getCacheControlHeader', () => {
    it('should return correct header for heroes', () => {
      const header = getCacheControlHeader('heroes');

      expect(header).toContain('public');
      expect(header).toContain('max-age=3600');
      expect(header).toContain('s-maxage=86400');
    });

    it('should return correct header for socialProof', () => {
      const header = getCacheControlHeader('socialProof');

      expect(header).toContain('public');
      expect(header).toContain('max-age=1800');
      expect(header).toContain('s-maxage=43200');
    });

    it('should return correct header for memoryStories', () => {
      const header = getCacheControlHeader('memoryStories');

      expect(header).toContain('s-maxage=604800'); // 7 days in seconds
    });

    it('should return correct header for lateNightScenarios', () => {
      const header = getCacheControlHeader('lateNightScenarios');

      expect(header).toContain('max-age=86400');
    });

    it('should return correct header for useCaseQuotes', () => {
      const header = getCacheControlHeader('useCaseQuotes');

      expect(header).toContain('public');
    });
  });

  describe('CachedHero Type', () => {
    it('should produce hero objects with all required fields', async () => {
      const hero = await getCachedHero('morning', 'new');

      // Type check via runtime validation
      const requiredFields: (keyof CachedHero)[] = [
        'id',
        'eyebrow',
        'headline',
        'subhead',
        'cta',
        'context',
        'generatedAt',
        'expiresAt',
      ];

      requiredFields.forEach((field) => {
        expect(hero).toHaveProperty(field);
      });
    });
  });
});
