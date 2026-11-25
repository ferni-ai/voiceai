/**
 * Turn Processor Tests
 *
 * Tests for the turn processing utility functions.
 * The main `processTurn` function has many dependencies and is better
 * suited for integration testing. These tests focus on the pure utility
 * functions that can be unit tested in isolation.
 *
 * @see speech-integrations.test.ts for integration tests
 */

import { describe, it, expect, vi } from 'vitest';
import type { TurnProcessorResult } from '../types.js';

// Import only the pure functions that don't require complex mocking
import { injectTurnContext, getCelebrationEvents } from '../turn-processor/index.js';

describe('Turn Processor Utility Functions', () => {
  describe('injectTurnContext', () => {
    it('should add combined injection content to chat context', () => {
      const mockChatContext = {
        addMessage: vi.fn(),
      };

      const mockResult: TurnProcessorResult = {
        analysis: {
          analysis: {} as TurnProcessorResult['analysis']['analysis'],
          currentTopic: 'general',
          previousTopic: undefined,
          topicChanged: false,
        },
        context: {
          injections: [
            { category: 'humanizing', content: 'Be warm and friendly', priority: 5 },
            { category: 'emotional', content: 'User seems happy', priority: 3 },
          ],
          elapsedMs: 10,
        },
        emotional: {
          primary: 'happy',
          intensity: 0.7,
          distressLevel: 0,
          trajectory: 'stable',
        },
        response: {
          length: { min: 20, max: 100, guidance: 'Keep it brief' },
        },
        identity: {
          needsReinforcement: false,
          activeAgentId: 'ferni',
          sessionPersonaId: 'ferni',
        },
      };

      injectTurnContext(
        mockChatContext as unknown as Parameters<typeof injectTurnContext>[0],
        mockResult
      );

      expect(mockChatContext.addMessage).toHaveBeenCalledTimes(1);
      expect(mockChatContext.addMessage).toHaveBeenCalledWith({
        role: 'user',
        content: expect.stringContaining('Be warm and friendly'),
      });
      expect(mockChatContext.addMessage).toHaveBeenCalledWith({
        role: 'user',
        content: expect.stringContaining('User seems happy'),
      });
    });

    it('should not add message if no injections', () => {
      const mockChatContext = {
        addMessage: vi.fn(),
      };

      const mockResult: TurnProcessorResult = {
        analysis: {
          analysis: {} as TurnProcessorResult['analysis']['analysis'],
          currentTopic: undefined,
          previousTopic: undefined,
          topicChanged: false,
        },
        context: {
          injections: [],
          elapsedMs: 5,
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
      };

      injectTurnContext(
        mockChatContext as unknown as Parameters<typeof injectTurnContext>[0],
        mockResult
      );

      expect(mockChatContext.addMessage).not.toHaveBeenCalled();
    });

    it('should combine multiple injections with double newlines', () => {
      const mockChatContext = {
        addMessage: vi.fn(),
      };

      const mockResult: TurnProcessorResult = {
        analysis: {
          analysis: {} as TurnProcessorResult['analysis']['analysis'],
          currentTopic: undefined,
          previousTopic: undefined,
          topicChanged: false,
        },
        context: {
          injections: [
            { category: 'a', content: 'First injection', priority: 1 },
            { category: 'b', content: 'Second injection', priority: 2 },
            { category: 'c', content: 'Third injection', priority: 3 },
          ],
          elapsedMs: 10,
        },
        emotional: {
          primary: 'neutral',
          intensity: 0.5,
          distressLevel: 0,
          trajectory: 'stable',
        },
        response: {
          length: { min: 20, max: 100, guidance: 'Normal' },
        },
        identity: {
          needsReinforcement: false,
          activeAgentId: 'ferni',
          sessionPersonaId: 'ferni',
        },
      };

      injectTurnContext(
        mockChatContext as unknown as Parameters<typeof injectTurnContext>[0],
        mockResult
      );

      const callArg = mockChatContext.addMessage.mock.calls[0][0];
      expect(callArg.content).toContain('First injection');
      expect(callArg.content).toContain('Second injection');
      expect(callArg.content).toContain('Third injection');
      // Should be separated by double newlines
      expect(callArg.content.split('\n\n').length).toBe(3);
    });

    it('should handle single injection without extra newlines', () => {
      const mockChatContext = {
        addMessage: vi.fn(),
      };

      const mockResult: TurnProcessorResult = {
        analysis: {
          analysis: {} as TurnProcessorResult['analysis']['analysis'],
          currentTopic: undefined,
          previousTopic: undefined,
          topicChanged: false,
        },
        context: {
          injections: [{ category: 'single', content: 'Only one injection', priority: 5 }],
          elapsedMs: 5,
        },
        emotional: {
          primary: 'neutral',
          intensity: 0.5,
          distressLevel: 0,
          trajectory: 'stable',
        },
        response: {
          length: { min: 20, max: 100, guidance: 'Normal' },
        },
        identity: {
          needsReinforcement: false,
          activeAgentId: 'ferni',
          sessionPersonaId: 'ferni',
        },
      };

      injectTurnContext(
        mockChatContext as unknown as Parameters<typeof injectTurnContext>[0],
        mockResult
      );

      const callArg = mockChatContext.addMessage.mock.calls[0][0];
      expect(callArg.content).toBe('Only one injection');
    });
  });

  describe('getCelebrationEvents', () => {
    it('should return empty array when no celebration injections', () => {
      const mockResult: TurnProcessorResult = {
        analysis: {
          analysis: {} as TurnProcessorResult['analysis']['analysis'],
          currentTopic: undefined,
          previousTopic: undefined,
          topicChanged: false,
        },
        context: {
          injections: [
            { category: 'humanizing', content: 'Be warm', priority: 5 },
            { category: 'emotional', content: 'User is happy', priority: 3 },
          ],
          elapsedMs: 10,
        },
        emotional: {
          primary: 'neutral',
          intensity: 0.5,
          distressLevel: 0,
          trajectory: 'stable',
        },
        response: {
          length: { min: 20, max: 100, guidance: 'Normal' },
        },
        identity: {
          needsReinforcement: false,
          activeAgentId: 'ferni',
          sessionPersonaId: 'ferni',
        },
      };

      const events = getCelebrationEvents(mockResult);

      expect(events).toEqual([]);
    });

    it('should return milestone events', () => {
      const mockResult: TurnProcessorResult = {
        analysis: {
          analysis: {} as TurnProcessorResult['analysis']['analysis'],
          currentTopic: undefined,
          previousTopic: undefined,
          topicChanged: false,
        },
        context: {
          injections: [
            { category: 'milestone', content: 'User hit a milestone!', priority: 10 },
            { category: 'humanizing', content: 'Be warm', priority: 5 },
          ],
          elapsedMs: 10,
        },
        emotional: {
          primary: 'happy',
          intensity: 0.8,
          distressLevel: 0,
          trajectory: 'improving',
        },
        response: {
          length: { min: 20, max: 100, guidance: 'Celebrate!' },
        },
        identity: {
          needsReinforcement: false,
          activeAgentId: 'ferni',
          sessionPersonaId: 'ferni',
        },
      };

      const events = getCelebrationEvents(mockResult);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        category: 'milestone',
        content: 'User hit a milestone!',
      });
    });

    it('should return achievement events', () => {
      const mockResult: TurnProcessorResult = {
        analysis: {
          analysis: {} as TurnProcessorResult['analysis']['analysis'],
          currentTopic: undefined,
          previousTopic: undefined,
          topicChanged: false,
        },
        context: {
          injections: [
            { category: 'achievement', content: 'User completed a goal!', priority: 10 },
          ],
          elapsedMs: 10,
        },
        emotional: {
          primary: 'happy',
          intensity: 0.9,
          distressLevel: 0,
          trajectory: 'improving',
        },
        response: {
          length: { min: 20, max: 100, guidance: 'Celebrate!' },
        },
        identity: {
          needsReinforcement: false,
          activeAgentId: 'ferni',
          sessionPersonaId: 'ferni',
        },
      };

      const events = getCelebrationEvents(mockResult);

      expect(events).toHaveLength(1);
      expect(events[0].category).toBe('achievement');
    });

    it('should return aha_moment events', () => {
      const mockResult: TurnProcessorResult = {
        analysis: {
          analysis: {} as TurnProcessorResult['analysis']['analysis'],
          currentTopic: undefined,
          previousTopic: undefined,
          topicChanged: false,
        },
        context: {
          injections: [
            { category: 'aha_moment', content: 'User had a realization!', priority: 10 },
          ],
          elapsedMs: 10,
        },
        emotional: {
          primary: 'excited',
          intensity: 0.85,
          distressLevel: 0,
          trajectory: 'improving',
        },
        response: {
          length: { min: 20, max: 100, guidance: 'Acknowledge insight' },
        },
        identity: {
          needsReinforcement: false,
          activeAgentId: 'ferni',
          sessionPersonaId: 'ferni',
        },
      };

      const events = getCelebrationEvents(mockResult);

      expect(events).toHaveLength(1);
      expect(events[0].category).toBe('aha_moment');
    });

    it('should return good_news events', () => {
      const mockResult: TurnProcessorResult = {
        analysis: {
          analysis: {} as TurnProcessorResult['analysis']['analysis'],
          currentTopic: undefined,
          previousTopic: undefined,
          topicChanged: false,
        },
        context: {
          injections: [{ category: 'good_news', content: 'User shared good news!', priority: 10 }],
          elapsedMs: 10,
        },
        emotional: {
          primary: 'happy',
          intensity: 0.8,
          distressLevel: 0,
          trajectory: 'improving',
        },
        response: {
          length: { min: 20, max: 100, guidance: 'Share excitement' },
        },
        identity: {
          needsReinforcement: false,
          activeAgentId: 'ferni',
          sessionPersonaId: 'ferni',
        },
      };

      const events = getCelebrationEvents(mockResult);

      expect(events).toHaveLength(1);
      expect(events[0].category).toBe('good_news');
    });

    it('should return multiple celebration events', () => {
      const mockResult: TurnProcessorResult = {
        analysis: {
          analysis: {} as TurnProcessorResult['analysis']['analysis'],
          currentTopic: undefined,
          previousTopic: undefined,
          topicChanged: false,
        },
        context: {
          injections: [
            { category: 'milestone', content: 'Hit 100 days!', priority: 10 },
            { category: 'achievement', content: 'Completed challenge!', priority: 10 },
            { category: 'humanizing', content: 'Be warm', priority: 5 },
            { category: 'aha_moment', content: 'Had insight!', priority: 10 },
          ],
          elapsedMs: 10,
        },
        emotional: {
          primary: 'ecstatic',
          intensity: 0.95,
          distressLevel: 0,
          trajectory: 'improving',
        },
        response: {
          length: { min: 20, max: 100, guidance: 'Big celebration!' },
        },
        identity: {
          needsReinforcement: false,
          activeAgentId: 'ferni',
          sessionPersonaId: 'ferni',
        },
      };

      const events = getCelebrationEvents(mockResult);

      expect(events).toHaveLength(3);
      expect(events.map((e) => e.category)).toContain('milestone');
      expect(events.map((e) => e.category)).toContain('achievement');
      expect(events.map((e) => e.category)).toContain('aha_moment');
      expect(events.map((e) => e.category)).not.toContain('humanizing');
    });

    it('should preserve event content', () => {
      const mockResult: TurnProcessorResult = {
        analysis: {
          analysis: {} as TurnProcessorResult['analysis']['analysis'],
          currentTopic: undefined,
          previousTopic: undefined,
          topicChanged: false,
        },
        context: {
          injections: [
            {
              category: 'milestone',
              content: 'Congratulations! You reached your 30-day streak!',
              priority: 10,
            },
          ],
          elapsedMs: 10,
        },
        emotional: {
          primary: 'happy',
          intensity: 0.9,
          distressLevel: 0,
          trajectory: 'improving',
        },
        response: {
          length: { min: 20, max: 100, guidance: 'Celebrate!' },
        },
        identity: {
          needsReinforcement: false,
          activeAgentId: 'ferni',
          sessionPersonaId: 'ferni',
        },
      };

      const events = getCelebrationEvents(mockResult);

      expect(events[0].content).toBe('Congratulations! You reached your 30-day streak!');
    });

    it('should handle empty injections array', () => {
      const mockResult: TurnProcessorResult = {
        analysis: {
          analysis: {} as TurnProcessorResult['analysis']['analysis'],
          currentTopic: undefined,
          previousTopic: undefined,
          topicChanged: false,
        },
        context: {
          injections: [],
          elapsedMs: 5,
        },
        emotional: {
          primary: 'neutral',
          intensity: 0.5,
          distressLevel: 0,
          trajectory: 'stable',
        },
        response: {
          length: { min: 20, max: 100, guidance: 'Normal' },
        },
        identity: {
          needsReinforcement: false,
          activeAgentId: 'ferni',
          sessionPersonaId: 'ferni',
        },
      };

      const events = getCelebrationEvents(mockResult);

      expect(events).toEqual([]);
    });
  });
});

// processTurn itself (including its "Empty user text" guard) runs for real in
// turn-processor/__tests__/caller-correction-crisis-hold.test.ts.
