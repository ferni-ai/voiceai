/**
 * Deep Understanding Synthesis Context Builder Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildDeepUnderstandingSynthesis,
  recordSilenceDuration,
  recordLastAIResponse,
  clearSessionState,
  getSessionInsightsSummary,
} from '../context-builders/deep-understanding-synthesis.js';
import type { ContextBuilderInput } from '../context-builders/index.js';

describe('Deep Understanding Synthesis', () => {
  const mockSessionId = 'test-session-123';
  const mockUserId = 'test-user-456';

  beforeEach(() => {
    clearSessionState(mockSessionId);
  });

  function createMockInput(overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput {
    return {
      userText: 'Hello there!',
      analysis: {
        emotion: {
          primary: 'neutral',
          intensity: 0.5,
          distressLevel: 0,
          valence: 'neutral',
          markers: [],
          suggestedTone: 'warm',
        },
        intent: {
          primary: 'greeting',
          confidence: 0.8,
          requiresEmpathy: false,
          requiresAction: false,
          suggestedApproach: 'Be friendly',
        },
        topics: {
          detected: [],
          primary: null,
          isTopicShift: false,
        },
        state: {
          phase: 'greeting',
          distressLevel: 0,
        },
      },
      services: {
        sessionId: mockSessionId,
        userId: mockUserId,
        userProfile: { id: mockUserId },
      },
      userData: {
        turnCount: 1,
      },
      userProfile: { id: mockUserId },
      persona: { id: 'ferni' },
      ...overrides,
    } as ContextBuilderInput;
  }

  describe('buildDeepUnderstandingSynthesis', () => {
    it('should return empty array for missing userId', async () => {
      const input = createMockInput({
        services: {
          sessionId: mockSessionId,
          userId: undefined,
          sessionStartTime: Date.now(),
          userProfile: null,
        },
      });

      const result = await buildDeepUnderstandingSynthesis(input);
      expect(result).toEqual([]);
    });

    it('should detect silence patterns', async () => {
      recordSilenceDuration(mockSessionId, 4000); // 4 second pause

      const input = createMockInput();
      const result = await buildDeepUnderstandingSynthesis(input);

      const silenceInjection = result.find(i => i.source === 'deep_silence');
      expect(silenceInjection).toBeDefined();
      expect(silenceInjection?.content).toContain('paused');
    });

    it('should detect repair signals', async () => {
      const input = createMockInput({
        userText: "No, that's not what I meant. Let me clarify.",
      });

      const result = await buildDeepUnderstandingSynthesis(input);

      const repairInjection = result.find(i => i.source === 'deep_repair');
      expect(repairInjection).toBeDefined();
      expect(repairInjection?.content).toContain('REPAIR');
    });

    it('should detect vulnerability signals', async () => {
      const input = createMockInput({
        userText: "I've never told anyone this before, but I'm really struggling.",
      });

      const result = await buildDeepUnderstandingSynthesis(input);

      const vulnerabilityInjection = result.find(i => i.source === 'deep_vulnerability');
      expect(vulnerabilityInjection).toBeDefined();
      expect(vulnerabilityInjection?.content).toContain('VULNERABILITY');
    });

    it('should detect low energy from brief responses', async () => {
      const input = createMockInput({
        userText: 'Yeah.',
        userData: { turnCount: 5 },
      });

      const result = await buildDeepUnderstandingSynthesis(input);

      const energyInjection = result.find(i => i.source === 'deep_energy');
      expect(energyInjection).toBeDefined();
      expect(energyInjection?.content).toContain('LOW ENERGY');
    });

    it('should detect high engagement from long responses', async () => {
      // Need > 100 words for high engagement detection
      const longMessage = 'I have so much to share about this topic because it is really important to me and I want to explain all the details about what happened and how I felt and what I think should happen next and all the implications of it. '.repeat(3);
      const input = createMockInput({
        userText: longMessage,
      });

      const result = await buildDeepUnderstandingSynthesis(input);

      const energyInjection = result.find(i => i.source === 'deep_energy');
      expect(energyInjection).toBeDefined();
      expect(energyInjection?.content).toContain('HIGH ENGAGEMENT');
    });

    it('should detect people mentioned', async () => {
      const input = createMockInput({
        userText: 'My wife has been really supportive through this.',
      });

      const result = await buildDeepUnderstandingSynthesis(input);

      const relationalInjection = result.find(i => i.source === 'deep_relational');
      expect(relationalInjection).toBeDefined();
      expect(relationalInjection?.content).toContain('wife');
    });

    it('should track emotion trajectory across turns', async () => {
      // First turn - neutral
      await buildDeepUnderstandingSynthesis(createMockInput());

      // Second turn - sadness
      await buildDeepUnderstandingSynthesis(
        createMockInput({
          analysis: {
            emotion: { primary: 'sadness', intensity: 0.7, distressLevel: 0.5 },
            intent: { primary: 'venting', confidence: 0.8 },
            topics: { detected: [], primary: null, isTopicShift: false },
            state: { phase: 'exploring', distressLevel: 0.5 },
          },
        })
      );

      // Third turn - more sadness should trigger trajectory
      await buildDeepUnderstandingSynthesis(
        createMockInput({
          analysis: {
            emotion: { primary: 'anxiety', intensity: 0.8, distressLevel: 0.6 },
            intent: { primary: 'seeking_support', confidence: 0.9 },
            topics: { detected: [], primary: null, isTopicShift: false },
            state: { phase: 'exploring', distressLevel: 0.6 },
          },
        })
      );

      const summary = getSessionInsightsSummary(mockSessionId);
      expect(summary.emotionTrajectory.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Session State Management', () => {
    it('should track silence duration', () => {
      recordSilenceDuration(mockSessionId, 3000);
      // Silence is used in next build call
    });

    it('should record AI responses', () => {
      recordLastAIResponse(mockSessionId, 'Test AI response');
      // Response is used for repair detection
    });

    it('should clear session state', () => {
      recordSilenceDuration(mockSessionId, 5000);
      clearSessionState(mockSessionId);

      const summary = getSessionInsightsSummary(mockSessionId);
      expect(summary.emotionTrajectory).toEqual([]);
      expect(summary.topicsDiscussed).toEqual([]);
    });

    it('should get session insights summary', () => {
      const summary = getSessionInsightsSummary(mockSessionId);

      expect(summary).toHaveProperty('emotionTrajectory');
      expect(summary).toHaveProperty('topicsDiscussed');
      expect(summary).toHaveProperty('turnsSinceDeepCheck');
    });
  });
});

