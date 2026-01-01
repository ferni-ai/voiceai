/**
 * Emotion-Aware Routing E2E Tests
 *
 * Tests that emotion detection correctly boosts relevant domains in routing.
 *
 * @module tests/e2e/emotion-routing-e2e.test
 */

import { describe, it, expect } from 'vitest';
import {
  applyEmotionBoosts,
  applyMultiEmotionBoosts,
  getEmotionDomains,
  getEmotionBoostAmount,
  isHighPriorityEmotion,
  EMOTION_DOMAIN_BOOST,
  type EmotionContext,
} from '../../tools/semantic-router/emotion-routing-boost.js';

describe('Emotion-Aware Routing', () => {
  describe('EMOTION_DOMAIN_BOOST mapping', () => {
    it('should have mappings for common negative emotions', () => {
      const negativeEmotions = ['angry', 'sad', 'anxious', 'overwhelmed', 'hopeless'];

      for (const emotion of negativeEmotions) {
        expect(EMOTION_DOMAIN_BOOST[emotion]).toBeDefined();
        expect(EMOTION_DOMAIN_BOOST[emotion].domains.length).toBeGreaterThan(0);
        expect(EMOTION_DOMAIN_BOOST[emotion].boost).toBeGreaterThan(0);
      }
    });

    it('should have mappings for shame/guilt/envy emotions', () => {
      expect(EMOTION_DOMAIN_BOOST['ashamed']).toBeDefined();
      expect(EMOTION_DOMAIN_BOOST['ashamed'].domains).toContain('shame');

      expect(EMOTION_DOMAIN_BOOST['jealous']).toBeDefined();
      expect(EMOTION_DOMAIN_BOOST['jealous'].domains).toContain('envy');

      expect(EMOTION_DOMAIN_BOOST['resentful']).toBeDefined();
      expect(EMOTION_DOMAIN_BOOST['resentful'].domains).toContain('resentment');
    });

    it('should have higher boosts for crisis emotions', () => {
      const crisisEmotions = ['hopeless', 'panicked', 'terrified'];
      const normalEmotions = ['sad', 'anxious', 'frustrated'];

      const crisisBoosts = crisisEmotions.map((e) => EMOTION_DOMAIN_BOOST[e].boost);
      const normalBoosts = normalEmotions.map((e) => EMOTION_DOMAIN_BOOST[e].boost);

      const avgCrisis = crisisBoosts.reduce((a, b) => a + b, 0) / crisisBoosts.length;
      const avgNormal = normalBoosts.reduce((a, b) => a + b, 0) / normalBoosts.length;

      expect(avgCrisis).toBeGreaterThan(avgNormal);
    });
  });

  describe('applyEmotionBoosts', () => {
    it('should boost anger-related tools when user is angry', () => {
      const matches = [
        {
          toolId: 'conflict-resolution',
          score: 0.5,
          domain: 'conflict',
          category: 'relationships',
        },
        { toolId: 'weather-check', score: 0.6, domain: 'utility', category: 'general' },
        { toolId: 'anger-management', score: 0.4, domain: 'anger', category: 'emotional' },
      ];

      const emotion: EmotionContext = { primary: 'angry', intensity: 1.0 };
      const boosted = applyEmotionBoosts(matches, emotion);

      // Conflict and anger tools should now be higher than weather
      const conflictScore = boosted.find((m) => m.toolId === 'conflict-resolution')!.score;
      const angerScore = boosted.find((m) => m.toolId === 'anger-management')!.score;
      const weatherScore = boosted.find((m) => m.toolId === 'weather-check')!.score;

      expect(conflictScore).toBeGreaterThan(weatherScore);
      expect(angerScore).toBeGreaterThan(0.4); // Original + boost
    });

    it('should boost grief tools when user is sad', () => {
      const matches = [
        { toolId: 'grief-support', score: 0.4, domain: 'grief', category: 'emotional' },
        { toolId: 'task-manager', score: 0.7, domain: 'productivity', category: 'tools' },
      ];

      const emotion: EmotionContext = { primary: 'sad', intensity: 0.8 };
      const boosted = applyEmotionBoosts(matches, emotion);

      const griefScore = boosted.find((m) => m.toolId === 'grief-support')!.score;
      // With boost, grief should be competitive
      expect(griefScore).toBeGreaterThan(0.4);
    });

    it('should scale boost by emotion intensity', () => {
      const matchesLow = [
        { toolId: 'anxiety-grounding', score: 0.5, domain: 'anxiety', category: 'emotional' },
      ];
      const matchesHigh = [
        { toolId: 'anxiety-grounding', score: 0.5, domain: 'anxiety', category: 'emotional' },
      ];

      const lowIntensity: EmotionContext = { primary: 'anxious', intensity: 0.3 };
      const highIntensity: EmotionContext = { primary: 'anxious', intensity: 1.0 };

      const boostedLow = applyEmotionBoosts(matchesLow, lowIntensity);
      const boostedHigh = applyEmotionBoosts(matchesHigh, highIntensity);

      expect(boostedHigh[0].score).toBeGreaterThan(boostedLow[0].score);
    });

    it('should re-sort matches after boosting', () => {
      const matches = [
        { toolId: 'calendar', score: 0.8, domain: 'scheduling', category: 'productivity' },
        { toolId: 'burnout-support', score: 0.4, domain: 'burnout', category: 'wellness' },
      ];

      const emotion: EmotionContext = { primary: 'overwhelmed', intensity: 1.0 };
      const boosted = applyEmotionBoosts(matches, emotion);

      // Burnout should be boosted enough to potentially reorder (depends on exact boost)
      // With 0.20 boost, 0.4 + 0.20 = 0.6, still less than 0.8
      // But they should be sorted by score
      expect(boosted[0].score).toBeGreaterThanOrEqual(boosted[1].score);
    });

    it('should not modify scores for unknown emotions', () => {
      const matches = [{ toolId: 'any-tool', score: 0.5, domain: 'general', category: 'tools' }];

      const emotion: EmotionContext = { primary: 'unknown-emotion' };
      const boosted = applyEmotionBoosts(matches, emotion);

      expect(boosted[0].score).toBe(0.5); // Unchanged
    });
  });

  describe('applyMultiEmotionBoosts', () => {
    it('should apply boosts for multiple emotions', () => {
      const matches = [
        { toolId: 'anxiety-support', score: 0.4, domain: 'anxiety', category: 'emotional' },
        { toolId: 'grief-support', score: 0.4, domain: 'grief', category: 'emotional' },
      ];

      const emotions: EmotionContext[] = [
        { primary: 'anxious', intensity: 0.7 },
        { primary: 'sad', intensity: 0.5 },
      ];

      const boosted = applyMultiEmotionBoosts(matches, emotions);

      // Both should be boosted
      expect(boosted.find((m) => m.toolId === 'anxiety-support')!.score).toBeGreaterThan(0.4);
      expect(boosted.find((m) => m.toolId === 'grief-support')!.score).toBeGreaterThan(0.4);
    });
  });

  describe('getEmotionDomains', () => {
    it('should return relevant domains for known emotions', () => {
      const angryDomains = getEmotionDomains('angry');
      expect(angryDomains).toContain('conflict');
      expect(angryDomains).toContain('anger');

      const sadDomains = getEmotionDomains('sad');
      expect(sadDomains).toContain('grief');
      expect(sadDomains).toContain('loss');
    });

    it('should return empty array for unknown emotions', () => {
      const domains = getEmotionDomains('nonexistent');
      expect(domains).toEqual([]);
    });
  });

  describe('getEmotionBoostAmount', () => {
    it('should return boost amount for known emotions', () => {
      expect(getEmotionBoostAmount('angry')).toBe(0.15);
      expect(getEmotionBoostAmount('hopeless')).toBe(0.25);
    });

    it('should return 0 for unknown emotions', () => {
      expect(getEmotionBoostAmount('nonexistent')).toBe(0);
    });
  });

  describe('isHighPriorityEmotion', () => {
    it('should identify crisis emotions as high priority', () => {
      expect(isHighPriorityEmotion('hopeless')).toBe(true);
      expect(isHighPriorityEmotion('desperate')).toBe(true);
      expect(isHighPriorityEmotion('panicked')).toBe(true);
    });

    it('should not flag normal negative emotions as high priority', () => {
      expect(isHighPriorityEmotion('sad')).toBe(false);
      expect(isHighPriorityEmotion('angry')).toBe(false);
      expect(isHighPriorityEmotion('anxious')).toBe(false);
    });
  });
});

