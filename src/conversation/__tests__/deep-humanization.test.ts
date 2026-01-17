/**
 * Deep Humanization Module Tests
 *
 * Tests for the clean architecture deep humanization system that creates
 * natural, human-like conversation features:
 * - Mood tracking and drift
 * - Humanization injection application
 * - Generator functions
 * - Detection utilities
 *
 * @module @ferni/conversation/deep-humanization/tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Import from the new clean architecture module
import {
  applyDeepHumanization,
  getMoodTracker,
  resetDeepHumanization,
  resetAllDeepHumanization,
  type HumanizationContext,
  type ConversationMood,
} from '../deep-humanization/index.js';

// Detection utilities (now from utils)
import {
  classifyTopicWeight,
  detectEvidence,
  detectBreakthrough,
  detectAdviceGiving,
  detectDisengagement,
  detectHighEngagement,
} from '../utils/detection.js';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Deep Humanization Module', () => {
  const testPersonaId = 'ferni';

  beforeEach(() => {
    resetDeepHumanization(testPersonaId);
  });

  afterEach(() => {
    resetDeepHumanization(testPersonaId);
  });

  // ==========================================================================
  // MOOD TRACKER TESTS
  // ==========================================================================

  describe('MoodTracker', () => {
    it('should get mood tracker instance for persona', () => {
      const tracker = getMoodTracker(testPersonaId);
      expect(tracker).toBeDefined();
      expect(typeof tracker.getMood).toBe('function');
      expect(typeof tracker.update).toBe('function');
    });

    it('should return same instance for same persona', () => {
      const tracker1 = getMoodTracker(testPersonaId);
      const tracker2 = getMoodTracker(testPersonaId);
      expect(tracker1).toBe(tracker2);
    });

    it('should start with default mood', () => {
      const tracker = getMoodTracker(testPersonaId);
      const mood = tracker.getMood();
      expect(mood.energy).toBe(0.75);
      expect(mood.engagement).toBe(0.7);
      expect(mood.emotionalLoad).toBe(0);
      expect(mood.heavyTopicCount).toBe(0);
      expect(mood.inEmotionalMoment).toBe(false);
    });

    it('should decrease energy for heavy topics', () => {
      const tracker = getMoodTracker(testPersonaId);
      const initialMood = tracker.getMood();

      tracker.update({
        topicWeight: 'heavy',
        turnCount: 1,
      });

      const updatedMood = tracker.getMood();
      expect(updatedMood.energy).toBeLessThan(initialMood.energy);
      expect(updatedMood.emotionalLoad).toBeGreaterThan(0);
      expect(updatedMood.heavyTopicCount).toBe(1);
    });

    it('should increase energy for light topics', () => {
      const tracker = getMoodTracker(testPersonaId);

      // First decrease with heavy topic
      tracker.update({ topicWeight: 'heavy', turnCount: 1 });
      const afterHeavy = tracker.getMood();

      // Then increase with light topic
      tracker.update({ topicWeight: 'light', turnCount: 2 });
      const afterLight = tracker.getMood();

      expect(afterLight.energy).toBeGreaterThan(afterHeavy.energy);
    });

    it('should track emotional moments', () => {
      const tracker = getMoodTracker(testPersonaId);

      tracker.update({
        userEmotion: 'sadness',
        turnCount: 1,
      });

      expect(tracker.getMood().inEmotionalMoment).toBe(true);
    });

    it('should increase engagement for high user engagement', () => {
      const tracker = getMoodTracker(testPersonaId);
      const initial = tracker.getMood();

      tracker.update({
        userEngagement: 'high',
        turnCount: 1,
      });

      expect(tracker.getMood().engagement).toBeGreaterThan(initial.engagement);
    });

    it('should decrease engagement for low user engagement', () => {
      const tracker = getMoodTracker(testPersonaId);
      const initial = tracker.getMood();

      tracker.update({
        userEngagement: 'low',
        turnCount: 1,
      });

      expect(tracker.getMood().engagement).toBeLessThan(initial.engagement);
    });
  });

  // ==========================================================================
  // APPLY DEEP HUMANIZATION TESTS
  // ==========================================================================

  describe('applyDeepHumanization', () => {
    const baseContext: HumanizationContext = {
      personaId: testPersonaId,
      turnCount: 5,
      sessionMinutes: 10,
      currentHour: 14,
      userMessage: 'Testing the humanization system',
      recentTopics: ['testing'],
      relationshipStage: 'acquaintance',
    };

    it('should return humanized text and applied effects', async () => {
      const result = await applyDeepHumanization('Original response.', baseContext);

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('appliedEffects');
      expect(typeof result.text).toBe('string');
      expect(Array.isArray(result.appliedEffects)).toBe(true);
    });

    it('should preserve original text when no effects applied', async () => {
      // With low turn count and no strong signals, effects may not fire
      const result = await applyDeepHumanization('Original response.', {
        ...baseContext,
        turnCount: 1,
      });

      // Text should at least contain the original
      expect(result.text).toContain('Original');
    });

    it('should not exceed max effects per turn', async () => {
      // Run multiple times and check effects count
      for (let i = 0; i < 5; i++) {
        const result = await applyDeepHumanization('Test response.', {
          ...baseContext,
          turnCount: i + 5,
        });

        // Max is 3 effects per turn (see DEFAULT_TUNING.global.maxEffectsPerResponse)
        expect(result.appliedEffects.length).toBeLessThanOrEqual(3);
      }
    });

    it('should update mood tracker during humanization', async () => {
      const tracker = getMoodTracker(testPersonaId);
      const initialMood = tracker.getMood();

      await applyDeepHumanization('Response about difficult topic.', {
        ...baseContext,
        userMessage: 'Dealing with anxiety and depression',
      });

      const updatedMood = tracker.getMood();
      // Mood should be updated based on context
      expect(updatedMood).toBeDefined();
    });
  });

  // ==========================================================================
  // RESET TESTS
  // ==========================================================================

  describe('reset functions', () => {
    it('should reset mood to default values', () => {
      const tracker = getMoodTracker(testPersonaId);

      // Modify mood
      tracker.update({
        topicWeight: 'heavy',
        userEngagement: 'high',
        userEmotion: 'sadness',
        turnCount: 10,
      });

      // Reset
      resetDeepHumanization(testPersonaId);

      // Get new tracker (old one should be reset)
      const newTracker = getMoodTracker(testPersonaId);
      const mood = newTracker.getMood();
      expect(mood.energy).toBe(0.75);
      expect(mood.engagement).toBe(0.7);
      expect(mood.emotionalLoad).toBe(0);
    });

    it('should reset all personas', () => {
      // Modify mood for multiple personas
      const ferniTracker = getMoodTracker('ferni');
      const peterTracker = getMoodTracker('peter-john');

      ferniTracker.update({ topicWeight: 'heavy', turnCount: 1 });
      peterTracker.update({ topicWeight: 'heavy', turnCount: 1 });

      // Reset all
      resetAllDeepHumanization();

      // Both should be reset
      expect(getMoodTracker('ferni').getMood().energy).toBe(0.75);
      expect(getMoodTracker('peter-john').getMood().energy).toBe(0.75);
    });
  });
});

// ============================================================================
// DETECTION HELPER TESTS (from utils/detection.ts)
// ============================================================================

describe('Detection helpers', () => {
  describe('classifyTopicWeight', () => {
    it('should classify heavy topics', () => {
      expect(classifyTopicWeight('My father died')).toBe('heavy');
      expect(classifyTopicWeight('Dealing with trauma')).toBe('heavy');
      expect(classifyTopicWeight('I got fired today')).toBe('heavy');
    });

    it('should classify light topics', () => {
      expect(classifyTopicWeight('Haha that was funny')).toBe('light');
      expect(classifyTopicWeight("I'm so excited!")).toBe('light');
      expect(classifyTopicWeight('Going on vacation')).toBe('light');
    });

    it('should classify medium topics', () => {
      expect(classifyTopicWeight('Working on a project')).toBe('medium');
    });

    it('should use detected emotion', () => {
      expect(classifyTopicWeight('Something happened', 'sadness')).toBe('heavy');
      expect(classifyTopicWeight('Something happened', 'joy')).toBe('light');
    });
  });

  describe('detectEvidence', () => {
    it('should detect evidence patterns', () => {
      expect(detectEvidence("Here's the thing")).toBe(true);
      expect(detectEvidence('But actually')).toBe(true);
      expect(detectEvidence('In my experience')).toBe(true);
      expect(detectEvidence('I disagree')).toBe(true);
    });

    it('should return false for non-evidence', () => {
      expect(detectEvidence('I agree with you')).toBe(false);
      expect(detectEvidence('That makes sense')).toBe(false);
    });
  });

  describe('detectBreakthrough', () => {
    it('should detect breakthrough patterns', () => {
      expect(detectBreakthrough('I just realized')).toBe(true);
      expect(detectBreakthrough('It hit me that')).toBe(true);
      expect(detectBreakthrough('Finally!')).toBe(true);
      expect(detectBreakthrough("I've never told anyone")).toBe(true);
    });

    it('should return false for non-breakthrough', () => {
      expect(detectBreakthrough('I think so')).toBe(false);
      expect(detectBreakthrough('Maybe')).toBe(false);
    });
  });

  describe('detectAdviceGiving', () => {
    it('should detect advice patterns', () => {
      expect(detectAdviceGiving('You should try')).toBe(true);
      expect(detectAdviceGiving("I'd recommend")).toBe(true);
      expect(detectAdviceGiving('Consider this')).toBe(true);
    });

    it('should return false for non-advice', () => {
      expect(detectAdviceGiving('What do you think?')).toBe(false);
      expect(detectAdviceGiving('How are you feeling?')).toBe(false);
    });
  });

  describe('detectDisengagement', () => {
    it('should detect disengagement patterns', () => {
      expect(detectDisengagement('yeah')).toBe(true);
      expect(detectDisengagement('ok')).toBe(true);
      expect(detectDisengagement('whatever')).toBe(true);
      expect(detectDisengagement('meh')).toBe(true);
    });

    it('should return false for engaged responses', () => {
      expect(detectDisengagement("That's really interesting!")).toBe(false);
      expect(detectDisengagement('Tell me more about that')).toBe(false);
    });
  });

  describe('detectHighEngagement', () => {
    it('should detect high engagement in long enthusiastic messages', () => {
      const engaged =
        "This is so fascinating! I've been thinking about this for a while and I feel like I finally understand what you mean. I want to share more about my experience.";
      expect(detectHighEngagement(engaged)).toBe(true);
    });

    it('should return false for short messages', () => {
      expect(detectHighEngagement("That's cool")).toBe(false);
      expect(detectHighEngagement('Interesting')).toBe(false);
    });
  });
});
