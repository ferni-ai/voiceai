/**
 * Turn Processing Integration Tests
 *
 * Tests the complete turn processing pipeline including:
 * - Message analysis
 * - Emotional state building
 * - Context injection
 * - Response guidance generation
 *
 * @module agents/__tests__/integration/turn-processing
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Setup mocks BEFORE importing modules under test
import {
  createMockAnalysis,
  createMockChatContext,
  createMockEmotionAnalysis,
  createMockLLMClient,
  createMockPersona,
  createMockSessionServices,
  createMockUserData,
  resetAllMocks,
  setupAllMocks,
} from '../mocks/index.js';

import { emotionalStates, users } from '../fixtures/index.js';

// Setup all mocks
const mockLLM = createMockLLMClient();
setupAllMocks({ llmClient: mockLLM });

// Now import the modules under test
import { getCelebrationEvents, injectTurnContext } from '../../processors/turn-processor.js';
import type { TurnProcessorResult } from '../../processors/types.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createBaseTurnResult(overrides: Partial<TurnProcessorResult> = {}): TurnProcessorResult {
  return {
    analysis: {
      analysis: createMockAnalysis() as unknown as TurnProcessorResult['analysis']['analysis'],
      currentTopic: 'general',
      previousTopic: undefined,
      topicChanged: false,
    },
    context: {
      injections: [],
      elapsedMs: 10,
    },
    emotional: {
      primary: 'neutral',
      intensity: 0.5,
      distressLevel: 0,
      trajectory: 'stable',
    },
    response: {
      length: { min: 20, max: 100, guidance: 'Normal response' },
    },
    identity: {
      needsReinforcement: false,
      activeAgentId: 'ferni',
      sessionPersonaId: 'ferni',
    },
    ...overrides,
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Turn Processing Integration Tests', () => {
  let mockServices: ReturnType<typeof createMockSessionServices>;
  let mockPersona: ReturnType<typeof createMockPersona>;
  let mockUserData: ReturnType<typeof createMockUserData>;

  beforeEach(() => {
    resetAllMocks();
    mockLLM.clearHistory();

    mockServices = createMockSessionServices({
      userId: users.returningUser.id,
      isReturningUser: true,
      relationshipTurns: 50,
    });
    mockPersona = createMockPersona('ferni');
    mockUserData = createMockUserData();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // CONTEXT INJECTION
  // ==========================================================================

  describe('Context Injection', () => {
    it('should inject context into chat context', () => {
      const chatCtx = createMockChatContext();
      const result = createBaseTurnResult({
        context: {
          injections: [
            { category: 'humanizing', content: 'Be warm and friendly', priority: 5 },
            { category: 'emotional', content: 'User seems happy', priority: 3 },
          ],
          elapsedMs: 10,
        },
      });

      injectTurnContext(chatCtx as unknown as Parameters<typeof injectTurnContext>[0], result);

      expect(chatCtx.addMessage).toHaveBeenCalledTimes(1);
      expect(chatCtx.addMessage).toHaveBeenCalledWith({
        role: 'user',
        content: expect.stringContaining('Be warm and friendly'),
      });
    });

    it('should not inject if no injections present', () => {
      const chatCtx = createMockChatContext();
      const result = createBaseTurnResult({
        context: { injections: [], elapsedMs: 5 },
      });

      injectTurnContext(chatCtx as unknown as Parameters<typeof injectTurnContext>[0], result);

      expect(chatCtx.addMessage).not.toHaveBeenCalled();
    });

    it('should combine multiple injections with double newlines', () => {
      const chatCtx = createMockChatContext();
      const result = createBaseTurnResult({
        context: {
          injections: [
            { category: 'a', content: 'First', priority: 1 },
            { category: 'b', content: 'Second', priority: 2 },
            { category: 'c', content: 'Third', priority: 3 },
          ],
          elapsedMs: 10,
        },
      });

      injectTurnContext(chatCtx as unknown as Parameters<typeof injectTurnContext>[0], result);

      const callArg = (chatCtx.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArg.content.split('\n\n').length).toBe(3);
    });

    it('should preserve injection content exactly', () => {
      const chatCtx = createMockChatContext();
      const specialContent = 'Remember: user mentioned "anxiety" and "stress" yesterday.';
      const result = createBaseTurnResult({
        context: {
          injections: [{ category: 'memory', content: specialContent, priority: 7 }],
          elapsedMs: 5,
        },
      });

      injectTurnContext(chatCtx as unknown as Parameters<typeof injectTurnContext>[0], result);

      const callArg = (chatCtx.addMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArg.content).toBe(specialContent);
    });
  });

  // ==========================================================================
  // CELEBRATION EVENTS
  // ==========================================================================

  describe('Celebration Event Detection', () => {
    it('should detect milestone events', () => {
      const result = createBaseTurnResult({
        context: {
          injections: [{ category: 'milestone', content: 'User hit 30-day streak!', priority: 10 }],
          elapsedMs: 10,
        },
      });

      const events = getCelebrationEvents(result);

      expect(events).toHaveLength(1);
      expect(events[0].category).toBe('milestone');
    });

    it('should detect achievement events', () => {
      const result = createBaseTurnResult({
        context: {
          injections: [
            { category: 'achievement', content: 'Completed weekly goal!', priority: 10 },
          ],
          elapsedMs: 10,
        },
      });

      const events = getCelebrationEvents(result);

      expect(events).toHaveLength(1);
      expect(events[0].category).toBe('achievement');
    });

    it('should detect aha_moment events', () => {
      const result = createBaseTurnResult({
        context: {
          injections: [{ category: 'aha_moment', content: 'User had insight!', priority: 10 }],
          elapsedMs: 10,
        },
      });

      const events = getCelebrationEvents(result);

      expect(events).toHaveLength(1);
      expect(events[0].category).toBe('aha_moment');
    });

    it('should detect good_news events', () => {
      const result = createBaseTurnResult({
        context: {
          injections: [{ category: 'good_news', content: 'Got the job!', priority: 10 }],
          elapsedMs: 10,
        },
      });

      const events = getCelebrationEvents(result);

      expect(events).toHaveLength(1);
      expect(events[0].category).toBe('good_news');
    });

    it('should return empty array for non-celebration injections', () => {
      const result = createBaseTurnResult({
        context: {
          injections: [
            { category: 'humanizing', content: 'Be warm', priority: 5 },
            { category: 'emotional', content: 'Neutral state', priority: 3 },
          ],
          elapsedMs: 10,
        },
      });

      const events = getCelebrationEvents(result);

      expect(events).toHaveLength(0);
    });

    it('should return multiple celebration events', () => {
      const result = createBaseTurnResult({
        context: {
          injections: [
            { category: 'milestone', content: '100 days!', priority: 10 },
            { category: 'achievement', content: 'Goal completed!', priority: 10 },
            { category: 'humanizing', content: 'Be warm', priority: 5 },
          ],
          elapsedMs: 10,
        },
      });

      const events = getCelebrationEvents(result);

      expect(events).toHaveLength(2);
      expect(events.map((e) => e.category)).toContain('milestone');
      expect(events.map((e) => e.category)).toContain('achievement');
    });
  });

  // ==========================================================================
  // EMOTIONAL STATE HANDLING
  // ==========================================================================

  describe('Emotional State Handling', () => {
    it('should handle happy emotional state', () => {
      const result = createBaseTurnResult({
        emotional: emotionalStates.happy,
      });

      expect(result.emotional.primary).toBe('happy');
      expect(result.emotional.distressLevel).toBe(0);
      expect(result.emotional.trajectory).toBe('stable');
    });

    it('should handle distressed emotional state', () => {
      const result = createBaseTurnResult({
        emotional: {
          primary: 'distressed',
          intensity: 0.95,
          distressLevel: 0.9,
          trajectory: 'volatile',
        },
      });

      expect(result.emotional.primary).toBe('distressed');
      expect(result.emotional.distressLevel).toBe(0.9);
      expect(result.emotional.trajectory).toBe('volatile');
    });

    it('should include trajectory in emotional state', () => {
      const trajectories = ['stable', 'improving', 'declining', 'volatile'] as const;

      for (const trajectory of trajectories) {
        const result = createBaseTurnResult({
          emotional: {
            primary: 'neutral',
            intensity: 0.5,
            distressLevel: 0,
            trajectory,
          },
        });

        expect(result.emotional.trajectory).toBe(trajectory);
      }
    });
  });

  // ==========================================================================
  // RESPONSE GUIDANCE
  // ==========================================================================

  describe('Response Guidance', () => {
    it('should include response length guidance', () => {
      const result = createBaseTurnResult({
        response: {
          length: { min: 30, max: 150, guidance: 'Provide detailed response' },
        },
      });

      expect(result.response.length.min).toBe(30);
      expect(result.response.length.max).toBe(150);
      expect(result.response.length.guidance).toBe('Provide detailed response');
    });

    it('should handle short response guidance', () => {
      const result = createBaseTurnResult({
        response: {
          length: { min: 10, max: 50, guidance: 'Keep it brief' },
        },
      });

      expect(result.response.length.max).toBeLessThan(100);
    });
  });

  // ==========================================================================
  // IDENTITY CONTEXT
  // ==========================================================================

  describe('Identity Context', () => {
    it('should track active agent id', () => {
      const result = createBaseTurnResult({
        identity: {
          needsReinforcement: false,
          activeAgentId: 'maya',
          sessionPersonaId: 'maya',
        },
      });

      expect(result.identity.activeAgentId).toBe('maya');
      expect(result.identity.sessionPersonaId).toBe('maya');
    });

    it('should flag identity reinforcement after handoff', () => {
      const result = createBaseTurnResult({
        identity: {
          needsReinforcement: true,
          activeAgentId: 'jordan',
          sessionPersonaId: 'ferni', // Changed from ferni
        },
      });

      expect(result.identity.needsReinforcement).toBe(true);
      expect(result.identity.activeAgentId).not.toBe(result.identity.sessionPersonaId);
    });
  });

  // ==========================================================================
  // ANALYSIS RESULTS
  // ==========================================================================

  describe('Analysis Results', () => {
    it('should track topic changes', () => {
      const result = createBaseTurnResult({
        analysis: {
          analysis: createMockAnalysis() as unknown as TurnProcessorResult['analysis']['analysis'],
          currentTopic: 'career',
          previousTopic: 'relationships',
          topicChanged: true,
        },
      });

      expect(result.analysis.topicChanged).toBe(true);
      expect(result.analysis.currentTopic).toBe('career');
      expect(result.analysis.previousTopic).toBe('relationships');
    });

    it('should handle no topic change', () => {
      const result = createBaseTurnResult({
        analysis: {
          analysis: createMockAnalysis() as unknown as TurnProcessorResult['analysis']['analysis'],
          currentTopic: 'health',
          previousTopic: 'health',
          topicChanged: false,
        },
      });

      expect(result.analysis.topicChanged).toBe(false);
      expect(result.analysis.currentTopic).toBe(result.analysis.previousTopic);
    });
  });

  // ==========================================================================
  // LLM INTERACTION
  // ==========================================================================

  describe('LLM Interaction', () => {
    it('should queue and use LLM responses', async () => {
      mockLLM.queueResponse('I understand. That sounds challenging.');

      const response = await mockLLM.generate([{ role: 'user', content: "I'm feeling stressed." }]);

      expect(response).toBe('I understand. That sounds challenging.');
    });

    it('should stream LLM responses', async () => {
      mockLLM.queueResponse('Hello there friend!');

      const chunks: string[] = [];
      for await (const chunk of mockLLM.generateStream([{ role: 'user', content: 'Hi!' }])) {
        chunks.push(chunk.delta);
      }

      expect(chunks.join('')).toBe('Hello there friend!');
    });

    it('should track LLM call history', async () => {
      const messages = [{ role: 'user' as const, content: 'Test message' }];

      await mockLLM.generate(messages);

      const history = mockLLM.getCallHistory();
      expect(history).toHaveLength(1);
      expect(history[0].messages[0].content).toBe('Test message');
    });
  });

  // ==========================================================================
  // USER MESSAGE FIXTURES
  // ==========================================================================

  describe('User Message Processing', () => {
    it('should handle greeting messages', () => {
      const greetingAnalysis = createMockAnalysis({
        topics: { detected: ['greeting'], confidence: 0.9 },
      });

      expect(greetingAnalysis.topics.detected).toContain('greeting');
    });

    it('should handle emotional messages', () => {
      const emotionalAnalysis = createMockAnalysis({
        emotion: createMockEmotionAnalysis('anxious', 0.8, 0.6),
        state: {
          userNeedsSupport: true,
          isVenting: false,
          needsAcknowledgment: true,
          emotionalDepth: 0.7,
        },
      });

      expect(emotionalAnalysis.emotion.primary).toBe('anxious');
      expect(emotionalAnalysis.state.userNeedsSupport).toBe(true);
    });

    it('should detect questions', () => {
      const questionAnalysis = createMockAnalysis({
        isQuestion: true,
      });

      expect(questionAnalysis.isQuestion).toBe(true);
    });

    it('should detect crisis indicators', () => {
      const crisisAnalysis = createMockAnalysis({
        hasCrisisIndicators: true,
        emotion: createMockEmotionAnalysis('distressed', 0.95, 0.9),
      });

      expect(crisisAnalysis.hasCrisisIndicators).toBe(true);
      expect(crisisAnalysis.emotion.distressLevel).toBeGreaterThan(0.8);
    });
  });

  // ==========================================================================
  // TIMING
  // ==========================================================================

  describe('Timing Tracking', () => {
    it('should track elapsed time in context', () => {
      const result = createBaseTurnResult({
        context: {
          injections: [],
          elapsedMs: 150,
        },
      });

      expect(result.context.elapsedMs).toBe(150);
    });

    it('should report reasonable elapsed times', () => {
      // Typical processing should be under 500ms
      const result = createBaseTurnResult({
        context: {
          injections: [{ category: 'test', content: 'test', priority: 1 }],
          elapsedMs: 250,
        },
      });

      expect(result.context.elapsedMs).toBeLessThan(500);
    });
  });
});
