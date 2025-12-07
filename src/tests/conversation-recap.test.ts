/**
 * Conversation Recap Context Builder Tests
 *
 * Tests for conversation recap functionality:
 * - RECAP_PATTERNS regex matching
 * - TOPIC_CALLBACK_PATTERNS regex matching
 * - buildConversationRecap function
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('../intelligence/context-builders/index.js', () => ({
  registerContextBuilder: vi.fn(),
  createStandardInjection: vi.fn((type, content) => ({ type, content, priority: 'standard' })),
  createHintInjection: vi.fn((type, content) => ({ type, content, priority: 'hint' })),
}));

import {
  RECAP_PATTERNS,
  TOPIC_CALLBACK_PATTERNS,
  buildConversationRecap,
} from '../intelligence/context-builders/conversation-recap.js';

describe('Conversation Recap', () => {
  describe('RECAP_PATTERNS', () => {
    const recapPhrases = [
      'Where were we?',
      'where was I?',
      'What were we talking about?',
      'what was I discussing?',
      'Remind me what we said',
      'catch me up',
      'what did we say earlier?',
      'What did I talk about?',
      'Back to what we were saying',
      'continue from where we left',
      'picking up from last time',
      'Where did we leave off?',
    ];

    it.each(recapPhrases)('should match recap phrase: "%s"', (phrase) => {
      const matches = RECAP_PATTERNS.some((pattern) => pattern.test(phrase));
      expect(matches).toBe(true);
    });

    const nonRecapPhrases = [
      'Hello there',
      'What is the weather?',
      'Tell me about stocks',
      'How are you?',
      'Can you help me?',
    ];

    it.each(nonRecapPhrases)('should NOT match non-recap phrase: "%s"', (phrase) => {
      const matches = RECAP_PATTERNS.some((pattern) => pattern.test(phrase));
      expect(matches).toBe(false);
    });
  });

  describe('TOPIC_CALLBACK_PATTERNS', () => {
    const callbackPhrases = [
      'Earlier you said something important',
      'earlier we talked about finances',
      'Going back to that investment idea',
      'Remember when you mentioned budgeting?',
      'You mentioned something about goals',
      'We discussed retirement planning',
      'About that thing with the savings',
    ];

    it.each(callbackPhrases)('should match topic callback phrase: "%s"', (phrase) => {
      const matches = TOPIC_CALLBACK_PATTERNS.some((pattern) => pattern.test(phrase));
      expect(matches).toBe(true);
    });

    const nonCallbackPhrases = [
      'I want to talk about something new',
      'What should I invest in?',
      'Tell me a joke',
      'How does compound interest work?',
    ];

    it.each(nonCallbackPhrases)('should NOT match non-callback phrase: "%s"', (phrase) => {
      const matches = TOPIC_CALLBACK_PATTERNS.some((pattern) => pattern.test(phrase));
      expect(matches).toBe(false);
    });
  });

  describe('buildConversationRecap', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return empty array when no recap or callback detected', async () => {
      const input = {
        userText: 'Hello, how are you?',
        userData: { recentTopics: [], keyMoments: [], turnCount: 0 },
        services: {},
      };

      const result = await buildConversationRecap(input);

      expect(result).toEqual([]);
    });

    it('should return recap injection when recap requested', async () => {
      const input = {
        userText: 'Where were we?',
        userData: {
          recentTopics: ['budgeting', 'savings', 'investments'],
          keyMoments: ['Set savings goal of $10k'],
          turnCount: 5,
        },
        services: {},
      };

      const result = await buildConversationRecap(input);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe('conversation_recap');
      expect(result[0].content).toContain('CONVERSATION RECAP REQUESTED');
      expect(result[0].content).toContain('5 exchanges');
      expect(result[0].content).toContain('budgeting');
    });

    it('should include last conversation summary in recap when available', async () => {
      const input = {
        userText: 'Catch me up please',
        userData: {
          recentTopics: ['stocks'],
          keyMoments: [],
          turnCount: 3,
        },
        services: {
          userProfile: {
            lastConversationSummary: 'Last time we discussed your 401k options',
          },
        },
      };

      const result = await buildConversationRecap(input);

      expect(result.length).toBe(1);
      expect(result[0].content).toContain('Last time we spoke');
      expect(result[0].content).toContain('401k');
    });

    it('should return topic callback injection when callback detected', async () => {
      const input = {
        userText: 'Earlier you mentioned something about budgeting',
        userData: {
          recentTopics: ['budgeting', 'emergency fund', 'debt payoff'],
          keyMoments: [],
          turnCount: 8,
        },
        services: {},
      };

      const result = await buildConversationRecap(input);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe('topic_callback');
      expect(result[0].content).toContain('TOPIC CALLBACK');
      expect(result[0].content).toContain('budgeting');
    });

    it('should handle empty userData gracefully', async () => {
      const input = {
        userText: 'Where were we?',
        userData: undefined,
        services: {},
      };

      const result = await buildConversationRecap(input);

      // Should still return recap (even if minimal)
      expect(result.length).toBe(1);
    });

    it('should not return callback injection when no recent topics', async () => {
      const input = {
        userText: 'Earlier you mentioned something',
        userData: {
          recentTopics: [],
          keyMoments: [],
          turnCount: 2,
        },
        services: {},
      };

      const result = await buildConversationRecap(input);

      // No topics to reference, so no callback injection
      expect(result).toEqual([]);
    });
  });
});
