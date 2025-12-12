/**
 * Topics Context Builder Tests
 *
 * Tests for topic management functionality:
 * - Topic threading (tracking multiple topics)
 * - Topic change transitions
 * - Topic threading verification
 * - Goal connection
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted to define mocks that are available when vi.mock is hoisted
const {
  mockCreateStandardInjection,
  mockCreateHintInjection,
  mockRegisterContextBuilder,
  mockVerifyTopicThreading,
  mockGetProactiveGoalReference,
  mockGetConversationEnhancements,
} = vi.hoisted(() => ({
  mockCreateStandardInjection: vi.fn((type: string, content: string) => ({
    type,
    content,
    priority: 'standard',
  })),
  mockCreateHintInjection: vi.fn((type: string, content: string) => ({
    type,
    content,
    priority: 'hint',
  })),
  mockRegisterContextBuilder: vi.fn(),
  mockVerifyTopicThreading: vi.fn(),
  mockGetProactiveGoalReference: vi.fn(),
  mockGetConversationEnhancements: vi.fn(),
}));

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('../intelligence/context-builders/index.js', () => ({
  registerContextBuilder: mockRegisterContextBuilder,
  createStandardInjection: mockCreateStandardInjection,
  createHintInjection: mockCreateHintInjection,
}));

vi.mock('../intelligence/human-behaviors.js', () => ({
  verifyTopicThreading: mockVerifyTopicThreading,
  getProactiveGoalReference: mockGetProactiveGoalReference,
}));

vi.mock('../services/conversation-manager.js', () => ({
  // Session-scoped is now the default export used by the builder
  getSessionConversationManager: vi.fn(() => ({
    getConversationEnhancements: mockGetConversationEnhancements,
  })),
  // Keep legacy export mocked for backward-compatibility
  getConversationManager: vi.fn(() => ({
    getConversationEnhancements: mockGetConversationEnhancements,
  })),
}));

import { buildTopicsContext } from '../intelligence/context-builders/topics.js';

describe('Topics Context Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversationEnhancements.mockReturnValue({});
    mockVerifyTopicThreading.mockReturnValue({});
    mockGetProactiveGoalReference.mockReturnValue(null);
  });

  describe('Registration', () => {
    it('should export buildTopicsContext function', () => {
      // Registration happens at module load, tested via export
      expect(typeof buildTopicsContext).toBe('function');
    });
  });

  describe('Topic Threading', () => {
    it('should create topic threading injection when multiple topics exist', () => {
      const input = {
        userText: 'Let me get back to budgeting',
        analysis: {
          topics: { detected: ['budgeting'] },
          emotion: { primary: 'neutral' },
        },
        userData: { turnCount: 5 },
        services: {
          getPromptContext: () => ({
            topicsToCircleBack: ['budgeting', 'retirement', 'emergency fund'],
          }),
          getSpeechContext: () => ({ topicWeight: 'medium' }),
        },
      };

      const result = buildTopicsContext(input);

      const threadingInjection = result.find((i) => i.type === 'topic_threading');
      expect(threadingInjection).toBeDefined();
      expect(threadingInjection?.content).toContain('budgeting');
      expect(threadingInjection?.content).toContain('retirement');
      expect(threadingInjection?.content).toContain('emergency fund');
    });

    it('should not create topic threading when no other topics to circle back', () => {
      const input = {
        userText: 'Lets talk about budgeting',
        analysis: {
          topics: { detected: ['budgeting'] },
          emotion: { primary: 'neutral' },
        },
        userData: { turnCount: 3 },
        services: {
          getPromptContext: () => ({
            topicsToCircleBack: ['budgeting'], // Same topic only
          }),
          getSpeechContext: () => undefined,
        },
      };

      const result = buildTopicsContext(input);

      const threadingInjection = result.find((i) => i.type === 'topic_threading');
      expect(threadingInjection).toBeUndefined();
    });

    it('should not create topic threading when no detected topics', () => {
      const input = {
        userText: 'Hello',
        analysis: {
          topics: { detected: [] },
          emotion: { primary: 'neutral' },
        },
        userData: { turnCount: 3 },
        services: {
          getPromptContext: () => ({
            topicsToCircleBack: ['retirement', 'savings'],
          }),
          getSpeechContext: () => undefined,
        },
      };

      const result = buildTopicsContext(input);

      const threadingInjection = result.find((i) => i.type === 'topic_threading');
      expect(threadingInjection).toBeUndefined();
    });
  });

  describe('Topic Transitions', () => {
    it('should create topic transition injection when topic changes', () => {
      mockGetConversationEnhancements.mockReturnValue({
        topicTransition: "That's a great shift - let me address that",
      });

      const input = {
        userText: 'Actually, what about investing?',
        analysis: {
          topics: { detected: ['investing'] },
          emotion: { primary: 'curious' },
        },
        userData: { turnCount: 5 },
        services: {
          getPromptContext: () => ({ topicsToCircleBack: [] }),
          getSpeechContext: () => ({ topicWeight: 'high' }),
        },
      };

      const result = buildTopicsContext(input);

      const transitionInjection = result.find((i) => i.type === 'topic_transition');
      expect(transitionInjection).toBeDefined();
      expect(transitionInjection?.content).toContain("That's a great shift");
    });

    it('should not create transition injection when no topic change', () => {
      mockGetConversationEnhancements.mockReturnValue({
        topicTransition: undefined,
      });

      const input = {
        userText: 'Tell me more about budgeting',
        analysis: {
          topics: { detected: ['budgeting'] },
          emotion: { primary: 'neutral' },
        },
        userData: { turnCount: 3 },
        services: {
          getPromptContext: () => ({ topicsToCircleBack: [] }),
          getSpeechContext: () => undefined,
        },
      };

      const result = buildTopicsContext(input);

      const transitionInjection = result.find((i) => i.type === 'topic_transition');
      expect(transitionInjection).toBeUndefined();
    });

    it('should use medium topic weight when getSpeechContext returns undefined', () => {
      mockGetConversationEnhancements.mockReturnValue({});

      const input = {
        userText: 'What about savings?',
        analysis: {
          topics: { detected: ['savings'] },
          emotion: { primary: 'neutral' },
        },
        userData: { turnCount: 3 },
        services: {
          getPromptContext: () => ({ topicsToCircleBack: [] }),
          getSpeechContext: () => undefined,
        },
      };

      buildTopicsContext(input);

      expect(mockGetConversationEnhancements).toHaveBeenCalledWith(
        'What about savings?',
        expect.anything(),
        'medium' // Default when undefined
      );
    });
  });

  describe('Topic Threading Verification', () => {
    it('should verify topic threading after 5 turns with circle back topics', () => {
      mockVerifyTopicThreading.mockReturnValue({
        suggestion: 'Consider circling back to retirement planning',
      });

      const mockTurns = [
        { role: 'user', content: 'Tell me about budgeting' },
        { role: 'assistant', content: 'Here are some tips...' },
        { role: 'user', content: 'Thanks' },
        { role: 'assistant', content: 'You are welcome' },
      ];

      const input = {
        userText: 'What else?',
        analysis: {
          topics: { detected: ['general'] },
          emotion: { primary: 'neutral' },
        },
        userData: { turnCount: 8 },
        services: {
          getPromptContext: () => ({
            topicsToCircleBack: ['retirement', 'savings'],
          }),
          getSpeechContext: () => undefined,
          historyTracker: {
            getSimpleTurns: () => mockTurns,
            getTurnCount: () => 8,
          },
        },
      };

      const result = buildTopicsContext(input);

      const verifyInjection = result.find((i) => i.type === 'topic_verify');
      expect(verifyInjection).toBeDefined();
      expect(verifyInjection?.content).toContain('retirement planning');
    });

    it('should not verify topic threading before turn 6', () => {
      const input = {
        userText: 'Hello',
        analysis: {
          topics: { detected: ['general'] },
          emotion: { primary: 'neutral' },
        },
        userData: { turnCount: 3 },
        services: {
          getPromptContext: () => ({
            topicsToCircleBack: ['retirement'],
          }),
          getSpeechContext: () => undefined,
          historyTracker: {
            getSimpleTurns: () => [],
            getTurnCount: () => 3,
          },
        },
      };

      const result = buildTopicsContext(input);

      expect(mockVerifyTopicThreading).not.toHaveBeenCalled();
      const verifyInjection = result.find((i) => i.type === 'topic_verify');
      expect(verifyInjection).toBeUndefined();
    });

    it('should not verify when no circle back topics', () => {
      const input = {
        userText: 'Hello',
        analysis: {
          topics: { detected: ['general'] },
          emotion: { primary: 'neutral' },
        },
        userData: { turnCount: 10 },
        services: {
          getPromptContext: () => ({
            topicsToCircleBack: [],
          }),
          getSpeechContext: () => undefined,
          historyTracker: {
            getSimpleTurns: () => [],
            getTurnCount: () => 10,
          },
        },
      };

      const result = buildTopicsContext(input);

      expect(mockVerifyTopicThreading).not.toHaveBeenCalled();
      const verifyInjection = result.find((i) => i.type === 'topic_verify');
      expect(verifyInjection).toBeUndefined();
    });

    it('should handle missing historyTracker gracefully', () => {
      mockVerifyTopicThreading.mockReturnValue({});

      const input = {
        userText: 'Hello',
        analysis: {
          topics: { detected: ['general'] },
          emotion: { primary: 'neutral' },
        },
        userData: { turnCount: 8 },
        services: {
          getPromptContext: () => ({
            topicsToCircleBack: ['retirement'],
          }),
          getSpeechContext: () => undefined,
          // No historyTracker
        },
      };

      const result = buildTopicsContext(input);

      // Should call with empty array when no historyTracker
      expect(mockVerifyTopicThreading).toHaveBeenCalledWith([], ['retirement']);
    });
  });

  describe('Goal Connection', () => {
    it('should create goal connection injection when user has goals', () => {
      mockGetProactiveGoalReference.mockReturnValue(
        'This ties into your goal of saving $50k for a house down payment'
      );

      const input = {
        userText: 'How should I budget better?',
        analysis: {
          topics: { detected: ['budgeting'] },
          emotion: { primary: 'curious' },
        },
        userData: { turnCount: 3 },
        userProfile: {
          goals: [{ id: 'goal-1', type: 'savings', target: 50000, name: 'House down payment' }],
        },
        services: {
          getPromptContext: () => ({ topicsToCircleBack: [] }),
          getSpeechContext: () => undefined,
        },
      };

      const result = buildTopicsContext(input);

      const goalInjection = result.find((i) => i.type === 'goal_connection');
      expect(goalInjection).toBeDefined();
      expect(goalInjection?.content).toContain('$50k');
    });

    it('should not create goal injection when no goals', () => {
      const input = {
        userText: 'Tell me about investing',
        analysis: {
          topics: { detected: ['investing'] },
          emotion: { primary: 'curious' },
        },
        userData: { turnCount: 3 },
        userProfile: {
          goals: [],
        },
        services: {
          getPromptContext: () => ({ topicsToCircleBack: [] }),
          getSpeechContext: () => undefined,
        },
      };

      const result = buildTopicsContext(input);

      expect(mockGetProactiveGoalReference).not.toHaveBeenCalled();
      const goalInjection = result.find((i) => i.type === 'goal_connection');
      expect(goalInjection).toBeUndefined();
    });

    it('should not create goal injection when getProactiveGoalReference returns null', () => {
      mockGetProactiveGoalReference.mockReturnValue(null);

      const input = {
        userText: 'What about taxes?',
        analysis: {
          topics: { detected: ['taxes'] },
          emotion: { primary: 'neutral' },
        },
        userData: { turnCount: 3 },
        userProfile: {
          goals: [{ id: 'goal-1', type: 'savings', target: 10000 }],
        },
        services: {
          getPromptContext: () => ({ topicsToCircleBack: [] }),
          getSpeechContext: () => undefined,
        },
      };

      const result = buildTopicsContext(input);

      const goalInjection = result.find((i) => i.type === 'goal_connection');
      expect(goalInjection).toBeUndefined();
    });

    it('should use truncated user text when no detected topics', () => {
      mockGetProactiveGoalReference.mockReturnValue('Relevant to your goal');

      const longText = 'A'.repeat(100);
      const input = {
        userText: longText,
        analysis: {
          topics: { detected: [] },
          emotion: { primary: 'neutral' },
        },
        userData: { turnCount: 3 },
        userProfile: {
          goals: [{ id: 'goal-1', type: 'savings', target: 10000 }],
        },
        services: {
          getPromptContext: () => ({ topicsToCircleBack: [] }),
          getSpeechContext: () => undefined,
        },
      };

      buildTopicsContext(input);

      expect(mockGetProactiveGoalReference).toHaveBeenCalledWith(
        input.userProfile,
        longText.slice(0, 50) // Should truncate to 50 chars
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing getPromptContext gracefully', () => {
      const input = {
        userText: 'Hello',
        analysis: {
          topics: { detected: ['general'] },
          emotion: { primary: 'neutral' },
        },
        userData: { turnCount: 3 },
        services: {
          // No getPromptContext
          getSpeechContext: () => undefined,
        },
      };

      expect(() => buildTopicsContext(input)).not.toThrow();
      const result = buildTopicsContext(input);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle undefined turnCount', () => {
      const input = {
        userText: 'Hello',
        analysis: {
          topics: { detected: ['general'] },
          emotion: { primary: 'neutral' },
        },
        userData: {}, // No turnCount
        services: {
          getPromptContext: () => ({ topicsToCircleBack: [] }),
          getSpeechContext: () => undefined,
        },
      };

      expect(() => buildTopicsContext(input)).not.toThrow();
    });

    it('should handle missing userProfile', () => {
      const input = {
        userText: 'Hello',
        analysis: {
          topics: { detected: ['general'] },
          emotion: { primary: 'neutral' },
        },
        userData: { turnCount: 3 },
        // No userProfile
        services: {
          getPromptContext: () => ({ topicsToCircleBack: [] }),
          getSpeechContext: () => undefined,
        },
      };

      expect(() => buildTopicsContext(input)).not.toThrow();
      expect(mockGetProactiveGoalReference).not.toHaveBeenCalled();
    });

    it('should return empty array when no injections needed', () => {
      mockGetConversationEnhancements.mockReturnValue({});

      const input = {
        userText: 'Hello',
        analysis: {
          topics: { detected: [] },
          emotion: { primary: 'neutral' },
        },
        userData: { turnCount: 1 },
        services: {
          getPromptContext: () => ({ topicsToCircleBack: [] }),
          getSpeechContext: () => undefined,
        },
      };

      const result = buildTopicsContext(input);

      expect(result).toEqual([]);
    });
  });
});
