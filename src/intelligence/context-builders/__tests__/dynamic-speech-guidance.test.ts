/**
 * Tests for Dynamic Speech Guidance Context Builder
 *
 * Validates that the builder provides LLM behavioral guidance
 * instead of static phrase pools for natural speech.
 *
 * This replaces:
 * - natural-tool-calling.ts (PRE_CALL_PHRASES, THINKING_SOUNDS)
 * - tool-fillers.ts (TOOL_FILLERS)
 * - authentic-thinking.ts (personaThinkingPhrases)
 * - processing-intelligence.ts (PROCESSING_PHRASES)
 * - physical-presence.json (coffee_references)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextBuilderInput } from '../index.js';
import {
  clearPhraseHistory,
  dynamicSpeechGuidanceBuilder,
  getAntiRepetitionGuidance,
  recordUsedPhrase,
  wasRecentlyUsed,
} from '../humanization/dynamic-speech-guidance.js';

describe('dynamic-speech-guidance context builder', () => {
  const createMockInput = (overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput => ({
    persona: { id: 'ferni', name: 'Ferni', roleType: 'companion' } as any,
    analysis: {
      emotion: {
        primary: 'neutral',
        intensity: 0.5,
        distressLevel: 0,
      },
    } as any,
    userData: {
      isReturningUser: false,
      turnCount: 5,
    } as any,
    userText: 'Hello',
    services: {} as any,
    userProfile: null,
    ...overrides,
  });

  // Helper to find injection by source prefix
  const findBySource = (
    result: Awaited<ReturnType<typeof dynamicSpeechGuidanceBuilder.build>>,
    sourcePrefix: string
  ) => result.find((r) => r.source === sourcePrefix);

  describe('basic functionality', () => {
    it('should return core speech guidance injections', async () => {
      // Seed random to get consistent physical_presence behavior
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // > 0.1, so no physical_presence for turn 5

      const input = createMockInput({ userData: { turnCount: 5 } as any });
      const result = await dynamicSpeechGuidanceBuilder.build(input);

      // Should have at least 3 core injections
      expect(result.length).toBeGreaterThanOrEqual(3);

      // Check sources (IDs have counter suffix like natural_speech_behavior_1)
      const sources = result.map((r) => r.source);
      expect(sources).toContain('natural_speech_behavior');
      expect(sources).toContain('tool_speech_behavior');
      expect(sources).toContain('thinking_behavior');

      vi.restoreAllMocks();
    });

    it('should include physical presence guidance for early turns', async () => {
      const input = createMockInput({ userData: { turnCount: 1 } as any });
      const result = await dynamicSpeechGuidanceBuilder.build(input);

      // Early turns (< 3) always get physical presence
      const sources = result.map((r) => r.source);
      expect(sources).toContain('physical_presence_behavior');
    });

    it('should rarely include physical presence for later turns', async () => {
      // Mock random to return > 0.1 (90% of cases)
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const input = createMockInput({ userData: { turnCount: 10 } as any });
      const result = await dynamicSpeechGuidanceBuilder.build(input);

      const sources = result.map((r) => r.source);
      expect(sources).not.toContain('physical_presence_behavior');

      vi.restoreAllMocks();
    });

    it('should include physical presence for later turns with low random', async () => {
      // Mock random to return < 0.1 (10% of cases)
      vi.spyOn(Math, 'random').mockReturnValue(0.05);

      const input = createMockInput({ userData: { turnCount: 10 } as any });
      const result = await dynamicSpeechGuidanceBuilder.build(input);

      const sources = result.map((r) => r.source);
      expect(sources).toContain('physical_presence_behavior');

      vi.restoreAllMocks();
    });
  });

  describe('injection content', () => {
    it('should contain anti-robotic speech guidance', async () => {
      const input = createMockInput();
      const result = await dynamicSpeechGuidanceBuilder.build(input);

      const naturalSpeech = findBySource(result, 'natural_speech_behavior');
      expect(naturalSpeech).toBeDefined();
      expect(naturalSpeech!.content).toContain('Natural Speech');
      expect(naturalSpeech!.content).toContain('Avoid These Patterns');
      expect(naturalSpeech!.content).toContain('One moment');
    });

    it('should contain tool behavior guidance', async () => {
      const input = createMockInput();
      const result = await dynamicSpeechGuidanceBuilder.build(input);

      const toolSpeech = findBySource(result, 'tool_speech_behavior');
      expect(toolSpeech).toBeDefined();
      expect(toolSpeech!.content).toContain('Tool Usage Speech');
      expect(toolSpeech!.content).toContain("Don't announce it");
    });

    it('should contain thinking behavior guidance', async () => {
      const input = createMockInput();
      const result = await dynamicSpeechGuidanceBuilder.build(input);

      const thinking = findBySource(result, 'thinking_behavior');
      expect(thinking).toBeDefined();
      expect(thinking!.content).toContain('Genuine Reflection');
      expect(thinking!.content).toContain('Pause naturally');
    });

    it('should contain physical presence guidance', async () => {
      const input = createMockInput({ userData: { turnCount: 1 } as any });
      const result = await dynamicSpeechGuidanceBuilder.build(input);

      const physical = findBySource(result, 'physical_presence_behavior');
      expect(physical).toBeDefined();
      expect(physical!.content).toContain('Physical Grounding');
      expect(physical!.content).toContain('Maximum once per conversation');
    });
  });

  describe('injection metadata', () => {
    it('should have correct category on all injections', async () => {
      const input = createMockInput({ userData: { turnCount: 1 } as any });
      const result = await dynamicSpeechGuidanceBuilder.build(input);

      for (const injection of result) {
        expect(injection.category).toBe('speech-behavior');
      }
    });

    it('should have standard priority on all injections', async () => {
      const input = createMockInput();
      const result = await dynamicSpeechGuidanceBuilder.build(input);

      for (const injection of result) {
        // createStandardInjection sets priority to 'standard'
        expect(injection.priority).toBe('standard');
      }
    });
  });

  describe('builder metadata', () => {
    it('should have correct name and description', () => {
      expect(dynamicSpeechGuidanceBuilder.name).toBe('dynamic-speech-guidance');
      expect(dynamicSpeechGuidanceBuilder.description).toContain('behavioral guidance');
    });

    it('should have high priority (85)', () => {
      expect(dynamicSpeechGuidanceBuilder.priority).toBe(85);
    });

    it('should be in HUMANIZING category', () => {
      expect(dynamicSpeechGuidanceBuilder.category).toBe('humanizing');
    });
  });
});

describe('anti-repetition tracking', () => {
  const sessionId = 'test-session-123';

  beforeEach(() => {
    clearPhraseHistory(sessionId);
  });

  describe('recordUsedPhrase', () => {
    it('should record phrases for a session', () => {
      recordUsedPhrase(sessionId, 'one moment');
      expect(wasRecentlyUsed(sessionId, 'one moment')).toBe(true);
    });

    it('should normalize phrases to lowercase', () => {
      recordUsedPhrase(sessionId, 'One Moment');
      expect(wasRecentlyUsed(sessionId, 'one moment')).toBe(true);
      expect(wasRecentlyUsed(sessionId, 'ONE MOMENT')).toBe(true);
    });

    it('should trim whitespace', () => {
      recordUsedPhrase(sessionId, '  coffee  ');
      expect(wasRecentlyUsed(sessionId, 'coffee')).toBe(true);
    });
  });

  describe('wasRecentlyUsed', () => {
    it('should return false for unused phrases', () => {
      expect(wasRecentlyUsed(sessionId, 'never used')).toBe(false);
    });

    it('should return true for used phrases', () => {
      recordUsedPhrase(sessionId, 'used phrase');
      expect(wasRecentlyUsed(sessionId, 'used phrase')).toBe(true);
    });
  });

  describe('clearPhraseHistory', () => {
    it('should clear all phrases for a session', () => {
      recordUsedPhrase(sessionId, 'phrase1');
      recordUsedPhrase(sessionId, 'phrase2');
      clearPhraseHistory(sessionId);

      expect(wasRecentlyUsed(sessionId, 'phrase1')).toBe(false);
      expect(wasRecentlyUsed(sessionId, 'phrase2')).toBe(false);
    });

    it('should not affect other sessions', () => {
      const otherSession = 'other-session';
      recordUsedPhrase(sessionId, 'phrase');
      recordUsedPhrase(otherSession, 'phrase');

      clearPhraseHistory(sessionId);

      expect(wasRecentlyUsed(sessionId, 'phrase')).toBe(false);
      expect(wasRecentlyUsed(otherSession, 'phrase')).toBe(true);

      // Cleanup
      clearPhraseHistory(otherSession);
    });
  });

  describe('getAntiRepetitionGuidance', () => {
    it('should return null for empty history', () => {
      expect(getAntiRepetitionGuidance(sessionId)).toBeNull();
    });

    it('should return null when no phrases repeated', () => {
      recordUsedPhrase(sessionId, 'phrase1');
      recordUsedPhrase(sessionId, 'phrase2');
      recordUsedPhrase(sessionId, 'phrase3');

      expect(getAntiRepetitionGuidance(sessionId)).toBeNull();
    });

    it('should return guidance when phrases are repeated', () => {
      recordUsedPhrase(sessionId, 'one moment');
      recordUsedPhrase(sessionId, 'one moment'); // Repeated

      const guidance = getAntiRepetitionGuidance(sessionId);
      expect(guidance).not.toBeNull();
      expect(guidance).toContain('Avoid repeating');
      expect(guidance).toContain('one moment');
    });

    it('should include multiple repeated phrases', () => {
      recordUsedPhrase(sessionId, 'let me check');
      recordUsedPhrase(sessionId, 'let me check');
      recordUsedPhrase(sessionId, 'coffee');
      recordUsedPhrase(sessionId, 'coffee');

      const guidance = getAntiRepetitionGuidance(sessionId);
      expect(guidance).toContain('let me check');
      expect(guidance).toContain('coffee');
    });

    it('should limit to 3 repeated phrases', () => {
      // Add 4 different repeated phrases
      for (const phrase of ['one', 'two', 'three', 'four']) {
        recordUsedPhrase(sessionId, phrase);
        recordUsedPhrase(sessionId, phrase);
      }

      const guidance = getAntiRepetitionGuidance(sessionId);
      // Should only have 3 phrases listed
      const matches = guidance?.match(/"/g) || [];
      expect(matches.length).toBeLessThanOrEqual(6); // 2 quotes per phrase, max 3 phrases
    });
  });

  describe('history limit', () => {
    it('should keep only last 10 phrases', () => {
      // Record 15 phrases
      for (let i = 1; i <= 15; i++) {
        recordUsedPhrase(sessionId, `phrase${i}`);
      }

      // First 5 should be evicted
      expect(wasRecentlyUsed(sessionId, 'phrase1')).toBe(false);
      expect(wasRecentlyUsed(sessionId, 'phrase5')).toBe(false);

      // Last 10 should be present
      expect(wasRecentlyUsed(sessionId, 'phrase6')).toBe(true);
      expect(wasRecentlyUsed(sessionId, 'phrase15')).toBe(true);
    });
  });
});
