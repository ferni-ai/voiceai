/**
 * Trust Context Injection Tests
 *
 * Verifies that trust context is:
 * - Registered as a context builder
 * - Injected into LLM context on each turn
 * - Contains all expected trust signals
 *
 * @module TrustContextInjectionTests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContextBuilderInput } from '../index.js';

// Mock all trust systems BEFORE any imports
vi.mock('../../../services/trust-systems/index.js', () => ({
  buildTrustContext: vi.fn().mockReturnValue({
    unsaidSignals: [],
    topicsToAvoid: [],
    growthReflection: null,
    callbackOpportunity: null,
    celebrationOpportunity: null,
  }),
  formatGuidanceForLLM: vi.fn().mockReturnValue(null),
  formatLearningGuidanceForLLM: vi.fn().mockReturnValue(null),
  generateSeasonalContextForLLM: vi.fn().mockReturnValue(null),
  generateTuningGuidance: vi.fn().mockReturnValue(null),
  generateVoiceContext: vi.fn().mockReturnValue(null),
  generateCelebrations: vi.fn().mockReturnValue([]),
  getEventsNeedingReminders: vi.fn().mockReturnValue([]),
  getFamiliarityScore: vi.fn().mockReturnValue({ score: 0 }),
  getHealthScore: vi.fn().mockReturnValue(null),
  getLearningProfile: vi.fn().mockReturnValue(null),
  getMomentumSummary: vi.fn().mockReturnValue(null),
  getStageName: vi.fn().mockReturnValue('building'),
  getUpcomingEvents: vi.fn().mockReturnValue({ today: [], thisWeek: [] }),
  processContextForSignals: vi.fn(),
  isGoodMomentForGrowth: vi.fn().mockReturnValue({ shouldSurface: false }),
  generateEarlyGrowthReflection: vi.fn().mockReturnValue(null),
  generateGrowthReflection: vi.fn().mockReturnValue(null),
}));

// Mock persona content loader
vi.mock('../../../services/persona-content-loader.js', () => ({
  loadTrustPhrases: vi.fn().mockResolvedValue({
    reading_between_lines: {
      false_fine: ['Test phrase 1'],
      deflection: ['Test phrase 2'],
    },
  }),
  getRandomPhraseClean: vi.fn().mockReturnValue('Test phrase'),
}));

describe('Trust Context Injection', () => {
  const createMockInput = (overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput =>
    ({
      userText: 'Hello, how are you?',
      services: {
        userId: 'test-user-123',
        sessionId: 'test-session-456',
      } as ContextBuilderInput['services'],
      userData: {
        turnCount: 5,
        isReturningUser: false,
        recentTopics: [],
      },
      analysis: {
        emotion: {
          primary: 'neutral',
          intensity: 0.5,
        },
        topics: {
          primary: 'greeting',
        },
        intent: {
          primary: 'greeting',
        },
      },
      persona: {
        id: 'ferni',
        name: 'Ferni',
      },
      userProfile: null,
      ...overrides,
    }) as ContextBuilderInput;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Builder Registration', () => {
    it('should be registered as a context builder', async () => {
      // Import trust-context first to trigger registration
      await import('../trust-context.js');

      // Then check registration
      const { getRegisteredBuilders } = await import('../index.js');
      const builders = getRegisteredBuilders();

      const trustBuilder = builders.find((b) => b.name === 'trust-context');
      expect(trustBuilder).toBeDefined();
      expect(trustBuilder?.priority).toBe(90);
    });
  });

  describe('Context Building', () => {
    it('should return empty array when no userId', async () => {
      const { buildTrustAwareContext } = await import('../trust-context.js');
      const input = createMockInput({
        services: { userId: undefined } as ContextBuilderInput['services'],
      });

      const result = await buildTrustAwareContext(input);

      expect(result).toEqual([]);
    });

    it('should return injections when userId is present', async () => {
      const { buildTrustAwareContext } = await import('../trust-context.js');
      const input = createMockInput();

      const result = await buildTrustAwareContext(input);

      // Should return an array (may be empty if no trust signals detected)
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle all persona types without throwing', async () => {
      const { buildTrustAwareContext } = await import('../trust-context.js');
      const personas = [
        'ferni',
        'maya-santos',
        'peter-john',
        'alex-chen',
        'jordan-taylor',
        'nayan-patel',
      ];

      for (const personaId of personas) {
        const input = createMockInput({
          persona: { id: personaId, name: personaId } as ContextBuilderInput['persona'],
        });

        // Should not throw for any persona
        const result = await buildTrustAwareContext(input);
        expect(Array.isArray(result)).toBe(true);
      }
    });
  });

  describe('Trust Signal Processing', () => {
    it('should call buildTrustContext with correct parameters', async () => {
      const { buildTrustAwareContext } = await import('../trust-context.js');
      const { buildTrustContext } = await import('../../../services/trust-systems/index.js');

      const input = createMockInput({ userText: "I'm feeling anxious today" });
      await buildTrustAwareContext(input);

      expect(buildTrustContext).toHaveBeenCalled();
      expect(buildTrustContext).toHaveBeenCalledWith(
        'test-user-123',
        "I'm feeling anxious today",
        expect.objectContaining({
          currentTopic: 'greeting',
          detectedEmotion: 'neutral',
        })
      );
    });

    it('should emit trust signals to frontend', async () => {
      const { buildTrustAwareContext } = await import('../trust-context.js');
      const { processContextForSignals } = await import('../../../services/trust-systems/index.js');

      const input = createMockInput();
      await buildTrustAwareContext(input);

      expect(processContextForSignals).toHaveBeenCalled();
    });
  });

  describe('Integration with Trust Systems', () => {
    it('should query relationship health when userId present', async () => {
      const { buildTrustAwareContext } = await import('../trust-context.js');
      const { getHealthScore } = await import('../../../services/trust-systems/index.js');

      const input = createMockInput();
      await buildTrustAwareContext(input);

      expect(getHealthScore).toHaveBeenCalledWith('test-user-123');
    });

    it('should query upcoming events for life events context', async () => {
      const { buildTrustAwareContext } = await import('../trust-context.js');
      const { getUpcomingEvents } = await import('../../../services/trust-systems/index.js');

      const input = createMockInput();
      await buildTrustAwareContext(input);

      expect(getUpcomingEvents).toHaveBeenCalledWith('test-user-123');
    });

    it('should check for events needing reminders', async () => {
      const { buildTrustAwareContext } = await import('../trust-context.js');
      const { getEventsNeedingReminders } = await import('../../../services/trust-systems/index.js');

      const input = createMockInput();
      await buildTrustAwareContext(input);

      expect(getEventsNeedingReminders).toHaveBeenCalledWith('test-user-123');
    });
  });

  describe('Error Handling', () => {
    it('should handle trust phrase loading errors gracefully', async () => {
      const { loadTrustPhrases } = await import('../../../services/persona-content-loader.js');
      vi.mocked(loadTrustPhrases).mockRejectedValueOnce(new Error('File not found'));

      const { buildTrustAwareContext } = await import('../trust-context.js');
      const input = createMockInput();

      // Should not throw
      const result = await buildTrustAwareContext(input);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle signal emission errors gracefully', async () => {
      const { processContextForSignals } = await import('../../../services/trust-systems/index.js');
      vi.mocked(processContextForSignals).mockImplementationOnce(() => {
        throw new Error('Signal emission failed');
      });

      const { buildTrustAwareContext } = await import('../trust-context.js');
      const input = createMockInput();

      // Should not throw
      const result = await buildTrustAwareContext(input);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
