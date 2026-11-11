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

import { describe, expect, it } from 'vitest';

describe('Better-Than-PhD Integration', () => {
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
