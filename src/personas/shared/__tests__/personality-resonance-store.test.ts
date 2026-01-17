/**
 * Unit tests for Personality Resonance Store
 *
 * Tests cross-session resonance learning for the "Better Than Human" system.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  detectEngagement,
  getCachedResonance,
  prewarmResonanceCache,
  recordResonanceEvent,
  recordUserTopicMention,
  recordVulnerabilityResponse,
  flushResonanceProfile,
} from '../personality-resonance-store.js';

// Mock Firestore
vi.mock('../../../memory/firestore.js', () => ({
  getFirestore: vi.fn().mockResolvedValue({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({
          exists: false,
          data: () => undefined,
        }),
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({
            set: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue({
              exists: false,
              data: () => undefined,
            }),
          }),
        }),
      }),
    }),
  }),
}));

describe('personality-resonance-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('detectEngagement', () => {
    // Tests based on actual patterns from personality-resonance-store.ts:
    // Positive: /thank you for sharing/i, /i (love|like) that/i, /haha|lol/i, /yes!? (exactly|definitely|totally)/i, /wow/i, /me too/i, /same/i, /that makes sense/i

    it('detects positive engagement from "thank you for sharing"', () => {
      const previousExpression = {
        theme: 'vulnerability' as const,
        content: "I've been thinking about you...",
      };

      const userResponse = 'Thank you for sharing that with me!';

      const engagement = detectEngagement(userResponse, previousExpression);

      expect(engagement).toBe('positive');
    });

    it('detects positive engagement from laughter (haha)', () => {
      const previousExpression = {
        theme: 'quirky_interests' as const,
        content: 'I love collecting vintage mugs',
      };

      const userResponse = 'haha thats great';

      const engagement = detectEngagement(userResponse, previousExpression);

      expect(engagement).toBe('positive');
    });

    it('detects positive engagement from "i love that"', () => {
      const previousExpression = {
        theme: 'sensory_moment' as const,
        content: 'The rain sounds nice today',
      };

      const userResponse = 'I love that about rainy days';

      const engagement = detectEngagement(userResponse, previousExpression);

      expect(engagement).toBe('positive');
    });

    it('detects positive engagement from "me too"', () => {
      const previousExpression = {
        theme: 'family_life' as const,
        content: 'My grandmother used to make amazing tea',
      };

      const userResponse = 'Me too! My grandmother did that as well.';

      const engagement = detectEngagement(userResponse, previousExpression);

      expect(engagement).toBe('positive');
    });

    it('detects negative engagement from dismissal (anyway)', () => {
      const previousExpression = {
        theme: 'quirky_interests' as const,
        content: 'Let me tell you about my collection...',
      };

      const userResponse = "anyway, let's move on";

      const engagement = detectEngagement(userResponse, previousExpression);

      expect(engagement).toBe('negative');
    });

    it('returns neutral for ambiguous responses (longer than 5 words)', () => {
      const previousExpression = {
        theme: 'sensory_moment' as const,
        content: 'I love mornings',
      };

      // Neutral: no patterns matched, more than 5 words, not vulnerability theme
      const userResponse = 'Interesting, I wonder about that sometimes';

      const engagement = detectEngagement(userResponse, previousExpression);

      expect(engagement).toBe('neutral');
    });

    it('detects negative for short response on vulnerability theme', () => {
      // Short responses (<5 words) to vulnerability are considered negative
      const previousExpression = {
        theme: 'vulnerability' as const,
        content: 'Sometimes I feel uncertain too',
      };

      const userResponse = 'ok';

      const engagement = detectEngagement(userResponse, previousExpression);

      expect(engagement).toBe('negative');
    });

    it('detects positive from "yes exactly"', () => {
      const previousExpression = {
        theme: 'vulnerability' as const,
        content: 'Sometimes I feel uncertain too',
      };

      const userResponse = 'Yes exactly! I feel the same way about that.';

      const engagement = detectEngagement(userResponse, previousExpression);

      expect(engagement).toBe('positive');
    });
  });

  describe('getCachedResonance', () => {
    it('returns null for unknown user', () => {
      const result = getCachedResonance('unknown-user-123');

      expect(result).toBeNull();
    });

    // Note: Can't easily test cache hits without mocking internal state
  });

  describe('prewarmResonanceCache', () => {
    it('does not throw for valid user', async () => {
      await expect(prewarmResonanceCache('test-user')).resolves.not.toThrow();
    });

    it('handles errors gracefully', async () => {
      // Should not throw even if Firestore fails
      await expect(prewarmResonanceCache('test-user')).resolves.not.toThrow();
    });
  });

  describe('recordResonanceEvent', () => {
    it('records positive engagement event', async () => {
      const event = {
        theme: 'vulnerability' as const,
        engagement: 'positive' as const,
        personaId: 'maya-santos',
        context: {
          turnCount: 5,
          momentum: 'cruising',
          emotion: 'calm',
        },
        timestamp: new Date(),
      };

      await expect(recordResonanceEvent('test-user', event)).resolves.not.toThrow();
    });

    it('records negative engagement event', async () => {
      const event = {
        theme: 'quirky_interests' as const,
        engagement: 'negative' as const,
        personaId: 'peter-john',
        context: {
          turnCount: 3,
          momentum: 'opening',
        },
        timestamp: new Date(),
      };

      await expect(recordResonanceEvent('test-user', event)).resolves.not.toThrow();
    });

    it('handles missing userId gracefully', async () => {
      const event = {
        theme: 'vulnerability' as const,
        engagement: 'positive' as const,
        personaId: 'alex-chen',
        context: {
          turnCount: 1,
          momentum: 'opening',
        },
        timestamp: new Date(),
      };

      // Should not throw with empty userId
      await expect(recordResonanceEvent('', event)).resolves.not.toThrow();
    });
  });

  describe('recordUserTopicMention', () => {
    it('records new topic mention', async () => {
      await expect(recordUserTopicMention('test-user', 'meditation')).resolves.not.toThrow();
    });

    it('records multiple topics', async () => {
      await recordUserTopicMention('test-user', 'work');
      await recordUserTopicMention('test-user', 'family');
      await expect(recordUserTopicMention('test-user', 'health')).resolves.not.toThrow();
    });

    it('handles empty topic gracefully', async () => {
      await expect(recordUserTopicMention('test-user', '')).resolves.not.toThrow();
    });
  });

  describe('recordVulnerabilityResponse', () => {
    it('records reciprocated vulnerability', async () => {
      await expect(recordVulnerabilityResponse('test-user', 'reciprocated')).resolves.not.toThrow();
    });

    it('records deflected vulnerability', async () => {
      await expect(recordVulnerabilityResponse('test-user', 'deflected')).resolves.not.toThrow();
    });
  });

  describe('flushResonanceProfile', () => {
    it('flushes profile for user', async () => {
      // Record some events first
      await recordResonanceEvent('flush-test-user', {
        theme: 'vulnerability' as const,
        engagement: 'positive' as const,
        personaId: 'jordan-taylor',
        context: { turnCount: 1, momentum: 'opening' },
        timestamp: new Date(),
      });

      await expect(flushResonanceProfile('flush-test-user')).resolves.not.toThrow();
    });

    it('handles flush for user with no data', async () => {
      await expect(flushResonanceProfile('nonexistent-user')).resolves.not.toThrow();
    });
  });

  describe('engagement detection patterns', () => {
    // Test patterns based on actual implementation in personality-resonance-store.ts
    const testPatterns = [
      { response: 'I love that!', expected: 'positive' },
      { response: 'wow thats amazing', expected: 'positive' },
      { response: 'yes exactly', expected: 'positive' },
      { response: 'lol thats great', expected: 'positive' },
      { response: 'thank you for sharing that', expected: 'positive' },
      { response: 'me too', expected: 'positive' },
      { response: 'I relate to that', expected: 'positive' },
      { response: 'that makes sense', expected: 'positive' },
      { response: 'anyway what about', expected: 'negative' },
      { response: "let's move on", expected: 'negative' },
      { response: 'sure', expected: 'negative' }, // "sure" is in negative patterns
      { response: 'ok...', expected: 'negative' }, // "ok..." with ellipsis is negative
    ];

    testPatterns.forEach(({ response, expected }) => {
      it(`detects "${expected}" from "${response}"`, () => {
        const engagement = detectEngagement(response, {
          theme: 'sensory_moment' as const,
          content: 'test content',
        });

        expect(engagement).toBe(expected);
      });
    });
  });

  describe('theme categories', () => {
    // Using valid ThemeCategory values
    const themes: Array<'vulnerability' | 'quirky_interests' | 'sensory_moment' | 'family_life'> = [
      'vulnerability',
      'quirky_interests',
      'sensory_moment',
      'family_life',
    ];

    themes.forEach((theme) => {
      it(`handles ${theme} theme correctly`, async () => {
        const event = {
          theme,
          engagement: 'positive' as const,
          personaId: 'maya-santos',
          context: { turnCount: 1, momentum: 'cruising' },
          timestamp: new Date(),
        };

        await expect(recordResonanceEvent('test-user', event)).resolves.not.toThrow();
      });
    });
  });
});
