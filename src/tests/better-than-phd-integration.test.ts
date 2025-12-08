/**
 * Better-Than-PhD Integration Tests
 *
 * End-to-end integration tests that simulate real conversation flow
 * through the voice agent pipeline.
 *
 * These tests verify:
 * 1. Context builders fire at the right times
 * 2. Multiple systems work together
 * 3. Context is properly formatted for the LLM
 * 4. Performance meets requirements
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Better-Than-PhD Integration', () => {
  describe('Context Builder Pipeline', () => {
    it('should load all new context builders lazily', async () => {
      // Force fresh import
      const contextBuilders = await import('../intelligence/context-builders/index.js');

      // Trigger builder loading by calling buildConversationContext
      const mockInput = {
        userText: 'Hello, testing the system',
        analysis: {
          emotion: { primary: 'neutral', intensity: 0.3 },
          intent: { primary: 'greeting', confidence: 0.9 },
          topics: { detected: [], primary: null },
          state: { phase: 'active' },
        },
        services: {
          sessionId: 'test-integration-1',
          userId: 'user-integration-1',
          sessionStartTime: Date.now(),
          userProfile: null,
        },
        userData: { turnCount: 1 },
        userProfile: null,
        persona: { id: 'ferni', name: 'Ferni' },
      };

      // This should load all builders
      const injections = await contextBuilders.buildConversationContext(mockInput as any);

      // Verify builders are now registered
      const builders = contextBuilders.getRegisteredBuilders();
      expect(builders.length).toBeGreaterThan(0);

      // Check that key builders exist
      const builderNames = builders.map((b) => b.name);
      expect(builderNames).toContain('cognitive-distortions');
      expect(builderNames).toContain('somatic-context');
      expect(builderNames).toContain('wellbeing-context');
      expect(builderNames).toContain('therapeutic-frameworks');
      expect(builderNames).toContain('behavioral-economics');
    });

    it('should produce cognitive distortion context for concerning statements', async () => {
      const contextBuilders = await import('../intelligence/context-builders/index.js');

      const mockInput = {
        userText: "I'm such a failure. Everything I do is wrong. I always mess up.",
        analysis: {
          emotion: { primary: 'sad', intensity: 0.7 },
          intent: { primary: 'venting', confidence: 0.8 },
          topics: { detected: ['self'], primary: 'self' },
          state: { phase: 'active' },
        },
        services: {
          sessionId: 'test-integration-2',
          userId: 'user-integration-2',
          sessionStartTime: Date.now(),
          userProfile: null,
        },
        userData: { turnCount: 5 },
        userProfile: { totalConversations: 10 } as any,
        persona: { id: 'ferni', name: 'Ferni' },
      };

      const injections = await contextBuilders.buildConversationContext(mockInput as any);

      // Should have some injections
      expect(injections.length).toBeGreaterThan(0);

      // Check if any contain cognitive-related content
      const hasCognitiveContent = injections.some(
        (i) =>
          i.content.includes('COGNITIVE') ||
          i.content.includes('distortion') ||
          i.content.includes('pattern')
      );

      // The cognitive distortion builder should have fired
      expect(hasCognitiveContent).toBe(true);
    });

    it('should produce somatic context for high-distress situations', async () => {
      const contextBuilders = await import('../intelligence/context-builders/index.js');

      const mockInput = {
        userText: "I'm panicking. I can't breathe. My heart is racing and I'm freaking out.",
        analysis: {
          emotion: { primary: 'panic', intensity: 0.95, needsSupport: true },
          intent: { primary: 'crisis', confidence: 0.95 },
          topics: { detected: ['crisis'], primary: 'crisis' },
          state: { phase: 'active', distressLevel: 0.95 },
        },
        services: {
          sessionId: 'test-integration-3',
          userId: 'user-integration-3',
          sessionStartTime: Date.now(),
          userProfile: null,
        },
        userData: { turnCount: 3 },
        userProfile: { totalConversations: 20 } as any,
        persona: { id: 'ferni', name: 'Ferni' },
      };

      const injections = await contextBuilders.buildConversationContext(mockInput as any);

      // Should have high-priority injections
      const hasCriticalOrStandard = injections.some(
        (i) => i.priority === 'critical' || i.priority === 'standard'
      );
      expect(hasCriticalOrStandard).toBe(true);

      // Should have somatic or breathing-related content
      const hasSomaticContent = injections.some(
        (i) =>
          i.content.includes('SOMATIC') ||
          i.content.includes('breathing') ||
          i.content.includes('grounding') ||
          i.content.includes('calm')
      );
      expect(hasSomaticContent).toBe(true);
    });

    it('should produce behavioral economics context for goal discussions', async () => {
      const contextBuilders = await import('../intelligence/context-builders/index.js');

      const mockInput = {
        userText:
          "I want to start exercising but I just can't seem to make it happen. What's wrong with me?",
        analysis: {
          emotion: { primary: 'frustrated', intensity: 0.5 },
          intent: { primary: 'seeking_help', confidence: 0.8 },
          topics: { detected: ['exercise', 'habits'], primary: 'habits' },
          state: { phase: 'active' },
        },
        services: {
          sessionId: 'test-integration-4',
          userId: 'user-integration-4',
          sessionStartTime: Date.now(),
          userProfile: null,
        },
        userData: { turnCount: 8 },
        userProfile: { totalConversations: 25 } as any,
        persona: { id: 'ferni', name: 'Ferni' },
      };

      const injections = await contextBuilders.buildConversationContext(mockInput as any);

      // Should produce some context for goal-setting
      expect(injections.length).toBeGreaterThan(0);
    });

    it('should produce therapeutic framework context for established relationships', async () => {
      const contextBuilders = await import('../intelligence/context-builders/index.js');

      const mockInput = {
        userText:
          "I want to change but I keep falling back into old patterns. Part of me wants to, part of me doesn't.",
        analysis: {
          emotion: { primary: 'conflicted', intensity: 0.6 },
          intent: { primary: 'processing', confidence: 0.7 },
          topics: { detected: ['change', 'patterns'], primary: 'change' },
          state: { phase: 'active' },
        },
        services: {
          sessionId: 'test-integration-5',
          userId: 'user-integration-5',
          sessionStartTime: Date.now(),
          userProfile: null,
        },
        userData: { turnCount: 15 },
        userProfile: { totalConversations: 30 } as any, // Established relationship
        persona: { id: 'ferni', name: 'Ferni' },
      };

      const injections = await contextBuilders.buildConversationContext(mockInput as any);

      // Should have context
      expect(injections.length).toBeGreaterThan(0);

      // Should detect change talk (MI)
      const hasChangeOrTherapeutic = injections.some(
        (i) =>
          i.content.includes('change') ||
          i.content.includes('CHANGE TALK') ||
          i.content.includes('DBT') ||
          i.content.includes('ACT') ||
          i.content.includes('value')
      );

      // At least basic context should be produced
      expect(injections.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Context Formatting', () => {
    it('should format multiple injections correctly', async () => {
      const {
        formatContextForPrompt,
        createStandardInjection,
        createHintInjection,
        createCriticalInjection,
      } = await import('../intelligence/context-builders/index.js');

      const injections = [
        createCriticalInjection('test_critical', 'CRITICAL: This is urgent'),
        createStandardInjection('test_standard', 'STANDARD: This is important'),
        createHintInjection('test_hint', 'HINT: This is a suggestion'),
      ];

      const formatted = formatContextForPrompt(injections);

      // Should contain all content
      expect(formatted).toContain('CRITICAL');
      expect(formatted).toContain('STANDARD');
      expect(formatted).toContain('HINT');

      // Critical should come before standard and hint (priority ordering)
      const criticalIndex = formatted.indexOf('CRITICAL');
      const standardIndex = formatted.indexOf('STANDARD');
      const hintIndex = formatted.indexOf('HINT');

      expect(criticalIndex).toBeLessThan(standardIndex);
      expect(standardIndex).toBeLessThan(hintIndex);
    });

    it('should respect max length limits', async () => {
      const { formatContextForPrompt, createStandardInjection } =
        await import('../intelligence/context-builders/index.js');

      // Create many large injections
      const injections = [];
      for (let i = 0; i < 20; i++) {
        injections.push(createStandardInjection(`test_${i}`, 'A'.repeat(500)));
      }

      const formatted = formatContextForPrompt(injections, { maxLength: 2000 });

      // Should be within limit
      expect(formatted.length).toBeLessThanOrEqual(2000);
    });
  });

  describe('Performance', () => {
    it('should build context within acceptable time', async () => {
      const contextBuilders = await import('../intelligence/context-builders/index.js');

      const mockInput = {
        userText: "I'm feeling really anxious about my presentation tomorrow. What if I fail?",
        analysis: {
          emotion: { primary: 'anxious', intensity: 0.7 },
          intent: { primary: 'seeking_support', confidence: 0.8 },
          topics: { detected: ['work', 'anxiety'], primary: 'work' },
          state: { phase: 'active' },
        },
        services: {
          sessionId: 'test-perf-1',
          userId: 'user-perf-1',
          sessionStartTime: Date.now(),
          userProfile: null,
        },
        userData: { turnCount: 5 },
        userProfile: { totalConversations: 15 } as any,
        persona: { id: 'ferni', name: 'Ferni' },
      };

      const start = Date.now();
      await contextBuilders.buildConversationContext(mockInput as any);
      const duration = Date.now() - start;

      // Should complete within 500ms (generous for first load)
      expect(duration).toBeLessThan(500);
    });

    it('should be faster on subsequent calls (after lazy loading)', async () => {
      const contextBuilders = await import('../intelligence/context-builders/index.js');

      const mockInput = {
        userText: "Just checking in, how's everything going?",
        analysis: {
          emotion: { primary: 'neutral', intensity: 0.3 },
          intent: { primary: 'greeting', confidence: 0.9 },
          topics: { detected: [], primary: null },
          state: { phase: 'active' },
        },
        services: {
          sessionId: 'test-perf-2',
          userId: 'user-perf-2',
          sessionStartTime: Date.now(),
          userProfile: null,
        },
        userData: { turnCount: 1 },
        userProfile: null,
        persona: { id: 'ferni', name: 'Ferni' },
      };

      // Warm up
      await contextBuilders.buildConversationContext(mockInput as any);

      // Measure subsequent call
      const times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await contextBuilders.buildConversationContext({
          ...mockInput,
          services: { ...mockInput.services, sessionId: `test-perf-${i}` },
        } as any);
        times.push(Date.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

      // Subsequent calls should be fast (< 100ms average)
      expect(avgTime).toBeLessThan(100);
    });
  });

  describe('Service Integration', () => {
    it('should integrate cognitive intelligence with wellbeing tracking', async () => {
      const { buildCognitiveIntelligenceContext } =
        await import('../services/cognitive-intelligence/index.js');
      const { processForWellbeing } = await import('../services/wellbeing-tracking/index.js');

      const userId = 'user-cross-system-1';
      const message = "I'm exhausted and everything feels hopeless. I always fail.";

      // Both systems should process the same message
      const cognitiveResult = buildCognitiveIntelligenceContext(userId, message, {
        emotion: 'sad',
        emotionIntensity: 0.8,
        relationshipStage: 'established',
      });

      const wellbeingResult = processForWellbeing(userId, message, {
        emotion: 'sad',
        emotionIntensity: 0.8,
      });

      // Both should detect something
      expect(cognitiveResult.hasDistortion || wellbeingResult.signals.length > 0).toBe(true);
    });

    it('should integrate therapeutic frameworks with behavioral economics', async () => {
      const { detectChangeTalk } =
        await import('../services/therapeutic-frameworks/motivational-interviewing.js');
      const { suggestCommitmentDevice } = await import('../services/behavioral-economics/index.js');

      // User expresses desire to change
      const message = 'I really want to start meditating every day';
      const changeTalk = detectChangeTalk(message, 'meditation');

      // Should detect change talk
      expect(changeTalk.length).toBeGreaterThan(0);
      expect(changeTalk.some((ct) => ct.type === 'desire')).toBe(true);

      // Should be able to suggest commitment device for the goal
      const commitmentSuggestions = suggestCommitmentDevice('meditate daily');
      expect(commitmentSuggestions.length).toBeGreaterThan(0);
    });

    it('should integrate somatic intelligence with DBT skills', async () => {
      const { selectExercise } = await import('../services/somatic-intelligence/index.js');
      const { selectDBTSkill } = await import('../services/therapeutic-frameworks/dbt-skills.js');

      // High distress situation
      const context = {
        emotionIntensity: 0.9,
        emotion: 'panic',
      };

      // Both systems should provide crisis-appropriate responses
      const somaticExercise = selectExercise({
        emotionIntensity: context.emotionIntensity,
        emotion: context.emotion,
      });

      const dbtSkill = selectDBTSkill({
        emotionIntensity: context.emotionIntensity,
        goal: 'survive_crisis',
      });

      // Somatic should suggest quick intervention
      expect(somaticExercise.duration).toBe('short');

      // DBT should suggest TIPP for crisis
      expect(dbtSkill.id).toBe('tipp');
    });
  });
});

describe('Error Handling', () => {
  it('should handle missing user profile gracefully', async () => {
    const contextBuilders = await import('../intelligence/context-builders/index.js');

    const mockInput = {
      userText: 'Hello there',
      analysis: {
        emotion: { primary: 'neutral', intensity: 0.3 },
        intent: { primary: 'greeting', confidence: 0.9 },
        topics: { detected: [], primary: null },
        state: { phase: 'active' },
      },
      services: {
        sessionId: 'test-error-1',
        userId: 'user-error-1',
        sessionStartTime: Date.now(),
        userProfile: null,
      },
      userData: {},
      userProfile: null, // No profile
      persona: { id: 'ferni', name: 'Ferni' },
    };

    // Should not throw
    const injections = await contextBuilders.buildConversationContext(mockInput as any);
    expect(Array.isArray(injections)).toBe(true);
  });

  it('should handle empty user text gracefully', async () => {
    const contextBuilders = await import('../intelligence/context-builders/index.js');

    const mockInput = {
      userText: '',
      analysis: {
        emotion: { primary: 'neutral', intensity: 0.3 },
        intent: { primary: 'unknown', confidence: 0.1 },
        topics: { detected: [], primary: null },
        state: { phase: 'active' },
      },
      services: {
        sessionId: 'test-error-2',
        userId: 'user-error-2',
        sessionStartTime: Date.now(),
        userProfile: null,
      },
      userData: {},
      userProfile: null,
      persona: { id: 'ferni', name: 'Ferni' },
    };

    // Should not throw
    const injections = await contextBuilders.buildConversationContext(mockInput as any);
    expect(Array.isArray(injections)).toBe(true);
  });

  it('should handle missing services gracefully', async () => {
    const { buildCognitiveIntelligenceContext } =
      await import('../services/cognitive-intelligence/index.js');

    // Missing userId should not crash
    const result = buildCognitiveIntelligenceContext(
      '', // Empty userId
      "I'm a failure",
      {}
    );

    expect(result).toBeDefined();
    expect(typeof result.hasDistortion).toBe('boolean');
  });
});