describe('Trajectory-Aware Routing', () => {
  it('should boost burnout tools for rising stress trajectory', async () => {
    const { applyTrajectoryBoosts } =
      await import('../../tools/semantic-router/trajectory-routing-boost.js');
    type EmotionalArc = {
      id: string;
      type: string;
      direction: 'rising' | 'falling' | 'stable';
      intensity: 'low' | 'medium' | 'high';
      durationDays: number;
      startedAt: string;
    };

    const matches = [
      { toolId: 'burnout-support', score: 0.4, domain: 'burnout', category: 'wellness' },
      { toolId: 'calendar', score: 0.7, domain: 'scheduling', category: 'productivity' },
    ];

    const arcs: EmotionalArc[] = [
      {
        id: 'arc-1',
        type: 'stress',
        direction: 'rising',
        intensity: 'high',
        durationDays: 7,
        startedAt: new Date().toISOString(),
      },
    ];

    const boosted = applyTrajectoryBoosts(matches, arcs);

    // Burnout should be boosted
    const burnoutScore = boosted.find((m) => m.toolId === 'burnout-support')!.score;
    expect(burnoutScore).toBeGreaterThan(0.4);
  });

  it('should boost recovery tools for falling recovery trajectory', async () => {
    const { hasUrgentTrajectory } =
      await import('../../tools/semantic-router/trajectory-routing-boost.js');
    type EmotionalArc = {
      id: string;
      type: string;
      direction: 'rising' | 'falling' | 'stable';
      intensity: 'low' | 'medium' | 'high';
      durationDays: number;
      startedAt: string;
    };

    const arcs: EmotionalArc[] = [
      {
        id: 'arc-2',
        type: 'recovery',
        direction: 'falling',
        intensity: 'medium',
        durationDays: 3,
        startedAt: new Date().toISOString(),
      },
    ];

    // Falling recovery is always urgent
    expect(hasUrgentTrajectory(arcs)).toBe(true);
  });
});

describe('Multi-Intent Detection', () => {
  it('should detect compound intents', async () => {
    const { detectMultipleIntents } =
      await import('../../tools/semantic-router/multi-intent-router.js');

    const result = detectMultipleIntents("I'm going through a divorce AND I just lost my job");

    expect(result.isMultiIntent).toBe(true);
    expect(result.intents.length).toBe(2);

    const domains = result.intents.map((i) => i.domain);
    expect(domains).toContain('divorce');
    expect(domains).toContain('job-loss');
  });

  it('should handle single intents', async () => {
    const { detectMultipleIntents } =
      await import('../../tools/semantic-router/multi-intent-router.js');

    const result = detectMultipleIntents("I'm feeling anxious about tomorrow");

    expect(result.isMultiIntent).toBe(false);
    expect(result.intents.length).toBeLessThanOrEqual(1);
  });

  it('should prioritize crisis intents', async () => {
    const { detectMultipleIntents, getPriorityIntent } =
      await import('../../tools/semantic-router/multi-intent-router.js');

    const result = detectMultipleIntents(
      "I'm struggling with my job search and feeling really depressed"
    );

    if (result.intents.length > 1) {
      const priority = getPriorityIntent(result.intents);
      // Depression should be higher priority than job search
      expect(priority?.domain).toBe('depression');
    }
  });
});
